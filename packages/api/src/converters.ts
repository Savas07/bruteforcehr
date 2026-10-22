import {
  type AppConfig,
  AppConfigSchema,
  type Application,
  type ApplicationEvent,
  ApplicationEventSchema,
  ApplicationSchema,
  type Contact,
  ContactSchema,
  type CoverLetter,
  CoverLetterSchema,
  CURRENT_SCHEMA_VERSION,
  type Cv,
  CV_VERSION_INCREMENT,
  type CvRevision,
  CvRevisionSchema,
  CvSchema,
  type Device,
  DeviceSchema,
  type Interview,
  InterviewSchema,
  type Job,
  type JobMatch,
  JobMatchSchema,
  JobSchema,
  type MailAccount,
  MailAccountSchema,
  type MailMessage,
  MailMessageSchema,
  type MailReviewUpdate,
  MailReviewUpdateSchema,
  type Profile,
  ProfileSchema,
  type RenderedFile,
  RenderedFileSchema,
  type SavedSearch,
  SavedSearchSchema,
} from "@bfhr/core";
import type { z } from "zod";
import { DOCUMENT_PATTERNS, type EntityName, matchDocumentPath } from "./paths";

/**
 * Bridges domain `Date`s and the SDK's timestamp type. Inject the platform's implementation:
 *
 * - Firebase JS SDK (desktop): `{ fromDate: (d) => Timestamp.fromDate(d), toDate: (t) => t.toDate(), isTimestamp: (v) => v instanceof Timestamp }`
 * - @react-native-firebase (iOS): the same shape with `firestore.Timestamp`.
 * - firebase-admin (functions): the same shape with `Timestamp` from `firebase-admin/firestore`.
 */
export interface TimestampAdapter<TTimestamp> {
  fromDate(date: Date): TTimestamp;
  toDate(value: TTimestamp): Date;
  isTimestamp(value: unknown): value is TTimestamp;
}

/** Document data as the SDKs see it. */
export type FirestoreData = Record<string, unknown>;

/** Structural subset of `DocumentSnapshot` shared by the JS SDK, RN Firebase and firebase-admin. */
export interface DocumentSnapshotLike {
  readonly id: string;
  readonly ref: { readonly path: string };
  data(): FirestoreData | undefined;
}

/** Thrown for documents that cannot be mapped (missing, wrong path, bad `schemaVersion`). */
export class FirestoreDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirestoreDataError";
  }
}

/** Domain fields that come from the document path instead of the document data. */
type PathKey = "id" | "cvId";

export interface EntityConverter<TEntity, TPathKey extends keyof TEntity> {
  /**
   * Full document data for `set()`/`create()`: validated, path fields removed, `Date`s converted,
   * `schemaVersion` stamped. Use only for creates or whole-document replacement by the owner.
   */
  toFirestore(entity: TEntity): FirestoreData;
  /**
   * Field-level data for `update()`: each field validated against its schema and converted;
   * never touches `schemaVersion` or path fields. Cross-field rules are not checked here.
   */
  toFirestoreUpdate(patch: Partial<Omit<TEntity, TPathKey>>): FirestoreData;
  /** Maps document data (+ the ids its path carries) to a validated domain entity. */
  fromFirestore(data: FirestoreData, pathIds: Pick<TEntity, TPathKey>): TEntity;
  /** `fromFirestore` for an existing snapshot; path ids are read from `snapshot.ref.path`. */
  fromSnapshot(snapshot: DocumentSnapshotLike): TEntity;
}

