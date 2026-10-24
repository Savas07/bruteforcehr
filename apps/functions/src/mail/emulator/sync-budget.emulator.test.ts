// Performance budget (docs/BRIEF.md §9): an incremental sync of 3 mail accounts takes < 30 s
// (docs/runbooks/performance.md). Three IMAP accounts on their own in-process servers with lived-in
// mailboxes (2,000 inbox messages over a year, spam and sent mail), 1,000 tracked applications, and
// rounds of new mail: per account 30 inbox messages (5 about applications: receipts, rejections and
// an interview invitation; the rest newsletters, notifications and personal mail) plus 3 in spam.
// Each round is timed end to end the way `mailPoll` + `mailSyncTask` run it: list the connected
// accounts, then run each account's incremental sync to completion, one after the other (Cloud
// Tasks may run them in parallel; one after the other is the slow case). Rules-only
// classification: AI is off, nothing leaves the process. Writes artifacts/perf/mail-sync.json.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import { getFirestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminConverters as converters } from "../../converters";
import { setImapTestOptions } from "../accounts";
import { rfc822, startTestMailServers, type TestMailServers } from "../providers/test-servers";
import { runSync } from "../sync";
import { application, clearFirestore, listMessages, seedImapAccount, seedProfile } from "./helpers";

const UID = "user-budget";
const BUDGET_MS = 30_000;
const ROUNDS = 3;
const APPLICATIONS = 1_000;
const DAY_MS = 86_400_000;
const ACCOUNTS = ["acc-work", "acc-personal", "acc-uni"] as const;
/** Per account and round. */
const NEW_INBOX = 30;
const NEW_SPAM = 3;
const JOB_MAIL_PER_ROUND = 5;

const ATS_AUTHENTICATED = {
  "Authentication-Results":
    "imap.test.example; dkim=pass header.d=greenhouse-mail.io; dmarc=pass header.from=us.greenhouse-mail.io",
};

const FIRST = [
  "Acme",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Vandelay",
  "Stark",
  "Wayne",
  "Tyrell",
  "Cyberdyne",
];
const SECOND = [
  "Robotics",
  "Labs",
  "Systems",
  "Analytics",
  "Health",
  "Mobility",
  "Payments",
  "Energy",
  "Studio",
  "Logistics",
];
const THIRD = [
  "Berlin",
  "Istanbul",
  "London",
  "Amsterdam",
  "Munich",
  "Remote",
  "Izmir",
  "Hamburg",
  "Leeds",
  "Austin",
];
const ROLES = [
  "Backend Engineer",
  "Frontend Engineer",
  "Platform Engineer",
  "Data Engineer",
  "Product Engineer",
];

/** 1,000 distinct companies: "Acme Robotics Berlin", "acmeroboticsberlin.example". */
function company(index: number): { name: string; domain: string; role: string } {
  const name = `${FIRST[index % 10]} ${SECOND[Math.floor(index / 10) % 10]} ${THIRD[Math.floor(index / 100) % 10]}`;
  return {
    name,
    domain: `${name.toLowerCase().replaceAll(" ", "")}.example`,
    role: ROLES[index % ROLES.length] ?? "Engineer",
  };
}

/** Mail that isn't about a job: what most of an inbox is. */
function everyday(account: string, n: number, date: Date): string {
  const kinds = [
    () =>
      rfc822({
        from: "Weekly Deals <news@shop.example>",
        subject: `Deals of the week #${n}`,
        body: "Save 20% on garden furniture this weekend only. Free delivery over €50.",
        headers: { "List-Unsubscribe": "<mailto:unsubscribe@shop.example>" },
        date,
      }),
    () =>
      rfc822({
        from: "GitHub <notifications@github.example>",
        subject: `[bruteforcehr] Pull request #${n} was merged`,
        body: `Merged #${n} into main.\n\nYou are receiving this because you were mentioned.`,
        headers: { "List-Unsubscribe": "<mailto:unsub@github.example>" },
        date,
      }),
    () =>
      rfc822({
        from: "Elif Kaya <elif@friends.example>",
        subject: n % 2 === 0 ? "Dinner on Friday?" : "Photos from the weekend",
        body: "Hi Deniz,\n\nAre you free on Friday evening? We could try the new place in Kadıköy.\n\nElif",
        date,
      }),
    () =>
      rfc822({
        from: "Bank <no-reply@bank.example>",
        subject: "Your monthly statement is ready",
        body: "Your statement for this month is available in online banking.",
        date,
      }),
  ];
  const make = kinds[n % kinds.length];
  if (!make) throw new Error("no kind");
  return make().replace("Message-ID: <", `Message-ID: <${account}-${n}-`);
}

