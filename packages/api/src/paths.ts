import { IdSchema, type Platform } from "@bfhr/core";

/**
 * Firestore layout (docs/adr/0002-data-model.md). All user data lives under `users/{uid}`;
 * `appConfig/{platform}` is public; `jobSources/{sourceId}` is readable by signed-in users;
 * `serverOnly/**` is never touched by clients.
 */
export const DOCUMENT_PATTERNS = {
  profile: "users/{id}",
  cv: "users/{uid}/cvs/{id}",
  cvRevision: "users/{uid}/cvs/{cvId}/revisions/{id}",
  renderedFile: "users/{uid}/renderedFiles/{id}",
  coverLetter: "users/{uid}/coverLetters/{id}",
  answer: "users/{uid}/answers/{id}",
  job: "users/{uid}/jobs/{id}",
  jobMatch: "users/{uid}/jobMatches/{id}",
  savedSearch: "users/{uid}/savedSearches/{id}",
  watchedCompany: "users/{uid}/watchlist/{id}",
  application: "users/{uid}/applications/{id}",
  applicationEvent: "users/{uid}/applicationEvents/{id}",
  interview: "users/{uid}/interviews/{id}",
  contact: "users/{uid}/contacts/{id}",
  mailAccount: "users/{uid}/mailAccounts/{id}",
  mailMessage: "users/{uid}/mailMessages/{id}",
  device: "users/{uid}/devices/{id}",
  appConfig: "appConfig/{id}",
  jobSource: "jobSources/{id}",
} as const;
export type EntityName = keyof typeof DOCUMENT_PATTERNS;

/** Collection ids, e.g. for `collectionGroup()` queries. */
export const COLLECTION_IDS = {
  users: "users",
  cvs: "cvs",
  cvRevisions: "revisions",
  renderedFiles: "renderedFiles",
  coverLetters: "coverLetters",
  answers: "answers",
  jobs: "jobs",
  jobMatches: "jobMatches",
  savedSearches: "savedSearches",
  watchlist: "watchlist",
  applications: "applications",
  applicationEvents: "applicationEvents",
  interviews: "interviews",
  contacts: "contacts",
  mailAccounts: "mailAccounts",
  mailMessages: "mailMessages",
  devices: "devices",
  appConfig: "appConfig",
  jobSources: "jobSources",
} as const;

/** Validates one path segment (document id) and returns it. */
function segment(id: string): string {
  const result = IdSchema.safeParse(id);
  if (!result.success) throw new TypeError(`Invalid Firestore document id: ${JSON.stringify(id)}`);
  return id;
}

const user = (uid: string) => `users/${segment(uid)}`;

/** Collection and document path builders. Every id is validated (no `/`, not `.`/`..`). */
export const firestorePaths = {
  users: () => COLLECTION_IDS.users,
  user,
  cvs: (uid: string) => `${user(uid)}/cvs`,
  cv: (uid: string, cvId: string) => `${user(uid)}/cvs/${segment(cvId)}`,
  cvRevisions: (uid: string, cvId: string) => `${user(uid)}/cvs/${segment(cvId)}/revisions`,
  cvRevision: (uid: string, cvId: string, revisionId: string) =>
    `${user(uid)}/cvs/${segment(cvId)}/revisions/${segment(revisionId)}`,
  renderedFiles: (uid: string) => `${user(uid)}/renderedFiles`,
  renderedFile: (uid: string, fileId: string) => `${user(uid)}/renderedFiles/${segment(fileId)}`,
  coverLetters: (uid: string) => `${user(uid)}/coverLetters`,
  coverLetter: (uid: string, coverLetterId: string) => `${user(uid)}/coverLetters/${segment(coverLetterId)}`,
  /** Answers library (application kit). */
  answers: (uid: string) => `${user(uid)}/answers`,
  answer: (uid: string, answerId: string) => `${user(uid)}/answers/${segment(answerId)}`,
  jobs: (uid: string) => `${user(uid)}/jobs`,
  job: (uid: string, jobId: string) => `${user(uid)}/jobs/${segment(jobId)}`,
  jobMatches: (uid: string) => `${user(uid)}/jobMatches`,
  /** Same id as the job. */
  jobMatch: (uid: string, jobId: string) => `${user(uid)}/jobMatches/${segment(jobId)}`,
  savedSearches: (uid: string) => `${user(uid)}/savedSearches`,
  savedSearch: (uid: string, savedSearchId: string) => `${user(uid)}/savedSearches/${segment(savedSearchId)}`,
  /** "Companies you follow" (ATS boards and careers pages). */
  watchlist: (uid: string) => `${user(uid)}/watchlist`,
  watchedCompany: (uid: string, companyId: string) => `${user(uid)}/watchlist/${segment(companyId)}`,
  applications: (uid: string) => `${user(uid)}/applications`,
  application: (uid: string, applicationId: string) => `${user(uid)}/applications/${segment(applicationId)}`,
  applicationEvents: (uid: string) => `${user(uid)}/applicationEvents`,
  applicationEvent: (uid: string, eventId: string) => `${user(uid)}/applicationEvents/${segment(eventId)}`,
  interviews: (uid: string) => `${user(uid)}/interviews`,
  interview: (uid: string, interviewId: string) => `${user(uid)}/interviews/${segment(interviewId)}`,
  contacts: (uid: string) => `${user(uid)}/contacts`,
  contact: (uid: string, contactId: string) => `${user(uid)}/contacts/${segment(contactId)}`,
  mailAccounts: (uid: string) => `${user(uid)}/mailAccounts`,
  mailAccount: (uid: string, accountId: string) => `${user(uid)}/mailAccounts/${segment(accountId)}`,
  mailMessages: (uid: string) => `${user(uid)}/mailMessages`,
  mailMessage: (uid: string, messageId: string) => `${user(uid)}/mailMessages/${segment(messageId)}`,
  devices: (uid: string) => `${user(uid)}/devices`,
  device: (uid: string, deviceId: string) => `${user(uid)}/devices/${segment(deviceId)}`,
  appConfigs: () => COLLECTION_IDS.appConfig,
  appConfig: (platform: Platform) => `${COLLECTION_IDS.appConfig}/${segment(platform)}`,
  /** Project-wide source health (Settings › Job sources); server-written. */
  jobSources: () => COLLECTION_IDS.jobSources,
  jobSource: (sourceId: string) => `${COLLECTION_IDS.jobSources}/${segment(sourceId)}`,
} as const;

