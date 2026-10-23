/**
 * `ImportCvDialog` (research/cv-editor.md "Import", components.md `ImportPicker` + `ParseProgress`
 * + `ImportReview`): Choose file → Read → Review in one Radix dialog. The file goes to
 * `users/{uid}/cv-imports/{id}` (kept attached to the CV), the `cvImport` callable reads it, and
 * the user checks the result before `onCreate` gets the new CV. Every failure says what happened
 * and offers the one way forward (try again / upload again / another file).
 */
import { Dialog, Progress } from "radix-ui";
import { Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../../shared/cx";
import { useConnectivity } from "../../../shared/connectivity";
import { Button, IconButton } from "../../../shared/ui/Button";
import { InlineAlert } from "../../../shared/ui/InlineAlert";
import { NeedsConnection } from "../../../shared/ui/NeedsConnection";
import { ProgressNote } from "../../../shared/ui/ProgressNote";
import { ImportReview, type ImportReviewResult } from "./ImportReview";
import {
  IMPORT_ACCEPT,
  IMPORT_ERROR_RECOVERY,
  applyReviewEdits,
  buildImportedCv,
  buildReviewModel,
  checkImportFiles,
  classifyImportError,
  defaultImportTitle,
  guessCvLanguage,
  parseCvImportResponse,
  type DetectedImportFile,
  type ImportErrorKind,
  type ImportFileProblem,
  type ImportedCv,
  type ReviewModel,
} from "./model";
import type { CvImportResponse } from "./schema";
import { requestCvImport, startImportUpload, type ImportUpload } from "./service";

const messages = defineMessages({
  title: { id: "cv-editor.import.title", defaultMessage: "Import a CV", description: "Import dialog title" },
  reviewTitle: {
    id: "cv-editor.import.reviewTitle",
    defaultMessage: "Did we read your CV correctly?",
    description: "Import dialog title on the review step",
  },
  close: { id: "cv-editor.import.close", defaultMessage: "Close", description: "Closes the import dialog" },
  closeBusy: {
    id: "cv-editor.import.closeBusy",
    defaultMessage: "Creating your CV. This closes when it's done.",
    description: "Why Close is disabled while the CV is being created",
  },
  steps: {
    id: "cv-editor.import.steps",
    defaultMessage: "Import steps",
    description: "Accessible name of the stepper",
  },
  stepPick: { id: "cv-editor.import.step.pick", defaultMessage: "Choose file", description: "Stepper step" },
  stepRead: { id: "cv-editor.import.step.read", defaultMessage: "Read", description: "Stepper step" },
  stepReview: { id: "cv-editor.import.step.review", defaultMessage: "Review", description: "Stepper step" },
  intro: {
    id: "cv-editor.import.intro",
    defaultMessage:
      "We'll fill in a new CV from your file. You can check and edit everything before it's created.",
    description: "Import dialog description on the pick step",
  },
  dropTitle: {
    id: "cv-editor.import.dropTitle",
    defaultMessage: "Drop your CV here",
    description: "Drop zone headline",
  },
  dropActive: {
    id: "cv-editor.import.dropActive",
    defaultMessage: "Drop to import",
    description: "Drop zone headline while a file is dragged over it",
  },
  formats: {
    id: "cv-editor.import.formats",
    defaultMessage: "PDF, Word (DOCX), JSON Resume or LinkedIn data export (ZIP), up to 20 MB",
    description: "Accepted formats and size limit under the drop zone",
  },
  choose: {
    id: "cv-editor.import.choose",
    defaultMessage: "Choose file…",
    description: "Opens the file picker",
  },
  needsConnection: {
    id: "cv-editor.import.needsConnection",
    defaultMessage: "Importing uploads your file and reads it on our server, so it needs a connection.",
    description: "Why Choose file is disabled offline",
  },
  dataUse: {
    id: "cv-editor.import.dataUse",
    defaultMessage:
      "Your file is stored privately with your account and kept attached to the new CV. PDF and Word files are read by Claude to fill in the fields.",
    description: "Data-use note on the pick step",
  },
  problemUnsupported: {
    id: "cv-editor.import.problem.unsupported",
    defaultMessage: "We can't import this type of file",
    description: "Picked file has an unsupported type",
  },
  problemUnsupportedBody: {
    id: "cv-editor.import.problem.unsupportedBody",
    defaultMessage:
      "Use a PDF, a Word document (.docx), a JSON Resume (.json) or your LinkedIn data export (.zip).",
    description: "Picked file has an unsupported type",
  },
  problemTooLarge: {
    id: "cv-editor.import.problem.tooLarge",
    defaultMessage: "This file is larger than 20 MB",
    description: "Picked file is over the size limit",
  },
  problemTooLargeBody: {
    id: "cv-editor.import.problem.tooLargeBody",
    defaultMessage: "Try a smaller copy, for example a PDF without large images.",
    description: "Picked file is over the size limit",
  },
  problemEmpty: {
    id: "cv-editor.import.problem.empty",
    defaultMessage: "This file is empty",
    description: "Picked file has no bytes",
  },
  problemEmptyBody: {
    id: "cv-editor.import.problem.emptyBody",
    defaultMessage: "Choose the file again, or export a fresh copy.",
    description: "Picked file has no bytes",
  },
  problemMultiple: {
    id: "cv-editor.import.problem.multiple",
    defaultMessage: "One file at a time, please",
    description: "Several files were dropped",
  },
  problemMultipleBody: {
    id: "cv-editor.import.problem.multipleBody",
    defaultMessage: "Drop or choose the single file you want to turn into a CV.",
    description: "Several files were dropped",
  },
  uploading: {
    id: "cv-editor.import.uploading",
    defaultMessage: "Uploading {fileName}…",
    description: "Upload step label",
  },
  uploadProgress: {
    id: "cv-editor.import.uploadProgress",
    defaultMessage: "Upload progress",
    description: "Accessible name of the upload progress bar",
  },
  reading: {
    id: "cv-editor.import.reading",
    defaultMessage: "Reading your CV… This usually takes under a minute.",
    description: "Read step label",
  },
  stepUpload: {
    id: "cv-editor.import.progress.upload",
    defaultMessage: "Uploading the file",
    description: "Progress step",
  },
  stepParse: {
    id: "cv-editor.import.progress.read",
    defaultMessage: "Reading sections and dates",
    description: "Progress step",
  },
  stepCheck: {
    id: "cv-editor.import.progress.check",
    defaultMessage: "Getting the review ready",
    description: "Progress step",
  },
  cancel: {
    id: "cv-editor.import.cancel",
    defaultMessage: "Cancel",
    description: "Stops the upload or read",
  },
  tryAgain: {
    id: "cv-editor.import.tryAgain",
    defaultMessage: "Try again",
    description: "Retries the failed step",
  },
  uploadAgain: {
    id: "cv-editor.import.uploadAgain",
    defaultMessage: "Upload again",
    description: "Uploads the file again",
  },
  tryAnother: {
    id: "cv-editor.import.tryAnother",
    defaultMessage: "Try another file",
    description: "Back to the file picker",
  },
});

const ERROR_MESSAGES = defineMessages({
  offline: { id: "cv-editor.import.error.offline", defaultMessage: "You're offline" },
  offlineBody: {
    id: "cv-editor.import.error.offlineBody",
    defaultMessage: "Importing needs a connection. Try again once you're back online.",
  },
  signedOut: { id: "cv-editor.import.error.signedOut", defaultMessage: "You're signed out" },
  signedOutBody: {
    id: "cv-editor.import.error.signedOutBody",
    defaultMessage: "Sign in again, then try again. Your file is still here.",
  },
  emailUnverified: {
    id: "cv-editor.import.error.emailUnverified",
    defaultMessage: "Confirm your email first",
  },
  emailUnverifiedBody: {
    id: "cv-editor.import.error.emailUnverifiedBody",
    defaultMessage: "Open the sign-in link we emailed you, then try again.",
  },
  uploadRejected: {
    id: "cv-editor.import.error.uploadRejected",
    defaultMessage: "The upload wasn't accepted",
  },
  uploadRejectedBody: {
    id: "cv-editor.import.error.uploadRejectedBody",
    defaultMessage:
      "Make sure you're signed in with a confirmed email and the file is a PDF, Word, JSON or ZIP file under 20 MB.",
  },
  uploadFailed: { id: "cv-editor.import.error.uploadFailed", defaultMessage: "The upload didn't finish" },
  uploadFailedBody: {
    id: "cv-editor.import.error.uploadFailedBody",
    defaultMessage: "This is usually the connection. Upload it again.",
  },
  fileMissing: {
    id: "cv-editor.import.error.fileMissing",
    defaultMessage: "We couldn't find the uploaded file",
  },
  fileMissingBody: {
    id: "cv-editor.import.error.fileMissingBody",
    defaultMessage: "Upload it again and we'll read it right away.",
  },
  dailyCap: {
    id: "cv-editor.import.error.dailyCap",
    defaultMessage: "You've reached today's limit for reading CVs",
  },
  dailyCapBody: {
    id: "cv-editor.import.error.dailyCapBody",
    defaultMessage: "The limit resets tomorrow. You can import it then, or start a CV from scratch now.",
  },
  aiDisabled: { id: "cv-editor.import.error.aiDisabled", defaultMessage: "Reading CVs is paused right now" },
  aiDisabledBody: {
    id: "cv-editor.import.error.aiDisabledBody",
    defaultMessage: "Your file is uploaded. Try again a little later.",
  },
  unreadableFile: {
    id: "cv-editor.import.error.unreadableFile",
    defaultMessage: "We couldn't open this file",
  },
  unreadableFileBody: {
    id: "cv-editor.import.error.unreadableFileBody",
    defaultMessage:
      "It may be damaged or password-protected. Try another copy, or save it as PDF or Word again.",
  },
  noText: { id: "cv-editor.import.error.noText", defaultMessage: "This PDF has no text we can read" },
  noTextBody: {
    id: "cv-editor.import.error.noTextBody",
    defaultMessage:
      "It looks like a scan or a picture of a CV. Try the Word file, or a PDF saved from the program you wrote it in.",
  },
  invalidFile: {
    id: "cv-editor.import.error.invalidFile",
    defaultMessage: "We couldn't find a CV in this file",
  },
  invalidFileBody: {
    id: "cv-editor.import.error.invalidFileBody",
    defaultMessage:
      "Check that it's your CV. A JSON file needs the JSON Resume format; a LinkedIn export is the ZIP from LinkedIn's “Get a copy of your data”.",
  },
  timeout: { id: "cv-editor.import.error.timeout", defaultMessage: "Reading took longer than expected" },
  timeoutBody: {
    id: "cv-editor.import.error.timeoutBody",
    defaultMessage: "Your file is uploaded. Try again; it's often quicker the second time.",
  },
  serverFailed: {
    id: "cv-editor.import.error.serverFailed",
    defaultMessage: "Something went wrong while reading your CV",
  },
  serverFailedBody: {
    id: "cv-editor.import.error.serverFailedBody",
    defaultMessage: "It's on our side, not your file. Try again in a moment.",
  },
  badResponse: { id: "cv-editor.import.error.badResponse", defaultMessage: "We got an unexpected result" },
  badResponseBody: {
    id: "cv-editor.import.error.badResponseBody",
    defaultMessage: "Nothing was saved. Try again in a moment.",
  },
});

type ShownError = Exclude<ImportErrorKind, "canceled">;

const ERROR_COPY: Readonly<
  Record<ShownError, readonly [title: keyof typeof ERROR_MESSAGES, body: keyof typeof ERROR_MESSAGES]>
> = {
  offline: ["offline", "offlineBody"],
  signedOut: ["signedOut", "signedOutBody"],
  emailUnverified: ["emailUnverified", "emailUnverifiedBody"],
  uploadRejected: ["uploadRejected", "uploadRejectedBody"],
  uploadFailed: ["uploadFailed", "uploadFailedBody"],
  fileMissing: ["fileMissing", "fileMissingBody"],
  dailyCap: ["dailyCap", "dailyCapBody"],
  aiDisabled: ["aiDisabled", "aiDisabledBody"],
  unreadableFile: ["unreadableFile", "unreadableFileBody"],
  noText: ["noText", "noTextBody"],
  invalidFile: ["invalidFile", "invalidFileBody"],
  timeout: ["timeout", "timeoutBody"],
  serverFailed: ["serverFailed", "serverFailedBody"],
  badResponse: ["badResponse", "badResponseBody"],
};

const PROBLEM_COPY = {
  unsupported: [messages.problemUnsupported, messages.problemUnsupportedBody],
  tooLarge: [messages.problemTooLarge, messages.problemTooLargeBody],
  empty: [messages.problemEmpty, messages.problemEmptyBody],
  multiple: [messages.problemMultiple, messages.problemMultipleBody],
} as const satisfies Record<ImportFileProblem, readonly [unknown, unknown]>;

interface Picked {
  readonly file: File;
  readonly detected: DetectedImportFile;
}

type Stage =
  | { readonly step: "pick"; readonly problem: ImportFileProblem | null }
  | { readonly step: "upload"; readonly picked: Picked; readonly transferred: number; readonly total: number }
  | { readonly step: "read"; readonly picked: Picked; readonly storagePath: string; readonly startedAt: Date }
  | {
      readonly step: "review";
      readonly picked: Picked;
      readonly storagePath: string;
      readonly response: CvImportResponse;
      readonly review: ReviewModel;
    }
  | {
      readonly step: "error";
      readonly picked: Picked;
      /** Set once the upload finished, so "Try again" re-reads the same stored file. */
      readonly storagePath: string | null;
      readonly error: ShownError;
    };

export interface ImportCvDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Signed-in user; the file goes to `users/{uid}/cv-imports/{id}`. */
  readonly uid: string;
  /** Saves the new CV (document + first revision). The dialog closes when it resolves; a rejection keeps the review open. */
  readonly onCreate: (result: ImportedCv) => Promise<void>;
}

