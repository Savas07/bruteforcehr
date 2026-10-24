/**
 * What every tracker action writes, as plain data: the application, event, interview, contact and
 * job documents to create, update or delete, computed with the `@bfhr/core` state machine. The
 * Firestore repository commits a plan as one batch (`firestore.ts`), the design build's memory
 * store applies it to its arrays (`memory.ts`), so both behave the same and the rules here are
 * tested once (`writes.test.ts`).
 *
 * Rules every plan follows (ADR 0002):
 * - a status change is one batch: the application patch + one user `status_changed` event;
 * - Undo is a new reverting event (`revert`), never an edit;
 * - creating an application writes its `created` event (and the link's manual job) with it;
 * - events are create-only and always `actor: "user"` from this client.
 */
import {
  type Application,
  type ApplicationEvent,
  type ApplicationEventDraft,
  type ApplicationStatus,
  type Contact,
  type CvRevision,
  type Interview,
  type Job,
  type JobMatch,
  manualJob,
  type Profile,
  revert,
  type SavedSearch,
  transition,
} from "@bfhr/core";

/** Collections the tracker and the Jobs area write, with their entity types. */
export interface TrackerEntities {
  readonly applications: Application;
  readonly applicationEvents: ApplicationEvent;
  readonly interviews: Interview;
  readonly contacts: Contact;
  readonly jobs: Job;
  readonly jobMatches: JobMatch;
  readonly savedSearches: SavedSearch;
}
export type TrackerCollection = keyof TrackerEntities;

/** Collections a client creates documents in (matches are computed server-side). */
export type CreatableCollection = Exclude<TrackerCollection, "jobMatches">;
/** Collections whose documents a client may update (events are create-only). */
export type UpdatableCollection = Exclude<TrackerCollection, "applicationEvents">;
/** Collections whose documents a client may delete. */
export type DeletableCollection = Exclude<TrackerCollection, "applicationEvents" | "jobs" | "jobMatches">;

/**
 * The profile fields the Jobs area changes: "Hide all jobs from {company}", "I have this" (a skill
 * for matching) and the CV matches are scored against.
 */
export type ProfilePatch = Partial<Pick<Profile, "hiddenCompanies" | "skills" | "defaultCvId" | "updatedAt">>;

export type TrackerWrite =
  | {
      [C in CreatableCollection]: {
        readonly op: "create";
        readonly collection: C;
        readonly entity: TrackerEntities[C];
      };
    }[CreatableCollection]
  | {
      [C in UpdatableCollection]: {
        readonly op: "update";
        readonly collection: C;
        readonly id: string;
        readonly patch: Partial<Omit<TrackerEntities[C], "id">>;
      };
    }[UpdatableCollection]
  | { readonly op: "delete"; readonly collection: DeletableCollection; readonly id: string }
  | { readonly op: "updateProfile"; readonly patch: ProfilePatch }
  /** A CV revision (`cvs/{cvId}/revisions/{id}`, create-only) committed with the plan: a tailored version. */
  | { readonly op: "createCvRevision"; readonly revision: CvRevision };

/** A new document id in `collection` (Firestore auto ids; counters in memory). */
export type NewId = (collection: CreatableCollection) => string;

// ─── Applications ──────────────────────────────────────────────────────────────────────────────

/** An application to create; `newApplication` fills the defaults. */
export interface NewApplication {
  readonly application: Omit<Application, "id">;
  /** Shown on the `created` timeline row ("Imported from tracker.csv · row 4"); null for none. */
  readonly reason?: string | null;
  /** The posting's address: stored as a manual `jobs` document (`manualJob`) the application points at. */
  readonly link?: string | null;
  /** When the `created` event happened (an import's applied date); defaults to `at`. */
  readonly occurredAt?: Date;
}

