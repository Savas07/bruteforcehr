/**
 * The update dialogs: "Check for Updates…" with an honest state for every step, the release
 * notes behind "What's new", and "Save your changes before restarting?".
 */
import { CircleAlert, CircleCheck, CircleArrowUp, ExternalLink, X, type LucideIcon } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { openExternal, type UpdateStatus } from "../../lib/desktop";
import { useUnsavedChangesList } from "../../shared/unsavedChanges";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { DownloadProgress, updateMessages, Working } from "./parts";
import { parseReleaseNotes } from "./releaseNotes";
import type { UpdateController } from "./useUpdateController";

/** Every published version has a release page in the public releases repo (ADR 0004 §1, addendum). */
const RELEASES_URL = "https://github.com/Savas07/bruteforcehr-releases/releases";

const messages = defineMessages({
  checkTitle: { id: "updates.check.title", defaultMessage: "Software update" },
  checking: { id: "updates.check.checking", defaultMessage: "Checking for updates…" },
  upToDate: { id: "updates.check.upToDate", defaultMessage: "You’re up to date" },
  upToDateBody: {
    id: "updates.check.upToDateBody",
    defaultMessage: "BruteForceHR {version} is the newest version.",
  },
  upToDateBodyBeta: {
    id: "updates.check.upToDateBodyBeta",
    defaultMessage: "BruteForceHR {version} is the newest version on the Beta channel.",
  },
  downloading: { id: "updates.check.downloading", defaultMessage: "Version {version} is downloading" },
  downloadingBody: {
    id: "updates.check.downloadingBody",
    defaultMessage: "Keep working. The sidebar lets you know when it’s ready.",
  },
  ready: { id: "updates.check.ready", defaultMessage: "Version {version} is ready" },
  readyBody: {
    id: "updates.check.readyBody",
    defaultMessage: "Restart when it suits you, or it installs when you quit. You have {current}.",
  },
  failedCheck: { id: "updates.check.failedCheck", defaultMessage: "Couldn’t check for updates" },
  failedDownload: { id: "updates.check.failedDownload", defaultMessage: "Couldn’t download the update" },
  failedInstall: { id: "updates.check.failedInstall", defaultMessage: "Couldn’t install the update" },
  failedNetworkBody: {
    id: "updates.check.failedNetworkBody",
    defaultMessage: "Check your internet connection, then try again. Your current version keeps working.",
  },
  failedInstallBody: {
    id: "updates.check.failedInstallBody",
    defaultMessage: "Your current version still works. Try again to download the update once more.",
  },
  ok: { id: "updates.check.ok", defaultMessage: "OK", description: "Closes the up-to-date message" },
  notesTitle: { id: "updates.notes.title", defaultMessage: "What’s new in {version}" },
  notesDate: {
    id: "updates.notes.date",
    defaultMessage: "Released {date}",
    description: "{date} is a formatted date (23 Oct 2026)",
  },
  notesEmpty: {
    id: "updates.notes.empty",
    defaultMessage: "This release has no notes here. The release page lists every change.",
  },
  notesLink: { id: "updates.notes.link", defaultMessage: "Release page on GitHub" },
  saveTitle: { id: "updates.save.title", defaultMessage: "Save your changes before restarting?" },
  saveBody: {
    id: "updates.save.body",
    defaultMessage:
      "{count, plural, one {{labels} has changes that aren’t saved yet.} other {{labels} have changes that aren’t saved yet.}} BruteForceHR saves them first, then restarts to update.",
    description: "{labels} is a list of open items (CV “Product Designer”)",
  },
  saveFailed: {
    id: "updates.save.failed",
    defaultMessage: "Couldn’t save your changes, so BruteForceHR didn’t restart. Try again.",
  },
  cancel: {
    id: "updates.save.cancel",
    defaultMessage: "Keep editing",
    description: "Closes “Save your changes before restarting?” without restarting",
  },
  saveAndRestart: { id: "updates.save.saveAndRestart", defaultMessage: "Save and restart" },
});

const contentClass =
  "bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg";
const overlayClass = "bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)";

function CloseButton() {
  const intl = useIntl();
  return (
    <Dialog.Close
      aria-label={intl.formatMessage(updateMessages.close)}
      className="text-fg-secondary hover:bg-surface-hover -mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-md"
    >
      <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
    </Dialog.Close>
  );
}

