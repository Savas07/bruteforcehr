/**
 * Settings › Data & privacy (settings-account.md "Decision — Desktop", Trello + Slack + beehiiv for
 * the export, Render placement for deletion): "Export everything" with what's included and what
 * isn't, the export's progress in place and a ready card with Save…; then "Delete account", which
 * opens the dialog (DeleteAccountDialog.tsx). The Settings shell renders the page heading.
 */
import { Check, Download, FileArchive, Minus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type IntlShape, useIntl } from "react-intl";
import { openExternal } from "../../../lib/desktop";
import { useConnectivity } from "../../../shared/connectivity";
import { Button } from "../../../shared/ui/Button";
import { InlineAlert } from "../../../shared/ui/InlineAlert";
import { ProgressNote } from "../../../shared/ui/ProgressNote";
import { SettingsSection } from "../ui";
import { useAccountData } from "./context";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { exportFailureMessages } from "./errors";
import type { ExportFlow, ExportView } from "./exportFlow";
import { commonMessages, deleteMessages, exportMessages } from "./messages";

const ISSUES_URL = "https://github.com/Savas07/bruteforcehr-releases/issues/new";
const EXPORT_SECTION_ID = "settings-data-privacy-export";

/** "14.2 MB" / "820 kB" in the UI locale. */
export function formatExportSize(intl: IntlShape, bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb >= 1
    ? intl.formatNumber(mb, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
    : intl.formatNumber(Math.max(1, Math.round(bytes / 1000)), { style: "unit", unit: "kilobyte" });
}

function ScopeList({
  title,
  items,
  included,
}: {
  title: string;
  items: readonly string[];
  included: boolean;
}) {
  const Icon = included ? Check : Minus;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-subheadline text-fg-primary font-semibold">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item} className="text-callout text-fg-secondary flex items-start gap-2">
            <Icon
              aria-hidden="true"
              strokeWidth={2}
              className={
                included
                  ? "text-accent-text mt-0.5 size-4 shrink-0"
                  : "text-fg-tertiary mt-0.5 size-4 shrink-0"
              }
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExportStatus({
  flow,
  view,
  online,
  actionRef,
}: {
  flow: ExportFlow;
  view: ExportView;
  online: boolean;
  /** The section's main button, focused by "Export my data first". */
  actionRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const intl = useIntl();
  const offlineReason = online ? null : intl.formatMessage(commonMessages.offline);

  if (view.status === "preparing")
    return (
      <ProgressNote
        label={intl.formatMessage(exportMessages.preparing)}
        startedAt={new Date(view.startedAt)}
      />
    );

  if (view.status === "ready") {
    const { export: created, save } = view;
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-surface-elevated border-line-subtle flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border p-3">
          <FileArchive aria-hidden="true" strokeWidth={1.75} className="text-fg-secondary size-6 shrink-0" />
          <div className="min-w-48 flex-1">
            <p className="text-body text-fg-primary font-semibold">
              {intl.formatMessage(exportMessages.readyTitle)}
            </p>
            <p className="text-footnote text-fg-secondary">
              {intl.formatMessage(exportMessages.readyMeta, {
                size: formatExportSize(intl, created.sizeBytes),
                date: intl.formatDate(created.expiresAt, { dateStyle: "medium", timeStyle: "short" }),
              })}
            </p>
          </div>
          <Button
            ref={actionRef}
            variant="primary"
            icon={Download}
            loading={save.status === "saving"}
            loadingLabel={intl.formatMessage(exportMessages.saving)}
            disabledReason={offlineReason}
            onClick={() => void flow.save()}
          >
            {intl.formatMessage(exportMessages.save)}
          </Button>
        </div>
        <div>
          <Button
            variant="plain"
            size="sm"
            className="-ml-2"
            disabledReason={
              offlineReason ?? (save.status === "saving" ? intl.formatMessage(exportMessages.saving) : null)
            }
            onClick={() => void flow.create()}
          >
            {intl.formatMessage(exportMessages.create)}
          </Button>
        </div>
        {save.status === "saved" && (
          <p role="status" className="text-footnote text-fg-secondary flex items-center gap-1.5">
            <Check aria-hidden="true" strokeWidth={2} className="text-success-text size-4" />
            {intl.formatMessage(exportMessages.saved, { fileName: save.fileName })}
          </p>
        )}
        {save.status === "failed" && (
          <InlineAlert
            tone="error"
            fromAction
            title={intl.formatMessage(exportMessages.errorDownload)}
            {...(online && {
              action: { label: intl.formatMessage(commonMessages.retry), onClick: () => void flow.save() },
            })}
          />
        )}
      </div>
    );
  }

  const failure = view.failure;
  return (
    <div className="flex flex-col items-start gap-3">
      {failure !== null && (
        <InlineAlert
          tone={failure === "generic" ? "error" : "info"}
          fromAction={failure === "generic"}
          className="self-stretch"
          title={intl.formatMessage(exportFailureMessages[failure])}
          {...(failure === "too-large"
            ? {
                action: {
                  label: intl.formatMessage(commonMessages.openGitHub),
                  onClick: () => void openExternal(ISSUES_URL),
                },
              }
            : failure === "generic" && online
              ? {
                  action: {
                    label: intl.formatMessage(commonMessages.retry),
                    onClick: () => void flow.create(),
                  },
                }
              : {})}
        />
      )}
      <Button
        ref={actionRef}
        variant={failure === null ? "primary" : "secondary"}
        icon={FileArchive}
        disabledReason={offlineReason}
        onClick={() => void flow.create()}
      >
        {intl.formatMessage(exportMessages.create)}
      </Button>
    </div>
  );
}

export function DataPrivacyPane() {
  const intl = useIntl();
  const { backend, exportFlow, initialDelete } = useAccountData();
  const flow = useMemo(() => exportFlow(), [exportFlow]);
  const view = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const online = useConnectivity().status === "online";
  const [deleteOpen, setDeleteOpen] = useState(initialDelete !== undefined);
  /** Each opening starts a fresh dialog (typed word, sign-in check). */
  const [deleteRun, setDeleteRun] = useState(0);
  const exportAction = useRef<HTMLButtonElement | null>(null);
  const deleteButton = useRef<HTMLButtonElement | null>(null);
  /** Where focus goes when the dialog closes: back to its button, or to the export ("Export my data first"). */
  const focusAfterDelete = useRef<"delete" | "export">("delete");

  // The server deletes the ZIP at `expiresAt`; drop the card then.
  useEffect(() => {
    flow.expire();
    const id = setInterval(() => flow.expire(), 60_000);
    return () => clearInterval(id);
  }, [flow]);

  const included = [
    exportMessages.included1,
    exportMessages.included2,
    exportMessages.included3,
    exportMessages.included4,
    exportMessages.included5,
  ].map((message) => intl.formatMessage(message));
  const excluded = [exportMessages.excluded1, exportMessages.excluded2].map((message) =>
    intl.formatMessage(message),
  );

  const openDelete = () => {
    focusAfterDelete.current = "delete";
    setDeleteRun((run) => run + 1);
    setDeleteOpen(true);
  };
  const exportFirst = () => {
    focusAfterDelete.current = "export";
    setDeleteOpen(false);
  };
  const restoreFocus = () => {
    if (focusAfterDelete.current === "export") {
      document.getElementById(EXPORT_SECTION_ID)?.scrollIntoView({ block: "start" });
      exportAction.current?.focus();
    } else deleteButton.current?.focus();
  };

  return (
    <div className="flex flex-col">
      <SettingsSection
        id={EXPORT_SECTION_ID}
        title={intl.formatMessage(exportMessages.title)}
        description={intl.formatMessage(exportMessages.description)}
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <ScopeList title={intl.formatMessage(exportMessages.includedTitle)} items={included} included />
          <ScopeList
            title={intl.formatMessage(exportMessages.excludedTitle)}
            items={excluded}
            included={false}
          />
        </div>
        <ExportStatus flow={flow} view={view} online={online} actionRef={exportAction} />
        <p className="text-footnote text-fg-secondary">{intl.formatMessage(exportMessages.retention)}</p>
      </SettingsSection>
      <SettingsSection
        title={intl.formatMessage(deleteMessages.title)}
        description={intl.formatMessage(deleteMessages.description)}
      >
        <div>
          <Button
            ref={deleteButton}
            variant="destructive"
            disabledReason={online ? null : intl.formatMessage(commonMessages.offline)}
            onClick={openDelete}
          >
            {intl.formatMessage(deleteMessages.open)}
          </Button>
        </div>
      </SettingsSection>
      <DeleteAccountDialog
        key={deleteRun}
        open={deleteOpen}
        backend={backend}
        initial={deleteRun === 0 ? initialDelete : undefined}
        online={online}
        onClose={() => setDeleteOpen(false)}
        onExportFirst={exportFirst}
        onCloseAutoFocus={restoreFocus}
      />
    </div>
  );
}
