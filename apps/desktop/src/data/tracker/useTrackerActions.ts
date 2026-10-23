/**
 * Tracker actions with their feedback, shared by the board, the application detail, Today and the
 * table: each one writes through the repository (applied locally at once, synced later), shows the
 * Undo toast (D11/D12: Undo and Mod+Z restore exactly), and words a refused move with its D16
 * reason. Undo of a status move is a reverting event (`revert`), offered while the move is still the
 * application's latest one; otherwise the toast says "Can't undo — the status changed since."
 */
import {
  type Application,
  type ApplicationEvent,
  type ApplicationStatus,
  canRevert,
  canTransition,
  type Contact,
  type Interview,
} from "@bfhr/core";
import { AlarmClock, ArrowRight, Check, Plus, Undo2, X } from "lucide-react";
import { useContext } from "react";
import { defineMessages, useIntl } from "react-intl";
import { MOVE_DENIAL_MESSAGES, STATUS_MESSAGES } from "../../shared/model/vocabulary";
import { useToast } from "../../shared/ui/Toast";
import { displayTimeZone, useTrackerSource } from "./live";
import { ModelEnvironmentContext } from "./model";
import { type PendingWrite, type TrackerData, useTrackerRepository } from "./repository";
import { snoozeInstant, type SnoozeUntil } from "./snooze";
import type {
  ApplicationPatch,
  ContactInput,
  InterviewInput,
  NewApplication,
  SuggestionKind,
} from "./writes";

const messages = defineMessages({
  undo: { id: "shared.trackerActions.undo", defaultMessage: "Undo" },
  moved: {
    id: "shared.trackerActions.moved",
    defaultMessage:
      "{outcome, select, rejected {{company} · marked as not selected} ghosted {{company} · marked as no response} withdrawn {{company} · marked as withdrawn} other {{company} · moved to {status}}}",
    description: "Undo toast after a move; {outcome} is the status key, {status} its display name",
  },
  movedMany: {
    id: "shared.trackerActions.movedMany",
    defaultMessage:
      "{count, plural, one {# application moved to {status}} other {# applications moved to {status}}}",
  },
  movedBack: {
    id: "shared.trackerActions.movedBack",
    defaultMessage: "{company} · back to {status}",
    description: "Toast after undoing a move from the timeline; {status} is the status it returned to",
  },
  superseded: {
    id: "shared.trackerActions.superseded",
    defaultMessage: "Can't undo — the status changed since.",
  },
  writeFailed: {
    id: "shared.trackerActions.writeFailed",
    defaultMessage: "We couldn't save that change. Check your connection and try again.",
  },
  snoozed: {
    id: "shared.trackerActions.snoozed",
    defaultMessage:
      "{preset, select, laterToday {Snoozed until later today} tomorrow {Snoozed until tomorrow} nextWeek {Snoozed until next week} other {Snoozed until {date, date, long}}} · {company}",
    description: "Toast after snoozing a suggestion. {date} is only used for a picked date",
  },
  notNeeded: { id: "shared.trackerActions.notNeeded", defaultMessage: "Follow-up not needed · {company}" },
  keptWaiting: {
    id: "shared.trackerActions.keptWaiting",
    defaultMessage: "Still waiting · {company}",
    description: "Toast after 'Keep waiting' on a no-response suggestion",
  },
  added: { id: "shared.trackerActions.added", defaultMessage: "{company} · added to {status}" },
  deleted: { id: "shared.trackerActions.deleted", defaultMessage: "{company} · application deleted" },
  noteAdded: { id: "shared.trackerActions.noteAdded", defaultMessage: "Note added · {company}" },
  followUpLogged: {
    id: "shared.trackerActions.followUpLogged",
    defaultMessage: "Follow-up noted · {company}",
    description: "Toast after 'I followed up'; the follow-up suggestion starts over",
  },
  saved: { id: "shared.trackerActions.saved", defaultMessage: "Saved · {company}" },
  interviewSaved: { id: "shared.trackerActions.interviewSaved", defaultMessage: "{title} saved · {company}" },
  interviewDeleted: {
    id: "shared.trackerActions.interviewDeleted",
    defaultMessage: "{title} removed · {company}",
  },
});

/** Ids `move` reports back so a screen can follow the card (focus, selection). */
export interface MoveOptions {
  /** Called after Undo's "Restored · Open". */
  readonly openAfterUndo?: () => void;
  /** Optional comment on the timeline row. */
  readonly text?: string;
}

