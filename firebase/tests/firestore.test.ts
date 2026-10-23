import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createTestEnvironment } from "./env";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnvironment();
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

// Email-link sign-in always yields a verified email (docs/adr/0008-auth-email-link.md).
const client = (uid: string) => env.authenticatedContext(uid, { email_verified: true }).firestore();
const unverified = (uid: string) => env.authenticatedContext(uid, { email_verified: false }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set(data);
  });
}

const OWNER_COLLECTIONS = ["coverLetters", "savedSearches", "interviews", "contacts", "devices"];

describe("users/{uid}: owner only", () => {
  it("lets a user read and write their own profile, but not delete it", async () => {
    await assertSucceeds(client("alice").doc("users/alice").set({ displayName: "Alice" }));
    await assertSucceeds(client("alice").doc("users/alice").update({ displayName: "Alice A." }));
    await assertSucceeds(client("alice").doc("users/alice").get());
    await assertFails(client("alice").doc("users/alice").delete());
  });

  it("keeps user A out of user B's profile", async () => {
    await seed("users/bob", { displayName: "Bob" });
    await assertFails(client("alice").doc("users/bob").get());
    await assertFails(client("alice").doc("users/bob").set({ displayName: "Mallory" }));
    await assertFails(client("alice").doc("users/bob").delete());
    await assertFails(client("alice").collection("users").get());
    await assertFails(anonymous().doc("users/bob").get());
  });

  it("denies an owner whose email is not verified (password sign-up)", async () => {
    await seed("users/alice", { displayName: "Alice" });
    await assertFails(unverified("alice").doc("users/alice").get());
    await assertFails(unverified("alice").doc("users/alice").set({ displayName: "Mallory" }));
    await assertFails(unverified("alice").doc("users/alice/contacts/c1").set({ schemaVersion: 1 }));
  });

  it.each(OWNER_COLLECTIONS)("%s: owner CRUD, other users denied", async (collection) => {
    const path = `users/alice/${collection}/doc1`;
    await assertSucceeds(client("alice").doc(path).set({ schemaVersion: 1 }));
    await assertSucceeds(client("alice").doc(path).update({ note: "updated" }));
    await assertSucceeds(client("alice").collection(`users/alice/${collection}`).get());

    await assertFails(client("bob").doc(path).get());
    await assertFails(client("bob").collection(`users/alice/${collection}`).get());
    await assertFails(client("bob").doc(path).update({ note: "hijacked" }));
    await assertFails(client("bob").doc(`users/alice/${collection}/doc2`).set({ schemaVersion: 1 }));
    await assertFails(client("bob").doc(path).delete());
    await assertFails(anonymous().doc(path).get());

    await assertSucceeds(client("alice").doc(path).delete());
  });

  it("denies collections that are not part of the layout", async () => {
    await assertFails(client("alice").doc("users/alice/unknown/doc1").set({ any: true }));
    await assertFails(client("alice").doc("users/alice/applications/a1/notes/n1").set({ any: true }));
  });
});

describe("users/{uid}/renderedFiles: create-only", () => {
  const file = "users/alice/renderedFiles/f1";

  it("lets the owner create and read, never change", async () => {
    await assertSucceeds(client("alice").doc(file).set({ kind: "pdf", sha256: "ab12" }));
    await assertSucceeds(client("alice").doc(file).get());
    await assertFails(client("alice").doc(file).update({ sha256: "cd34" }));
    await assertFails(client("alice").doc(file).delete());
    await assertFails(client("bob").doc(file).get());
    await assertFails(client("bob").doc("users/alice/renderedFiles/f2").set({ kind: "pdf" }));
  });
});

