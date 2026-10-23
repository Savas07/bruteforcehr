/**
 * Today's actions (decisions.md D11/D12: every one moves the item out at once and offers Undo).
 * What the tracker data stores goes through `useTrackerActions`, so it persists, syncs and shows
 * the same on every device:
 * - follow-up suggestions: "I followed up" (`logFollowUp`), "Not needed" / "Keep waiting"
 *   (`dismissSuggestion`), "Mark as no response" (a move to No response), snooze
 *   (`snoozeSuggestion`) and "Move back now" (clears the snooze);
 * - reminders: "Mark as done" clears the application's next action and its date;
 * - automatic changes: "Undo this change" (`undoEvent`).
 * Emails, matches, email and posting deadlines and "Mark as seen" have no stored state in this
 * version (mail and jobs arrive in M4/M5; production Today never lists them yet), so in the design
 * build they keep a session-local state: handled ones go to "Done today", snoozed ones to Later.
 */
import type { Application } from "@bfhr/core";
import { AlarmClock, AlarmClockOff, Bookmark, BookmarkX, Check, MailX, X, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useTrackerSource } from "../../data/tracker/live";
import type { SnoozeUntil } from "../../data/tracker/snooze";
import { useTrackerActions } from "../../data/tracker/useTrackerActions";
import { useToast } from "../../shared/ui/Toast";
import type {
  AttentionItemVM,
  AutoUpdateItemVM,
  DeadlineItemVM,
  FollowUpItemVM,
  MatchItemVM,
  ReviewItemVM,
} from "./model";

const messages = defineMessages({
  undo: { id: "today.toast.undo", defaultMessage: "Undo", description: "Toast action" },
  confirmedMove: {
    id: "today.toast.confirmedMove",
    defaultMessage: "Confirmed · {company} moved to {status}",
    description: "Toast after confirming an email. {status} is a status name",
  },
  confirmed: {
    id: "today.toast.confirmed",
    defaultMessage: "Confirmed · {company}",
    description: "Toast after confirming an email that doesn't change a status",
  },
  notJobMail: {
    id: "today.toast.notJobMail",
    defaultMessage: "Marked as not job mail · {company}",
    description: "Toast",
  },
  seen: { id: "today.toast.seen", defaultMessage: "Marked as seen · {company}", description: "Toast" },
  deadlineDone: {
    id: "today.toast.deadlineDone",
    defaultMessage: "Marked as done · {company}",
    description: "Toast after marking a deadline or reminder as done",
  },
  movedBackNow: {
    id: "today.toast.movedBackNow",
    defaultMessage: "Back on Today · {company}",
    description: "Toast after 'Move back now' on a snoozed suggestion",
  },
  notForMe: {
    id: "today.toast.notForMe",
    defaultMessage: "Not for me · {role}, {company}",
    description: "Toast after hiding a new match",
  },
  saved: { id: "today.toast.saved", defaultMessage: "Saved · {role}, {company}", description: "Toast" },
  unsaved: {
    id: "today.toast.unsaved",
    defaultMessage: "Removed from saved · {role}, {company}",
    description: "Toast",
  },
  snoozed: {
    id: "today.toast.snoozed",
    defaultMessage:
      "{preset, select, laterToday {Snoozed until later today} tomorrow {Snoozed until tomorrow} nextWeek {Snoozed until next week} other {Snoozed until {date, date, long}}} · {company}",
    description: "Toast after snoozing an item. {date} is only used for a picked date",
  },
  // Outcomes in the "Done today" group (session-local items).
  outcomeConfirmed: { id: "today.outcome.confirmed", defaultMessage: "Confirmed", description: "Done today" },
  outcomeNotJobMail: {
    id: "today.outcome.notJobMail",
    defaultMessage: "Marked as not job mail",
    description: "Done today",
  },
  outcomeSeen: { id: "today.outcome.seen", defaultMessage: "Seen", description: "Done today" },
  outcomeDone: { id: "today.outcome.done", defaultMessage: "Done", description: "Done today" },
  outcomeNotForMe: { id: "today.outcome.notForMe", defaultMessage: "Not for me", description: "Done today" },
});

