/**
 * Attachments of an email apply (research/apply.md "Attachment picker", Braintrust drop zone,
 * Fabric "Your files"): the CV and cover letter PDFs, plus up to `MAIL_SEND_MAX_ATTACHMENTS` files
 * in all from the user's rendered files ("From your files…", a multi-select dialog) or from this
 * computer (the system file picker, or dropped on the section). Each addition is checked against
 * the account's size limit (`mailSendMaxAttachmentBytes`) and the types `mailSend` takes; a refusal
 * says why in one sentence.
 */
import { MAIL_SEND_MAX_ATTACHMENTS, type MailProvider, type RenderedFile } from "@bfhr/core";
import { FileText, FolderOpen, Paperclip, X } from "lucide-react";
import { useSearch } from "@tanstack/react-router";
import { Dialog } from "radix-ui";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import {
  ATTACHMENT_ACCEPT,
  attachmentContentType,
  attachmentLimitBytes,
  attachmentRefusal,
  type ApplyDraft,
  type ExtraAttachment,
  extraBytes,
  extraName,
  fileSize,
  refusalSentence,
} from "./model";

const messages = defineMessages({
  attachments: { id: "apply.attachments.title", defaultMessage: "Attachments" },
  fromFiles: { id: "apply.attachments.fromFiles", defaultMessage: "From your files…" },
  fromComputer: { id: "apply.attachments.fromComputer", defaultMessage: "From this computer…" },
  drop: { id: "apply.attachments.drop", defaultMessage: "Drop files here to attach them" },
  limit: {
    id: "apply.attachments.limit",
    defaultMessage: "Up to {count} files and {size} in total{account, select, none {} other { with {account}}}.",
  },
  remove: { id: "apply.attachments.remove", defaultMessage: "Remove {name}" },
  dialogTitle: { id: "apply.attachments.dialogTitle", defaultMessage: "Attach from your files" },
  dialogBody: {
    id: "apply.attachments.dialogBody",
    defaultMessage: "CVs and cover letters you made in BruteForceHR. Choose the ones to send with this email.",
  },
  cvGroup: { id: "apply.attachments.cvGroup", defaultMessage: "CVs" },
  letterGroup: { id: "apply.attachments.letterGroup", defaultMessage: "Cover letters" },
  fileRow: { id: "apply.attachments.fileRow", defaultMessage: "{date} · {size}" },
  noFiles: {
    id: "apply.attachments.noFiles",
    defaultMessage: "No saved files yet. The PDFs you send or export appear here.",
  },
  add: {
    id: "apply.attachments.add",
    defaultMessage: "{count, plural, =0 {Attach} one {Attach # file} other {Attach # files}}",
  },
  chooseFirst: { id: "apply.attachments.chooseFirst", defaultMessage: "Choose at least one file." },
  cancel: { id: "apply.attachments.cancel", defaultMessage: "Cancel" },
  added: {
    id: "apply.attachments.added",
    defaultMessage: "{count, plural, one {Attached {name}} other {Attached # files}}",
  },
  readFailed: { id: "apply.attachments.readFailed", defaultMessage: "Couldn't read “{fileName}”. Try another file." },
});

/** The CV / cover letter chip (made at Review) or an extra file with its remove button. */
export interface AttachmentChipVM {
  readonly key: string;
  readonly name: string;
  /** "84 kB"; null until the PDF is made. */
  readonly size: string | null;
  readonly removable: boolean;
}

export function AttachmentChip({ chip, onRemove }: { chip: AttachmentChipVM; onRemove?: () => void }) {
  const intl = useIntl();
  return (
    <li className="bg-surface-sunken text-callout inline-flex max-w-full items-center gap-2 rounded-md py-1 pr-1 pl-2">
      <FileText aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{chip.name}</span>
      {chip.size && <span className="text-fg-tertiary shrink-0 tabular-nums">{chip.size}</span>}
      {chip.removable && onRemove ? (
        <IconButton size="sm" icon={X} label={intl.formatMessage(messages.remove, { name: chip.name })} onClick={onRemove} />
      ) : (
        <span className="w-1" />
      )}
    </li>
  );
}

let localKeys = 0;