interface CheckView {
  readonly icon: LucideIcon | null;
  readonly tone: string;
  readonly headline: string;
  readonly body: ReactNode;
  readonly actions: ReactNode;
}

function useCheckView(controller: UpdateController): CheckView {
  const intl = useIntl();
  const { updates, closeDialog, openDialog, requestRestart, restarting } = controller;
  const { status, channel } = updates.snapshot;
  const closeButton = (label = intl.formatMessage(updateMessages.close)) => (
    <Button onClick={closeDialog}>{label}</Button>
  );
  const retry = (
    <Button variant="primary" onClick={updates.check}>
      {intl.formatMessage(updateMessages.tryAgain)}
    </Button>
  );
  const failed = (headline: string, body: string): CheckView => ({
    icon: CircleAlert,
    tone: "text-warning-text",
    headline,
    body,
    actions: (
      <>
        {closeButton()}
        {retry}
      </>
    ),
  });
  switch (status.state) {
    case "idle":
    case "checking":
      return {
        icon: null,
        tone: "",
        headline: intl.formatMessage(messages.checkTitle),
        body: <Working label={intl.formatMessage(messages.checking)} />,
        actions: closeButton(),
      };
    case "up-to-date":
      return {
        icon: CircleCheck,
        tone: "text-success-text",
        headline: intl.formatMessage(messages.upToDate),
        body: intl.formatMessage(channel === "beta" ? messages.upToDateBodyBeta : messages.upToDateBody, {
          version: updates.currentVersion,
        }),
        actions: closeButton(intl.formatMessage(messages.ok)),
      };
    case "downloading":
      return {
        icon: CircleArrowUp,
        tone: "text-accent-text",
        headline: intl.formatMessage(messages.downloading, { version: status.version }),
        body: (
          <div className="flex flex-col gap-3">
            <DownloadProgress status={status} />
            <span>{intl.formatMessage(messages.downloadingBody)}</span>
          </div>
        ),
        actions: closeButton(),
      };
    case "ready":
      return {
        icon: CircleArrowUp,
        tone: "text-accent-text",
        headline: intl.formatMessage(messages.ready, { version: status.version }),
        body: intl.formatMessage(messages.readyBody, { current: updates.currentVersion }),
        actions: (
          <>
            <Button onClick={() => openDialog("notes")}>{intl.formatMessage(updateMessages.whatsNew)}</Button>
            <Button
              variant="primary"
              loading={restarting}
              loadingLabel={intl.formatMessage(updateMessages.restarting)}
              onClick={requestRestart}
            >
              {intl.formatMessage(updateMessages.restart)}
            </Button>
          </>
        ),
      };
    case "failed":
      switch (status.step) {
        case "check":
          return failed(
            intl.formatMessage(messages.failedCheck),
            intl.formatMessage(messages.failedNetworkBody),
          );
        case "download":
          return failed(
            intl.formatMessage(messages.failedDownload),
            intl.formatMessage(messages.failedNetworkBody),
          );
        case "install":
          return failed(
            intl.formatMessage(messages.failedInstall),
            intl.formatMessage(messages.failedInstallBody),
          );
      }
  }
}

/** "Check for Updates…" (app menu on macOS, Help on Windows, the palette, the rail icon). */
export function CheckForUpdatesDialog({ controller }: { controller: UpdateController }) {
  const view = useCheckView(controller);
  const Icon = view.icon;
  return (
    <Dialog.Root
      open={controller.dialog === "check"}
      onOpenChange={(open) => {
        if (!open) controller.closeDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          onCloseAutoFocus={controller.restoreFocus}
          className={`${contentClass} w-[min(420px,calc(100vw-32px))]`}
        >
          <div className="flex items-start gap-3 px-6 pt-5">
            {Icon && (
              <Icon aria-hidden="true" className={`${view.tone} mt-1 size-5 shrink-0`} strokeWidth={1.75} />
            )}
            <Dialog.Title className="font-display text-title3 flex-1">{view.headline}</Dialog.Title>
            <CloseButton />
          </div>
          {/* Polite live region: a manual check reports each step as it happens. */}
          <Dialog.Description asChild>
            <div role="status" className="text-fg-secondary px-6 pt-2 text-callout">
              {view.body}
            </div>
          </Dialog.Description>
          <div className="flex justify-end gap-2 px-6 pt-5 pb-5">{view.actions}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="flex flex-col gap-3 text-callout">
      {parseReleaseNotes(notes).map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <h3 key={index} className="text-fg-primary text-callout font-semibold">
                {block.text}
              </h3>
            );
          case "list":
            return (
              <ul key={index} className="flex list-disc flex-col gap-1.5 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          case "paragraph":
            return <p key={index}>{block.text}</p>;
        }
      })}
    </div>
  );
}

