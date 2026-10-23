/**
 * Export (Mod+E): PDF printed offline by the OS webview from the same HTML as the preview, DOCX
 * built from the same JSON, or the JSON Resume itself. File name `First-Last-CV-<Company>.<ext>`
 * (`First-Last-CV.<ext>` without a company), saved where the user picks in the Save dialog.
 * While AI placeholders like "[X%]" remain in the CV, nothing is exported (BRIEF §2.4).
 */
import type { CvContent } from "@bfhr/core";
import { buildCvDocx, exportFileName, exportJsonResume, splitName } from "@bfhr/cv-render";
import { Dialog } from "radix-ui";
import { useId, useMemo, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { printCvPdf, saveExportFile, type ExportKind } from "../../lib/cvExport";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { useToast } from "../../shared/ui/Toast";
import { renderCv, renderInput } from "./render";

const messages = defineMessages({
  title: { id: "cv-editor.export.title", defaultMessage: "Export {title}" },
  body: {
    id: "cv-editor.export.body",
    defaultMessage: "PDF is what most applications ask for. The file is made on this device; nothing is uploaded.",
  },
  format: { id: "cv-editor.export.format", defaultMessage: "Format" },
  pdf: { id: "cv-editor.export.pdf", defaultMessage: "PDF" },
  docx: { id: "cv-editor.export.docx", defaultMessage: "Word (DOCX)" },
  json: { id: "cv-editor.export.json", defaultMessage: "JSON Resume" },
  paper: { id: "cv-editor.export.paper", defaultMessage: "Paper" },
  a4: { id: "cv-editor.export.a4", defaultMessage: "A4" },
  letter: { id: "cv-editor.export.letter", defaultMessage: "US Letter" },
  company: { id: "cv-editor.export.company", defaultMessage: "Company (optional)" },
  companyHint: { id: "cv-editor.export.companyHint", defaultMessage: "Added to the file name, so recruiters see it's for them." },
  fileName: { id: "cv-editor.export.fileName", defaultMessage: "File name: {fileName}" },
  export: { id: "cv-editor.export.submit", defaultMessage: "Export…" },
  exporting: { id: "cv-editor.export.exporting", defaultMessage: "Exporting…" },
  cancel: { id: "cv-editor.export.cancel", defaultMessage: "Cancel" },
  saved: { id: "cv-editor.export.saved", defaultMessage: "Saved {fileName}" },
  placeholdersTitle: {
    id: "cv-editor.export.placeholdersTitle",
    defaultMessage: "{count, plural, one {Fill in # placeholder first} other {Fill in # placeholders first}}",
  },
  placeholdersBody: {
    id: "cv-editor.export.placeholdersBody",
    defaultMessage: "Only you know these facts, so we don't guess them: {list}",
  },
  failed: {
    id: "cv-editor.export.failed",
    defaultMessage: "We couldn't make the file. Your CV is fine; try again, or pick another format.",
  },
  showPlaceholder: {
    id: "cv-editor.export.showPlaceholder",
    defaultMessage: "Show in CV",
    description: "Closes Export and moves to the first field that still has a placeholder like [X%]",
  },
});

export function ExportDialog({
  open,
  onOpenChange,
  title,
  content,
  language,
  onShowPlaceholder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The working copy's content (what the preview shows). */
  content: CvContent;
  language: string;
  /** Closes the dialog and focuses the field holding the placeholder (`PlaceholderHit.path`). */
  onShowPlaceholder: (path: string) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const companyId = useId();
  const [kind, setKind] = useState<ExportKind>("pdf");
  const [paper, setPaper] = useState(content.meta.theme.paperSize);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const rendered = useMemo(() => renderCv(content, language, paper), [content, language, paper]);
  const { firstName, lastName } = splitName(content.basics?.name);
  const trimmedCompany = company.trim();
  const fileName = exportFileName({
    firstName,
    lastName,
    ...(trimmedCompany !== "" && { company: trimmedCompany }),
    ext: kind,
    locale: language,
  });
  const placeholders = rendered.placeholders;

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const bytes =
        kind === "pdf"
          ? await printCvPdf(rendered.html, paper)
          : kind === "docx"
            ? await buildCvDocx(renderInput(content, language, paper))
            : new TextEncoder().encode(exportJsonResume(content));
      const path = await saveExportFile(bytes, fileName, kind);
      if (path !== null) {
        onOpenChange(false);
        toast.show({ variant: "info", message: intl.formatMessage(messages.saved, { fileName }) });
      }
    } catch (error) {
      console.error("Export failed", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg p-5">
          <div>
            <Dialog.Title className="font-display text-title3">{intl.formatMessage(messages.title, { title })}</Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">{intl.formatMessage(messages.body)}</Dialog.Description>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && placeholders.length === 0) void run();
            }}
          >
            {/* Visible labels: a bare row of segments doesn't say what it chooses. */}
            <div className="flex flex-col items-start gap-1">
              <span aria-hidden className="text-footnote text-fg-secondary">
                {intl.formatMessage(messages.format)}
              </span>
              <SegmentedControl
                size="sm"
                label={intl.formatMessage(messages.format)}
                value={kind}
                onValueChange={setKind}
                options={[
                  { value: "pdf", label: intl.formatMessage(messages.pdf) },
                  { value: "docx", label: intl.formatMessage(messages.docx) },
                  { value: "json", label: intl.formatMessage(messages.json) },
                ]}
              />
            </div>
            {kind !== "json" && (
              <div className="flex flex-col items-start gap-1">
                <span aria-hidden className="text-footnote text-fg-secondary">
                  {intl.formatMessage(messages.paper)}
                </span>
                <SegmentedControl
                  size="sm"
                  label={intl.formatMessage(messages.paper)}
                  value={paper}
                  onValueChange={setPaper}
                  options={[
                    { value: "a4", label: intl.formatMessage(messages.a4) },
                    { value: "letter", label: intl.formatMessage(messages.letter) },
                  ]}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor={companyId} className="text-footnote text-fg-secondary">
                {intl.formatMessage(messages.company)}
              </label>
              <input
                id={companyId}
                value={company}
                maxLength={80}
                onChange={(event) => setCompany(event.target.value)}
                aria-describedby={`${companyId}-hint`}
                className="bg-surface-base border-line-control text-callout text-fg-primary h-8 rounded-md border px-2"
              />
              <p id={`${companyId}-hint`} className="text-fg-tertiary text-footnote">
                {intl.formatMessage(messages.companyHint)}
              </p>
            </div>
            <p className="text-fg-secondary text-footnote" aria-live="polite">
              {intl.formatMessage(messages.fileName, { fileName: <span className="text-fg-primary font-mono">{fileName}</span> })}
            </p>
            {placeholders.length > 0 && (
              <InlineAlert
                tone="warning"
                title={intl.formatMessage(messages.placeholdersTitle, { count: placeholders.length })}
                action={{
                  label: intl.formatMessage(messages.showPlaceholder),
                  onClick: () => {
                    const [first] = placeholders;
                    if (first) onShowPlaceholder(first.path);
                  },
                }}
              >
                {intl.formatMessage(messages.placeholdersBody, {
                  list: intl.formatList([...new Set(placeholders.map((hit) => hit.text))], { type: "conjunction" }),
                })}
              </InlineAlert>
            )}
            {failed && <InlineAlert tone="error" fromAction title={intl.formatMessage(messages.failed)} />}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">{intl.formatMessage(messages.cancel)}</Button>
              </Dialog.Close>
              <Button
                variant="primary"
                type="submit"
                loading={busy}
                loadingLabel={intl.formatMessage(messages.exporting)}
                disabledReason={
                  placeholders.length > 0 ? intl.formatMessage(messages.placeholdersTitle, { count: placeholders.length }) : null
                }
              >
                {intl.formatMessage(messages.export)}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
