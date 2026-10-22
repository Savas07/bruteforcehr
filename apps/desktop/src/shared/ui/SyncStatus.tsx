/**
 * `SyncStatus` (states.md "Components needed"): the sidebar footer's persistent sync line and the
 * editor toolbar's save status. Text carries the meaning; icons only support it.
 */
import { Check, CircleAlert, CloudCheck, CloudOff, HardDrive, History, LoaderCircle } from "lucide-react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";
import { useConnectivity } from "../connectivity";
import type { TimeVM } from "../model/types";
import { Button } from "./Button";

const messages = defineMessages({
  waiting: {
    id: "shared.ui.syncStatus.waiting",
    defaultMessage: "{count, plural, one {# change waiting to sync} other {# changes waiting to sync}}",
    description: "Sidebar sync line: writes queued for the server",
  },
  offlineWaiting: {
    id: "shared.ui.syncStatus.offlineWaiting",
    defaultMessage:
      "Offline · {count, plural, one {# change waiting to sync} other {# changes waiting to sync}}",
    description: "Sidebar sync line while offline with queued writes",
  },
  offline: {
    id: "shared.ui.syncStatus.offline",
    defaultMessage: "Offline",
    description: "Sidebar sync line while offline",
  },
  synced: {
    id: "shared.ui.syncStatus.synced",
    defaultMessage: "Synced · {time}",
    description: "Sidebar sync line; {time} is a relative time like 'just now'",
  },
  saved: { id: "shared.ui.syncStatus.saved", defaultMessage: "Saved", description: "Editor save status" },
  savedAt: {
    id: "shared.ui.syncStatus.savedAt",
    defaultMessage: "Saved · {time}",
    description: "Editor save status; {time} is a relative time like 'just now'",
  },
  saving: { id: "shared.ui.syncStatus.saving", defaultMessage: "Saving…", description: "Editor save status" },
  local: {
    id: "shared.ui.syncStatus.local",
    defaultMessage: "Saved on this device",
    description: "Editor save status while offline",
  },
  failed: {
    id: "shared.ui.syncStatus.failed",
    defaultMessage: "Couldn't save",
    description: "Editor save status",
  },
  tryAgain: {
    id: "shared.ui.syncStatus.tryAgain",
    defaultMessage: "Try again",
    description: "Retries a failed save",
  },
});

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
  const intl = useIntl();
  const { status, pendingWrites, lastSyncedAt } = useConnectivity();

  if (status === "offline")
    return (
      <p className="text-footnote text-fg-secondary flex items-center gap-2 tabular-nums">
        <CloudOff aria-hidden="true" className={iconClass} strokeWidth={1.75} />
        {pendingWrites > 0
          ? intl.formatMessage(messages.offlineWaiting, { count: pendingWrites })
          : intl.formatMessage(messages.offline)}
      </p>
    );
  if (pendingWrites > 0)
    return (
      <p className="text-footnote text-fg-secondary flex items-center gap-2 tabular-nums">
        <History aria-hidden="true" className={iconClass} strokeWidth={1.75} />
        {intl.formatMessage(messages.waiting, { count: pendingWrites })}
      </p>
    );
  if (lastSyncedAt === null) return null;
  return (
    <p className="text-footnote text-fg-tertiary flex items-center gap-2">
      <CloudCheck aria-hidden="true" className={iconClass} strokeWidth={1.75} />
      <span>
        <FormattedMessage
          {...messages.synced}
          values={{
            time: (
              <time dateTime={lastSyncedAt.iso} title={lastSyncedAt.absolute}>
                {lastSyncedAt.label}
              </time>
            ),
          }}
        />
      </span>
    </p>
  );
}

function EditorSave({ state, savedAt, onRetry }: SyncStatusEditorProps) {
  const intl = useIntl();
  return (
    <div role="status" className="text-footnote text-fg-secondary flex items-center gap-2">
      {state === "saved" && (
        <>
          <Check aria-hidden="true" className={iconClass} strokeWidth={1.75} />
          <span>
            {savedAt ? (
              <FormattedMessage
                {...messages.savedAt}
                values={{
                  time: (
                    <time dateTime={savedAt.iso} title={savedAt.absolute}>
                      {savedAt.label}
                    </time>
                  ),
                }}
              />
            ) : (
              intl.formatMessage(messages.saved)
            )}
          </span>
        </>
      )}
      {state === "saving" && (
        <>
          <LoaderCircle
            aria-hidden="true"
            className={`${iconClass} motion-safe:animate-spin`}
            strokeWidth={1.75}
          />
          <span>{intl.formatMessage(messages.saving)}</span>
        </>
      )}
      {state === "local" && (
        <>
          <HardDrive aria-hidden="true" className={iconClass} strokeWidth={1.75} />
          <span>{intl.formatMessage(messages.local)}</span>
        </>
      )}
      {state === "failed" && (
        <>
          <CircleAlert aria-hidden="true" className={`${iconClass} text-danger-text`} strokeWidth={1.75} />
          <span className="text-fg-primary">{intl.formatMessage(messages.failed)}</span>
          {onRetry && (
            <>
              <span aria-hidden="true">·</span>
              <Button size="sm" variant="plain" onClick={onRetry}>
                {intl.formatMessage(messages.tryAgain)}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