describe("users/{uid}/jobs: embedding is server-written", () => {
  it("lets the owner save and edit a job without an embedding", async () => {
    await assertSucceeds(client("alice").doc("users/alice/jobs/j1").set({ title: "Engineer" }));
    await assertSucceeds(client("alice").doc("users/alice/jobs/j1").update({ title: "Senior Engineer" }));
    await assertSucceeds(client("alice").doc("users/alice/jobs/j1").get());
    await assertFails(client("alice").doc("users/alice/jobs/j1").delete());
    await assertFails(client("bob").doc("users/alice/jobs/j1").get());
  });

  it("rejects client writes to the embedding", async () => {
    await assertFails(
      client("alice")
        .doc("users/alice/jobs/j1")
        .set({ title: "Engineer", embedding: [0.1, 0.2] }),
    );
    await seed("users/alice/jobs/j2", { title: "Engineer", embedding: [0.1, 0.2] });
    await assertFails(
      client("alice")
        .doc("users/alice/jobs/j2")
        .update({ embedding: [0.3, 0.4] }),
    );
    await assertSucceeds(client("alice").doc("users/alice/jobs/j2").update({ title: "Staff Engineer" }));
  });
});

describe("users/{uid}/cvs: optimistic concurrency", () => {
  const cv = "users/alice/cvs/cv1";

  it("creates a CV at version 1 only", async () => {
    await assertFails(client("alice").doc(cv).set({ version: 2, basics: {} }));
    await assertFails(client("alice").doc(cv).set({ basics: {} }));
    await assertSucceeds(client("alice").doc(cv).set({ version: 1, basics: {} }));
  });

  it("requires every update to bump version by exactly one", async () => {
    await seed(cv, { version: 3, basics: { name: "Alice" } });
    await assertFails(client("alice").doc(cv).update({ "basics.name": "A." }));
    await assertFails(client("alice").doc(cv).update({ version: 3, "basics.name": "A." }));
    await assertFails(client("alice").doc(cv).update({ version: 5, "basics.name": "A." }));
    await assertFails(client("alice").doc(cv).update({ version: 2, "basics.name": "A." }));
    await assertFails(client("alice").doc(cv).update({ version: "4" }));
    await assertSucceeds(client("alice").doc(cv).update({ version: 4, "basics.name": "A." }));
  });

  it("keeps other users out and is archived, not deleted", async () => {
    await seed(cv, { version: 1 });
    await assertFails(client("bob").doc(cv).get());
    await assertFails(client("bob").doc(cv).update({ version: 2 }));
    await assertFails(client("alice").doc(cv).delete());
  });
});

describe("users/{uid}/jobMatches: save and dismiss only", () => {
  const match = "users/alice/jobMatches/j1";

  beforeEach(() =>
    seed(match, {
      score: 82,
      state: "new",
      dismissReasons: [],
      stateChangedAt: null,
      computedAt: new Date(),
    }),
  );

  it("lets the owner save or dismiss a match", async () => {
    await assertSucceeds(client("alice").doc(match).get());
    await assertSucceeds(client("alice").doc(match).update({ state: "saved", stateChangedAt: new Date() }));
    await assertSucceeds(
      client("alice")
        .doc(match)
        .update({ state: "dismissed", dismissReasons: ["salary", "location"], stateChangedAt: new Date() }),
    );
  });

  it("rejects other fields, unknown states, create and delete", async () => {
    await assertFails(client("alice").doc(match).update({ score: 100 }));
    await assertFails(client("alice").doc(match).update({ state: "saved", score: 100 }));
    await assertFails(client("alice").doc(match).update({ state: "applied" }));
    await assertFails(client("alice").doc("users/alice/jobMatches/j2").set({ state: "new", score: 50 }));
    await assertFails(client("alice").doc(match).delete());
    await assertFails(client("bob").doc(match).get());
    await assertFails(client("bob").doc(match).update({ state: "dismissed" }));
  });
});