export interface TrackerActions {
  /** A user move through `canTransition`; refused moves show their D16 reason. False when refused. */
  move(applicationId: string, to: ApplicationStatus, options?: MoveOptions): boolean;
  /** The same move for several applications, one batch and one Undo (Table bulk change). */
  moveMany(applicationIds: readonly string[], to: ApplicationStatus): number;
  /** Durable Undo of a status change from the timeline (no time limit; only the latest move). */
  undoEvent(eventId: string): void;
  snoozeSuggestion(applicationId: string, kind: SuggestionKind, until: SnoozeUntil): void;
  /** "Not needed" (follow-up) / "Keep waiting" (no response). */
  dismissSuggestion(applicationId: string, kind: SuggestionKind): void;
  /** Creates applications; the toast's Undo deletes them again. Returns the new ids. */
  createApplications(
    items: readonly NewApplication[],
    options?: { openAfterUndo?: () => void },
  ): readonly string[];
  updateApplication(applicationId: string, patch: ApplicationPatch, options?: { quiet?: boolean }): void;
  deleteApplication(applicationId: string): void;
  addNote(applicationId: string, text: string): void;
  /** "I followed up": records it on the timeline; the follow-up suggestion starts a new round. */
  logFollowUp(applicationId: string): void;
  saveInterview(input: InterviewInput, existing: Interview | null): string;
  deleteInterview(interview: Interview): void;
  saveContact(input: ContactInput, existing: Contact | null): string;
  linkContact(contact: Contact, applicationId: string, linked: boolean): void;
}

