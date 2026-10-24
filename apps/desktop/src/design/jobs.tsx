/**
 * The Jobs area in the design build: the memory Jobs store (src/data/jobs/memory.ts) over the
 * design tracker store, so save, Not for me, saved searches, imports and apply behave as in the
 * app (a save shows on the board). The callables answer from the fixtures after a short wait:
 * search returns the fixture jobs that mention the query, a link import returns a draft posting
 * (a link containing `blocked` fails like a login wall), and an email send is sent after the undo
 * window.
 */
import { FIXTURE_NOW, type FixtureDataset } from "@bfhr/fixtures";
import {
  type EmailSend,
  type JobImportUrlResponse,
  type JobSourceStatus,
  type JobsSearchResponse,
  jobSourceKey,
  jobToWire,
  MAIL_SEND_UNDO_SECONDS,
} from "@bfhr/core";
import { useSearch } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { JobsProviders } from "../data/jobs/live";
import { createMemoryJobsStore, type MemoryJobsCallables, type MemoryJobsStore } from "../data/jobs/memory";
import type { MemoryTrackerStore } from "../data/tracker/memory";
import { newApplication, planCreateApplications } from "../data/tracker/writes";
import { designCoverLetter, designTailor } from "./apply";
import { designDataset } from "./datasets";
import { readDesignParams } from "./search";
import { designTrackerStore } from "./tracker";

const SECOND_MS = 1_000;
const HOUR_MS = 3_600_000;

const at = (hoursAgo: number) => new Date(FIXTURE_NOW.getTime() - hoursAgo * HOUR_MS);

function source(
  id: string,
  label: string,
  kind: JobSourceStatus["kind"],
  state: JobSourceStatus["state"],
  reason: JobSourceStatus["reason"],
  url: string,
  lastResultCount: number | null,
): JobSourceStatus {
  const ran = state === "skipped" ? null : at(2);
  return {
    id,
    label,
    kind,
    markets: ["remote"],
    state,
    reason,
    lastRunAt: ran,
    lastSuccessAt: state === "ok" ? ran : null,
    lastError: null,
    lastResultCount,
    quota: null,
    attribution: { label, url, minSize: null },
    updatedAt: at(2),
  };
}

