import {
  AnswerSchema,
  AppConfigSchema,
  ApplicationEventSchema,
  ApplicationSchema,
  ApplicationStatusSchema,
  ContactSchema,
  CoverLetterSchema,
  CvRevisionSchema,
  CvSchema,
  DeviceSchema,
  followUpDue,
  InterviewSchema,
  JobMatchSchema,
  JobSchema,
  MailAccountSchema,
  MailCategorySchema,
  MailMessageSchema,
  ProfileSchema,
  RenderedFileSchema,
  revertedBy,
  SavedSearchSchema,
  suggestGhosted,
} from "@bfhr/core";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  appConfigs,
  emptyDataset,
  FIXTURE_NOW,
  type FixtureDataset,
  PERF_SIZES,
  populatedDataset,
  scaledDataset,
} from "./index";

const SCHEMAS = {
  cvs: CvSchema,
  cvRevisions: CvRevisionSchema,
  renderedFiles: RenderedFileSchema,
  coverLetters: CoverLetterSchema,
  answers: AnswerSchema,
  jobs: JobSchema,
  jobMatches: JobMatchSchema,
  savedSearches: SavedSearchSchema,
  applications: ApplicationSchema,
  applicationEvents: ApplicationEventSchema,
  interviews: InterviewSchema,
  contacts: ContactSchema,
  mailAccounts: MailAccountSchema,
  mailMessages: MailMessageSchema,
  devices: DeviceSchema,
} satisfies Record<Exclude<keyof FixtureDataset, "uid" | "profile">, z.ZodType>;

function expectValid(schema: z.ZodType, value: unknown, label: string) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(`${label} is invalid:\n${JSON.stringify(result.error.issues, null, 2)}`);
}

const perfDataset = scaledDataset();

describe.each([
  ["populated", populatedDataset],
  ["empty", emptyDataset],
  ["scaled", perfDataset],
])("%s dataset", (_name, dataset) => {
  it("validates every document against the core schemas", () => {
    expectValid(ProfileSchema, dataset.profile, "profile");
    for (const [collection, schema] of Object.entries(SCHEMAS)) {
      for (const doc of dataset[collection as keyof typeof SCHEMAS])
        expectValid(schema, doc, `${collection}/${doc.id}`);
    }
  });

  it("uses unique ids per collection", () => {
    for (const collection of Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[]) {
      const ids = dataset[collection].map((doc) => doc.id);
      expect(new Set(ids).size, collection).toBe(ids.length);
    }
  });

  it("never stores documents created after FIXTURE_NOW", () => {
    for (const collection of Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[]) {
      for (const doc of dataset[collection]) {
        if ("createdAt" in doc)
          expect(doc.createdAt.getTime(), `${collection}/${doc.id}`).toBeLessThanOrEqual(
            FIXTURE_NOW.getTime(),
          );
      }
    }
  });
});

describe("app config fixtures", () => {
  it("covers every platform with valid documents", () => {
    for (const config of appConfigs) expectValid(AppConfigSchema, config, `appConfig/${config.id}`);
    expect(appConfigs.map((config) => config.id).sort()).toEqual(["ios", "macos", "windows"]);
  });
});

