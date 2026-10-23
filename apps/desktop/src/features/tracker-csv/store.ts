/** Open state of the CSV import dialog, shared by every caller of `openCsvImport()`. */
import { useSyncExternalStore } from "react";

export type CsvImportStep = "columns" | "statuses" | "preview";

export interface CsvImportRequest {
  /** A file to start with (a drop on the Tracker, the design build's sample); else the picker shows. */
  readonly file?: { readonly name: string; readonly bytes: Uint8Array };
  /** With `file`: the step to open on (design build captures). */
  readonly step?: CsvImportStep;
}

let current: CsvImportRequest | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: CsvImportRequest | null): void {
  current = next;
  generation += 1;
  for (const listener of listeners) listener();
}

/** Opens the CSV import dialog (replacing a running import's file only if it was still picking). */
export function openCsvImport(request: CsvImportRequest = {}): void {
  emit(request);
}

export function closeCsvImport(): void {
  emit(null);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The open request (null = closed) and a counter that changes with every `openCsvImport`. */
export function useCsvImportRequest(): {
  readonly request: CsvImportRequest | null;
  readonly generation: number;
} {
  const request = useSyncExternalStore(subscribe, () => current);
  const key = useSyncExternalStore(subscribe, () => generation);
  return { request, generation: key };
}
