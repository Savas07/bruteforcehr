// Live check of the deployed Jobs functions (docs/runbooks/jobs.md, docs/adr/0011-embeddings-matching.md).
// Creates a throwaway user signed in with a real email link (so the email is verified like in the
// apps), seeds a profile, a saved search and a followed company, calls savedSearchRunNow and
// jobsSearch over HTTPS, prints the jobs, matches, rationale, alerts and source health it finds,
// then removes everything with deleteUserData and deletes the Auth user.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions smoke:jobs
// First: initializes the Admin app before src/callable.ts would (see live-app.ts).
import { PROJECT, REGION, WEB_API_KEY } from "./live-app";
import { setTimeout as sleep } from "node:timers/promises";
import { firestorePaths, serverOnlyPaths } from "@bfhr/api";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PROFILE_SETTINGS,
  type Profile,
  type SavedSearch,
  WATCHLIST_PENDING_FIELDS,
} from "@bfhr/core";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { deleteUserData } from "../src/account/user-data";
import { adminConverters } from "../src/converters";

const db = getFirestore();

interface CallableReply {
  result?: unknown;
  error?: { status: string; message: string; details?: unknown };
}

async function call(name: string, idToken: string, data: unknown): Promise<CallableReply> {
  const response = await fetch(`https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  return (await response.json()) as CallableReply;
}

const show = (label: string, value: unknown): void =>
  console.log(`\n=== ${label}\n${JSON.stringify(value, null, 2)}`);

const email = `jobs-smoke-${Date.now()}@example.com`;
const user = await getAuth().createUser({ email });
const uid = user.uid;
console.log(`created test user ${uid} <${email}>`);
const now = new Date();
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
  const signedIn = (await signIn.json()) as { idToken?: string; error?: unknown };
  if (signedIn.idToken === undefined)
    throw new Error(`email-link sign-in failed: ${JSON.stringify(signedIn.error)}`);
  const idToken = signedIn.idToken;

  const profile: Profile = {
    id: uid,
    fullName: "Smoke Test",
    email,
    phone: null,
    headline: "Backend engineer",
    links: [],
    targetRoles: ["Backend Engineer", "Software Engineer"],
    seniority: "senior",
    locations: [
      { label: "Berlin", city: "Berlin", countryCode: "DE", relocation: true },
      { label: "Istanbul", city: "Istanbul", countryCode: "TR", relocation: false },
    ],
    remotePreferences: ["remote", "hybrid"],
    salaryFloor: null,
    workAuthorization: [{ region: "TR", status: "citizen" }],
    languages: [
      { language: "en", level: "C1" },
      { language: "tr", level: "native" },
    ],
    timezone: "Europe/Istanbul",
    uiLanguage: "en",
    hiddenCompanies: [],
    skills: ["typescript", "node.js", "postgresql", "aws", "docker"],
    defaultCvId: null,
    onboardingCompletedAt: now,
    aiEnabled: true,
    settings: DEFAULT_PROFILE_SETTINGS,
    createdAt: now,
    updatedAt: now,
  };
  await db.doc(firestorePaths.user(uid)).set(adminConverters.profile.toFirestore(profile));

  const search: SavedSearch = {
    id: "smoke",
    name: "Remote backend",
    query: "backend engineer",
    filters: {
      countryCodes: [],
      remoteTypes: ["remote"],
      seniority: [],
      salaryMin: null,
      sources: [],
      postedWithinDays: 30,
      visaSponsorship: null,
    },
    schedule: "daily",
    alertThreshold: 60,
    dailyDigest: true,
    enabled: false,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db
    .doc(firestorePaths.savedSearch(uid, search.id))
    .set(adminConverters.savedSearch.toFirestore(search));
  await db.doc(firestorePaths.watchedCompany(uid, "gitlab")).set({
    name: "GitLab",
    careersUrl: "https://job-boards.greenhouse.io/gitlab",
    enabled: true,
    ...WATCHLIST_PENDING_FIELDS,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });

  const started = Date.now();
  const run = await call("savedSearchRunNow", idToken, { savedSearchId: search.id });
  show(`savedSearchRunNow (${Date.now() - started} ms)`, run);

  const searched = await call("jobsSearch", idToken, {
    query: "typescript developer",
    filters: { ...search.filters, remoteTypes: ["remote"], postedWithinDays: 14 },
    limit: 10,
  });
  show("jobsSearch", {
    counts: (searched.result as { counts?: unknown } | undefined)?.counts,
    error: searched.error,
  });
  show(
    "jobsSearch again within 15 s (rate limit)",
    (await call("jobsSearch", idToken, { query: "x", filters: search.filters })).error,
  );

  const jobs = await db.collection(firestorePaths.jobs(uid)).get();
  const withVector = jobs.docs.filter((doc) => doc.get("embedding") !== undefined).length;
  const multiSource = jobs.docs.filter((doc) => (doc.get("sources") as unknown[]).length > 1).length;
  const matches = (
    await db.collection(firestorePaths.jobMatches(uid)).orderBy("score", "desc").get()
  ).docs.map((doc) => adminConverters.jobMatch.fromSnapshot(doc));
  show("stored", {
    jobs: jobs.size,
    jobsWithEmbedding: withVector,
    jobsWithSeveralSources: multiSource,
    matches: matches.length,
    withRationale: matches.filter((match) => match.rationale !== null).length,
  });
  const top = matches.slice(0, 3).map((match) => {
    const job = jobs.docs.find((doc) => doc.id === match.id);
    return {
      title: job?.get("title"),
      company: job?.get("company"),
      sources: (job?.get("sources") as { source: string }[] | undefined)?.map((source) => source.source),
      score: match.score,
      requirements: match.reasons
        .concat(match.gaps)
        .filter((factor) => factor.kind === "requirement")
        .map((factor) => `${factor.facet}:${factor.status}`),
      skills: match.skills,
      rationale: match.rationale,
    };
  });
  show("top matches", top);

  const refreshed = await call("jobMatchesRefresh", idToken, {});
  show("jobMatchesRefresh (vector search)", refreshed);

  const alerts = await db.collection(`${serverOnlyPaths.jobAlertsRoot(uid)}/jobAlertItems`).get();
  show(
    "pending alerts",
    alerts.docs.map((doc) => ({
      jobId: doc.id,
      score: doc.get("score"),
      savedSearchId: doc.get("savedSearchId"),
    })),
  );

  for (let attempt = 0; attempt < 10; attempt++) {
    const company = await db.doc(firestorePaths.watchedCompany(uid, "gitlab")).get();
    if (company.get("status") !== "pending") {
      show("watchlist (GitLab)", {
        status: company.get("status"),
        ats: company.get("ats"),
        boardToken: company.get("boardToken"),
        openJobs: company.get("openJobs"),
      });
      break;
    }
    await sleep(3_000);
  }

  const health = await db.collection(firestorePaths.jobSources()).get();
  show(
    "jobSources",
    health.docs.map(
      (doc) =>
        `${doc.id}: ${doc.get("state")}${doc.get("reason") === null ? "" : ` (${doc.get("reason")})`} · ${doc.get("lastResultCount") ?? "–"}`,
    ),
  );
} finally {
  await deleteUserData(db, getStorage().bucket(), uid);
  await getAuth().deleteUser(uid);
  const leftovers = await Promise.all([
    db.doc(firestorePaths.user(uid)).listCollections(),
    db.doc(serverOnlyPaths.jobQuotaRoot(uid)).listCollections(),
    db.doc(serverOnlyPaths.jobAlertsRoot(uid)).listCollections(),
  ]);
  console.log(
    `\ncleanup: user data deleted (remaining collections: ${leftovers.flat().length}), auth user deleted`,
  );
}
