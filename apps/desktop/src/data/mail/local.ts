/**
 * Mail state that lives on this computer only: "Review later" (an email leaves To review until the
 * chosen time) and "Mark as seen" on automatic changes. The data model has no fields for either
 * (clients may change only the review fields of `mailMessages`), so they are kept in localStorage
 * per device, like the interview reminder opt-in.
 */
import { useSyncExternalStore } from "react";

export interface MailLocalState {
  /** Message id → when it comes back to To review. */
  readonly snoozed: Readonly<Record<string, Date>>;
  /** Message ids whose automatic change the user marked as seen. */
  readonly seen: ReadonlySet<string>;
}

const STORAGE_KEY = "bfhr.mail.local.v1";

function read(): MailLocalState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { snoozed: {}, seen: new Set() };
    const parsed = JSON.parse(raw) as { snoozed?: Record<string, string>; seen?: string[] };
    return {
      snoozed: Object.fromEntries(
        Object.entries(parsed.snoozed ?? {}).flatMap(([id, iso]) => {
          const at = new Date(iso);
          return Number.isNaN(at.getTime()) ? [] : [[id, at]];
        }),
      ),
      seen: new Set(parsed.seen ?? []),
    };
  } catch {
    return { snoozed: {}, seen: new Set() };
  }
}

let state: MailLocalState = read();
const listeners = new Set<() => void>();

function update(next: MailLocalState): void {
  state = next;
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        snoozed: Object.fromEntries(Object.entries(next.snoozed).map(([id, at]) => [id, at.toISOString()])),
        seen: [...next.seen],
      }),
    );
  } catch {
    // Storage full or unavailable: the state still holds for this session.
  }
  for (const listener of listeners) listener();
}

export const mailLocal = {
  snooze(messageId: string, until: Date): void {
    update({ ...state, snoozed: { ...state.snoozed, [messageId]: until } });
  },
  unsnooze(messageId: string): void {
    const { [messageId]: _removed, ...snoozed } = state.snoozed;
    update({ ...state, snoozed });
  },
  markSeen(messageIds: readonly string[]): void {
    update({ ...state, seen: new Set([...state.seen, ...messageIds]) });
  },
  unmarkSeen(messageIds: readonly string[]): void {
    update({ ...state, seen: new Set([...state.seen].filter((id) => !messageIds.includes(id))) });
  },
};

/** Whether `messageId` is snoozed past `now`. */
export function isSnoozed(local: MailLocalState, messageId: string, now: Date): boolean {
  const until = local.snoozed[messageId];
  return until !== undefined && until > now;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMailLocal(): MailLocalState {
  return useSyncExternalStore(subscribe, () => state);
}