/** Mail about application `index`: a receipt, a rejection or an interview invitation. */
function jobMail(kind: "receipt" | "rejection" | "invite", index: number, id: string, date: Date): string {
  const { name, domain, role } = company(index);
  if (kind === "receipt")
    return rfc822({
      from: `${name} <no-reply@us.greenhouse-mail.io>`,
      subject: `Thank you for applying to ${name}`,
      body: `Hi Deniz,\n\nThank you for applying for the ${role} role at ${name}. We have received your application and our team will review your application shortly.\n\n${name} Recruiting`,
      messageId: `<${id}@greenhouse-mail.io>`,
      headers: ATS_AUTHENTICATED,
      date,
    });
  if (kind === "invite")
    return rfc822({
      from: `${name} <no-reply@us.greenhouse-mail.io>`,
      subject: `Interview invitation: ${role} at ${name}`,
      body: `Hi Deniz,\n\nWe would like to invite you to a technical interview for the ${role} role at ${name}. Please schedule an interview using the link below.\n\n${name} Recruiting`,
      messageId: `<${id}@greenhouse-mail.io>`,
      headers: ATS_AUTHENTICATED,
      date,
    });
  return rfc822({
    from: `${name} Talent <talent@${domain}>`,
    subject: `Your application: ${role}`,
    body: `Hi Deniz,\n\nThank you for your time. Unfortunately we have decided not to move forward with your application for the ${role} position.\n\nBest,\n${name} Talent`,
    messageId: `<${id}@${domain}>`,
    date,
  });
}

/** A year of mail that was already synced before the measured rounds. */
function fillMailbox(servers: TestMailServers, account: string): void {
  const now = Date.now();
  for (let n = 0; n < 2_000; n++) {
    const date = new Date(now - (365 * DAY_MS * (2_000 - n)) / 2_000);
    servers.imap.control.addMessage("INBOX", {
      raw: everyday(account, n, date),
      flags: ["\\Seen"],
      internaldate: date,
    });
  }
  for (let n = 0; n < 150; n++) {
    const date = new Date(now - n * 2 * DAY_MS);
    servers.imap.control.addMessage("Junk", { raw: everyday(account, 10_000 + n, date), internaldate: date });
  }
  for (let n = 0; n < 300; n++) {
    const date = new Date(now - n * DAY_MS);
    servers.imap.control.addMessage("Sent", {
      raw: everyday(account, 20_000 + n, date),
      flags: ["\\Seen"],
      internaldate: date,
    });
  }
}

/**
 * One round of new mail for account `a`: 5 job emails about applications no earlier round touched
 * (2 receipts for `applied` ones, 2 rejections, 1 invitation), the rest everyday mail.
 */
function deliverRound(servers: TestMailServers, account: string, a: number, round: number): void {
  const now = new Date();
  const base = (round * ACCOUNTS.length + a) * JOB_MAIL_PER_ROUND;
  const job = [
    jobMail("receipt", base, `r${round}-${account}-receipt-1`, now),
    jobMail("rejection", base + 1, `r${round}-${account}-rejection-1`, now),
    jobMail("receipt", base + 2, `r${round}-${account}-receipt-2`, now),
    jobMail("invite", base + 3, `r${round}-${account}-invite`, now),
    jobMail("rejection", base + 4, `r${round}-${account}-rejection-2`, now),
  ];
  for (let n = 0; n < NEW_INBOX; n++) {
    const raw = n % 6 === 0 ? job[n / 6] : everyday(account, 100_000 * (round + 1) + n, now);
    if (raw === undefined) throw new Error("ran out of job mail");
    servers.imap.control.addMessage("INBOX", { raw, internaldate: now });
  }
  for (let n = 0; n < NEW_SPAM; n++)
    servers.imap.control.addMessage("Junk", {
      raw: everyday(account, 200_000 * (round + 1) + n, now),
      internaldate: now,
    });
}