/** What the user enters for a new application (Log an application, CSV import). */
export interface ApplicationFields {
  readonly company: string;
  readonly role: string;
  readonly status: ApplicationStatus;
  readonly location?: string | null;
  readonly channel?: Application["channel"];
  readonly source?: string | null;
  /** When the user applied; defaults to `at` for statuses from Applied on, else null. */
  readonly appliedAt?: Date | null;
  readonly cvId?: string | null;
  readonly cvRevisionId?: string | null;
  readonly jobId?: string | null;
  readonly notes?: string;
}

/** Statuses at or past Applied (they need an `appliedAt`). */
const NOT_APPLIED_YET: readonly ApplicationStatus[] = ["saved", "preparing"];

/** A complete application document from the entered fields, every "maybe" field null (ADR 0002). */
export function newApplication(fields: ApplicationFields, at: Date): Omit<Application, "id"> {
  const applied = !NOT_APPLIED_YET.includes(fields.status);
  return {
    jobId: fields.jobId ?? null,
    company: fields.company.trim(),
    companyDomain: null,
    role: fields.role.trim(),
    location: fields.location?.trim() || null,
    status: fields.status,
    statusChangedAt: at,
    channel: fields.channel ?? null,
    source: fields.source ?? null,
    appliedAt: fields.appliedAt ?? (applied ? at : null),
    cvId: fields.cvId ?? null,
    cvRevisionId: fields.cvRevisionId ?? null,
    cvFileId: null,
    coverLetterId: null,
    coverLetterFileId: null,
    fromAccountId: null,
    threadRefs: [],
    nextAction: null,
    nextActionAt: null,
    priority: "normal",
    notes: fields.notes ?? "",
    followUpSnoozedUntil: null,
    followUpDismissedAt: null,
    ghostedSnoozedUntil: null,
    ghostedDismissedAt: null,
    emailSend: null,
    createdAt: at,
    updatedAt: at,
  };
}

const userEvent = (
  applicationId: string,
  type: ApplicationEvent["type"],
  at: Date,
  fields: Partial<ApplicationEventDraft> = {},
): ApplicationEventDraft => ({
  applicationId,
  type,
  fromStatus: null,
  toStatus: null,
  actor: "user",
  confidence: null,
  evidence: null,
  text: null,
  revertsEventId: null,
  occurredAt: at,
  createdAt: at,
  ...fields,
});

export interface CreatePlan {
  readonly writes: readonly TrackerWrite[];
  readonly applicationIds: readonly string[];
  readonly eventIds: readonly string[];
}

export function planCreateApplications(items: readonly NewApplication[], at: Date, newId: NewId): CreatePlan {
  const writes: TrackerWrite[] = [];
  const applicationIds: string[] = [];
  const eventIds: string[] = [];
  for (const item of items) {
    const id = newId("applications");
    let jobId = item.application.jobId;
    if (item.link) {
      jobId = newId("jobs");
      const job = manualJob({
        company: item.application.company,
        title: item.application.role,
        url: item.link,
        location: item.application.location,
        at,
      });
      writes.push({ op: "create", collection: "jobs", entity: { id: jobId, ...job } });
    }
    writes.push({ op: "create", collection: "applications", entity: { ...item.application, id, jobId } });
    const eventId = newId("applicationEvents");
    const occurredAt = item.occurredAt ?? at;
    writes.push({
      op: "create",
      collection: "applicationEvents",
      entity: {
        id: eventId,
        ...userEvent(id, "created", occurredAt, {
          toStatus: item.application.status,
          evidence: item.reason ? { mailMessageId: null, reason: item.reason } : null,
          createdAt: at,
        }),
      },
    });
    applicationIds.push(id);
    eventIds.push(eventId);
  }
  return { writes, applicationIds, eventIds };
}

export function planDeleteApplications(applicationIds: readonly string[]): TrackerWrite[] {
  // Their events go with them through a server trigger (clients can't delete events, ADR 0002).
  return applicationIds.map((id) => ({ op: "delete", collection: "applications", id }));
}

