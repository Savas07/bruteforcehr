// "Export everything" and "Delete account" against the Auth, Firestore and Storage emulators
// (docs/runbooks/account.md). Seeds a document in every per-user collection and serverOnly tree, and
// a file under every Storage area, then checks the ZIP (expected files, no secrets) and that
// deletion leaves nothing under any root, in Storage or in Auth.
import {
  COLLECTION_IDS,
  DOCUMENT_PATTERNS,
  firestorePaths,
  serverOnlyPaths,
  storagePaths,
  userDataRoots,
  userStoragePrefix,
} from "@bfhr/api";
import { ACCOUNT_EXPORT_LIMITS, type AccountExportResponse } from "@bfhr/core";
import { strFromU8, unzipSync } from "fflate";
import { getAuth } from "firebase-admin/auth";
import { type DocumentReference, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { CallableRequest } from "firebase-functions/v2/https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveMailSecret, secretRefOf } from "../mail/accounts";
import { clearFirestore } from "../mail/emulator/helpers";
import { createExport, ExportRefused } from "./export";
import { accountDelete, accountExport } from "./functions";

if (process.env["FIREBASE_AUTH_EMULATOR_HOST"] === undefined)
  throw new Error("Run with the Auth emulator: `pnpm --filter @bfhr/functions test:emulator`.");
const UID = "user-account";
const OTHER = "user-other";
const EMAIL = "deniz@mail.example";
const REFRESH_TOKEN = "1//google-refresh-token-SECRET";
const IMAP_PASSWORD = "abcd-efgh-ijkl-SECRET";
const PUSH_TOKEN = "fcm-registration-token-SECRET";
const db = () => getFirestore();
const bucket = () => getStorage().bucket();

/** One document per user collection (every `users/{uid}/…` entity of DOCUMENT_PATTERNS). */
function userDocuments(uid: string): Record<string, Record<string, unknown>> {
  const at = Timestamp.fromDate(new Date("2026-10-20T09:30:00Z"));
  return {
    [firestorePaths.user(uid)]: { fullName: "Deniz Arslan", email: EMAIL, timezone: "Europe/Istanbul" },
    [firestorePaths.cv(uid, "cv-1")]: { title: "Backend CV", version: 1, createdAt: at },
    [firestorePaths.cvRevision(uid, "cv-1", "rev-1")]: { summary: "Go and Kotlin", createdAt: at },
    [firestorePaths.renderedFile(uid, "file-1")]: {
      kind: "pdf",
      fileName: "Deniz-Arslan-CV.pdf",
      storagePath: storagePaths.renderedFile(uid, "file-1"),
    },
    [firestorePaths.coverLetter(uid, "cl-1")]: { title: "Initech", body: "Dear team" },
    [firestorePaths.job(uid, "job-1")]: {
      title: "Backend Engineer",
      company: "Initech",
      embedding: FieldValue.vector([0.1, 0.2, 0.3]),
    },
    [firestorePaths.jobMatch(uid, "job-1")]: { score: 0.82 },
    [firestorePaths.savedSearch(uid, "search-1")]: { name: "Berlin backend", query: "backend" },
    [firestorePaths.watchedCompany(uid, "company-1")]: { name: "Initech", status: "ok" },
    [firestorePaths.application(uid, "app-1")]: { company: "Initech", status: "applied", appliedAt: at },
    [firestorePaths.applicationEvent(uid, "event-1")]: { applicationId: "app-1", type: "status_changed" },
    [firestorePaths.interview(uid, "interview-1")]: { applicationId: "app-1", startsAt: at },
    [firestorePaths.contact(uid, "contact-1")]: { name: "Ayşe Recruiter", email: "ayse@initech.example" },
    [firestorePaths.mailAccount(uid, "acc-google")]: {
      provider: "gmail",
      address: "deniz@gmail.example",
      status: "connected",
      secretRef: secretRefOf(uid, "acc-google"),
    },
    [firestorePaths.mailAccount(uid, "acc-imap")]: {
      provider: "imap",
      address: "deniz@icloud.example",
      status: "connected",
      secretRef: secretRefOf(uid, "acc-imap"),
    },
    [firestorePaths.mailMessage(uid, "msg-1")]: { accountId: "acc-google", subject: "Interview invite" },
    [firestorePaths.device(uid, "device-1")]: { platform: "ios", pushToken: PUSH_TOKEN, locale: "tr-TR" },
    [serverOnlyPaths.aiUsageDay(uid, "2026-10-20")]: { microUsd: 1200 },
    [serverOnlyPaths.jobAlert(uid, "job-1")]: { score: 0.82 },
    [serverOnlyPaths.jobQuotaDay(uid, "2026-10-20")]: { search: 3 },
    [serverOnlyPaths.jobImportPage(uid, "c".repeat(64))]: {
      url: "https://jobs.example/backend",
      status: "ok",
    },
    [serverOnlyPaths.mailSeen(uid, "a".repeat(64))]: { accountId: "acc-google" },
    [serverOnlyPaths.mailOutbox(uid, "send-1")]: { subject: "Application", bodyText: "Hello" },
    [serverOnlyPaths.mailSendDay(uid, "2026-10-20")]: { count: 1 },
    [`${serverOnlyPaths.mailCorrections(uid)}/fix-1`]: { from: "other", to: "interview" },
    [serverOnlyPaths.accountExportDay(uid, "2026-10-19")]: { count: 1 },
    [serverOnlyPaths.renderDay(uid, "2026-10-20")]: { count: 2 },
    [serverOnlyPaths.mailConnectDay(uid, "2026-10-20")]: { attempts: 1 },
  };
}

const FILES = (uid: string): Record<string, string> => ({
  [storagePaths.cvImport(uid, "import-1")]: "%PDF-1.7 imported CV",
  [storagePaths.renderedFile(uid, "file-1")]: "%PDF-1.7 rendered CV",
  [storagePaths.cvPhoto(uid, "photo-1")]: "JPEG photo bytes",
  [storagePaths.mailAttachment(uid, "attachment-1")]: "%PDF-1.7 attachment",
});

async function seedUser(uid: string): Promise<void> {
  const batch = db().batch();
  for (const [path, data] of Object.entries(userDocuments(uid))) batch.set(db().doc(path), data);
  await batch.commit();
  await saveMailSecret(uid, "acc-google", {
    kind: "oauth",
    provider: "google",
    refreshToken: REFRESH_TOKEN,
    accessToken: null,
    expiresAt: 0,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
  await saveMailSecret(uid, "acc-imap", {
    kind: "imap",
    username: "deniz@icloud.example",
    password: IMAP_PASSWORD,
    imap: { host: "imap.mail.me.com", port: 993, security: "tls" },
    smtp: null,
    smtpSavesSent: false,
    smtpUsername: null,
  });
  for (const [path, content] of Object.entries(FILES(uid)))
    await bucket().file(path).save(Buffer.from(content), { contentType: "application/octet-stream" });
}

async function storageNames(uid: string): Promise<string[]> {
  const [files] = await bucket().getFiles({ prefix: userStoragePrefix(uid) });
  return files.map((file) => file.name);
}

/** Every document path left under the user's roots (including "missing" parents of subcollections). */
async function remainingDocuments(uid: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (ref: DocumentReference): Promise<void> => {
    if ((await ref.get()).exists) found.push(ref.path);
    for (const collection of await ref.listCollections())
      for (const child of await collection.listDocuments()) await visit(child);
  };
  for (const root of userDataRoots(uid)) await visit(db().doc(root));
  return found;
}

function callable(uid: string, token: Record<string, unknown> = {}): CallableRequest<unknown> {
  return {
    auth: {
      uid,
      token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000), ...token } as never,
      rawToken: "test",
    },
    data: {},
    rawRequest: {} as never,
    acceptsStreaming: false,
  };
}

const realFetch = globalThis.fetch;
let revoked: string[] = [];

async function resetStorage(): Promise<void> {
  for (const uid of [UID, OTHER]) await bucket().deleteFiles({ prefix: userStoragePrefix(uid) });
}

async function resetAuth(): Promise<void> {
  for (const uid of [UID, OTHER])
    await getAuth()
      .deleteUser(uid)
      .catch(() => undefined);
}

beforeEach(async () => {
  await clearFirestore();
  await resetStorage();
  await resetAuth();
  revoked = [];
  // Google's revocation endpoint is the only network call; everything else goes to the emulators.
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) {
      revoked.push(new URLSearchParams(String(init?.body)).get("token") ?? "");
      return new Response("", { status: 200 });
    }
    return realFetch(input, init);
  });
  await seedUser(UID);
  await seedUser(OTHER);
  await getAuth().createUser({ uid: UID, email: EMAIL, emailVerified: true });
  await getAuth().createUser({ uid: OTHER, email: "other@mail.example", emailVerified: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("seed coverage", () => {
  it("seeds every per-user collection, so a new collection can't skip these tests", () => {
    const seeded = new Set(
      Object.keys(userDocuments(UID)).flatMap((path) => path.split("/").filter((_, i) => i % 2 === 0)),
    );
    const userCollections = Object.values(DOCUMENT_PATTERNS)
      .filter((pattern) => pattern.startsWith("users/{"))
      .flatMap((pattern) => pattern.split("/").filter((_, i) => i % 2 === 0));
    for (const collection of userCollections) expect(seeded, collection).toContain(collection);
    expect(seeded).toContain(COLLECTION_IDS.users);
    for (const root of userDataRoots(UID))
      expect(
        Object.keys(userDocuments(UID)).some((path) => path.startsWith(`${root}/`) || path === root),
        root,
      ).toBe(true);
  });
});

describe("accountExport", () => {
  it("zips every collection and file, without secrets or other users' data", async () => {
    const response = (await accountExport.run(callable(UID))) as AccountExportResponse;
    expect(response.storagePath).toBe(storagePaths.accountExport(UID, response.exportId));
    expect(response.fileName).toMatch(/^BruteForceHR-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(response.fileCount).toBe(4);
    expect(Date.parse(response.expiresAt) - Date.parse(response.createdAt)).toBe(
      ACCOUNT_EXPORT_LIMITS.availableDays * 86_400_000,
    );

    const [bytes] = await bucket().file(response.storagePath).download();
    expect(bytes.byteLength).toBe(response.sizeBytes);
    const zip = unzipSync(new Uint8Array(bytes));
    const names = Object.keys(zip).sort();
    expect(names).toEqual(
      [
        "README.md",
        "data/profile.json",
        "data/applicationEvents.json",
        "data/applications.json",
        "data/contacts.json",
        "data/coverLetters.json",
        "data/cvs.json",
        "data/cvs/revisions.json",
        "data/devices.json",
        "data/interviews.json",
        "data/jobMatches.json",
        "data/jobs.json",
        "data/mailAccounts.json",
        "data/mailMessages.json",
        "data/renderedFiles.json",
        "data/savedSearches.json",
        "data/watchlist.json",
        "data/internal/accountExport/accountExportDays.json",
        "data/internal/aiUsage/aiUsageDays.json",
        "data/internal/jobAlerts/jobAlertItems.json",
        "data/internal/jobQuota/jobQuotaDays.json",
        "data/internal/render/renderDays.json",
        "data/internal/jobImport/jobImportPages.json",
        "data/internal/mail/mailCorrections.json",
        "data/internal/mail/mailOutbox.json",
        "data/internal/mail/mailSeen.json",
        "data/internal/mail/mailConnectDays.json",
        "data/internal/mail/mailSendDays.json",
        "files/cv-imports/import-1",
        "files/cv-photos/photo-1",
        "files/mail-attachments/attachment-1",
        "files/rendered/file-1",
      ].sort(),
    );
    const text = Object.values(zip)
      .map((entry) => strFromU8(entry))
      .join("\n");
    for (const secret of [REFRESH_TOKEN, IMAP_PASSWORD, PUSH_TOKEN, "mailTokens", "secretRef", OTHER])
      expect(text, secret).not.toContain(secret);
    // The encrypted token documents are not in the export either.
    expect(names.some((name) => name.includes("mailTokens"))).toBe(false);

    const entry = (name: string): string => strFromU8(zip[name] ?? new Uint8Array());
    const profile = JSON.parse(entry("data/profile.json")) as Record<string, unknown>;
    expect(profile["fullName"]).toBe("Deniz Arslan");
    expect(JSON.parse(entry("data/cvs/revisions.json"))).toEqual([
      {
        id: "rev-1",
        path: "cvs/cv-1/revisions/rev-1",
        data: { summary: "Go and Kotlin", createdAt: "2026-10-20T09:30:00.000Z" },
      },
    ]);
    const jobs = JSON.parse(entry("data/jobs.json")) as { data: Record<string, unknown> }[];
    expect(jobs[0]?.data).toEqual({ title: "Backend Engineer", company: "Initech" });
    const devices = JSON.parse(entry("data/devices.json")) as { data: Record<string, unknown> }[];
    expect(devices[0]?.data).toEqual({ platform: "ios", locale: "tr-TR" });
    expect(entry("files/rendered/file-1")).toBe("%PDF-1.7 rendered CV");
    expect(entry("README.md")).toContain("## Not included");
  });

  it("keeps one export at a time and never puts an export inside the next one", async () => {
    const first = await createExport(db(), bucket(), UID, new Date("2026-10-24T10:00:00Z"));
    const second = await createExport(db(), bucket(), UID, new Date("2026-10-24T10:05:00Z"));
    const exports = (await storageNames(UID)).filter((name) => name.includes("/exports/"));
    expect(exports).toEqual([second.storagePath]);
    expect(first.storagePath).not.toBe(second.storagePath);
    const [bytes] = await bucket().file(second.storagePath).download();
    expect(Object.keys(unzipSync(new Uint8Array(bytes))).some((name) => name.includes("exports/"))).toBe(
      false,
    );
  });

  it("rate-limits: spacing, then the daily count", async () => {
    const start = Date.parse("2026-10-24T08:00:00Z");
    await createExport(db(), bucket(), UID, new Date(start));
    await expect(createExport(db(), bucket(), UID, new Date(start + 60_000))).rejects.toEqual(
      new ExportRefused("export_too_soon"),
    );
    for (let i = 1; i < ACCOUNT_EXPORT_LIMITS.perDay; i += 1)
      await createExport(db(), bucket(), UID, new Date(start + i * 600_000));
    await expect(
      createExport(db(), bucket(), UID, new Date(start + ACCOUNT_EXPORT_LIMITS.perDay * 600_000)),
    ).rejects.toEqual(new ExportRefused("export_daily_limit"));
    // The callable maps a refusal to a reasoned error the apps translate (today's count is full).
    await db()
      .doc(serverOnlyPaths.accountExportDay(UID, new Date().toISOString().slice(0, 10)))
      .set({ count: ACCOUNT_EXPORT_LIMITS.perDay });
    await expect(accountExport.run(callable(UID))).rejects.toMatchObject({
      code: "resource-exhausted",
      details: { reason: "export_daily_limit" },
    });
  });
});

describe("accountDelete", () => {
  it("revokes mail, deletes every root, all Storage files and the Auth user; others untouched", async () => {
    await createExport(db(), bucket(), UID);
    const othersBefore = { docs: await remainingDocuments(OTHER), files: await storageNames(OTHER) };

    await expect(accountDelete.run({ ...callable(UID), data: { confirm: true } })).resolves.toEqual({
      deleted: true,
    });

    expect(revoked).toEqual([REFRESH_TOKEN]);
    expect(await remainingDocuments(UID)).toEqual([]);
    for (const root of userDataRoots(UID)) expect(await db().doc(root).listCollections(), root).toEqual([]);
    expect(await storageNames(UID)).toEqual([]);
    await expect(getAuth().getUser(UID)).rejects.toMatchObject({ code: "auth/user-not-found" });

    expect(await remainingDocuments(OTHER)).toEqual(othersBefore.docs);
    expect(await storageNames(OTHER)).toEqual(othersBefore.files);
    await expect(getAuth().getUser(OTHER)).resolves.toMatchObject({ uid: OTHER });
  });

  it("is idempotent: a second call after success succeeds and changes nothing", async () => {
    const request = { ...callable(UID), data: { confirm: true } };
    await accountDelete.run(request);
    await expect(accountDelete.run(request)).resolves.toEqual({ deleted: true });
    expect(await remainingDocuments(UID)).toEqual([]);
  });

  it("needs a sign-in from the last 5 minutes and an explicit confirmation", async () => {
    const stale = callable(UID, { auth_time: Math.floor(Date.now() / 1000) - 301 });
    await expect(accountDelete.run({ ...stale, data: { confirm: true } })).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "recent_sign_in_required" },
    });
    await expect(accountDelete.run({ ...callable(UID), data: {} })).rejects.toMatchObject({
      code: "invalid-argument",
    });
    await expect(
      accountDelete.run({ ...callable(UID, { email_verified: false }), data: { confirm: true } }),
    ).rejects.toMatchObject({ details: { reason: "email_unverified" } });
    // Nothing was deleted by the refused calls.
    expect((await remainingDocuments(UID)).length).toBe(Object.keys(userDocuments(UID)).length + 2);
    await expect(getAuth().getUser(UID)).resolves.toMatchObject({ uid: UID });
  });
});