export function AttachmentPicker({
  chips,
  draft,
  renderedFiles,
  provider,
  accountLabel,
  pdfBytes,
  onAdd,
  onRemove,
}: {
  /** The CV and cover letter (not removable here) followed by the extras. */
  readonly chips: readonly AttachmentChipVM[];
  readonly draft: Pick<ApplyDraft, "extras" | "letterOn">;
  readonly renderedFiles: readonly RenderedFile[];
  /** The sending account's provider (its size limit); null on the mail-app path. */
  readonly provider: MailProvider | null;
  /** "deniz@gmail.com"; null without an account. */
  readonly accountLabel: string | null;
  /** The CV (+ letter) PDFs' size, or an estimate until they are made. */
  readonly pdfBytes: number;
  readonly onAdd: (extras: readonly ExtraAttachment[]) => void;
  readonly onRemove: (key: string) => void;
}) {
  const intl = useIntl();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // `?attach=files` opens "From your files…" (critique captures).
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const attach = search["attach"];
  useEffect(() => {
    if (attach !== "files") return;
    // After the panel has moved focus to its heading, or that focus would close the dialog.
    const frame = requestAnimationFrame(() => setDialogOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [attach]);
  const ctx = { intl, locale: intl.locale };

  /** Adds what fits, one by one, and says why the first one that doesn't fit was refused. */
  const add = (candidates: readonly ExtraAttachment[]) => {
    const accepted: ExtraAttachment[] = [];
    for (const candidate of candidates) {
      const refusal = attachmentRefusal(
        { ...draft, extras: [...draft.extras, ...accepted] },
        {
          fileName: extraName(candidate),
          bytes: extraBytes(candidate),
          contentType: candidate.kind === "local" ? candidate.contentType : "application/pdf",
        },
        { provider, pdfBytes },
      );
      if (refusal) {
        setStatus(refusalSentence(refusal, ctx));
        if (accepted.length > 0) onAdd(accepted);
        return;
      }
      accepted.push(candidate);
    }
    if (accepted.length === 0) return;
    onAdd(accepted);
    setStatus(intl.formatMessage(messages.added, { count: accepted.length, name: extraName(accepted[0] as ExtraAttachment) }));
  };

  const addLocal = async (files: readonly File[]) => {
    const extras: ExtraAttachment[] = [];
    for (const file of files) {
      const contentType = attachmentContentType(file.name, file.type);
      if (contentType === null) {
        setStatus(refusalSentence({ kind: "type", fileName: file.name }, ctx));
        if (extras.length > 0) add(extras);
        return;
      }
      try {
        extras.push({
          key: `local-${(localKeys += 1)}`,
          kind: "local",
          fileName: file.name,
          contentType,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      } catch {
        setStatus(intl.formatMessage(messages.readFailed, { fileName: file.name }));
        return;
      }
    }
    add(extras);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void addLocal([...event.dataTransfer.files]);
  };

  const attachedIds = new Set(draft.extras.flatMap((extra) => (extra.kind === "rendered" ? [extra.file.id] : [])));
  const limit = intl.formatMessage(messages.limit, {
    count: MAIL_SEND_MAX_ATTACHMENTS,
    size: fileSize(attachmentLimitBytes(provider), intl.locale),
    account: accountLabel ?? "none",
  });

  return (
    <section
      aria-label={intl.formatMessage(messages.attachments)}
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "flex flex-col gap-2 rounded-md border border-dashed p-2",
        dragging ? "border-accent-solid bg-accent-subtle" : "border-transparent",
      )}
    >
      <h3 className="text-footnote text-fg-secondary font-medium">{intl.formatMessage(messages.attachments)}</h3>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <AttachmentChip key={chip.key} chip={chip} onRemove={() => onRemove(chip.key)} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={Paperclip} aria-describedby={statusId} onClick={() => setDialogOpen(true)}>
          {intl.formatMessage(messages.fromFiles)}
        </Button>
        <Button size="sm" icon={FolderOpen} aria-describedby={statusId} onClick={() => inputRef.current?.click()}>
          {intl.formatMessage(messages.fromComputer)}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void addLocal(files);
          }}
        />
      </div>
      <p className="text-fg-tertiary text-footnote">
        {dragging ? intl.formatMessage(messages.drop) : limit}
      </p>
      <p id={statusId} role="status" className="text-fg-secondary text-footnote empty:hidden">
        {status}
      </p>
      {dialogOpen && (
        <FilesDialog
          files={renderedFiles.filter((file) => !attachedIds.has(file.id))}
          onOpenChange={setDialogOpen}
          onAttach={(files) => {
            setDialogOpen(false);
            add(files.map((file) => ({ key: `rendered-${file.id}`, kind: "rendered" as const, file })));
          }}
        />
      )}
    </section>
  );
}

function FilesDialog({
  files,
  onOpenChange,
  onAttach,
}: {
  files: readonly RenderedFile[];
  onOpenChange: (open: boolean) => void;
  onAttach: (files: readonly RenderedFile[]) => void;
}) {
  const intl = useIntl();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const sorted = files.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const groups = [
    { label: intl.formatMessage(messages.cvGroup), files: sorted.filter((file) => file.cvRevisionId !== null) },
    { label: intl.formatMessage(messages.letterGroup), files: sorted.filter((file) => file.coverLetterId !== null) },
  ].filter((group) => group.files.length > 0);
  const date = new Intl.DateTimeFormat(intl.locale, { dateStyle: "medium" });
  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[80vh] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg p-5">
          <div>
            <Dialog.Title className="font-display text-title3">{intl.formatMessage(messages.dialogTitle)}</Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">
              {intl.formatMessage(messages.dialogBody)}
            </Dialog.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <EmptyState kind="subArea" body={intl.formatMessage(messages.noFiles)} />
            ) : (
              groups.map((group) => (
                <fieldset key={group.label} className="mb-3 flex flex-col gap-1">
                  <legend className="text-footnote text-fg-secondary mb-1 font-semibold">{group.label}</legend>
                  {group.files.map((file) => (
                    <label key={file.id} className="hover:bg-surface-hover flex items-start gap-3 rounded-md px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={chosen.has(file.id)}
                        onChange={(event) =>
                          setChosen((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(file.id);
                            else next.delete(file.id);
                            return next;
                          })
                        }
                        className="accent-accent-solid mt-0.5 size-4 shrink-0"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-callout truncate">{file.fileName}</span>
                        <span className="text-fg-tertiary text-footnote tabular-nums">
                          {intl.formatMessage(messages.fileRow, {
                            date: date.format(file.createdAt),
                            size: fileSize(file.sizeBytes, intl.locale),
                          })}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button>{intl.formatMessage(messages.cancel)}</Button>
            </Dialog.Close>
            <Button
              variant="primary"
              disabledReason={chosen.size === 0 ? intl.formatMessage(messages.chooseFirst) : null}
              onClick={() => onAttach(files.filter((file) => chosen.has(file.id)))}
            >
              {intl.formatMessage(messages.add, { count: chosen.size })}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