type EntitySchema<TEntity> = z.ZodType<TEntity> & { readonly shape: Readonly<Record<string, z.ZodType>> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function createEntityConverter<TTimestamp, TEntity, TPathKey extends keyof TEntity & PathKey>(
  adapter: TimestampAdapter<TTimestamp>,
  entity: EntityName,
  schema: EntitySchema<TEntity>,
  pathKeys: readonly TPathKey[],
): EntityConverter<TEntity, TPathKey> {
  const isPathKey = (key: string): boolean => (pathKeys as readonly string[]).includes(key);

  // Dates → timestamps; drops `undefined` (Firestore rejects it). SDK values pass through.
  const encode = (value: unknown): unknown => {
    if (value instanceof Date) return adapter.fromDate(value);
    if (Array.isArray(value)) return value.map(encode);
    if (isPlainObject(value)) {
      const out: FirestoreData = {};
      for (const [key, inner] of Object.entries(value)) if (inner !== undefined) out[key] = encode(inner);
      return out;
    }
    return value;
  };

  const decode = (value: unknown): unknown => {
    if (adapter.isTimestamp(value)) return adapter.toDate(value);
    if (Array.isArray(value)) return value.map(decode);
    if (isPlainObject(value)) {
      const out: FirestoreData = {};
      for (const [key, inner] of Object.entries(value)) out[key] = decode(inner);
      return out;
    }
    return value;
  };

  const fromFirestore = (data: FirestoreData, pathIds: Pick<TEntity, TPathKey>): TEntity => {
    const { schemaVersion, ...fields } = data;
    // Newer versions are readable (expand phase); fields this client does not know are stripped.
    if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new FirestoreDataError(`${entity} document has invalid schemaVersion ${String(schemaVersion)}`);
    }
    return schema.parse({ ...(decode(fields) as FirestoreData), ...pathIds });
  };

  return {
    toFirestore(value) {
      const parsed = schema.parse(value) as Record<string, unknown>;
      const data: FirestoreData = {};
      for (const [key, inner] of Object.entries(parsed)) {
        if (!isPathKey(key) && inner !== undefined) data[key] = encode(inner);
      }
      data.schemaVersion = CURRENT_SCHEMA_VERSION;
      return data;
    },

    toFirestoreUpdate(patch) {
      const data: FirestoreData = {};
      for (const [key, inner] of Object.entries(patch)) {
        if (inner === undefined) continue;
        const field = schema.shape[key];
        if (field === undefined || isPathKey(key))
          throw new FirestoreDataError(`${entity} has no updatable field "${key}"`);
        data[key] = encode(field.parse(inner));
      }
      return data;
    },

    fromFirestore,

    fromSnapshot(snapshot) {
      const params = matchDocumentPath(entity, snapshot.ref.path);
      if (params === null) {
        throw new FirestoreDataError(
          `${snapshot.ref.path} is not a ${entity} document (${DOCUMENT_PATTERNS[entity]})`,
        );
      }
      const data = snapshot.data();
      if (data === undefined) throw new FirestoreDataError(`${snapshot.ref.path} does not exist`);
      const pathIds: Record<string, string> = {};
      for (const key of pathKeys) {
        const id = params[key];
        if (id === undefined)
          throw new FirestoreDataError(`${DOCUMENT_PATTERNS[entity]} carries no {${key}}`);
        pathIds[key] = id;
      }
      return fromFirestore(data, pathIds as Pick<TEntity, TPathKey>);
    },
  };
}

/** Converters for every collection, plus the two constrained client updates. */
export interface Converters {
  readonly profile: EntityConverter<Profile, "id">;
  readonly cv: EntityConverter<Cv, "id">;
  readonly cvRevision: EntityConverter<CvRevision, "id" | "cvId">;
  readonly renderedFile: EntityConverter<RenderedFile, "id">;
  readonly coverLetter: EntityConverter<CoverLetter, "id">;
  readonly job: EntityConverter<Job, "id">;
  readonly jobMatch: EntityConverter<JobMatch, "id">;
  readonly savedSearch: EntityConverter<SavedSearch, "id">;
  readonly application: EntityConverter<Application, "id">;
  readonly applicationEvent: EntityConverter<ApplicationEvent, "id">;
  readonly interview: EntityConverter<Interview, "id">;
  readonly contact: EntityConverter<Contact, "id">;
  readonly mailAccount: EntityConverter<MailAccount, "id">;
  readonly mailMessage: EntityConverter<MailMessage, "id">;
  readonly device: EntityConverter<Device, "id">;
  readonly appConfig: EntityConverter<AppConfig, "id">;
  /**
   * The only update a client sends to `mailMessages`: exactly the four review fields
   * (`MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS`), as the security rules require.
   */
  mailReviewUpdate(update: MailReviewUpdate): FirestoreData;
  /**
   * Update data for a CV with optimistic concurrency: run inside a transaction that read
   * `previousVersion`; the rules reject anything but `previousVersion + CV_VERSION_INCREMENT`.
   */
  cvUpdate(previousVersion: number, patch: Partial<Omit<Cv, "id" | "version">>): FirestoreData;
}