/** A session-local handled item (design build: emails, matches, email and posting deadlines). */
export interface LocalDone {
  readonly item: AttentionItemVM;
  /** "Confirmed", "Seen". */
  readonly outcome: string;
}

/** A session-local snoozed item. */
export interface LocalLater {
  readonly item: AttentionItemVM;
  readonly until: SnoozeUntil;
}

export interface TodayLocalState {
  /** Newest first. */
  readonly done: readonly LocalDone[];
  readonly later: readonly LocalLater[];
  /** Save toggled on Today: match id → saved. */
  readonly saved: Readonly<Record<string, boolean>>;
}

const EMPTY: TodayLocalState = { done: [], later: [], saved: {} };

export interface TodayActions {
  readonly local: TodayLocalState;
  readonly confirm: (item: ReviewItemVM) => void;
  readonly notJobMail: (item: ReviewItemVM) => void;
  readonly acknowledge: (item: AutoUpdateItemVM) => void;
  readonly undoAutoChange: (item: AutoUpdateItemVM) => void;
  readonly markDone: (item: DeadlineItemVM) => void;
  /** The suggestion's primary: "I followed up" or "Mark as no response". */
  readonly nudgePrimary: (item: FollowUpItemVM) => void;
  /** "Not needed" / "Keep waiting" (D19). */
  readonly declineNudge: (item: FollowUpItemVM) => void;
  readonly notForMe: (item: MatchItemVM) => void;
  readonly toggleSave: (item: MatchItemVM) => void;
  readonly snooze: (item: AttentionItemVM, until: SnoozeUntil) => void;
  /** Back from Later to the open list ("Move back now"). */
  readonly unsnooze: (item: AttentionItemVM) => void;
}

/** Snooze applies to every kind but interviews, automatic changes and reminders (they have a date). */
export function canSnooze(item: AttentionItemVM): boolean {
  if (item.kind === "deadline") return item.deadlineKind !== "reminder";
  return item.kind !== "interview" && item.kind !== "autoUpdate";
}

/**
 * @param beforeRemove called before an item leaves the visible list, so the screen can move the
 *   selection to its neighbour.
 * @param reveal called after Undo's "Restored · Open" to select the item again.
 */
