/**
 * The minimum-version gate (IA.md: one of the two full-window takeovers). Shown while this version
 * is below `appConfig/{platform}.minSupportedVersion`. It covers the shell instead of replacing
 * it, so an open editor keeps its edits and "Restart to update" can still save them first.
 */
import { CircleArrowUp, ExternalLink } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useEffect } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome, openExternal } from "../../lib/desktop";
import { Button } from "../../shared/ui/Button";
import { DownloadProgress, updateMessages, Working } from "./parts";
import type { UpdateController } from "./useUpdateController";

const messages = defineMessages({
  title: { id: "updates.required.title", defaultMessage: "Update required" },
  body: {
    id: "updates.required.body",
    defaultMessage:
      "BruteForceHR {current} is no longer supported. Update to version {minimum} or later to keep using it. Your data stays safe in your account.",
  },
  looking: { id: "updates.required.looking", defaultMessage: "Looking for the update…" },
  downloading: {
    id: "updates.required.downloading",
    defaultMessage: "Downloading version {version}. You can restart as soon as it’s ready.",
  },
  ready: {
    id: "updates.required.ready",
    defaultMessage: "Version {version} is downloaded and ready to install.",
  },
  failed: {
    id: "updates.required.failed",
    defaultMessage:
      "Couldn’t download the update. Check your internet connection and try again, or get it from the website.",
  },
  unavailable: {
    id: "updates.required.unavailable",
    defaultMessage:
      "The update isn’t available in the app yet. Try again in a few minutes, or get it from the website.",
  },
  website: { id: "updates.required.website", defaultMessage: "Download from the website" },
});

export function UpdateRequired({ controller }: { controller: UpdateController }) {
  const intl = useIntl();
  const { updates, requestRestart, restarting, blocking } = controller;
  const { requirement, snapshot, check } = updates;
  const { status } = snapshot;
  const idle = status.state === "idle";

  // Start the update right away (release builds already check at launch).
  useEffect(() => {
    if (blocking && idle) check();
  }, [blocking, idle, check]);

  if (!requirement) return null;
  const website = requirement.downloadUrl;
  const fallback = (message: string) => (
    <div className="flex flex-col gap-4">
      <p className="text-fg-secondary text-callout">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={check}>
          {intl.formatMessage(updateMessages.tryAgain)}
        </Button>
        {website && (
          <Button size="lg" icon={ExternalLink} onClick={() => void openExternal(website)}>
            {intl.formatMessage(messages.website)}
          </Button>
        )}
      </div>
    </div>
  );

  let action;
  switch (status.state) {
    case "idle":
    case "checking":
      action = <Working label={intl.formatMessage(messages.looking)} />;
      break;
    case "downloading":
      action = (
        <div className="flex flex-col gap-3">
          <p className="text-fg-secondary text-callout">
            {intl.formatMessage(messages.downloading, { version: status.version })}
          </p>
          <DownloadProgress status={status} />
        </div>
      );
      break;
    case "ready":
      action = (
        <div className="flex flex-col gap-4">
          <p className="text-fg-secondary text-callout">
            {intl.formatMessage(messages.ready, { version: status.version })}
          </p>
          <Button
            variant="primary"
            size="lg"
            className="self-start"
            loading={restarting}
            loadingLabel={intl.formatMessage(updateMessages.restarting)}
            onClick={requestRestart}
          >
            {intl.formatMessage(updateMessages.restart)}
          </Button>
        </div>
      );
      break;
    case "up-to-date":
      action = fallback(intl.formatMessage(messages.unavailable));
      break;
    case "failed":
      action = fallback(intl.formatMessage(messages.failed));
      break;
  }

  return (
    <AlertDialog.Root open={blocking}>
      <AlertDialog.Portal>
        <AlertDialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="bg-surface-canvas fixed inset-0 z-(--bfhr-layer-modal) flex flex-col"
        >
          {/* macOS: the hidden title bar still moves the window. */}
          {chrome.platform === "macos" && (
            <div data-tauri-drag-region className="h-(--chrome-height) shrink-0" />
          )}
          <div className="flex flex-1 items-center justify-center overflow-y-auto px-8 py-10">
            <div className="flex w-full max-w-110 flex-col gap-5">
              <span className="bg-accent-subtle flex size-12 items-center justify-center rounded-full">
                <CircleArrowUp aria-hidden="true" className="text-accent-text size-6" strokeWidth={1.75} />
              </span>
              <div className="flex flex-col gap-2">
                <AlertDialog.Title className="font-display text-title1">
                  {intl.formatMessage(messages.title)}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-fg-primary text-body">
                  {intl.formatMessage(messages.body, {
                    current: updates.currentVersion,
                    minimum: requirement.minSupportedVersion,
                  })}
                </AlertDialog.Description>
              </div>
              <div role="status">{action}</div>
            </div>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
