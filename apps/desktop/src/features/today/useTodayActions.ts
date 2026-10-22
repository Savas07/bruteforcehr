/**
 * Today's actions, optimistic and local (M0 has no backend; foundation-desktop.md "The screen
 * contract"). Every action moves the item out of the open list at once and shows an Undo toast
 * (decisions.md D11, states.md "Undo toast"). Handled items go to "Done today", snoozed ones to
 * the Later view. The toast's Undo (and Mod+Z) puts the item back where it was.
 */
import { AlarmClock, Bookmark, BookmarkX, Check, MailX, Undo2, X, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { SnoozePreset } from "../../shared/ui/SnoozeMenu";
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
  movedBack: {
    id: "today.toast.movedBack",
    defaultMessage: "Moved back to {status} · {company}",
    description: "Toast after undoing an automatic change. {status} is a status name",
  },
  deadlineDone: {
    id: "today.toast.deadlineDone",
    defaultMessage: "Marked as done · {company}",
    description: "Toast after marking a deadline as done",
  },
  notNeeded: {
    id: "today.toast.notNeeded",
    defaultMessage: "Follow-up not needed · {company}",
    description: "Toast",
  },
  keptOpen: {
    id: "today.toast.keptOpen",
    defaultMessage: "Still waiting · {company}",
    description: "Toast after 'Keep waiting' on a no-response suggestion",
  },
  noResponse: {
    id: "today.toast.noResponse",
    defaultMessage: "Marked as no response · {company}",
    description: "Toast",
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
  // Outcomes in the "Done today" group.
  outcomeConfirmed: { id: "today.outcome.confirmed", defaultMessage: "Confirmed", description: "Done today" },
  outcomeNotJobMail: {
    id: "today.outcome.notJobMail",
    defaultMessage: "Marked as not job mail",
    description: "Done today",
  },
  outcomeSeen: { id: "today.outcome.seen", defaultMessage: "Seen", description: "Done today" },
  outcomeUndone: {
    id: "today.outcome.undone",
    defaultMessage: "Undone · back to {status}",
    description: "Done today: the user undid an automatic change. {status} is a status name",
  },
  outcomeDone: { id: "today.outcome.done", defaultMessage: "Done", description: "Done today" },
  outcomeNotNeeded: { id: "today.outcome.notNeeded", defaultMessage: "Not needed", description: "Done today" },
  outcomeKeptOpen: { id: "today.outcome.keptOpen", defaultMessage: "Still waiting", description: "Done today" },
  outcomeNoResponse: {
    id: "today.outcome.noResponse",
    defaultMessage: "Marked as no response",
    description: "Done today",
  },
  outcomeNotForMe: { id: "today.outcome.notForMe", defaultMessage: "Not for me", description: "Done today" },
});

/** When a snoozed item comes back. `pickDate` carries the date the user chose. */
export type SnoozeUntil =
  | { readonly preset: Exclude<SnoozePreset, "pickDate"> }
  | { readonly preset: "pickDate"; readonly date: Date };

