/**
 * The export section's state machine: Create export → preparing → ready (size, expiry, Save…) or
 * a failure, and Save… → downloading → saved / cancelled / failed. It's plain TypeScript over an
 * `AccountDataBackend`, read by React through `useSyncExternalStore`. The app keeps one per signed-in
 * user (liveBackend.ts), so leaving the pane while an export is being made doesn't lose it.
 */
import type { AccountExportResponse } from "@bfhr/core";
import type { AccountDataBackend } from "./backend";
import { type ExportFailure, exportFailureOf } from "./errors";

export type SaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | { readonly status: "saved"; readonly fileName: string }
  | { readonly status: "failed" };

export type ExportView =
  | { readonly status: "idle"; readonly failure: ExportFailure | null }
  | { readonly status: "preparing"; readonly startedAt: number }
  | { readonly status: "ready"; readonly export: AccountExportResponse; readonly save: SaveState };

export const EXPORT_IDLE: ExportView = { status: "idle", failure: null };

/** A minimal external store: `subscribe` / `getSnapshot` for `useSyncExternalStore`. */
export class ViewStore<View> {
  #view: View;
  readonly #listeners = new Set<() => void>();

  constructor(initial: View) {
    this.#view = initial;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): View => this.#view;

  protected set(view: View): void {
    this.#view = view;
    for (const listener of this.#listeners) listener();
  }
}

/** The last segment of a path the Save dialog returned (macOS `/`, Windows `\`). */
export function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

export class ExportFlow extends ViewStore<ExportView> {
  constructor(
    private readonly backend: Pick<
      AccountDataBackend,
      "createExport" | "downloadExport" | "saveExport" | "now"
    >,
    initial: ExportView = EXPORT_IDLE,
  ) {
    super(initial);
  }

  /** "Create export" (and "Try again"); ignored while one is being prepared. */
  async create(): Promise<void> {
    if (this.getSnapshot().status === "preparing") return;
    this.set({ status: "preparing", startedAt: this.backend.now() });
    try {
      const created = await this.backend.createExport();
      this.set({ status: "ready", export: created, save: { status: "idle" } });
    } catch (error) {
      console.error("Couldn't create the account export", error);
      this.set({ status: "idle", failure: exportFailureOf(error) });
    }
  }

  /** "Save…": downloads the ZIP, then the Save dialog. Cancelling the dialog changes nothing. */
  async save(): Promise<void> {
    const view = this.getSnapshot();
    if (view.status !== "ready" || view.save.status === "saving") return;
    const { export: created } = view;
    this.set({ ...view, save: { status: "saving" } });
    let save: SaveState;
    try {
      const bytes = await this.backend.downloadExport(created.storagePath);
      const path = await this.backend.saveExport(bytes, created.fileName);
      save = path === null ? { status: "idle" } : { status: "saved", fileName: fileNameOf(path) };
    } catch (error) {
      console.error("Couldn't save the account export", error);
      save = { status: "failed" };
    }
    // The export may have expired (or been replaced) meanwhile.
    const current = this.getSnapshot();
    if (current.status === "ready" && current.export === created) this.set({ ...current, save });
  }

  /** After `expiresAt` the server has deleted the ZIP, so the ready card goes. */
  expire(): void {
    const view = this.getSnapshot();
    if (view.status === "ready" && this.backend.now() >= Date.parse(view.export.expiresAt))
      this.set(EXPORT_IDLE);
  }
}
