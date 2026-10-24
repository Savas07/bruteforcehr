/**
 * Review actions on job emails, shared by Mail and Today (flows.md §3, ADR 0012):
 * - Confirm / Change / Not job mail are held on this computer for the toast's Undo window
 *   (`REVIEW_HOLD_MS`), then written as the four review fields; the `mailMessageReviewed` trigger
 *   links the email, moves the application (forward or to a decision only) and creates the
 *   suggested interview. Rules never let a message go back to `pending`, so Undo inside the window
 *   simply cancels the write; after it, Undo reverts the status move the server made, if any.
 *   Leaving the window (closing the app) writes every held decision at once.
 * - Undo of an automatic change reverts its event (a reverting user event, ADR 0002) and records
 *   the correction on the message (`corrected`, a labeled example for the classifier).
 * - "Add interview" on an automatically applied invite confirms it; the server creates the
 *   interview from `interviewSuggestion`.
 */
import { canRevert, type MailCategory, type MailMessage } from "@bfhr/core";
import { useSyncExternalStore } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useToast } from "../../shared/ui/Toast";
import { useTrackerSource } from "../tracker/live";
import { useTrackerRepository } from "../tracker/repository";
import { useTrackerActions } from "../tracker/useTrackerActions";
import type { NewApplication } from "../tracker/writes";
import { useMailData } from "./live";
import { type MailReviewDecision, useMailRepository } from "./repository";

export type ReviewOutcome = "confirmed" | "corrected" | "notJobMail";

/** A decision waiting out its Undo window. */
export interface HeldDecision {
  readonly outcome: ReviewOutcome;
  readonly category: MailCategory;
  readonly applicationId: string | null;
}

/** How long a review decision waits before it is written: the Undo toast's longest duration. */
export const REVIEW_HOLD_MS = 10_000;

interface HeldEntry {
  readonly decision: HeldDecision;
  readonly commit: () => void;
  readonly timer: number;
}

const held = new Map<string, HeldEntry>();
let heldView: ReadonlyMap<string, HeldDecision> = new Map();
const listeners = new Set<() => void>();

function publish(): void {
  heldView = new Map([...held].map(([id, entry]) => [id, entry.decision]));
  for (const listener of listeners) listener();
}

function flush(messageId: string): void {
  const entry = held.get(messageId);
  if (!entry) return;
  clearTimeout(entry.timer);
  held.delete(messageId);
  publish();
  entry.commit();
}

/** Writes every held decision now (window closing, sign-out). */
export function flushHeldDecisions(): void {
  for (const messageId of [...held.keys()]) flush(messageId);
}

if (typeof window !== "undefined") window.addEventListener("pagehide", flushHeldDecisions);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Decisions made on this computer that are still inside their Undo window, by message id. */
export function useHeldDecisions(): ReadonlyMap<string, HeldDecision> {
  return useSyncExternalStore(subscribe, () => heldView);
}

const messages = defineMessages({
  writeFailed: {
    id: "mail.actions.writeFailed",
    defaultMessage: "We couldn't save your decision on this email. Try again in a moment.",
  },
  alreadySaved: {
    id: "mail.actions.alreadySaved",
    defaultMessage: "This decision is already saved and changed nothing in your Tracker to undo.",
  },
});

export interface ReviewChange {
  readonly category: MailCategory;
  /** The linked application; ignored when `newApplication` is given. */
  readonly applicationId: string | null;
  /** "Create application": created now, linked by the decision, deleted again by Undo. */
  readonly newApplication?: NewApplication;
}

export interface MailActions {
  /**
   * Holds a decision on a pending email (Confirm keeps its category and link; Not job mail makes
   * the server forget it). Returns the Undo for the toast.
   */
  review(message: MailMessage, outcome: ReviewOutcome, change?: ReviewChange): () => void;
  /** Undo of an automatic status change from an email (Mail › Updates, Today, timeline). */
  undoAutoChange(message: MailMessage): void;
  /** Creates the interview an automatically applied invite suggests. */
  addInterview(message: MailMessage): void;
}

export function useMailActions(): MailActions {
  const intl = useIntl();
  const toast = useToast();
  const repository = useMailRepository();
  const trackerRepository = useTrackerRepository();
  const tracker = useTrackerActions();
  const trackerSource = useTrackerSource();
  const mail = useMailData();

  const write = (decision: MailReviewDecision) => {
    repository.review(decision).done.catch((error: unknown) => {
      console.error("Mail review write failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.writeFailed) });
    });
  };

  /** Whether the tracker would accept reverting `eventId` now (the latest move, not yet undone). */
  const revertible = (eventId: string): boolean => {
    const state = trackerSource.getState();
    if (state.status !== "ready") return false;
    const event = state.data.applicationEvents.find((candidate) => candidate.id === eventId);
    const application = state.data.applications.find((candidate) => candidate.id === event?.applicationId);
    if (!event || !application) return false;
    const events = state.data.applicationEvents.filter(
      (candidate) => candidate.applicationId === application.id,
    );
    return canRevert({ application, event, events }).allowed;
  };

  return {
    review(message, outcome, change) {
      const createdId = change?.newApplication
        ? (trackerRepository.createApplications([change.newApplication]).ids.applicationIds[0] ?? null)
        : null;
      const decision: HeldDecision =
        outcome === "notJobMail"
          ? { outcome, category: "not_job", applicationId: null }
          : {
              outcome,
              category: change?.category ?? message.category,
              applicationId: createdId ?? (change ? change.applicationId : message.applicationId),
            };
      flush(message.id);
      held.set(message.id, {
        decision,
        commit: () =>
          write({
            messageId: message.id,
            reviewState: outcome === "confirmed" ? "confirmed" : "corrected",
            category: decision.category,
            applicationId: decision.applicationId,
          }),
        timer: window.setTimeout(() => flush(message.id), REVIEW_HOLD_MS),
      });
      publish();
      return () => {
        const entry = held.get(message.id);
        if (entry) {
          clearTimeout(entry.timer);
          held.delete(message.id);
          publish();
          if (createdId !== null)
            void trackerRepository.deleteApplications([createdId]).done.catch(() => undefined);
          return;
        }
        // Already written: undo what the server did with it.
        const current =
          mail.status === "ready"
            ? mail.data.mailMessages.find((candidate) => candidate.id === message.id)
            : undefined;
        if (current?.appliedEventId) tracker.undoEvent(current.appliedEventId);
        else toast.show({ variant: "info", message: intl.formatMessage(messages.alreadySaved) });
      };
    },
    undoAutoChange(message) {
      const eventId = message.appliedEventId;
      if (eventId === null) return;
      const allowed = revertible(eventId);
      // Shows the moved-back toast, or why it can't undo.
      tracker.undoEvent(eventId);
      if (allowed && message.reviewState === "auto_applied")
        write({
          messageId: message.id,
          reviewState: "corrected",
          category: message.category,
          applicationId: message.applicationId,
        });
    },
    addInterview(message) {
      write({
        messageId: message.id,
        reviewState: "confirmed",
        category: message.category,
        applicationId: message.applicationId,
      });
    },
  };
}