/**
 * Suffix of every account export object. The bucket lifecycle rule
 * (firebase/storage.lifecycle.json) deletes objects with this suffix `ACCOUNT_EXPORT_LIMITS.availableDays` after creation; no
 * other object may end with it.
 */
export const ACCOUNT_EXPORT_SUFFIX = ".bfhr-export.zip";

/** Cloud Storage object paths (mirrored by `firebase/storage.rules`). */
export const storagePaths = {
  /** Original uploaded CV (PDF, DOCX, JSON Resume, LinkedIn ZIP), kept attached to the CV. */
  cvImport: (uid: string, fileId: string) => `${user(uid)}/cv-imports/${segment(fileId)}`,
  /** Bytes of a `renderedFiles` document (PDF/DOCX); same id as the document. */
  renderedFile: (uid: string, fileId: string) => `${user(uid)}/rendered/${segment(fileId)}`,
  /** CV photo of a variant that opted in (U6); referenced from `basics.image`. */
  cvPhoto: (uid: string, fileId: string) => `${user(uid)}/cv-photos/${segment(fileId)}`,
  /** A file attached from the device to an email apply (`mailSend` upload attachments). */
  mailAttachment: (uid: string, fileId: string) => `${user(uid)}/mail-attachments/${segment(fileId)}`,
  /**
   * "Export everything" ZIP built by `accountExport` (server-written, owner-readable; deleted by
   * the bucket lifecycle rule and never included in a later export).
   */
  accountExport: (uid: string, exportId: string) =>
    `${user(uid)}/exports/${segment(exportId)}${ACCOUNT_EXPORT_SUFFIX}`,
  /** Prefix of every export of a user. */
  accountExports: (uid: string) => `${user(uid)}/exports/`,
} as const;

/**
 * Matches a document path against an entity pattern and returns its placeholders
 * (`{ uid, cvId, id }`), or null when the path is not of that entity.
 */
export function matchDocumentPath(entity: EntityName, path: string): Record<string, string> | null {
  const pattern = DOCUMENT_PATTERNS[entity].split("/");
  const parts = path.split("/");
  if (parts.length !== pattern.length) return null;
  const params: Record<string, string> = {};
  for (const [index, expected] of pattern.entries()) {
    const actual = parts[index] ?? "";
    if (expected.startsWith("{")) {
      if (!IdSchema.safeParse(actual).success) return null;
      params[expected.slice(1, -1)] = actual;
    } else if (actual !== expected) {
      return null;
    }
  }
  return params;
}

/**
 * Server-only per-user documents (never readable by clients; docs/adr/0002-data-model.md).
 * Every tree here is also listed in `userDataRoots`, so account deletion and export cover it.
 */
