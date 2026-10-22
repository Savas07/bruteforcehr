/**
 * The user's Mail decisions made in this window and not yet reflected in the model (M0 has no
 * backend, so they are optimistic, like Firestore's local cache will be). Kept outside React so
 * they survive the route change from `/mail/review/$messageId` to `/mail`. Keyed by message id.
 */
import type { MailCategory } from "@bfhr/core";
import { useSyncExternalStore } from "react";

export type ReviewOutcome = "confirmed" | "corrected" | "notJobMail" | "reviewLater";

export interface MailOutcomes {
  /** Review decisions on pending emails. */
  readonly reviewed: ReadonlyMap<
    string,
    { readonly outcome: ReviewOutcome; readonly category: MailCategory }
  >;
  /** Emails whose automatic change the user undid (Updates › Undo). */
  readonly undone: ReadonlySet<string>;
  /** Emails whose automatic change the user marked as seen. */
  readonly seen: ReadonlySet<string>;
}

let state: MailOutcomes = { reviewed: new Map(), undone: new Set(), seen: new Set() };
const listeners = new Set<() => void>();

function update(next: MailOutcomes): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const mailOutcomes = {
  review(messageId: string, outcome: ReviewOutcome, category: MailCategory): void {
    update({ ...state, reviewed: new Map(state.reviewed).set(messageId, { outcome, category }) });
  },
  /** Undo of a review decision: the email is pending again. */
  reopen(messageId: string): void {
    const reviewed = new Map(state.reviewed);
    reviewed.delete(messageId);
    update({ ...state, reviewed });
  },
  undoChange(messageId: string): void {
    update({ ...state, undone: new Set(state.undone).add(messageId) });
  },
  markSeen(messageIds: readonly string[]): void {
    update({ ...state, seen: new Set([...state.seen, ...messageIds]) });
  },
  unmarkSeen(messageIds: readonly string[]): void {
    update({ ...state, seen: new Set([...state.seen].filter((id) => !messageIds.includes(id))) });
  },
};

export function useMailOutcomes(): MailOutcomes {
  return useSyncExternalStore(subscribe, () => state);
}