describe("users/{uid}/applications: pins are write-once after appliedAt", () => {
  const application = "users/alice/applications/a1";
  const pins = { cvRevisionId: null, cvFileId: null, coverLetterId: null, coverLetterFileId: null };

  it("lets the owner manage applications before applying", async () => {
    await assertSucceeds(
      client("alice")
        .doc(application)
        .set({ status: "saved", appliedAt: null, ...pins }),
    );
    await assertSucceeds(client("alice").doc(application).update({ cvRevisionId: "r1", cvFileId: "f1" }));
    await assertSucceeds(client("alice").doc(application).update({ cvRevisionId: "r2", cvFileId: null }));
    await assertSucceeds(client("alice").doc(application).get());
    await assertSucceeds(client("alice").doc(application).delete());
    await assertFails(client("bob").doc("users/alice/applications/a2").set({ status: "saved" }));
  });

  it("allows setting pins together with appliedAt and filling empty pins afterwards", async () => {
    await seed(application, { status: "preparing", appliedAt: null, ...pins });
    await assertSucceeds(
      client("alice")
        .doc(application)
        .update({ status: "applied", appliedAt: new Date(), cvRevisionId: "r1" }),
    );
    await assertSucceeds(
      client("alice").doc(application).update({ coverLetterId: "cl1", coverLetterFileId: "f2" }),
    );
    await assertSucceeds(
      client("alice").doc(application).update({ status: "screening", notes: "Call on Monday" }),
    );
  });

  it("forbids changing or clearing a pin once applied", async () => {
    await seed(application, {
      status: "applied",
      appliedAt: new Date(),
      ...pins,
      cvRevisionId: "r1",
      cvFileId: "f1",
    });
    await assertFails(client("alice").doc(application).update({ cvRevisionId: "r2" }));
    await assertFails(client("alice").doc(application).update({ cvFileId: null }));
    await assertFails(client("alice").doc(application).update({ appliedAt: null }));
    await assertFails(client("alice").doc(application).update({ appliedAt: null, cvRevisionId: "r2" }));
    await assertSucceeds(
      client("alice")
        .doc(application)
        .update({ appliedAt: new Date("2026-10-20T09:00:00Z") }),
    );
  });

  it("keeps other users out", async () => {
    await seed(application, { status: "applied", appliedAt: new Date(), ...pins });
    await assertFails(client("bob").doc(application).get());
    await assertFails(client("bob").doc(application).update({ notes: "hijacked" }));
    await assertFails(client("bob").doc(application).delete());
  });
});

describe("users/{uid}/cvs/{cvId}/revisions: immutable", () => {
  const revision = "users/alice/cvs/cv1/revisions/r1";

  it("allows create and read by the owner", async () => {
    await assertSucceeds(client("alice").doc(revision).set({ cvVersion: 1, content: {} }));
    await assertSucceeds(client("alice").doc(revision).get());
  });

  it("forbids update and delete, even by the owner", async () => {
    await seed(revision, { cvVersion: 1, content: {} });
    await assertFails(
      client("alice")
        .doc(revision)
        .update({ content: { changed: true } }),
    );
    await assertFails(client("alice").doc(revision).set({ cvVersion: 2, content: {} }));
    await assertFails(client("alice").doc(revision).delete());
  });

  it("keeps other users out", async () => {
    await seed(revision, { cvVersion: 1, content: {} });
    await assertFails(client("bob").doc(revision).get());
    await assertFails(client("bob").doc("users/alice/cvs/cv1/revisions/r2").set({ cvVersion: 1 }));
  });
});

describe("users/{uid}/applicationEvents: append-only", () => {
  const event = "users/alice/applicationEvents/e1";

  it("lets the owner append user events", async () => {
    await assertSucceeds(
      client("alice").doc(event).set({ applicationId: "a1", actor: "user", toStatus: "applied" }),
    );
    await assertSucceeds(client("alice").doc(event).get());
  });

  it("leaves rule and AI events to the server", async () => {
    await assertFails(
      client("alice").doc(event).set({ applicationId: "a1", actor: "ai", toStatus: "rejected" }),
    );
    await assertFails(client("alice").doc(event).set({ applicationId: "a1", toStatus: "applied" }));
  });

  it("forbids changing or deleting history", async () => {
    await seed(event, { applicationId: "a1", actor: "user", toStatus: "applied" });
    await assertFails(client("alice").doc(event).update({ toStatus: "offer" }));
    await assertFails(client("alice").doc(event).delete());
    await assertFails(client("bob").doc(event).get());
  });
});

