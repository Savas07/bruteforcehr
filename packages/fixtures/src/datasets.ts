import type {
  Application,
  ApplicationEvent,
  Contact,
  CoverLetter,
  Cv,
  CvRevision,
  Device,
  Interview,
  Job,
  JobMatch,
  MailAccount,
  MailMessage,
  Profile,
  RenderedFile,
  SavedSearch,
} from "@bfhr/core";
import { coverLetters, cvRevisions, cvs, renderedFiles } from "./cvs";
import { jobMatches, jobs, savedSearches } from "./jobs";
import { mailAccounts, mailMessages } from "./mail";
import { devices, FIXTURE_UID, profile } from "./persona";
import { applicationEvents, applications, contacts, interviews } from "./tracker";
import { daysAgo } from "./time";

/** Everything stored under `users/{uid}` for one user, collection by collection. */
export interface FixtureDataset {
  readonly uid: string;
  readonly profile: Profile;
  readonly cvs: readonly Cv[];
  readonly cvRevisions: readonly CvRevision[];
  readonly renderedFiles: readonly RenderedFile[];
  readonly coverLetters: readonly CoverLetter[];
  readonly jobs: readonly Job[];
  readonly jobMatches: readonly JobMatch[];
  readonly savedSearches: readonly SavedSearch[];
  readonly applications: readonly Application[];
  readonly applicationEvents: readonly ApplicationEvent[];
  readonly interviews: readonly Interview[];
  readonly contacts: readonly Contact[];
  readonly mailAccounts: readonly MailAccount[];
  readonly mailMessages: readonly MailMessage[];
  readonly devices: readonly Device[];
}

/** Deniz mid-search: the data behind populated screenshots of the five core screens. */
export const populatedDataset: FixtureDataset = {
  uid: FIXTURE_UID,
  profile,
  cvs,
  cvRevisions,
  renderedFiles,
  coverLetters,
  jobs,
  jobMatches,
  savedSearches,
  applications,
  applicationEvents,
  interviews,
  contacts,
  mailAccounts,
  mailMessages,
  devices,
};

/** Right after onboarding: a profile and one device, nothing else (empty states). */
export const emptyDataset: FixtureDataset = {
  uid: FIXTURE_UID,
  profile: {
    ...profile,
    defaultCvId: null,
    hiddenCompanies: [],
    onboardingCompletedAt: daysAgo(0, -0.1),
    createdAt: daysAgo(0, -0.2),
    updatedAt: daysAgo(0, -0.1),
  },
  cvs: [],
  cvRevisions: [],
  renderedFiles: [],
  coverLetters: [],
  jobs: [],
  jobMatches: [],
  savedSearches: [],
  applications: [],
  applicationEvents: [],
  interviews: [],
  contacts: [],
  mailAccounts: [],
  mailMessages: [],
  devices: devices.slice(0, 1).map((device) => ({ ...device, createdAt: daysAgo(0, -0.2) })),
};