/** "What's new": version, date and notes of the downloaded update. */
export function ReleaseNotesDialog({ controller }: { controller: UpdateController }) {
  const intl = useIntl();
  const { status } = controller.updates.snapshot;
  const ready: Extract<UpdateStatus, { state: "ready" }> | null = status.state === "ready" ? status : null;
  const date = ready?.publishedAt ? new Date(ready.publishedAt) : null;
  return (
    <Dialog.Root
      open={controller.dialog === "notes" && ready !== null}
      onOpenChange={(open) => {
        if (!open) controller.closeDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        {ready && (
          <Dialog.Content
            onCloseAutoFocus={controller.restoreFocus}
            className={`${contentClass} w-[min(560px,calc(100vw-32px))]`}
          >
            <div className="flex items-start gap-4 px-6 pt-5 pb-3">
              <div className="flex-1">
                <Dialog.Title className="font-display text-title2">
                  {intl.formatMessage(messages.notesTitle, { version: ready.version })}
                </Dialog.Title>
                {date && !Number.isNaN(date.getTime()) && (
                  <p className="text-fg-secondary mt-1 text-footnote">
                    {intl.formatMessage(messages.notesDate, {
                      date: intl.formatDate(date, { dateStyle: "medium" }),
                    })}
                  </p>
                )}
              </div>
              <CloseButton />
            </div>
            <Dialog.Description asChild>
              <div className="text-fg-primary min-h-0 overflow-y-auto px-6 pb-2">
                {ready.notes ? (
                  <ReleaseNotes notes={ready.notes} />
                ) : (
                  <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.notesEmpty)}</p>
                )}
              </div>
            </Dialog.Description>
            {/* Wraps the link above the buttons when the labels are long (German). */}
            <div className="border-line-subtle flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
              <Button
                variant="plain"
                icon={ExternalLink}
                className="-ml-3 mr-auto"
                onClick={() => void openExternal(`${RELEASES_URL}/tag/v${ready.version}`)}
              >
                {intl.formatMessage(messages.notesLink)}
              </Button>
              <Button onClick={controller.closeDialog}>{intl.formatMessage(updateMessages.close)}</Button>
              <Button
                variant="primary"
                loading={controller.restarting}
                loadingLabel={intl.formatMessage(updateMessages.restarting)}
                onClick={controller.requestRestart}
              >
                {intl.formatMessage(updateMessages.restart)}
              </Button>
            </div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Asked before "Restart to update" when an editor holds unsaved edits. */
export function SaveFirstDialog({ controller }: { controller: UpdateController }) {
  const intl = useIntl();
  const entries = useUnsavedChangesList();
  const labels = intl.formatList(
    entries.map((entry) => entry.label),
    { type: "conjunction" },
  );
  return (
    <AlertDialog.Root
      open={controller.dialog === "save-first"}
      onOpenChange={(open) => {
        if (!open) controller.closeDialog();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content
          onCloseAutoFocus={controller.restoreFocus}
          className={`${contentClass} w-[min(440px,calc(100vw-32px))] gap-3 px-6 py-5`}
        >
          <AlertDialog.Title className="font-display text-title3">
            {intl.formatMessage(messages.saveTitle)}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-fg-secondary text-callout">
            {intl.formatMessage(messages.saveBody, { count: entries.length, labels })}
          </AlertDialog.Description>
          {controller.saveFailed && (
            <InlineAlert tone="error" fromAction title={intl.formatMessage(messages.saveFailed)} />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <AlertDialog.Cancel asChild>
              <Button>{intl.formatMessage(messages.cancel)}</Button>
            </AlertDialog.Cancel>
            <Button
              variant="primary"
              loading={controller.restarting}
              loadingLabel={intl.formatMessage(updateMessages.restarting)}
              onClick={controller.saveAndRestart}
            >
              {intl.formatMessage(messages.saveAndRestart)}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