describe("users/{uid}/mailAccounts: client read-only", () => {
  const account = "users/alice/mailAccounts/m1";

  it("lets the owner read status and nothing else", async () => {
    await seed(account, { provider: "gmail", status: "connected" });
    await assertSucceeds(client("alice").doc(account).get());
    await assertFails(client("alice").doc(account).update({ status: "paused" }));
    await assertFails(client("alice").doc(account).delete());
    await assertFails(client("alice").doc("users/alice/mailAccounts/m2").set({ provider: "imap" }));
    await assertFails(client("bob").doc(account).get());
  });
});

describe("users/{uid}/mailMessages: review fields only", () => {
  const message = "users/alice/mailMessages/msg1";

  beforeEach(() =>
    seed(message, { subject: "Your application", from: "jobs@acme.example", reviewState: "pending" }),
  );

  it("lets the owner review a message", async () => {
    await assertSucceeds(client("alice").doc(message).get());
    await assertSucceeds(client("alice").doc(message).update({ reviewState: "confirmed" }));
    await assertSucceeds(
      client("alice")
        .doc(message)
        .update({ applicationId: "a1", category: "interview", reviewedAt: new Date() }),
    );
    await assertSucceeds(
      client("alice").doc(message).update({ reviewState: "dismissed", category: "other" }),
    );
  });

  it("rejects changes to any other field", async () => {
    await assertFails(client("alice").doc(message).update({ subject: "Edited" }));
    await assertFails(
      client("alice").doc(message).update({ reviewState: "confirmed", from: "spoof@example.com" }),
    );
    await assertFails(client("alice").doc(message).set({ reviewState: "confirmed" }));
  });

  it("rejects review states the client may not set", async () => {
    await assertFails(client("alice").doc(message).update({ reviewState: "pending" }));
    await assertFails(client("alice").doc(message).update({ reviewState: "auto_applied" }));
    // Every client review lands in a client state, so the server's pending/auto states can't be kept.
    await assertFails(client("alice").doc(message).update({ category: "interview" }));
  });

  it("forbids create and delete, and other users", async () => {
    await assertFails(client("alice").doc("users/alice/mailMessages/msg2").set({ reviewState: "confirmed" }));
    await assertFails(client("alice").doc(message).delete());
    await assertFails(client("bob").doc(message).get());
    await assertFails(client("bob").doc(message).update({ reviewState: "confirmed" }));
  });
});

describe("appConfig/{platform}: public read, server write", () => {
  it("is readable without signing in", async () => {
    await seed("appConfig/ios", { minimumVersion: "0.1.0" });
    await assertSucceeds(anonymous().doc("appConfig/ios").get());
    await assertSucceeds(client("alice").doc("appConfig/ios").get());
  });

  it("is not writable by clients", async () => {
    await seed("appConfig/ios", { minimumVersion: "0.1.0" });
    await assertFails(anonymous().doc("appConfig/ios").update({ minimumVersion: "0.0.1" }));
    await assertFails(client("alice").doc("appConfig/ios").update({ minimumVersion: "0.0.1" }));
    await assertFails(client("alice").doc("appConfig/desktop").set({ minimumVersion: "0.0.1" }));
    await assertFails(client("alice").doc("appConfig/ios").delete());
  });
});