export function useTodayActions({
  beforeRemove,
  reveal,
}: {
  beforeRemove: (item: AttentionItemVM) => void;
  reveal: (id: string) => void;
}): TodayActions {
  const intl = useIntl();
  const toast = useToast();
  const tracker = useTrackerActions();
  const source = useTrackerSource();
  const [local, setLocal] = useState<TodayLocalState>(EMPTY);

  /** The application as stored when the action runs (Undo restores exactly that). */
  const application = (id: string): Application | null => {
    const state = source.getState();
    return state.status === "ready"
      ? (state.data.applications.find((candidate) => candidate.id === id) ?? null)
      : null;
  };

  const restore = useCallback((id: string) => {
    setLocal((current) => ({
      ...current,
      done: current.done.filter((entry) => entry.item.id !== id),
      later: current.later.filter((entry) => entry.item.id !== id),
    }));
  }, []);

  /** An application patch with its own Undo toast (the shared "Saved" toast stays quiet). */
  const patchWithUndo = (
    item: AttentionItemVM,
    applicationId: string,
    patch: Partial<Pick<Application, "nextAction" | "nextActionAt" | "followUpSnoozedUntil" | "ghostedSnoozedUntil">>,
    message: string,
    glyph: LucideIcon,
  ) => {
    const before = application(applicationId);
    if (!before) return;
    const previous = Object.fromEntries(
      Object.keys(patch).map((key) => [key, before[key as keyof typeof patch]]),
    ) as typeof patch;
    beforeRemove(item);
    tracker.updateApplication(applicationId, patch, { quiet: true });
    toast.show({
      message,
      glyph,
      action: {
        label: intl.formatMessage(messages.undo),
        run: () => tracker.updateApplication(applicationId, previous, { quiet: true }),
      },
      openAfterUndo: () => reveal(item.id),
    });
  };

  const finishLocally = (item: AttentionItemVM, outcome: string, message: string, glyph: LucideIcon) => {
    beforeRemove(item);
    setLocal((current) => ({ ...current, done: [{ item, outcome }, ...current.done] }));
    toast.show({
      message,
      glyph,
      action: { label: intl.formatMessage(messages.undo), run: () => restore(item.id) },
      openAfterUndo: () => reveal(item.id),
    });
  };

  const company = (item: AttentionItemVM) => item.company.name;

  return {
    local,
    confirm: (item) => {
      const { move } = item.proposal;
      finishLocally(
        item,
        intl.formatMessage(messages.outcomeConfirmed),
        move
          ? intl.formatMessage(messages.confirmedMove, { company: company(item), status: move.to.label })
          : intl.formatMessage(messages.confirmed, { company: company(item) }),
        Check,
      );
    },
    notJobMail: (item) =>
      finishLocally(
        item,
        intl.formatMessage(messages.outcomeNotJobMail),
        intl.formatMessage(messages.notJobMail, { company: company(item) }),
        MailX,
      ),
    acknowledge: (item) =>
      finishLocally(
        item,
        intl.formatMessage(messages.outcomeSeen),
        intl.formatMessage(messages.seen, { company: company(item) }),
        Check,
      ),
    undoAutoChange: (item) => {
      if (!item.change.undo.available) return;
      beforeRemove(item);
      tracker.undoEvent(item.change.eventId);
    },
    markDone: (item) => {
      if (item.deadlineKind === "reminder" && item.applicationId) {
        patchWithUndo(
          item,
          item.applicationId,
          { nextAction: null, nextActionAt: null },
          intl.formatMessage(messages.deadlineDone, { company: company(item) }),
          Check,
        );
        return;
      }
      finishLocally(
        item,
        intl.formatMessage(messages.outcomeDone),
        intl.formatMessage(messages.deadlineDone, { company: company(item) }),
        Check,
      );
    },
    nudgePrimary: (item) => {
      const { applicationId, kind } = item.nudge;
      beforeRemove(item);
      if (kind === "noResponse") tracker.move(applicationId, "ghosted", { openAfterUndo: () => reveal(item.id) });
      else tracker.logFollowUp(applicationId);
    },
    declineNudge: (item) => {
      beforeRemove(item);
      tracker.dismissSuggestion(item.nudge.applicationId, item.nudge.kind);
    },
    notForMe: (item) =>
      finishLocally(
        item,
        intl.formatMessage(messages.outcomeNotForMe),
        intl.formatMessage(messages.notForMe, { company: company(item), role: item.title }),
        X,
      ),
    toggleSave: (item) => {
      const next = !(local.saved[item.id] ?? item.saved);
      const setSaved = (saved: boolean) =>
        setLocal((current) => ({ ...current, saved: { ...current.saved, [item.id]: saved } }));
      setSaved(next);
      toast.show({
        message: intl.formatMessage(next ? messages.saved : messages.unsaved, {
          company: company(item),
          role: item.title,
        }),
        glyph: next ? Bookmark : BookmarkX,
        action: { label: intl.formatMessage(messages.undo), run: () => setSaved(!next) },
      });
    },
    snooze: (item, until) => {
      if (!canSnooze(item)) return;
      beforeRemove(item);
      if (item.kind === "followUp") {
        tracker.snoozeSuggestion(item.nudge.applicationId, item.nudge.kind, until);
        return;
      }
      setLocal((current) => ({
        ...current,
        later: [{ item, until }, ...current.later.filter((entry) => entry.item.id !== item.id)],
      }));
      toast.show({
        message: intl.formatMessage(messages.snoozed, {
          preset: until.preset,
          date: until.preset === "pickDate" ? until.date : null,
          company: company(item),
        }),
        glyph: AlarmClock,
        action: { label: intl.formatMessage(messages.undo), run: () => restore(item.id) },
        openAfterUndo: () => reveal(item.id),
      });
    },
    unsnooze: (item) => {
      if (item.kind === "followUp" && item.snoozed) {
        patchWithUndo(
          item,
          item.nudge.applicationId,
          item.nudge.kind === "followUp" ? { followUpSnoozedUntil: null } : { ghostedSnoozedUntil: null },
          intl.formatMessage(messages.movedBackNow, { company: company(item) }),
          AlarmClockOff,
        );
        return;
      }
      beforeRemove(item);
      restore(item.id);
    },
  };
}