describe("populated dataset content", () => {
  const data = populatedDataset;
  const ids = <T extends { id: string }>(docs: readonly T[]) => new Set(docs.map((doc) => doc.id));
  const jobIds = ids(data.jobs);
  const applicationIds = ids(data.applications);
  const mailIds = ids(data.mailMessages);
  const eventIds = ids(data.applicationEvents);

  it("has the advertised volume and coverage", () => {
    expect(data.jobs).toHaveLength(40);
    expect(data.jobMatches).toHaveLength(40);
    expect(data.applications).toHaveLength(25);
    expect(new Set(data.applications.map((app) => app.status))).toEqual(
      new Set(ApplicationStatusSchema.options),
    );
    expect(data.interviews).toHaveLength(4);
    expect(new Set(data.interviews.map((interview) => interview.timezone)).size).toBe(4);
    expect(data.mailMessages).toHaveLength(12);
    expect(new Set(data.mailMessages.map((mail) => mail.category))).toEqual(
      new Set(MailCategorySchema.options.filter((category) => category !== "not_job")),
    );
    expect(new Set(data.mailMessages.map((mail) => mail.language))).toEqual(new Set(["en", "tr", "de"]));
    expect(data.jobs.some((job) => job.sources.length >= 3)).toBe(true);
    expect(new Set(data.jobMatches.map((match) => match.state))).toEqual(
      new Set(["new", "saved", "dismissed"]),
    );
    expect(data.cvs.map((cv) => cv.language)).toEqual(["en", "de"]);
  });

  it("keeps references intact", () => {
    for (const match of data.jobMatches) expect(jobIds.has(match.id), match.id).toBe(true);
    for (const app of data.applications)
      if (app.jobId !== null) expect(jobIds.has(app.jobId), app.id).toBe(true);
    for (const event of data.applicationEvents) {
      expect(applicationIds.has(event.applicationId), event.id).toBe(true);
      if (event.evidence?.mailMessageId)
        expect(mailIds.has(event.evidence.mailMessageId), event.id).toBe(true);
      if (event.revertsEventId !== null) expect(eventIds.has(event.revertsEventId), event.id).toBe(true);
    }
    for (const interview of data.interviews)
      expect(applicationIds.has(interview.applicationId), interview.id).toBe(true);
    for (const contact of data.contacts)
      for (const id of contact.applicationIds) expect(applicationIds.has(id), contact.id).toBe(true);
    for (const mail of data.mailMessages) {
      expect(ids(data.mailAccounts).has(mail.accountId), mail.id).toBe(true);
      if (mail.applicationId !== null) expect(applicationIds.has(mail.applicationId), mail.id).toBe(true);
      if (mail.appliedEventId !== null) {
        const event = data.applicationEvents.find((candidate) => candidate.id === mail.appliedEventId);
        expect(event?.evidence?.mailMessageId, mail.id).toBe(mail.id);
        expect(event?.actor, mail.id).not.toBe("user");
      }
    }
    const revisions = ids(data.cvRevisions);
    const files = ids(data.renderedFiles);
    for (const cv of data.cvs) expect(revisions.has(cv.currentRevisionId), cv.id).toBe(true);
    for (const app of data.applications) {
      if (app.cvRevisionId !== null) expect(revisions.has(app.cvRevisionId), app.id).toBe(true);
      if (app.cvFileId !== null) expect(files.has(app.cvFileId), app.id).toBe(true);
      if (app.coverLetterFileId !== null) expect(files.has(app.coverLetterFileId), app.id).toBe(true);
    }
  });

  it("matches each application's status to its event history", () => {
    for (const app of data.applications) {
      const moves = data.applicationEvents.filter(
        (event) =>
          event.applicationId === app.id && (event.type === "created" || event.type === "status_changed"),
      );
      expect(moves.at(-1)?.toStatus, app.id).toBe(app.status);
    }
  });

  it("includes automatic changes with evidence and exactly one undone one", () => {
    const automatic = data.applicationEvents.filter((event) => event.actor !== "user");
    expect(automatic.length).toBeGreaterThanOrEqual(5);
    for (const event of automatic) expect(event.evidence?.reason, event.id).toBeTruthy();
    const undone = data.applicationEvents.filter(
      (event) => revertedBy(event.id, data.applicationEvents) !== null,
    );
    expect(undone.map((event) => event.id)).toEqual(["evt-kumsal-auto-reject"]);
  });

  it("produces ghosted and follow-up suggestions at FIXTURE_NOW", () => {
    const ghosted = data.applications.filter(
      (app) => suggestGhosted(app, data.applicationEvents, FIXTURE_NOW) !== null,
    );
    const followUps = data.applications.filter(
      (app) => followUpDue(app, data.applicationEvents, FIXTURE_NOW) !== null,
    );
    expect(ghosted.map((app) => app.id)).toEqual(["app-kiez"]);
    expect(followUps.map((app) => app.id)).toEqual(["app-quill"]);
  });

  it("has upcoming interviews for the Today screen", () => {
    const upcoming = data.interviews.filter((interview) => interview.startsAt > FIXTURE_NOW);
    expect(upcoming).toHaveLength(3);
  });
});

describe("scaled dataset", () => {
  it("has the performance budget's volume with intact references", () => {
    expect(perfDataset.jobs).toHaveLength(PERF_SIZES.jobs);
    expect(perfDataset.jobMatches).toHaveLength(PERF_SIZES.jobs);
    expect(perfDataset.applications).toHaveLength(PERF_SIZES.applications);
    const jobIds = new Set(perfDataset.jobs.map((job) => job.id));
    const applicationIds = new Set(perfDataset.applications.map((app) => app.id));
    const eventIds = new Set(perfDataset.applicationEvents.map((event) => event.id));
    for (const match of perfDataset.jobMatches) expect(jobIds.has(match.id), match.id).toBe(true);
    for (const app of perfDataset.applications)
      if (app.jobId !== null) expect(jobIds.has(app.jobId), app.id).toBe(true);
    for (const event of perfDataset.applicationEvents) {
      expect(applicationIds.has(event.applicationId), event.id).toBe(true);
      if (event.revertsEventId !== null) expect(eventIds.has(event.revertsEventId), event.id).toBe(true);
    }
    for (const interview of perfDataset.interviews)
      expect(applicationIds.has(interview.applicationId), interview.id).toBe(true);
    const sourceKeys = perfDataset.jobs.flatMap((job) => job.sourceKeys);
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
  });

  it("starts with the populated documents", () => {
    expect(perfDataset.jobs.slice(0, populatedDataset.jobs.length)).toEqual(populatedDataset.jobs);
    expect(scaledDataset({ jobs: 40, applications: 25 }).applications).toEqual(populatedDataset.applications);
  });
});