/** What `mailPoll` + `mailSyncTask` do for every connected account, one account after the other. */
async function pollAndSync(): Promise<number> {
  const accounts = await getFirestore()
    .collectionGroup("mailAccounts")
    .where("status", "in", ["connected", "syncing", "error"])
    .select()
    .get();
  for (const doc of accounts.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid === undefined) continue;
    while (await runSync({ uid, accountId: doc.id, mode: "incremental" }));
  }
  return accounts.size;
}

const servers: TestMailServers[] = [];

beforeAll(async () => {
  servers.push(...(await Promise.all(ACCOUNTS.map(() => startTestMailServers()))));
  const [first] = servers;
  if (!first) throw new Error("no servers");
  setImapTestOptions(first.test);
});
afterAll(async () => {
  setImapTestOptions({});
  await Promise.all(servers.map((server) => server.stop()));
});

describe("incremental sync budget", () => {
  beforeAll(async () => {
    await clearFirestore();
    await seedProfile(UID);
    const db = getFirestore();
    for (let start = 0; start < APPLICATIONS; start += 400) {
      const batch = db.batch();
      for (let index = start; index < Math.min(APPLICATIONS, start + 400); index++) {
        const { name, domain, role } = company(index);
        const app = application({
          id: `app-${index}`,
          company: name,
          companyDomain: domain,
          role,
          status: "applied",
        });
        batch.set(db.doc(firestorePaths.application(UID, app.id)), converters.application.toFirestore(app));
      }
      await batch.commit();
    }
    for (const [a, account] of ACCOUNTS.entries()) {
      const server = servers[a];
      if (!server) throw new Error("no server");
      fillMailbox(server, account);
      await seedImapAccount(UID, account, server);
    }
    // Connecting takes each account's cursor (the lookback scan has run before).
    expect(await pollAndSync()).toBe(ACCOUNTS.length);
  }, 120_000);

  it(`syncs ${ACCOUNTS.length} accounts' new mail in under ${BUDGET_MS / 1000} s`, async () => {
    const rounds: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      for (const [a, account] of ACCOUNTS.entries()) {
        const server = servers[a];
        if (!server) throw new Error("no server");
        deliverRound(server, account, a, round);
      }
      const started = performance.now();
      await pollAndSync();
      rounds.push(Math.round(performance.now() - started));

      const stored = await listMessages(UID);
      expect(stored).toHaveLength((round + 1) * ACCOUNTS.length * JOB_MAIL_PER_ROUND);
      const seen = await getFirestore().collection(serverOnlyPaths.mailSeenCollection(UID)).count().get();
      expect(seen.data().count).toBe(
        (round + 1) * ACCOUNTS.length * (NEW_INBOX - JOB_MAIL_PER_ROUND + NEW_SPAM),
      );
    }
    const median = rounds.toSorted((a, b) => a - b)[Math.floor(ROUNDS / 2)] ?? 0;
    const result = {
      budgetMs: BUDGET_MS,
      accounts: ACCOUNTS.length,
      applications: APPLICATIONS,
      mailbox: { inbox: 2_000, spam: 150, sent: 300 },
      newMailPerAccount: { inbox: NEW_INBOX, spam: NEW_SPAM, aboutApplications: JOB_MAIL_PER_ROUND },
      roundsMs: rounds,
      medianMs: median,
      platform: `${process.platform}-${process.arch}`,
    };
    console.log(
      `incremental sync of ${ACCOUNTS.length} accounts: ${rounds.join(" / ")} ms (median ${median} ms)`,
    );
    const output = path.resolve(import.meta.dirname, "../../../../../artifacts/perf/mail-sync.json");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    for (const elapsed of rounds) expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 300_000);
});
