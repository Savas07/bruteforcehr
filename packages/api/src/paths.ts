import { IdSchema, type Platform } from "@bfhr/core";

/**
 * Firestore layout (docs/adr/0002-data-model.md). All user data lives under `users/{uid}`;
 * `appConfig/{platform}` is public; `serverOnly/**` is never touched by clients.
 */
export const DOCUMENT_PATTERNS = {
  profile: "users/{id}",
  cv: "users/{uid}/cvs/{id}",
  cvRevision: "users/{uid}/cvs/{cvId}/revisions/{id}",
  renderedFile: "users/{uid}/renderedFiles/{id}",
  coverLetter: "users/{uid}/coverLetters/{id}",
  job: "users/{uid}/jobs/{id}",
  jobMatch: "users/{uid}/jobMatches/{id}",
  savedSearch: "users/{uid}/savedSearches/{id}",
  application: "users/{uid}/applications/{id}",
  applicationEvent: "users/{uid}/applicationEvents/{id}",
  interview: "users/{uid}/interviews/{id}",
  contact: "users/{uid}/contacts/{id}",
  mailAccount: "users/{uid}/mailAccounts/{id}",
  mailMessage: "users/{uid}/mailMessages/{id}",
  device: "users/{uid}/devices/{id}",
  appConfig: "appConfig/{id}",
} as const;
export type EntityName = keyof typeof DOCUMENT_PATTERNS;

/** Collection ids, e.g. for `collectionGroup()` queries. */
export const COLLECTION_IDS = {
  users: "users",
  cvs: "cvs",
  cvRevisions: "revisions",
  renderedFiles: "renderedFiles",
  coverLetters: "coverLetters",
  jobs: "jobs",
  jobMatches: "jobMatches",
  savedSearches: "savedSearches",
  applications: "applications",
  applicationEvents: "applicationEvents",
  interviews: "interviews",
  contacts: "contacts",
  mailAccounts: "mailAccounts",
  mailMessages: "mailMessages",
  devices: "devices",
  appConfig: "appConfig",
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
  jobs: (uid: string) => `${user(uid)}/jobs`,
  job: (uid: string, jobId: string) => `${user(uid)}/jobs/${segment(jobId)}`,
  jobMatches: (uid: string) => `${user(uid)}/jobMatches`,
  /** Same id as the job. */
  jobMatch: (uid: string, jobId: string) => `${user(uid)}/jobMatches/${segment(jobId)}`,
  savedSearches: (uid: string) => `${user(uid)}/savedSearches`,
  savedSearch: (uid: string, savedSearchId: string) => `${user(uid)}/savedSearches/${segment(savedSearchId)}`,
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
} as const;

/** Cloud Storage object paths (mirrored by `firebase/storage.rules`). */
export const storagePaths = {
  /** Original uploaded CV (PDF, DOCX, JSON Resume, LinkedIn ZIP), kept attached to the CV. */
  cvImport: (uid: string, fileId: string) => `${user(uid)}/cv-imports/${segment(fileId)}`,
  /** Bytes of a `renderedFiles` document (PDF/DOCX); same id as the document. */
  renderedFile: (uid: string, fileId: string) => `${user(uid)}/rendered/${segment(fileId)}`,
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
