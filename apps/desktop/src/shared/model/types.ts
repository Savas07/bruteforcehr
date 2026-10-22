/**
 * Inputs and building blocks shared by every screen's view-model (`src/features/<screen>/model.ts`).
 * View-models are plain data: strings already formatted for display, status keys for tones, ids
 * for actions. Views never touch `@bfhr/core` entities or format dates themselves.
 */
import type { IntlShape } from "react-intl";
import type {
  Application,
  ApplicationEvent,
  ApplicationStatus,
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
  MatchBand,
  Profile,
  RenderedFile,
  SavedSearch,
  StatusPhase,
} from "@bfhr/core";

/**
 * Everything stored under `users/{uid}`, collection by collection. `@bfhr/fixtures`'
 * `FixtureDataset` has this shape; later milestones fill it from Firestore snapshots. Builders
 * take a `Pick<UserData, …>` of what they read.
 */
export interface UserData {
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

/** What every builder needs besides the data. Pure: no `Date.now()`, no ambient locale. */
export interface ModelContext {
  /** The clock. Fixtures use `FIXTURE_NOW`, so screenshots are deterministic. */
  readonly now: Date;
  /** BCP 47 locale for `Intl` formatting ("en-GB": 24 h clock, day-month order) = `intl.locale`. */
  readonly locale: string;
  /**
   * Messages in the UI language (src/i18n). Every user-facing string a builder returns goes
   * through `intl.formatMessage(messages.key, values)` with a module-level `defineMessages`.
   */
  readonly intl: IntlShape;
  /** IANA zone for wall-clock times (the profile's `timezone`). */
  readonly timeZone: string;
  /**
   * Ids of documents with local writes not yet on the server (Firestore `hasPendingWrites`).
   * Rows whose id is here show `SyncGlyph`.
   */
  readonly pendingWrites: ReadonlySet<string>;
}

/** A point in time, formatted. Relative label visible, absolute in the tooltip / accessible name. */
export interface TimeVM {
  readonly iso: string;
  /** "2 hours ago", "Tomorrow, 17:00", "In 3 days". */
  readonly label: string;
  /** "Thursday, 22 October 2026 at 10:30". */
  readonly absolute: string;
}

export interface StatusVM {
  readonly key: ApplicationStatus;
  /** From the shared dictionary: `rejected` → "Not selected", `ghosted` → "No response". */
  readonly label: string;
  readonly phase: StatusPhase;
}

export interface CompanyVM {
  readonly name: string;
  readonly domain: string | null;
  /** One or two letters for `Monogram` ("Acme Robotics" → "AR"). */
  readonly monogram: string;
}

/** Provenance shown by `SourceTag`: who or what made a value or change. */
export type SourceKind = "you" | "mail" | "cv" | "ai" | "rule" | "job_board" | "employer";

export interface SourceVM {
  readonly kind: SourceKind;
  /** "You", "From email", "From CV", "Automatic · Mail", "LinkedIn". */
  readonly label: string;
}

export interface MatchVM {
  readonly score: number;
  readonly band: MatchBand;
  /** "Strong", "Good", "Partial", "Stretch". */
  readonly bandLabel: string;
  /** Pill text: "Strong match", "Good match", "Partial match", "Stretch". */
  readonly pillLabel: string;
}

/** A screen's data, loaded or not. Views switch on `status` (states.md "State precedence"). */
export type Loadable<Model> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly retry: () => void }
  | {
      readonly status: "ready";
      readonly data: Model;
      /** Shown from the local cache (offline or not yet refreshed): render `StaleStamp`. */
      readonly fromCache: boolean;
      readonly updatedAt: TimeVM;
      /** `updatedAt` as a clock time for `StaleStamp` ("Updated 10:05"). */
      readonly updatedClock: string;
    };