/** Fields the user edits on an application after creating it. Status moves go through `planMoves`. */
export type ApplicationPatch = Partial<
  Pick<
    Application,
    | "company"
    | "role"
    | "location"
    | "channel"
    | "appliedAt"
    | "cvId"
    | "cvRevisionId"
    | "nextAction"
    | "nextActionAt"
    | "priority"
    | "notes"
    | "followUpSnoozedUntil"
    | "followUpDismissedAt"
    | "ghostedSnoozedUntil"
    | "ghostedDismissedAt"
  >
>;

export function planUpdateApplication(
  applicationId: string,
  patch: ApplicationPatch,
  at: Date,
): TrackerWrite[] {
  return [
    { op: "update", collection: "applications", id: applicationId, patch: { ...patch, updatedAt: at } },
  ];
}

// ─── Status moves and Undo ─────────────────────────────────────────────────────────────────────

export interface StatusMove {
  readonly application: Application;
  readonly to: ApplicationStatus;
  /** Optional comment on the timeline row. */
  readonly text?: string;
}

export interface MovePlan {
  readonly writes: readonly TrackerWrite[];
  readonly eventIds: readonly string[];
}

/** One user `transition` per move (throws `TransitionError` for a move the user may not make). */
export function planMoves(moves: readonly StatusMove[], at: Date, newId: NewId): MovePlan {
  const writes: TrackerWrite[] = [];
  const eventIds: string[] = [];
  for (const move of moves) {
    const result = transition({
      application: move.application,
      to: move.to,
      actor: "user",
      at,
      ...(move.text ? { text: move.text } : {}),
    });
    const eventId = newId("applicationEvents");
    writes.push(
      {
        op: "update",
        collection: "applications",
        id: move.application.id,
        patch: { ...result.applicationPatch, updatedAt: at },
      },
      { op: "create", collection: "applicationEvents", entity: { id: eventId, ...result.event } },
    );
    eventIds.push(eventId);
  }
  return { writes, eventIds };
}

/** The status change to undo, with its application's current state and events. */
export interface RevertTarget {
  readonly application: Application;
  readonly event: ApplicationEvent;
  readonly events: readonly ApplicationEvent[];
}

/** One reverting user event per target (throws `TransitionError` when `canRevert` says no). */
export function planUndo(targets: readonly RevertTarget[], at: Date, newId: NewId): MovePlan {
  const writes: TrackerWrite[] = [];
  const eventIds: string[] = [];
  for (const target of targets) {
    const result = revert({ ...target, at });
    const eventId = newId("applicationEvents");
    writes.push(
      {
        op: "update",
        collection: "applications",
        id: target.application.id,
        patch: { ...result.applicationPatch, updatedAt: at },
      },
      { op: "create", collection: "applicationEvents", entity: { id: eventId, ...result.event } },
    );
    eventIds.push(eventId);
  }
  return { writes, eventIds };
}

// ─── Notes ─────────────────────────────────────────────────────────────────────────────────────

/** A dated note on the timeline (the free-text `notes` field is edited with `planUpdateApplication`). */
export function planAddNote(applicationId: string, text: string, at: Date, newId: NewId): MovePlan {
  const eventId = newId("applicationEvents");
  return {
    writes: [
      {
        op: "create",
        collection: "applicationEvents",
        entity: { id: eventId, ...userEvent(applicationId, "note", at, { text: text.trim() }) },
      },
    ],
    eventIds: [eventId],
  };
}

/**
 * "I followed up": the user records a follow-up they sent outside the app (a `mail_sent` event
 * without a subject), which starts a new follow-up round (`followUpDue`).
 */
export function planLogFollowUp(applicationId: string, at: Date, newId: NewId): MovePlan {
  const eventId = newId("applicationEvents");
  return {
    writes: [
      {
        op: "create",
        collection: "applicationEvents",
        entity: { id: eventId, ...userEvent(applicationId, "mail_sent", at) },
      },
    ],
    eventIds: [eventId],
  };
}