describe("users/{uid}/watchlist: clients own name, URL and switch only", () => {
  const entry = "users/alice/watchlist/w1";
  const pending = {
    name: "Acme",
    careersUrl: "https://jobs.lever.co/acme",
    enabled: true,
    ats: null,
    boardToken: null,
    companyDomain: null,
    status: "pending",
    lastError: null,
    openJobs: null,
    lastFetchedAt: null,
    schemaVersion: 1,
  };

  it("lets the owner add a pending entry, edit their fields and delete it", async () => {
    await assertSucceeds(client("alice").doc(entry).set(pending));
    await assertSucceeds(
      client("alice").doc(entry).update({ name: "Acme Inc.", enabled: false, updatedAt: new Date() }),
    );
    await assertSucceeds(client("alice").doc(entry).update({ careersUrl: "https://jobs.lever.co/acme-eu" }));
    await assertSucceeds(client("alice").collection("users/alice/watchlist").get());
    await assertSucceeds(client("alice").doc(entry).delete());
  });

  it("rejects client-written resolution fields", async () => {
    await assertFails(
      client("alice")
        .doc(entry)
        .set({ ...pending, status: "ok" }),
    );
    await assertFails(
      client("alice")
        .doc(entry)
        .set({ ...pending, ats: "lever", boardToken: "acme" }),
    );
    await assertFails(
      client("alice")
        .doc(entry)
        .set({ ...pending, openJobs: 12 }),
    );
    await seed(entry, { ...pending, status: "ok", ats: "lever", boardToken: "acme" });
    await assertFails(client("alice").doc(entry).update({ status: "pending" }));
    await assertFails(client("alice").doc(entry).update({ boardToken: "other" }));
    await assertFails(client("alice").doc(entry).update({ lastError: null, openJobs: 0 }));
  });

  it("keeps other users out", async () => {
    await seed(entry, pending);
    await assertFails(client("bob").doc(entry).get());
    await assertFails(client("bob").doc(entry).update({ name: "Mallory" }));
    await assertFails(client("bob").doc("users/alice/watchlist/w2").set(pending));
    await assertFails(client("bob").doc(entry).delete());
    await assertFails(unverified("alice").doc(entry).get());
  });
});

describe("jobSources/{sourceId}: read by signed-in users, server write", () => {
  const health = { label: "Remotive", kind: "keyless", state: "ok", reason: null, lastError: null };

  it("is readable by verified users only", async () => {
    await seed("jobSources/remotive", health);
    await assertSucceeds(client("alice").doc("jobSources/remotive").get());
    await assertSucceeds(client("bob").collection("jobSources").get());
    await assertFails(unverified("alice").doc("jobSources/remotive").get());
    await assertFails(anonymous().doc("jobSources/remotive").get());
  });

  it("is not writable by clients", async () => {
    await seed("jobSources/remotive", health);
    await assertFails(client("alice").doc("jobSources/remotive").update({ state: "failing" }));
    await assertFails(client("alice").doc("jobSources/adzuna").set(health));
    await assertFails(client("alice").doc("jobSources/remotive").delete());
  });
});

describe("serverOnly/**: no client access", () => {
  it.each([
    "serverOnly/mail/tokens/acc-gmail",
    "serverOnly/jobSources/keys/adzuna",
    // The user's own AI spend ledger is server-only too: clients must not reset their daily cap.
    "serverOnly/aiUsage/users/alice/aiUsageDays/2026-10-23",
    // Job search budget and pending alerts: clients must not reset limits or forge alerts.
    "serverOnly/jobQuota/users/alice/jobQuotaDays/2026-10-24",
    "serverOnly/jobAlerts/users/alice/jobAlertItems/j1",
    "serverOnly/jobSources/state/remotive",
  ])("%s", async (path) => {
    await seed(path, { secret: true });
    await assertFails(client("alice").doc(path).get());
    await assertFails(client("alice").doc(path).set({ secret: false }));
    await assertFails(client("alice").doc(path).delete());
    await assertFails(anonymous().doc(path).get());
  });
});

describe("unknown top-level paths", () => {
  it("are denied", async () => {
    await assertFails(client("alice").doc("jobs/j1").get());
    await assertFails(client("alice").doc("jobs/j1").set({ title: "Engineer" }));
  });
});