/** Binds every converter to one SDK's timestamp type. */
export function createConverters<TTimestamp>(adapter: TimestampAdapter<TTimestamp>): Converters {
  const converters = {
    profile: createEntityConverter<TTimestamp, Profile, "id">(adapter, "profile", ProfileSchema, ["id"]),
    cv: createEntityConverter<TTimestamp, Cv, "id">(adapter, "cv", CvSchema, ["id"]),
    cvRevision: createEntityConverter<TTimestamp, CvRevision, "id" | "cvId">(
      adapter,
      "cvRevision",
      CvRevisionSchema,
      ["id", "cvId"],
    ),
    renderedFile: createEntityConverter<TTimestamp, RenderedFile, "id">(
      adapter,
      "renderedFile",
      RenderedFileSchema,
      ["id"],
    ),
    coverLetter: createEntityConverter<TTimestamp, CoverLetter, "id">(
      adapter,
      "coverLetter",
      CoverLetterSchema,
      ["id"],
    ),
    job: createEntityConverter<TTimestamp, Job, "id">(adapter, "job", JobSchema, ["id"]),
    jobMatch: createEntityConverter<TTimestamp, JobMatch, "id">(adapter, "jobMatch", JobMatchSchema, ["id"]),
    savedSearch: createEntityConverter<TTimestamp, SavedSearch, "id">(
      adapter,
      "savedSearch",
      SavedSearchSchema,
      ["id"],
    ),
    application: createEntityConverter<TTimestamp, Application, "id">(
      adapter,
      "application",
      ApplicationSchema,
      ["id"],
    ),
    applicationEvent: createEntityConverter<TTimestamp, ApplicationEvent, "id">(
      adapter,
      "applicationEvent",
      ApplicationEventSchema,
      ["id"],
    ),
    interview: createEntityConverter<TTimestamp, Interview, "id">(adapter, "interview", InterviewSchema, [
      "id",
    ]),
    contact: createEntityConverter<TTimestamp, Contact, "id">(adapter, "contact", ContactSchema, ["id"]),
    mailAccount: createEntityConverter<TTimestamp, MailAccount, "id">(
      adapter,
      "mailAccount",
      MailAccountSchema,
      ["id"],
    ),
    mailMessage: createEntityConverter<TTimestamp, MailMessage, "id">(
      adapter,
      "mailMessage",
      MailMessageSchema,
      ["id"],
    ),
    device: createEntityConverter<TTimestamp, Device, "id">(adapter, "device", DeviceSchema, ["id"]),
    appConfig: createEntityConverter<TTimestamp, AppConfig, "id">(adapter, "appConfig", AppConfigSchema, [
      "id",
    ]),
  } satisfies Omit<Converters, "mailReviewUpdate" | "cvUpdate">;

  return {
    ...converters,
    mailReviewUpdate(update) {
      const parsed = MailReviewUpdateSchema.parse(update);
      return { ...parsed, reviewedAt: adapter.fromDate(parsed.reviewedAt) };
    },
    cvUpdate(previousVersion, patch) {
      if (!Number.isInteger(previousVersion) || previousVersion < 1) {
        throw new RangeError(`previousVersion must be a positive integer, got ${previousVersion}`);
      }
      return { ...converters.cv.toFirestoreUpdate(patch), version: previousVersion + CV_VERSION_INCREMENT };
    },
  };
}
