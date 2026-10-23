/** Copy and small pieces shared by the update card, dialogs and the "Update required" screen. */
import { LoaderCircle } from "lucide-react";
import { defineMessages, useIntl } from "react-intl";
import type { UpdateStatus } from "../../lib/desktop";

export const updateMessages = defineMessages({
  restart: {
    id: "updates.restart",
    defaultMessage: "Restart to update",
    description: "Primary action: installs the downloaded update and relaunches the app",
  },
  restarting: { id: "updates.restarting", defaultMessage: "Restarting…" },
  whatsNew: {
    id: "updates.whatsNew",
    defaultMessage: "What’s new",
    description: "Opens the release notes of the downloaded update",
  },
  tryAgain: { id: "updates.tryAgain", defaultMessage: "Try again" },
  close: { id: "updates.close", defaultMessage: "Close" },
  downloadingProgress: {
    id: "updates.downloadingProgress",
    defaultMessage: "{done} of {total} MB · {percent}",
    description: "Download progress; {done} and {total} are formatted numbers, {percent} a percentage (45%)",
  },
  downloadingSize: {
    id: "updates.downloadingSize",
    defaultMessage: "{done} MB so far",
    description: "Download progress when the size is unknown",
  },
  progressLabel: {
    id: "updates.progressLabel",
    defaultMessage: "Download of version {version}",
    description: "Accessible name of the download progress bar",
  },
});

/** The download line and bar; indeterminate when the server sends no size. */
export function DownloadProgress({ status }: { status: Extract<UpdateStatus, { state: "downloading" }> }) {
  const intl = useIntl();
  const fraction = status.total ? Math.min(status.downloaded / status.total, 1) : null;
  const megabytes = (bytes: number) => intl.formatNumber(bytes / 1_048_576, { maximumFractionDigits: 1 });
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-fg-secondary text-footnote tabular-nums">
        {fraction === null
          ? intl.formatMessage(updateMessages.downloadingSize, { done: megabytes(status.downloaded) })
          : intl.formatMessage(updateMessages.downloadingProgress, {
              done: megabytes(status.downloaded),
              total: megabytes(status.total ?? 0),
              percent: intl.formatNumber(fraction, { style: "percent" }),
            })}
      </p>
      <div
        role="progressbar"
        aria-label={intl.formatMessage(updateMessages.progressLabel, { version: status.version })}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(fraction !== null && { "aria-valuenow": Math.round(fraction * 100) })}
        className="bg-line-subtle h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={
            fraction === null
              ? "bg-accent-solid h-full w-1/3 rounded-full motion-safe:animate-pulse"
              : "bg-accent-solid h-full rounded-full transition-[width] duration-300"
          }
          style={fraction === null ? undefined : { width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Spinner + one line, for "Checking for updates…" and "Looking for the update…". */
export function Working({ label }: { label: string }) {
  return (
    <p className="text-fg-secondary flex items-center gap-2 text-callout">
      <LoaderCircle
        aria-hidden="true"
        className="size-4 shrink-0 motion-safe:animate-spin"
        strokeWidth={1.75}
      />
      {label}
    </p>
  );
}
