// Live check of the deployed `jobImportUrl` callable (docs/adr/0005-job-sources-scraping.md, URL
// import). Creates a throwaway user, signs it in with an Admin-generated email link (verified email,
// like the apps), imports real public postings over HTTPS like the apps do, confirms one import the
// way a client does (create users/{uid}/jobs) and imports it again to prove the duplicate is
// merged, probes the SSRF guard, prints a Markdown table, then deletes the user and everything it
// created. AI fallback pages cost a fraction of a cent.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:job-import [url ...]
import { createConverters } from "@bfhr/api";
import { jobFromWire, JobImportUrlResponseSchema } from "@bfhr/core";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT = "bruteforcehr";
const REGION = "europe-west1";
/** Web API key (public client config, apps/desktop/src/lib/firebase.ts). */
const WEB_API_KEY = "AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag";

/** Public postings from the sites the import supports (recorded 2026-10-24; postings expire). */
const DEFAULT_URLS = [
  "Saw this on LinkedIn https://www.linkedin.com/jobs/view/2027-university-graduate-software-engineer-at-adobe-4470036822/?trk=public_jobs",
  "https://job-boards.greenhouse.io/anthropic/jobs/5456619008",
  "https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd",
  "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
  "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineering-Manager--Graphics-System-Software_JR2028533",
  "https://www.kariyer.net/is-ilani/logo-yazilim-san-ve-tic-a-s-yazilim-gelistirme-uzmani-4573334",
  "https://www.xing.com/jobs/bayreuth-senior-specialist-cae-engineering-156020738",
  "https://ultralytics.jobs.personio.com/job/1874062?language=en",
  "https://www.stepstone.de/stellenangebote--Software-Entwickler-m-w-d-Kiel-Anschuetz-GmbH--14533598-inline.html",
  "https://de.indeed.com/viewjob?jk=4b5d7c1e2f3a4b5c",
  "https://www.glassdoor.com/job-listing/software-engineer-JV_IC1147401_KO0,17.htm?jl=1009412345678",
];

/** SSRF probes: each must be refused before any request leaves the function. */
const SSRF_URLS = [
  "https://169.254.169.254/latest/meta-data/",
  "https://metadata.google.internal/computeMetadata/v1/",
  "https://localhost/",
  "https://127.0.0.1:8443/",
  "http://example.com/plain-http-is-upgraded",
];

initializeApp({ projectId: PROJECT });
const converters = createConverters<Timestamp>({
  fromDate: (date) => Timestamp.fromDate(date),
  toDate: (value) => value.toDate(),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
});

interface CallableReply {
  result?: unknown;
  error?: { status: string; message: string; details?: { reason?: string } };
}

async function call(idToken: string, data: unknown): Promise<{ reply: CallableReply; ms: number }> {
  const started = Date.now();
  const response = await fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/jobImportUrl`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const text = await response.text();
  try {
    return { reply: JSON.parse(text) as CallableReply, ms: Date.now() - started };
  } catch {
    // Infrastructure errors (e.g. a timeout) come back as HTML.
    return {
      reply: { error: { status: `HTTP ${response.status}`, message: text.slice(0, 200) } },
      ms: Date.now() - started,
    };
  }
}

const cell = (value: unknown): string =>
  String(value ?? "—")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .slice(0, 60);

const email = `job-import-check-${Date.now()}@example.com`;
const user = await getAuth().createUser({ email });
const uid = user.uid;
console.log(`created test user ${uid}`);
try {
  const link = await getAuth().generateSignInWithEmailLink(email, {
    url: `https://${PROJECT}.web.app/auth/finish`,
    handleCodeInApp: true,
  });
  const oobCode = new URL(link).searchParams.get("oobCode");
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithEmailLink?key=${WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "tauri://localhost/" },
      body: JSON.stringify({ email, oobCode }),
    },
  );
  const { idToken } = (await signIn.json()) as { idToken?: string };
  if (idToken === undefined) throw new Error("sign-in failed");

  const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;
  const rows: string[] = [
    "| URL | Outcome | Method | Site | Title | Company | Location | Description | Robots | Time |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  let firstImported: { url: string; wire: unknown } | null = null;
  for (const url of urls) {
    const { reply, ms } = await call(idToken, { url });
    if (reply.error !== undefined) {
      rows.push(
        `| ${cell(url)} | ${reply.error.details?.reason ?? reply.error.status} | — | — | — | — | — | — | — | ${ms} ms |`,
      );
      continue;
    }
    const response = JobImportUrlResponseSchema.parse(reply.result);
    firstImported ??= { url, wire: response.job };
    rows.push(
      `| ${cell(url)} | ok | ${response.method} | ${cell(response.site)} | ${cell(response.job.title)} | ${cell(response.job.company)} | ${cell(
        response.job.locations.map((location) => location.label).join("; "),
      )} | ${response.job.description.length} chars, ${response.job.language} | ${response.robots} | ${ms} ms |`,
    );
  }
  console.log(`\n${rows.join("\n")}`);

  if (firstImported !== null) {
    // What a client does after "Save": create the job document; then the same link again.
    const draft = jobFromWire(JobImportUrlResponseSchema.shape.job.parse(firstImported.wire));
    const ref = getFirestore().collection(`users/${uid}/jobs`).doc();
    await ref.set(converters.job.toFirestore({ ...draft, id: ref.id }));
    const again = await call(idToken, { url: firstImported.url });
    const merged = JobImportUrlResponseSchema.parse(again.reply.result);
    console.log(
      `\ndedupe: second import of the same link → existingJobId ${merged.existingJobId === ref.id ? "= saved job ✔" : `${merged.existingJobId} ✘`}, sources ${merged.job.sources.length}, ${again.ms} ms (cached)`,
    );
  }

  console.log("\nSSRF probes:");
  for (const url of SSRF_URLS) {
    const { reply } = await call(idToken, { url, refresh: true });
    console.log(
      `  ${url} → ${reply.error?.details?.reason ?? (reply.result === undefined ? reply.error?.status : "ok")}`,
    );
  }
} finally {
  await getFirestore().recursiveDelete(getFirestore().doc(`users/${uid}`));
  await getFirestore().recursiveDelete(getFirestore().doc(`serverOnly/jobImport/users/${uid}`));
  await getFirestore().recursiveDelete(getFirestore().doc(`serverOnly/aiUsage/users/${uid}`));
  await getAuth().deleteUser(uid);
  const left = await getFirestore()
    .collection(`serverOnly/jobImport/users/${uid}/jobImportPages`)
    .limit(1)
    .get();
  console.log(`\ncleanup: user deleted, cached imports left=${left.size}`);
}
