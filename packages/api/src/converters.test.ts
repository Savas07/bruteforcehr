import { CURRENT_SCHEMA_VERSION, MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS } from "@bfhr/core";
import { appConfigs, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import {
  createConverters,
  type DocumentSnapshotLike,
  type FirestoreData,
  FirestoreDataError,
  type TimestampAdapter,
} from "./converters";
import { firestorePaths } from "./paths";

/** Stand-in for an SDK Timestamp (seconds + nanoseconds), like the JS SDK and RN Firebase ones. */
class FakeTimestamp {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number,
  ) {}
}

const adapter: TimestampAdapter<FakeTimestamp> = {
  fromDate: (date) => new FakeTimestamp(Math.floor(date.getTime() / 1000), (date.getTime() % 1000) * 1e6),
  toDate: (value) => new Date(value.seconds * 1000 + value.nanoseconds / 1e6),
  isTimestamp: (value): value is FakeTimestamp => value instanceof FakeTimestamp,
};

const converters = createConverters(adapter);
const uid = populatedDataset.uid;

function containsDate(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (Array.isArray(value)) return value.some(containsDate);
  if (value !== null && typeof value === "object" && !(value instanceof FakeTimestamp))
    return Object.values(value).some(containsDate);
  return false;
}

function snapshot(path: string, data: FirestoreData | undefined): DocumentSnapshotLike {
  return { id: path.split("/").at(-1) ?? "", ref: { path }, data: () => data };
}

describe("round trips every populated fixture document", () => {
  const cases = [
    ["profile", [populatedDataset.profile], () => firestorePaths.user(uid)],
    ["cv", populatedDataset.cvs, (id: string) => firestorePaths.cv(uid, id)],
    ["renderedFile", populatedDataset.renderedFiles, (id: string) => firestorePaths.renderedFile(uid, id)],
    ["coverLetter", populatedDataset.coverLetters, (id: string) => firestorePaths.coverLetter(uid, id)],
    ["answer", populatedDataset.answers, (id: string) => firestorePaths.answer(uid, id)],
    ["job", populatedDataset.jobs, (id: string) => firestorePaths.job(uid, id)],
    ["jobMatch", populatedDataset.jobMatches, (id: string) => firestorePaths.jobMatch(uid, id)],
    ["savedSearch", populatedDataset.savedSearches, (id: string) => firestorePaths.savedSearch(uid, id)],
    ["application", populatedDataset.applications, (id: string) => firestorePaths.application(uid, id)],
    [
      "applicationEvent",
      populatedDataset.applicationEvents,
      (id: string) => firestorePaths.applicationEvent(uid, id),
    ],
    ["interview", populatedDataset.interviews, (id: string) => firestorePaths.interview(uid, id)],
    ["contact", populatedDataset.contacts, (id: string) => firestorePaths.contact(uid, id)],
    ["mailAccount", populatedDataset.mailAccounts, (id: string) => firestorePaths.mailAccount(uid, id)],
    ["mailMessage", populatedDataset.mailMessages, (id: string) => firestorePaths.mailMessage(uid, id)],
    ["device", populatedDataset.devices, (id: string) => firestorePaths.device(uid, id)],
    ["appConfig", appConfigs, (id: string) => `appConfig/${id}`],
  ] as const;

  for (const [name, docs, pathOf] of cases) {
    it(name, () => {
      const converter = converters[name] as unknown as {
        toFirestore(entity: unknown): FirestoreData;
        fromSnapshot(snap: DocumentSnapshotLike): unknown;
      };
      for (const doc of docs) {
        const data = converter.toFirestore(doc);
        expect(data, doc.id).not.toHaveProperty("id");
        expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(containsDate(data), `${name}/${doc.id} still contains Date`).toBe(false);
        expect(converter.fromSnapshot(snapshot(pathOf(doc.id), data))).toEqual(doc);
      }
    });
  }

  it("cvRevision takes cvId from the path", () => {
    for (const revision of populatedDataset.cvRevisions) {
      const data = converters.cvRevision.toFirestore(revision);
      expect(data).not.toHaveProperty("cvId");
      const path = firestorePaths.cvRevision(uid, revision.cvId, revision.id);
      expect(converters.cvRevision.fromSnapshot(snapshot(path, data))).toEqual(revision);
    }
  });
});