export const serverOnlyPaths = {
  /** Daily AI spend ledger (docs/adr/0010-ai.md). */
  aiUsageRoot: (uid: string) => `serverOnly/aiUsage/users/${segment(uid)}`,
  aiUsageDay: (uid: string, day: string) =>
    `serverOnly/aiUsage/users/${segment(uid)}/aiUsageDays/${segment(day)}`,
  /** Pending job alerts for M5 notifications (docs/adr/0011-embeddings-matching.md). */
  jobAlertsRoot: (uid: string) => `serverOnly/jobAlerts/users/${segment(uid)}`,
  jobAlert: (uid: string, jobId: string) =>
    `serverOnly/jobAlerts/users/${segment(uid)}/jobAlertItems/${segment(jobId)}`,
  /** Per-user daily search budget and rate limit (docs/runbooks/jobs.md). */
  jobQuotaRoot: (uid: string) => `serverOnly/jobQuota/users/${segment(uid)}`,
  jobQuotaDay: (uid: string, day: string) =>
    `serverOnly/jobQuota/users/${segment(uid)}/jobQuotaDays/${segment(day)}`,
  /** Invite-only sign-up allowlist `{ allowedEmails, allowedDomains }` (docs/runbooks/accounts.md). */
  signupConfig: () => "serverOnly/signup",
  /** URL import: owner config (denied hosts, restricted-site switch; docs/adr/0005-job-sources-scraping.md). */
  jobImportConfig: () => "serverOnly/jobImport",
  /** URL import: per-host politeness budget and cached robots.txt (shared by all users). */
  jobImportHost: (host: string) => `serverOnly/jobImport/hosts/${segment(host)}`,
  /** URL import: per-user 24 h result cache, keyed by a hash of the canonical URL. */
  jobImportRoot: (uid: string) => `serverOnly/jobImport/users/${segment(uid)}`,
  jobImportPage: (uid: string, key: string) =>
    `serverOnly/jobImport/users/${segment(uid)}/jobImportPages/${segment(key)}`,
  /** Mail tokens, processed-message hashes, outbox and send counters (docs/adr/0012-mail-sync.md). */
  mailRoot: (uid: string) => `serverOnly/mail/users/${segment(uid)}`,
  /** Encrypted credentials of one account; `mailAccounts.secretRef` is this path without `serverOnly/`. */
  mailToken: (uid: string, accountId: string) =>
    `serverOnly/mail/users/${segment(uid)}/mailTokens/${segment(accountId)}`,
  /** Hash of a processed message id (dedupe; TTL `expireAt`). The id is a hex SHA-256. */
  mailSeen: (uid: string, hash: string) => `serverOnly/mail/users/${segment(uid)}/mailSeen/${segment(hash)}`,
  mailSeenCollection: (uid: string) => `serverOnly/mail/users/${segment(uid)}/mailSeen`,
  /** Body and attachments of a scheduled email apply until it is sent or cancelled. */
  mailOutbox: (uid: string, sendId: string) =>
    `serverOnly/mail/users/${segment(uid)}/mailOutbox/${segment(sendId)}`,
  /** Emails sent per UTC day (daily send cap; TTL `expireAt`). */
  mailSendDay: (uid: string, day: string) =>
    `serverOnly/mail/users/${segment(uid)}/mailSendDays/${segment(day)}`,
  /** Review corrections kept as labeled examples (category from/to, sender domain; no body). */
  mailCorrections: (uid: string) => `serverOnly/mail/users/${segment(uid)}/mailCorrections`,
  /** `mailConnectImap` attempts per UTC day (TTL `expireAt`). */
  mailConnectDay: (uid: string, day: string) =>
    `serverOnly/mail/users/${segment(uid)}/mailConnectDays/${segment(day)}`,
  /** `accountExport` rate limit, one document per UTC day (TTL `expireAt`). */
  accountExportRoot: (uid: string) => `serverOnly/accountExport/users/${segment(uid)}`,
  accountExportDay: (uid: string, day: string) =>
    `serverOnly/accountExport/users/${segment(uid)}/accountExportDays/${segment(day)}`,
  /** `cvRenderPdf` renders per UTC day (TTL `expireAt`). */
  renderRoot: (uid: string) => `serverOnly/render/users/${segment(uid)}`,
  renderDay: (uid: string, day: string) =>
    `serverOnly/render/users/${segment(uid)}/renderDays/${segment(day)}`,
  /** Pending OAuth connect (nonce → uid, PKCE verifier, then the encrypted grant; TTL `expireAt`, minutes). */
  mailConnect: (nonce: string) => `serverOnly/mailConnect/mailConnectNonces/${segment(nonce)}`,
  /**
   * Project-wide spend per UTC day (AI micro-USD, PDF renders) against the ceilings in
   * docs/runbooks/limits.md; not per user (TTL `expireAt`).
   */
  projectUsageDay: (day: string) => `serverOnly/projectUsage/projectUsageDays/${segment(day)}`,
} as const;

/**
 * Every Firestore document tree that holds one user's data: the user document with all its
 * subcollections, and each per-user `serverOnly` tree. The single source of truth for account
 * deletion (recursive delete of every root) and "Export everything" (ADR 0002). A feature that
 * stores per-user data elsewhere must add its root here.
 */
export function userDataRoots(uid: string): readonly string[] {
  return [
    `users/${segment(uid)}`,
    serverOnlyPaths.aiUsageRoot(uid),
    serverOnlyPaths.jobAlertsRoot(uid),
    serverOnlyPaths.jobQuotaRoot(uid),
    serverOnlyPaths.jobImportRoot(uid),
    serverOnlyPaths.mailRoot(uid),
    serverOnlyPaths.accountExportRoot(uid),
    serverOnlyPaths.renderRoot(uid),
  ];
}

/** Cloud Storage prefix of every object the user owns (CV imports, rendered files, photos). */
export function userStoragePrefix(uid: string): string {
  return `users/${segment(uid)}/`;
}
