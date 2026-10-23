/**
 * Edits that haven't reached the store yet. An editor registers while it holds some
 * (`useUnsavedChanges`); anything that would end the session — "Restart to update", the
 * minimum-version gate — asks here first and offers to save them (BRIEF §7: an update never
 * interrupts unsaved edits).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

export interface UnsavedChanges {
  /** What holds them, for the "Save your changes first?" prompt ("CV “Product Designer”"). */
  readonly label: string;
  /** Writes them; rejects when they couldn't be saved. */
  readonly save: () => Promise<void>;
}

const entries = new Set<UnsavedChanges>();
const listeners = new Set<() => void>();
let snapshot: readonly UnsavedChanges[] = [];

function changed(): void {
  snapshot = [...entries];
  for (const listener of listeners) listener();
}

/** Registers `entry` until the returned function is called. */
export function registerUnsavedChanges(entry: UnsavedChanges): () => void {
  entries.add(entry);
  changed();
  return () => {
    if (entries.delete(entry)) changed();
  };
}

/** Everything unsaved right now. */
export function unsavedChanges(): readonly UnsavedChanges[] {
  return snapshot;
}

/** Saves every entry; rejects with the first failure (entries that saved unregister themselves). */
export async function saveUnsavedChanges(): Promise<void> {
  await Promise.all(snapshot.map((entry) => entry.save()));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current entries, re-rendering when they change. */
export function useUnsavedChangesList(): readonly UnsavedChanges[] {
  return useSyncExternalStore(subscribe, unsavedChanges, unsavedChanges);
}

/**
 * Registers while `entry` is non-null (an editor with pending edits). The latest `label` and
 * `save` are used without re-registering on every render.
 */
export function useUnsavedChanges(entry: UnsavedChanges | null): void {
  const latest = useRef(entry);
  useEffect(() => {
    latest.current = entry;
  });
  const active = entry !== null;
  useEffect(() => {
    if (!active) return;
    return registerUnsavedChanges({
      get label() {
        return latest.current?.label ?? "";
      },
      save: () => latest.current?.save() ?? Promise.resolve(),
    });
  }, [active]);
}