describe("timestamp handling", () => {
  const [event] = populatedDataset.applicationEvents;
  if (event === undefined) throw new Error("fixture missing");

  it("converts nested dates to timestamps and back", () => {
    const mail = populatedDataset.mailMessages.find((message) => message.extracted.dates.length > 0);
    if (mail === undefined) throw new Error("fixture missing");
    const data = converters.mailMessage.toFirestore(mail);
    const extracted = data.extracted as { dates: { at: unknown }[] };
    expect(extracted.dates[0]?.at).toBeInstanceOf(FakeTimestamp);
    expect(data.receivedAt).toEqual(adapter.fromDate(mail.receivedAt));
  });

  it("keeps millisecond precision", () => {
    const at = new Date("2026-10-22T07:30:00.123Z");
    const data = converters.applicationEvent.toFirestore({ ...event, occurredAt: at, createdAt: at });
    expect(converters.applicationEvent.fromFirestore(data, { id: event.id }).occurredAt).toEqual(at);
  });
});

describe("fromFirestore", () => {
  const app = populatedDataset.applications[0];
  if (app === undefined) throw new Error("fixture missing");
  const data = converters.application.toFirestore(app);

  it("tolerates fields from newer schema versions (expand phase)", () => {
    const parsed = converters.application.fromFirestore(
      { ...data, schemaVersion: CURRENT_SCHEMA_VERSION + 1, futureField: "x" },
      { id: app.id },
    );
    expect(parsed).toEqual(app);
  });

  it("rejects missing or invalid schemaVersion", () => {
    const { schemaVersion: _drop, ...withoutVersion } = data;
    expect(() => converters.application.fromFirestore(withoutVersion, { id: app.id })).toThrow(
      FirestoreDataError,
    );
    expect(() => converters.application.fromFirestore({ ...data, schemaVersion: 0 }, { id: app.id })).toThrow(
      FirestoreDataError,
    );
  });

  it("validates document data", () => {
    expect(() =>
      converters.application.fromFirestore({ ...data, status: "hired" }, { id: app.id }),
    ).toThrow();
  });

  it("checks snapshot paths and existence", () => {
    expect(() =>
      converters.application.fromSnapshot(snapshot(firestorePaths.job(uid, app.id), data)),
    ).toThrow(FirestoreDataError);
    expect(() =>
      converters.application.fromSnapshot(snapshot(firestorePaths.application(uid, app.id), undefined)),
    ).toThrow(FirestoreDataError);
  });

  it("never exposes server-only job fields", () => {
    const job = populatedDataset.jobs[0];
    if (job === undefined) throw new Error("fixture missing");
    const stored = { ...converters.job.toFirestore(job), embedding: { vector: [0.1, 0.2] } };
    expect(converters.job.fromFirestore(stored, { id: job.id })).not.toHaveProperty("embedding");
  });

  it("reads a profile written before aiEnabled existed as AI enabled", () => {
    const profile = { ...populatedDataset.profile, aiEnabled: false };
    const { aiEnabled: _drop, ...older } = converters.profile.toFirestore(profile);
    expect(converters.profile.fromFirestore(older, { id: uid }).aiEnabled).toBe(true);
    expect(
      converters.profile.fromFirestore(converters.profile.toFirestore(profile), { id: uid }).aiEnabled,
    ).toBe(false);
  });
});

describe("updates", () => {
  it("validates each field, converts dates and leaves schemaVersion alone", () => {
    const at = new Date("2026-10-22T08:00:00.000Z");
    const data = converters.application.toFirestoreUpdate({ status: "screening", statusChangedAt: at });
    expect(data).toEqual({ status: "screening", statusChangedAt: adapter.fromDate(at) });
    expect(() => converters.application.toFirestoreUpdate({ status: "hired" as never })).toThrow();
    expect(() => converters.application.toFirestoreUpdate({ id: "x" } as never)).toThrow(FirestoreDataError);
    expect(() => converters.application.toFirestoreUpdate({ schemaVersion: 2 } as never)).toThrow(
      FirestoreDataError,
    );
  });

  it("builds the exact mail review update the rules allow", () => {
    const at = new Date("2026-10-22T08:00:00.000Z");
    const data = converters.mailReviewUpdate({
      reviewState: "corrected",
      applicationId: null,
      category: "other_job",
      reviewedAt: at,
    });
    expect(Object.keys(data).sort()).toEqual([...MAIL_MESSAGE_CLIENT_UPDATABLE_FIELDS].sort());
    expect(data.reviewedAt).toBeInstanceOf(FakeTimestamp);
    expect(() =>
      converters.mailReviewUpdate({
        reviewState: "auto_applied" as never,
        applicationId: null,
        category: "other_job",
        reviewedAt: at,
      }),
    ).toThrow();
  });

  it("increments the CV version by exactly one", () => {
    expect(converters.cvUpdate(4, { title: "Base CV" })).toEqual({ title: "Base CV", version: 5 });
    expect(() => converters.cvUpdate(0, {})).toThrow(RangeError);
  });
});