/** Source health as a fresh install sees it: keyless sources run, keyed ones wait for their key. */
export const DESIGN_JOB_SOURCES: readonly JobSourceStatus[] = [
  source("remotive", "Remotive", "keyless", "ok", null, "https://remotive.com", 42),
  source("arbeitnow", "Arbeitnow", "keyless", "ok", null, "https://www.arbeitnow.com", 37),
  source("greenhouse", "Greenhouse", "keyless", "ok", null, "https://www.greenhouse.com", 18),
  source("lever", "Lever", "keyless", "ok", null, "https://www.lever.co", 9),
  source("adzuna", "Adzuna", "keyed", "skipped", "no_key", "https://www.adzuna.com", null),
  source("jooble", "Jooble", "keyed", "skipped", "no_key", "https://jooble.org", null),
  source("usajobs", "USAJOBS", "keyed", "skipped", "no_key", "https://www.usajobs.gov", null),
  source("reed", "Reed", "keyed", "skipped", "no_key", "https://www.reed.co.uk", null),
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A callable failure as the Firebase SDK reports it (`code` + `details.reason`). */
function callableError(code: string, reason: string): Error {
  return Object.assign(new Error(reason), { code: `functions/${code}`, details: { reason } });
}

function searchResponse(tracker: MemoryTrackerStore, query: string): JobsSearchResponse {
  const terms = query.toLocaleLowerCase("en").split(/\s+/u).filter(Boolean);
  const matches = new Map(tracker.jobMatches().map((match) => [match.id, match.score]));
  const jobIds = tracker
    .jobs()
    .filter((job) => {
      const text = `${job.title} ${job.company} ${job.skills.join(" ")}`.toLocaleLowerCase("en");
      return terms.some((term) => text.includes(term));
    })
    .map((job) => job.id)
    .toSorted((a, b) => (matches.get(b) ?? 0) - (matches.get(a) ?? 0))
    .slice(0, 30);
  return {
    jobIds,
    counts: { found: jobIds.length * 3, created: 0, updated: jobIds.length, matched: jobIds.length },
    sources: DESIGN_JOB_SOURCES.map((status) => ({
      source: status.id,
      status: status.state === "skipped" ? "skipped" : "ok",
      reason: status.reason,
      count: status.state === "skipped" ? 0 : Math.ceil(jobIds.length / 2),
    })),
  };
}

/** A draft posting for any pasted link (the import's confirm-and-edit form). */
function importResponse(url: string): JobImportUrlResponse {
  const link = {
    source: "url_import",
    sourceId: null,
    url,
    applyUrl: url,
    applyEmail: null,
    isDirectFromEmployer: true,
    title: "Senior Frontend Engineer",
    locationText: "Berlin, hybrid",
    salary: { min: 70_000, max: 85_000, currency: "EUR", period: "year", estimated: false },
    postedAt: at(30),
    firstSeenAt: FIXTURE_NOW,
    lastSeenAt: FIXTURE_NOW,
  } as const;
  const job = jobToWire({
    sources: [link],
    sourceKeys: [jobSourceKey(link)],
    applyUrl: url,
    applyEmail: null,
    company: "Lindenhof Mobility",
    companyDomain: "lindenhof-mobility.de",
    title: link.title,
    locations: [{ label: "Berlin", city: "Berlin", countryCode: "DE" }],
    remoteType: "hybrid",
    remoteEligibility: null,
    employmentType: "full_time",
    seniority: "senior",
    salary: link.salary,
    visaSponsorship: true,
    relocationSupport: null,
    language: "en",
    description:
      "Lindenhof Mobility builds the booking app for 40 car-sharing operators across Germany.\n\nYou'll own our React and TypeScript web app, work with two designers and ship every week.\n\nWe sponsor visas and help with the move to Berlin.",
    skills: ["react", "typescript", "graphql", "testing"],
    postedAt: at(30),
    expiresAt: null,
    fingerprint: "lindenhof mobility|senior frontend engineer|berlin",
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  });
  return {
    job,
    existingJobId: null,
    method: "json_ld",
    site: null,
    confidence: { title: 0.98, company: 0.97, locations: 0.9, salary: 0.72, description: 0.95 },
    warnings: [],
    model: "none",
    promptVersion: null,
    finalUrl: url,
    robots: "allowed",
  };
}

function designCallables(
  tracker: MemoryTrackerStore,
  repository: () => MemoryJobsStore["repository"],
): MemoryJobsCallables {
  /** Scheduled sends: application id → the timer and delivery of the undo window. */
  const scheduled = new Map<string, { timer: number; deliver: () => void }>();
  const trackerData = () => {
    const state = tracker.source.getState();
    return state.status === "ready" ? state.data : null;
  };
  const setEmailSend = (applicationId: string, emailSend: EmailSend) =>
    void tracker.apply([
      {
        op: "update",
        collection: "applications",
        id: applicationId,
        patch: { emailSend, updatedAt: FIXTURE_NOW },
      },
    ]);
  return {
    async search(request) {
      await wait(1.5 * SECOND_MS);
      return searchResponse(tracker, request.query);
    },
    async runSavedSearch(savedSearchId) {
      await wait(1.5 * SECOND_MS);
      const saved = tracker.savedSearches().find((candidate) => candidate.id === savedSearchId);
      if (!saved) throw callableError("not-found", "saved_search_not_found");
      return searchResponse(tracker, saved.query);
    },
    async importUrl(url) {
      await wait(1.2 * SECOND_MS);
      if (url.includes("blocked")) throw callableError("failed-precondition", "blocked_by_site");
      return importResponse(url);
    },
    /** The server re-scores against the profile's CV: the matches now name it as their basis. */
    async refreshMatches(jobIds) {
      await wait(1.2 * SECOND_MS);
      const data = trackerData();
      const cv = data?.cvs.find((candidate) => candidate.id === data.profile?.defaultCvId);
      if (!cv) return;
      await tracker.apply(
        (jobIds ?? tracker.jobs().map((job) => job.id)).map((id) => ({
          op: "update" as const,
          collection: "jobMatches" as const,
          id,
          patch: { basedOnCvId: cv.id, basedOnCvRevisionId: cv.currentRevisionId, computedAt: FIXTURE_NOW },
        })),
      );
    },
    /**
     * Like `mailSend`: the job's application (created as Preparing · email when there is none)
     * carries `emailSend: scheduled`; after the undo window it is sent (an address containing
     * `fail` fails instead) and the application moves to Applied with the documents pinned.
     */
    async sendEmail(request) {
      const job = tracker.jobs().find((candidate) => candidate.id === request.jobId);
      const data = trackerData();
      if (!data) throw callableError("unavailable", "application_not_found");
      let application =
        data.applications.find((candidate) => candidate.id === request.applicationId) ??
        data.applications.find((candidate) => job !== undefined && candidate.jobId === job.id) ??
        null;
      if (!application) {
        if (!job) throw callableError("not-found", "job_not_found");
        const plan = planCreateApplications(
          [
            {
              application: newApplication(
                {
                  company: job.company,
                  role: job.title,
                  status: "preparing",
                  channel: "email",
                  jobId: job.id,
                  source: job.sources[0]?.source ?? null,
                },
                FIXTURE_NOW,
              ),
            },
          ],
          FIXTURE_NOW,
          tracker.newId,
        );
        await tracker.apply(plan.writes);
        application =
          trackerData()?.applications.find((candidate) => candidate.id === plan.applicationIds[0]) ?? null;
      }
      if (!application) throw callableError("not-found", "application_not_found");
      const applicationId = application.id;
      const sendAt = new Date(Date.now() + MAIL_SEND_UNDO_SECONDS * SECOND_MS);
      const emailSend: EmailSend = {
        state: "scheduled",
        sendId: `design-send-${applicationId}`,
        accountId: request.accountId,
        to: request.to,
        subject: request.subject,
        sendAt,
        sentAt: null,
        providerMessageId: null,
        threadId: null,
        rfc822MessageId: null,
        error: null,
      };
      setEmailSend(applicationId, emailSend);
      const deliver = () => {
        scheduled.delete(applicationId);
        if (request.to.some((address) => address.address.includes("fail"))) {
          setEmailSend(applicationId, {
            ...emailSend,
            state: "failed",
            error: { code: "send_failed", message: "The mail server refused the message." },
          });
          return;
        }
        const current =
          trackerData()?.applications.find((candidate) => candidate.id === applicationId) ?? null;
        if (job)
          void repository().recordApplied({
            job,
            application: current,
            channel: "email",
            ...request.pins,
          }).done;
        setEmailSend(applicationId, {
          ...emailSend,
          state: "sent",
          sentAt: new Date(),
          providerMessageId: "design-message",
        });
      };
      scheduled.set(applicationId, {
        timer: window.setTimeout(deliver, MAIL_SEND_UNDO_SECONDS * SECOND_MS),
        deliver,
      });
      return { applicationId, sendAt: sendAt.toISOString(), state: "scheduled" as const };
    },
    cancelEmail(applicationId) {
      const send = scheduled.get(applicationId);
      if (send) {
        clearTimeout(send.timer);
        scheduled.delete(applicationId);
        const application = trackerData()?.applications.find((candidate) => candidate.id === applicationId);
        if (application?.emailSend)
          setEmailSend(applicationId, { ...application.emailSend, state: "cancelled" });
      }
      return Promise.resolve();
    },
    sendEmailNow(applicationId) {
      const send = scheduled.get(applicationId);
      if (send) {
        clearTimeout(send.timer);
        send.deliver();
      }
      return Promise.resolve();
    },
    tailorCv(request) {
      const revision = tracker.cvRevisions().find((candidate) => candidate.id === request.revisionId);
      return designTailor(
        request,
        revision?.content ?? null,
        tracker.jobs().find((job) => job.id === request.jobId),
      );
    },
    draftCoverLetter(request) {
      return designCoverLetter(
        request,
        tracker.jobs().find((job) => job.id === request.jobId),
        trackerData()?.profile?.fullName ?? null,
      );
    },
  };
}

const jobsStores = new Map<FixtureDataset, MemoryJobsStore>();

/**
 * The fixtures' only email-apply posting (Halden) is applied already, so the design build turns a
 * German posting without an application into one that asks for email: the composer's capture
 * (`apply`, matrix.ts) and the de templates.
 */
export const DESIGN_EMAIL_APPLY_JOB_ID = "job-fernweh-frontend";
const DESIGN_EMAIL_APPLY_ADDRESS = "bewerbung@fernweh-reisen.de";

function jobsStoreFor(dataset: FixtureDataset): MemoryJobsStore {
  let store = jobsStores.get(dataset);
  if (!store) {
    const tracker = designTrackerStore(dataset);
    if (tracker.jobs().some((job) => job.id === DESIGN_EMAIL_APPLY_JOB_ID))
      void tracker.apply([
        {
          op: "update",
          collection: "jobs",
          id: DESIGN_EMAIL_APPLY_JOB_ID,
          patch: { applyUrl: null, applyEmail: DESIGN_EMAIL_APPLY_ADDRESS },
        },
      ]);
    const created: MemoryJobsStore = createMemoryJobsStore(
      tracker,
      {
        mailAccounts: dataset.mailAccounts,
        coverLetters: dataset.coverLetters,
        renderedFiles: dataset.renderedFiles,
        jobSources: DESIGN_JOB_SOURCES,
        answers: dataset.answers,
      },
      // The send simulation records the application through the store it belongs to.
      designCallables(tracker, () => created.repository),
    );
    store = created;
    jobsStores.set(dataset, store);
  }
  return store;
}

/** The design Jobs store of the route's dataset; goes inside `DesignTrackerProviders`. */
export function DesignJobsProviders({ children }: { readonly children: ReactNode }) {
  const search = readDesignParams(useSearch({ strict: false }));
  const dataset = designDataset(search.fixture);
  const store = jobsStoreFor(dataset);
  const base = useMemo(
    () => ({
      cvRevisions: dataset.cvRevisions,
      mailMessages: dataset.mailMessages,
      devices: dataset.devices,
    }),
    [dataset],
  );
  return (
    <JobsProviders source={store.source} repository={store.repository} base={base}>
      {children}
    </JobsProviders>
  );
}