export interface LocalDone {
  readonly item: AttentionItemVM;
  /** "Confirmed", "Undone · back to Applied". */
  readonly outcome: string;
}

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
  readonly state: TodayLocalState;
  readonly confirm: (item: ReviewItemVM) => void;
  readonly notJobMail: (item: ReviewItemVM) => void;
  readonly acknowledge: (item: AutoUpdateItemVM) => void;
  readonly undoAutoChange: (item: AutoUpdateItemVM) => void;
  readonly markDone: (item: DeadlineItemVM) => void;
  /** "Mark as no response" (the no-response nudge's primary action). */
  readonly markNoResponse: (item: FollowUpItemVM) => void;
  /** "Not needed" / "Keep waiting" (D). */
  readonly declineNudge: (item: FollowUpItemVM) => void;
  readonly notForMe: (item: MatchItemVM) => void;
  readonly toggleSave: (item: MatchItemVM) => void;
  readonly snooze: (item: AttentionItemVM, until: SnoozeUntil) => void;
  /** Back from Later to the open list ("Move back now"). */
  readonly unsnooze: (item: AttentionItemVM) => void;
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
  const [state, setState] = useState<TodayLocalState>(EMPTY);

  const restore = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      done: current.done.filter((entry) => entry.item.id !== id),
      later: current.later.filter((entry) => entry.item.id !== id),
    }));
  }, []);

  const show = (item: AttentionItemVM, message: string, glyph: LucideIcon) =>
    toast.show({
      message,
      glyph,
      action: { label: intl.formatMessage(messages.undo), run: () => restore(item.id) },
      openAfterUndo: () => reveal(item.id),
    });

  const finish = (item: AttentionItemVM, outcome: string, message: string, glyph: LucideIcon) => {
    beforeRemove(item);
    setState((current) => ({ ...current, done: [{ item, outcome }, ...current.done] }));
    show(item, message, glyph);
  };

  const company = (item: AttentionItemVM) => item.company.name;

  return {
    state,
    confirm: (item) => {
      const { move } = item.proposal;
      finish(
        item,
        intl.formatMessage(messages.outcomeConfirmed),
        move
          ? intl.formatMessage(messages.confirmedMove, { company: company(item), status: move.to.label })
          : intl.formatMessage(messages.confirmed, { company: company(item) }),
        Check,
      );
    },
    notJobMail: (item) =>
      finish(
        item,
        intl.formatMessage(messages.outcomeNotJobMail),
        intl.formatMessage(messages.notJobMail, { company: company(item) }),
        MailX,
      ),
    acknowledge: (item) =>
      finish(
        item,
        intl.formatMessage(messages.outcomeSeen),
        intl.formatMessage(messages.seen, { company: company(item) }),
        Check,
      ),
    undoAutoChange: (item) =>
      finish(
        item,
        intl.formatMessage(messages.outcomeUndone, { status: item.change.from.label }),
        intl.formatMessage(messages.movedBack, { company: company(item), status: item.change.from.label }),
        Undo2,
      ),
    markDone: (item) =>
      finish(
        item,
        intl.formatMessage(messages.outcomeDone),
        intl.formatMessage(messages.deadlineDone, { company: company(item) }),
        Check,
      ),
    markNoResponse: (item) =>
      finish(
        item,
        intl.formatMessage(messages.outcomeNoResponse),
        intl.formatMessage(messages.noResponse, { company: company(item) }),
        Check,
      ),
    declineNudge: (item) =>
      item.nudge.kind === "noResponse"
        ? finish(
            item,
            intl.formatMessage(messages.outcomeKeptOpen),
            intl.formatMessage(messages.keptOpen, { company: company(item) }),
            Check,
          )
        : finish(
            item,
            intl.formatMessage(messages.outcomeNotNeeded),
            intl.formatMessage(messages.notNeeded, { company: company(item) }),
            X,
          ),
    notForMe: (item) =>
      finish(
        item,
        intl.formatMessage(messages.outcomeNotForMe),
        intl.formatMessage(messages.notForMe, { company: company(item), role: item.title }),
        X,
      ),
    toggleSave: (item) => {
      const next = !(state.saved[item.id] ?? item.saved);
      const setSaved = (saved: boolean) =>
        setState((current) => ({ ...current, saved: { ...current.saved, [item.id]: saved } }));
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
      beforeRemove(item);
      setState((current) => ({ ...current, later: [{ item, until }, ...current.later] }));
      show(
        item,
        intl.formatMessage(messages.snoozed, {
          preset: until.preset,
          date: until.preset === "pickDate" ? until.date : null,
          company: company(item),
        }),
        AlarmClock,
      );
    },
    unsnooze: (item) => {
      beforeRemove(item);
      restore(item.id);
    },
  };
}