const contentClass =
  "bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg";

/** Import a CV from a PDF, DOCX, JSON Resume or LinkedIn export: pick → upload → read → review → create. */
export function ImportCvDialog({ open, onOpenChange, uid, onCreate }: ImportCvDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // While the CV is being created, closing would hide the outcome.
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        {/* Mounted only while open: closing drops the flow's state and cancels a running upload. */}
        <ImportFlow
          uid={uid}
          busy={busy}
          onBusyChange={setBusy}
          onCreate={async (result) => {
            await onCreate(result);
            onOpenChange(false);
          }}
        />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stepper({ current }: { current: 0 | 1 | 2 }) {
  const intl = useIntl();
  const labels = [messages.stepPick, messages.stepRead, messages.stepReview];
  return (
    <ol
      aria-label={intl.formatMessage(messages.steps)}
      className="flex flex-wrap items-center gap-2 text-footnote"
    >
      {labels.map((label, index) => (
        <li
          key={label.id}
          aria-current={index === current ? "step" : undefined}
          className={cx(
            "flex items-center gap-1.5",
            index === current
              ? "text-fg-primary font-semibold"
              : index < current
                ? "text-fg-secondary"
                : "text-fg-tertiary",
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex size-5 items-center justify-center rounded-full border text-caption1 tabular-nums",
              index === current
                ? "border-accent-solid bg-accent-solid text-fg-on-accent"
                : "border-line-control",
            )}
          >
            {index + 1}
          </span>
          {intl.formatMessage(label)}
          {index < labels.length - 1 && (
            <span aria-hidden="true" className="text-fg-tertiary ml-0.5">
              ›
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** The dialog content: header with the stepper, then the current step. */
function ImportFlow({
  uid,
  busy,
  onBusyChange,
  onCreate,
}: {
  uid: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onCreate: (result: ImportedCv) => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>({ step: "pick", problem: null });
  const intl = useIntl();
  const connectivity = useConnectivity();
  const upload = useRef<ImportUpload | null>(null);
  /** Bumped on cancel and unmount; late results of an older run are dropped. */
  const run = useRef(0);
  const stepRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(stage.step);

  useEffect(
    () => () => {
      run.current += 1;
      upload.current?.cancel();
    },
    [],
  );

  // Move focus into each new step so keyboard and screen-reader users follow along: to the step's
  // main control when it has one ("Choose file…"), else to the step itself.
  useEffect(() => {
    if (shownStep.current === stage.step) return;
    shownStep.current = stage.step;
    const target = stepRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? stepRef.current;
    target?.focus({ preventScroll: true });
  }, [stage.step]);

  const online = () => connectivity.status !== "offline" && navigator.onLine;

  const fail = (picked: Picked, storagePath: string | null, error: unknown) => {
    const kind = classifyImportError(error, { online: online() });
    setStage(
      kind === "canceled"
        ? { step: "pick", problem: null }
        : { step: "error", picked, storagePath, error: kind },
    );
  };

  const read = async (picked: Picked, storagePath: string) => {
    const id = ++run.current;
    setStage({ step: "read", picked, storagePath, startedAt: new Date() });
    try {
      const data = await requestCvImport(storagePath, picked.detected.requestKind);
      if (id !== run.current) return;
      const response = parseCvImportResponse(data);
      if (!response) {
        setStage({ step: "error", picked, storagePath, error: "badResponse" });
        return;
      }
      setStage({
        step: "review",
        picked,
        storagePath,
        response,
        review: buildReviewModel(response.resume, response.confidence),
      });
    } catch (error) {
      if (id === run.current) fail(picked, storagePath, error);
    }
  };

  const send = async (picked: Picked) => {
    const id = ++run.current;
    setStage({ step: "upload", picked, transferred: 0, total: picked.file.size });
    let current: ImportUpload;
    try {
      current = startImportUpload(uid, picked.file, picked.detected.contentType, (transferred, total) => {
        if (id === run.current) setStage({ step: "upload", picked, transferred, total });
      });
    } catch (error) {
      fail(picked, null, error);
      return;
    }
    upload.current = current;
    try {
      await current.done;
    } catch (error) {
      if (id === run.current) fail(picked, null, error);
      return;
    } finally {
      if (upload.current === current) upload.current = null;
    }
    if (id === run.current) await read(picked, current.storagePath);
  };

  const pick = (files: readonly File[]) => {
    const check = checkImportFiles(files);
    const [file] = files;
    if (!check.ok || !file) {
      setStage({ step: "pick", problem: check.ok ? "multiple" : check.problem });
      return;
    }
    void send({ file, detected: check.file });
  };

  const cancel = () => {
    run.current += 1;
    upload.current?.cancel();
    upload.current = null;
    setStage({ step: "pick", problem: null });
  };

  const create = async (
    picked: Picked,
    storagePath: string,
    review: ReviewModel,
    response: CvImportResponse,
    result: ImportReviewResult,
  ) => {
    onBusyChange(true);
    try {
      await onCreate(
        buildImportedCv({
          resume: applyReviewEdits(response.resume, review, result.values),
          title: result.title,
          language: result.language,
          locale: intl.locale,
          kind: picked.detected.kind,
          storagePath,
          fileName: picked.file.name,
        }),
      );
    } finally {
      onBusyChange(false);
    }
  };

  let body: ReactNode;
  switch (stage.step) {
    case "pick":
      body = <PickStep problem={stage.problem} onFiles={pick} />;
      break;
    case "upload":
    case "read": {
      const uploading = stage.step === "upload";
      const percent = uploading && stage.total > 0 ? Math.round((stage.transferred / stage.total) * 100) : 0;
      body = (
        <div className="flex flex-col gap-4 px-6 pt-2 pb-5">
          <ProgressNote
            label={
              uploading
                ? intl.formatMessage(messages.uploading, { fileName: stage.picked.file.name })
                : intl.formatMessage(messages.reading)
            }
            {...(stage.step === "read" && { startedAt: stage.startedAt })}
            steps={[
              { label: intl.formatMessage(messages.stepUpload), state: uploading ? "active" : "done" },
              { label: intl.formatMessage(messages.stepParse), state: uploading ? "pending" : "active" },
              { label: intl.formatMessage(messages.stepCheck), state: "pending" },
            ]}
          />
          {uploading && (
            <Progress.Root
              value={percent}
              aria-label={intl.formatMessage(messages.uploadProgress)}
              className="bg-surface-sunken h-1.5 w-full overflow-hidden rounded-full"
            >
              <Progress.Indicator
                className="bg-accent-solid h-full transition-[width] duration-(--bfhr-duration-fast)"
                style={{ width: `${percent}%` }}
              />
            </Progress.Root>
          )}
          <div className="flex justify-end">
            <Button onClick={cancel}>{intl.formatMessage(messages.cancel)}</Button>
          </div>
        </div>
      );
      break;
    }
    case "error": {
      const recovery = IMPORT_ERROR_RECOVERY[stage.error];
      const [titleKey, bodyKey] = ERROR_COPY[stage.error];
      const { picked, storagePath } = stage;
      // Re-read the stored file when the upload finished; otherwise upload it again.
      const retry =
        recovery === "upload" || recovery === "again"
          ? storagePath === null || recovery === "upload"
            ? "upload"
            : "read"
          : null;
      body = (
        <div className="flex flex-col gap-4 px-6 pt-2 pb-5">
          <InlineAlert
            tone="error"
            fromAction
            title={intl.formatMessage(ERROR_MESSAGES[titleKey])}
            {...(retry !== null && {
              action: {
                label: intl.formatMessage(retry === "upload" ? messages.uploadAgain : messages.tryAgain),
                onClick: () =>
                  void (storagePath === null || retry === "upload"
                    ? send(picked)
                    : read(picked, storagePath)),
              },
            })}
          >
            <p>{intl.formatMessage(ERROR_MESSAGES[bodyKey])}</p>
            <p className="text-fg-secondary mt-1 truncate text-footnote">{picked.file.name}</p>
          </InlineAlert>
          <div className="flex justify-end">
            <Button
              variant={retry !== null ? "secondary" : "primary"}
              onClick={() => setStage({ step: "pick", problem: null })}
            >
              {intl.formatMessage(messages.tryAnother)}
            </Button>
          </div>
        </div>
      );
      break;
    }
    case "review": {
      const { picked, storagePath, review, response } = stage;
      body = (
        <div className="flex min-h-0 flex-1 flex-col">
          <ImportReview
            review={review}
            warnings={response.warnings}
            fileName={picked.file.name}
            kind={picked.detected.kind}
            aiAssisted={response.model !== "none"}
            defaultTitle={defaultImportTitle(picked.file.name, picked.detected.kind, response.resume)}
            defaultLanguage={guessCvLanguage(response.resume, intl.locale)}
            onCreate={(result) => create(picked, storagePath, review, response, result)}
            onTryAnotherFile={() => setStage({ step: "pick", problem: null })}
          />
        </div>
      );
      break;
    }
  }

  const reviewing = stage.step === "review";
  return (
    <Dialog.Content
      // A stray click outside must not throw away an upload or a half-checked review.
      onInteractOutside={(event) => event.preventDefault()}
      // Nor a reflex Esc: during the review only the Close button leaves, so half-checked work
      // isn't lost by accident.
      onEscapeKeyDown={(event) => {
        if (stage.step === "review") event.preventDefault();
      }}
      // Start on "Choose file…" rather than the Close button.
      onOpenAutoFocus={(event) => {
        const target = stepRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        if (!target) return;
        event.preventDefault();
        target.focus();
      }}
      // Only the pick step has a description; the other steps announce themselves (live regions).
      {...(stage.step !== "pick" && { "aria-describedby": undefined })}
      className={cx(
        contentClass,
        reviewing
          ? "h-[min(820px,calc(100vh-48px))] w-[min(960px,calc(100vw-32px))]"
          : "w-[min(560px,calc(100vw-32px))]",
      )}
    >
      <div className="flex items-start gap-4 px-6 pt-5 pb-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Dialog.Title className="font-display text-title3">
            {intl.formatMessage(reviewing ? messages.reviewTitle : messages.title)}
          </Dialog.Title>
          <Stepper current={stage.step === "pick" ? 0 : reviewing ? 2 : 1} />
        </div>
        <Dialog.Close asChild>
          <IconButton
            icon={X}
            label={intl.formatMessage(messages.close)}
            disabledReason={busy ? intl.formatMessage(messages.closeBusy) : null}
          />
        </Dialog.Close>
      </div>
      {/* Focus lands here on each new step so keyboard and screen-reader users follow along. */}
      <div ref={stepRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
        {body}
      </div>
    </Dialog.Content>
  );
}

function PickStep({
  problem,
  onFiles,
}: {
  problem: ImportFileProblem | null;
  onFiles: (files: readonly File[]) => void;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const formatsId = useId();
  const [dragging, setDragging] = useState(false);
  const { status } = useConnectivity();
  const offline = status === "offline";

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!offline) onFiles([...event.dataTransfer.files]);
  };

  const problemCopy = problem ? PROBLEM_COPY[problem] : null;
  return (
    <div className="flex flex-col gap-4 px-6 pt-1 pb-5">
      <Dialog.Description className="text-fg-secondary text-callout">
        {intl.formatMessage(messages.intro)}
      </Dialog.Description>
      <div
        onDragEnter={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = offline ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={cx(
          "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-(--bfhr-duration-fast)",
          dragging ? "border-accent-solid bg-accent-subtle" : "border-line-control bg-surface-sunken",
        )}
      >
        <Upload aria-hidden="true" className="text-fg-secondary size-7" strokeWidth={1.5} />
        <p className="text-headline">
          {intl.formatMessage(dragging ? messages.dropActive : messages.dropTitle)}
        </p>
        <NeedsConnection explanation={intl.formatMessage(messages.needsConnection)}>
          {(reason) => (
            <Button
              variant="primary"
              data-autofocus
              aria-describedby={formatsId}
              disabledReason={reason}
              onClick={() => inputRef.current?.click()}
            >
              {intl.formatMessage(messages.choose)}
            </Button>
          )}
        </NeedsConnection>
        <p id={formatsId} className="text-fg-secondary text-footnote">
          {intl.formatMessage(messages.formats)}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (files.length > 0) onFiles(files);
          }}
        />
      </div>
      {problemCopy && (
        <InlineAlert tone="warning" title={intl.formatMessage(problemCopy[0])}>
          {intl.formatMessage(problemCopy[1])}
        </InlineAlert>
      )}
      <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.dataUse)}</p>
    </div>
  );
}
