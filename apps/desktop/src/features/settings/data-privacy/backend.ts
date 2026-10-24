/**
 * What Settings › Data & privacy needs from the outside world: the two callables, the Storage
 * download, the native Save dialog and the session's sign-in time. The app wires Firebase and
 * Tauri (liveBackend.ts); the design build and the tests pass fakes.
 */
import type { AccountExportResponse } from "@bfhr/core";

export interface AccountDataBackend {
  /** `accountExport`, validated. Rejects with the callable's `HttpsError`. */
  createExport(): Promise<AccountExportResponse>;
  /** The ZIP's bytes from Cloud Storage (`storagePath` of the export). */
  downloadExport(storagePath: string): Promise<Uint8Array>;
  /** Native Save dialog suggesting `fileName`; the chosen path, or null when cancelled. */
  saveExport(bytes: Uint8Array, fileName: string): Promise<string | null>;
  /** The signed-in session's `auth_time` claim (seconds since epoch). */
  authTimeSeconds(): Promise<number>;
  /** `accountDelete` with `{ confirm: true }`. Rejects with the callable's `HttpsError`. */
  deleteAccount(): Promise<void>;
  readonly now: () => number;
}
