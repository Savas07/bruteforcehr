/**
 * `SyncStatus` (states.md "Components needed"): the sidebar footer's persistent sync line and the
 * editor toolbar's save status. Text carries the meaning; icons only support it.
 */
import { Check, CircleAlert, CloudCheck, CloudOff, HardDrive, History, LoaderCircle } from "lucide-react";
import { useConnectivity } from "../connectivity";
import { countLabel } from "../model/format";
import type { TimeVM } from "../model/types";
import { Button } from "./Button";

/** Editor save state: `local` = saved on this device while offline, `failed` = the write failed. */
export type SaveState = "saved" | "saving" | "local" | "failed";

/** Sidebar footer line; reads `useConnectivity()`. */
export interface SyncStatusSidebarProps {
  /** "Synced · just now" / "3 changes waiting to sync" / "Offline · 3 changes waiting to sync". */
  variant: "sidebar";
}

/** Editor toolbar status (CV editor, Apply, cover letters). */
export interface SyncStatusEditorProps {
  /** Editor toolbar placement; the state comes from the editor's save queue, not connectivity. */
  variant: "editor";
  /** "Saved · {relative}" / "Saving…" / "Saved on this device" / "Couldn't save · Try again". */
  state: SaveState;
  /** Last successful save, for the `saved` label; without it the label is just "Saved". */
  savedAt?: TimeVM;
  /** `failed`: "Try again" saves again. Without it the failed label has no button. */
  onRetry?: () => void;
}

const iconClass = "size-3.5 shrink-0";

/** The sync line (`variant="sidebar"`) or an editor's save status (`variant="editor"`). */
export function SyncStatus(props: SyncStatusSidebarProps | SyncStatusEditorProps) {
  return props.variant === "sidebar" ? <SidebarSync /> : <EditorSave {...props} />;
}

function SidebarSync() {
  const { status, pendingWrites, lastSyncedAt } = useConnectivity();
  const waiting =
    pendingWrites > 0 ? `${countLabel(pendingWrites, "change", "changes", "en-GB")} waiting to sync` : null;

  if (status === "offline")
    return (
      <p className="text-footnote text-fg-secondary flex items-center gap-2 tabular-nums">
        <CloudOff aria-hidden="true" className={iconClass} strokeWidth={1.75} />
        {waiting ? `Offline · ${waiting}` : "Offline"}
      </p>
    );
  if (waiting)
    return (
      <p className="text-footnote text-fg-secondary flex items-center gap-2 tabular-nums">
        <History aria-hidden="true" className={iconClass} strokeWidth={1.75} />
        {waiting}
      </p>
    );
  if (lastSyncedAt === null) return null;
  return (
    <p className="text-footnote text-fg-tertiary flex items-center gap-2">
      <CloudCheck aria-hidden="true" className={iconClass} strokeWidth={1.75} />
      <span>
        Synced ·{" "}
        <time dateTime={lastSyncedAt.iso} title={lastSyncedAt.absolute}>
          {lastSyncedAt.label}
        </time>
      </span>
    </p>
  );
}

function EditorSave({ state, savedAt, onRetry }: SyncStatusEditorProps) {
  return (
    <div role="status" className="text-footnote text-fg-secondary flex items-center gap-2">
      {state === "saved" && (
        <>
          <Check aria-hidden="true" className={iconClass} strokeWidth={1.75} />
          {savedAt ? (
            <span>
              Saved ·{" "}
              <time dateTime={savedAt.iso} title={savedAt.absolute}>
                {savedAt.label}
              </time>
            </span>
          ) : (
            <span>Saved</span>
          )}
        </>
      )}
      {state === "saving" && (
        <>
          <LoaderCircle
            aria-hidden="true"
            className={`${iconClass} motion-safe:animate-spin`}
            strokeWidth={1.75}
          />
          <span>Saving…</span>
        </>
      )}
      {state === "local" && (
        <>
          <HardDrive aria-hidden="true" className={iconClass} strokeWidth={1.75} />
          <span>Saved on this device</span>
        </>
      )}
      {state === "failed" && (
        <>
          <CircleAlert aria-hidden="true" className={`${iconClass} text-danger-text`} strokeWidth={1.75} />
          <span className="text-fg-primary">Couldn't save</span>
          {onRetry && (
            <>
              <span aria-hidden="true">·</span>
              <Button size="sm" variant="plain" onClick={onRetry}>
                Try again
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