// ─── Suggestions (decisions.md F9) ─────────────────────────────────────────────────────────────

export type SuggestionKind = "followUp" | "noResponse";

/** "Later": hidden until `until`. */
export function planSnoozeSuggestion(
  applicationId: string,
  kind: SuggestionKind,
  until: Date | null,
  at: Date,
): TrackerWrite[] {
  return planUpdateApplication(
    applicationId,
    kind === "followUp" ? { followUpSnoozedUntil: until } : { ghostedSnoozedUntil: until },
    at,
  );
}

/** "Not needed" / "Keep waiting"; `null` undoes it. */
export function planDismissSuggestion(
  applicationId: string,
  kind: SuggestionKind,
  dismissedAt: Date | null,
  at: Date,
): TrackerWrite[] {
  return planUpdateApplication(
    applicationId,
    kind === "followUp" ? { followUpDismissedAt: dismissedAt } : { ghostedDismissedAt: dismissedAt },
    at,
  );
}

// ─── Interviews ────────────────────────────────────────────────────────────────────────────────

/** An interview round as edited on the detail page. */
export type InterviewInput = Omit<Interview, "id" | "createdAt" | "updatedAt" | "sourceMailMessageId">;

export interface InterviewPlan {
  readonly writes: readonly TrackerWrite[];
  readonly interviewId: string;
}

/**
 * Creates an interview round with its `interview_scheduled` timeline event (a signal for the
 * no-response suggestion), or updates an existing one.
 */
export function planSaveInterview(
  input: InterviewInput,
  existing: Interview | null,
  at: Date,
  newId: NewId,
): InterviewPlan {
  if (existing) {
    return {
      writes: [
        { op: "update", collection: "interviews", id: existing.id, patch: { ...input, updatedAt: at } },
      ],
      interviewId: existing.id,
    };
  }
  const interviewId = newId("interviews");
  return {
    writes: [
      {
        op: "create",
        collection: "interviews",
        entity: { ...input, id: interviewId, sourceMailMessageId: null, createdAt: at, updatedAt: at },
      },
      {
        op: "create",
        collection: "applicationEvents",
        entity: {
          id: newId("applicationEvents"),
          ...userEvent(input.applicationId, "interview_scheduled", at, { text: input.title }),
        },
      },
    ],
    interviewId,
  };
}

export function planDeleteInterview(interviewId: string): TrackerWrite[] {
  return [{ op: "delete", collection: "interviews", id: interviewId }];
}

// ─── Contacts ──────────────────────────────────────────────────────────────────────────────────

export type ContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">;

export interface ContactPlan {
  readonly writes: readonly TrackerWrite[];
  readonly contactId: string;
}

export function planSaveContact(
  input: ContactInput,
  existing: Contact | null,
  at: Date,
  newId: NewId,
): ContactPlan {
  if (existing) {
    return {
      writes: [{ op: "update", collection: "contacts", id: existing.id, patch: { ...input, updatedAt: at } }],
      contactId: existing.id,
    };
  }
  const contactId = newId("contacts");
  return {
    writes: [
      {
        op: "create",
        collection: "contacts",
        entity: { ...input, id: contactId, createdAt: at, updatedAt: at },
      },
    ],
    contactId,
  };
}

/** Adds or removes `applicationId` on the contact (it stays in the address book either way). */
export function planLinkContact(
  contact: Contact,
  applicationId: string,
  linked: boolean,
  at: Date,
): TrackerWrite[] {
  const others = contact.applicationIds.filter((id) => id !== applicationId);
  return [
    {
      op: "update",
      collection: "contacts",
      id: contact.id,
      patch: { applicationIds: linked ? [...others, applicationId] : others, updatedAt: at },
    },
  ];
}

export function planDeleteContact(contactId: string): TrackerWrite[] {
  return [{ op: "delete", collection: "contacts", id: contactId }];
}