export function useTrackerActions(): TrackerActions {
  const intl = useIntl();
  const toast = useToast();
  const repository = useTrackerRepository();
  const source = useTrackerSource();
  // The clock and zone screens are built with (the fixture clock and `?tz` in the design build).
  const environment = useContext(ModelEnvironmentContext);

  // Read when an action runs (Undo runs later, from the toast or Mod+Z): the data as it is then.
  const data = (): TrackerData | null => {
    const state = source.getState();
    return state.status === "ready" ? state.data : null;
  };
  const findApplication = (id: string) =>
    data()?.applications.find((candidate) => candidate.id === id) ?? null;
  const company = (application: Application | null) => application?.company ?? "";
  const statusLabel = (status: ApplicationStatus) => intl.formatMessage(STATUS_MESSAGES[status]);

  /** Reports a rejected batch (offline writes stay pending instead and never land here). */
  const watch = <Ids extends object>(write: PendingWrite<Ids>): PendingWrite<Ids> => {
    write.done.catch((error: unknown) => {
      console.error("Tracker write failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.writeFailed) });
    });
    return write;
  };

  /** Reverts the given status-change events, if each is still its application's latest move. */
  const revertEvents = (eventIds: readonly string[]): boolean => {
    const current = data();
    if (!current) return false;
    const targets: { application: Application; event: ApplicationEvent; events: ApplicationEvent[] }[] = [];
    for (const eventId of eventIds) {
      const event = current.applicationEvents.find((candidate) => candidate.id === eventId);
      const application = event ? findApplication(event.applicationId) : null;
      if (!event || !application) continue;
      const events = current.applicationEvents.filter(
        (candidate) => candidate.applicationId === application.id,
      );
      if (canRevert({ application, event, events }).allowed) targets.push({ application, event, events });
    }
    if (targets.length === 0) {
      toast.show({ variant: "info", message: intl.formatMessage(messages.superseded) });
      return false;
    }
    watch(repository.undo(targets));
    return true;
  };

  const actions: TrackerActions = {
    move(applicationId, to, options = {}) {
      const application = findApplication(applicationId);
      if (!application || application.status === to) return false;
      const check = canTransition(application.status, to, "user");
      if (!check.allowed) {
        if (check.reason === "outcome_requires_offer")
          toast.show({
            variant: "info",
            message: intl.formatMessage(MOVE_DENIAL_MESSAGES.outcome_requires_offer),
          });
        return false;
      }
      const write = watch(
        repository.moveStatus([{ application, to, ...(options.text ? { text: options.text } : {}) }]),
      );
      toast.show({
        message: intl.formatMessage(messages.moved, {
          company: application.company,
          status: statusLabel(to),
          outcome: to,
        }),
        glyph: ArrowRight,
        action: {
          label: intl.formatMessage(messages.undo),
          run: () => void revertEvents(write.ids.eventIds),
        },
        ...(options.openAfterUndo ? { openAfterUndo: options.openAfterUndo } : {}),
      });
      return true;
    },

    moveMany(applicationIds, to) {
      const moves = applicationIds.flatMap((id) => {
        const application = findApplication(id);
        return application && canTransition(application.status, to, "user").allowed
          ? [{ application, to }]
          : [];
      });
      if (moves.length === 0) return 0;
      const write = watch(repository.moveStatus(moves));
      toast.show({
        message: intl.formatMessage(messages.movedMany, { count: moves.length, status: statusLabel(to) }),
        glyph: ArrowRight,
        extended: moves.length > 1,
        action: {
          label: intl.formatMessage(messages.undo),
          run: () => void revertEvents(write.ids.eventIds),
        },
      });
      return moves.length;
    },

    undoEvent(eventId) {
      const event = data()?.applicationEvents.find((candidate) => candidate.id === eventId);
      const application = event ? findApplication(event.applicationId) : null;
      if (!event?.fromStatus || !application) return;
      if (revertEvents([eventId])) {
        toast.show({
          message: intl.formatMessage(messages.movedBack, {
            company: application.company,
            status: statusLabel(event.fromStatus),
          }),
          glyph: Undo2,
        });
      }
    },

    snoozeSuggestion(applicationId, kind, until) {
      const application = findApplication(applicationId);
      const at = snoozeInstant(
        until,
        environment.now(),
        environment.timeZone ?? displayTimeZone(data()?.profile ?? null),
      );
      watch(repository.snoozeSuggestion(applicationId, kind, at));
      toast.show({
        message: intl.formatMessage(messages.snoozed, {
          preset: until.preset,
          date: until.preset === "pickDate" ? until.date : null,
          company: company(application),
        }),
        glyph: AlarmClock,
        action: {
          label: intl.formatMessage(messages.undo),
          run: () => void watch(repository.snoozeSuggestion(applicationId, kind, null)),
        },
      });
    },

    dismissSuggestion(applicationId, kind) {
      const application = findApplication(applicationId);
      watch(repository.dismissSuggestion(applicationId, kind, true));
      toast.show({
        message: intl.formatMessage(kind === "followUp" ? messages.notNeeded : messages.keptWaiting, {
          company: company(application),
        }),
        glyph: kind === "followUp" ? X : Check,
        action: {
          label: intl.formatMessage(messages.undo),
          run: () => void watch(repository.dismissSuggestion(applicationId, kind, false)),
        },
      });
    },

    createApplications(items, options = {}) {
      const write = watch(repository.createApplications(items));
      const [first] = items;
      if (first) {
        toast.show({
          message: intl.formatMessage(messages.added, {
            company: first.application.company,
            status: statusLabel(first.application.status),
          }),
          glyph: Plus,
          extended: items.length > 1,
          action: {
            label: intl.formatMessage(messages.undo),
            run: () => void watch(repository.deleteApplications(write.ids.applicationIds)),
          },
          ...(options.openAfterUndo ? { openAfterUndo: options.openAfterUndo } : {}),
        });
      }
      return write.ids.applicationIds;
    },

    updateApplication(applicationId, patch, options = {}) {
      watch(repository.updateApplication(applicationId, patch));
      if (!options.quiet) {
        toast.show({
          variant: "info",
          message: intl.formatMessage(messages.saved, { company: company(findApplication(applicationId)) }),
        });
      }
    },

    deleteApplication(applicationId) {
      const application = findApplication(applicationId);
      watch(repository.deleteApplications([applicationId]));
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.deleted, { company: company(application) }),
      });
    },

    addNote(applicationId, text) {
      watch(repository.addNote(applicationId, text));
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.noteAdded, { company: company(findApplication(applicationId)) }),
      });
    },

    logFollowUp(applicationId) {
      watch(repository.logFollowUp(applicationId));
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.followUpLogged, {
          company: company(findApplication(applicationId)),
        }),
      });
    },

    saveInterview(input, existing) {
      const write = watch(repository.saveInterview(input, existing));
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.interviewSaved, {
          title: input.title,
          company: company(findApplication(input.applicationId)),
        }),
      });
      return write.ids.interviewId;
    },

    deleteInterview(interview) {
      watch(repository.deleteInterview(interview.id));
      const {
        id: _id,
        createdAt: _created,
        updatedAt: _updated,
        sourceMailMessageId: _source,
        ...input
      } = interview;
      toast.show({
        message: intl.formatMessage(messages.interviewDeleted, {
          title: interview.title,
          company: company(findApplication(interview.applicationId)),
        }),
        glyph: X,
        action: {
          label: intl.formatMessage(messages.undo),
          run: () => void watch(repository.saveInterview(input, null)),
        },
      });
    },

    saveContact(input, existing) {
      return watch(repository.saveContact(input, existing)).ids.contactId;
    },

    linkContact(contact, applicationId, linked) {
      watch(repository.linkContact(contact, applicationId, linked));
    },
  };
  return actions;
}
