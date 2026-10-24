/**
 * Apply by email (BRIEF §4.4, research/apply.md "Decision — Desktop", decisions.md D21–D24, F6):
 * a two-step composer the Jobs screen mounts for `?apply=1` on a posting that takes email.
 *
 * - **Compose:** From (accounts that can send), To (prefilled from the posting, with its source),
 *   Subject and Body from templates in the posting's language, the CV (its current version or the
 *   one tailored for this job; "Tailor for this job" opens the tailor review), an optional cover
 *   letter (`CoverLetterEditor`: templates, tone, language, AI draft), "Fields to fill" for merge
 *   fields without a value, and extra attachments (`AttachmentPicker`). `Mod+Enter` → Review.
 * - **Review:** "Sending details" (From, To, Subject, attachments with sizes) above the message
 *   with every merge field filled; the PDFs are made here. With an account, "Send to …" schedules
 *   the email (`mailSend`; device files are uploaded first): a toast counts down the 10 s undo
 *   window (Undo · Send now), and the application's `emailSend` reports sent or failed. Without
 *   one, the user saves the PDFs, opens the message in their mail app and confirms with "I sent
 *   it" (`recordApplied`, files pinned).
 *
 * `Esc` closes; the draft stays in memory for the session (`session.ts`).
 */
import type { MailSendAttachment } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheck, Copy, Download, Mail, Send } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsRepository } from "../../data/jobs/repository";
import { useTrackerData } from "../../data/tracker/live";
import { useTrackerRepository } from "../../data/tracker/repository";
import { saveExportFile } from "../../lib/cvExport";
import { openMailto } from "../../lib/desktop";
import { useConnectivity } from "../../shared/connectivity";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { useToast } from "../../shared/ui/Toast";
import { AttachmentChip, type AttachmentChipVM, AttachmentPicker } from "./AttachmentPicker";
import { CoverLetterEditor, FieldsToFill } from "./CoverLetterEditor";
import { CvField } from "./CvField";
import { designSessionSuffix } from "./designState";
import { ApplyGate } from "./gate";
import {
  type ApplyInput,
  applyRecord,
  attachmentsTooLarge,
  blockerSentence,
  buildSendRequest,
  composerModel,
  draftBlocker,
  extraAttachment,
  extraBytes,
  extraName,
  fileSize,
  mailtoMessage,
  parseRecipients,
  sendErrorKind,
  sendErrorSentence,
  sendingAccounts,
  toggleLetter,
} from "./model";
import { useApplyDocuments } from "./useApplyDocuments";
import { BlockerLine, Field, inputClass, Outcome, OutcomeFooter, Shell, textareaClass } from "./ui";

const messages = defineMessages({
  fallbackTitle: { id: "apply.email.panel.fallbackTitle", defaultMessage: "Apply by email" },
  keyGroup: { id: "apply.email.panel.keyGroup", defaultMessage: "Apply" },
  keyPrimary: { id: "apply.email.panel.keyPrimary", defaultMessage: "Review, then send the application" },
  from: { id: "apply.email.panel.from", defaultMessage: "From" },
  to: { id: "apply.email.panel.to", defaultMessage: "To" },
  subject: { id: "apply.email.panel.subject", defaultMessage: "Subject" },
  message: { id: "apply.email.panel.message", defaultMessage: "Message" },
  letterToggle: { id: "apply.email.panel.letterToggle", defaultMessage: "Attach a cover letter" },
  letter: { id: "apply.email.panel.letter", defaultMessage: "Cover letter" },
  letterHint: {
    id: "apply.email.panel.letterHint",
    defaultMessage: "Attached as a PDF in your CV's design and saved with this application.",
  },
  attachments: { id: "apply.email.panel.attachments", defaultMessage: "Attachments" },
  attaching: {
    id: "apply.email.panel.attaching",
    defaultMessage: "Attaching: {files}",
    description: "Compose footer when nothing blocks Review: the files that go with the email",
  },
  noAccount: {
    id: "apply.email.panel.noAccount",
    defaultMessage: "Connect an email account to send from the app. Until then, you send it from your mail app.",
  },
  review: { id: "apply.email.panel.review", defaultMessage: "Review email" },
  edit: { id: "apply.email.panel.edit", defaultMessage: "Edit" },
  details: { id: "apply.email.panel.details", defaultMessage: "Sending details" },
  noSender: { id: "apply.email.panel.noSender", defaultMessage: "Your mail app" },
  preparing: { id: "apply.email.panel.preparing", defaultMessage: "Preparing your PDFs…" },
  prepareFailed: {
    id: "apply.email.panel.prepareFailed",
    defaultMessage: "Couldn't make the PDFs. Your draft is saved.",
  },
  tryAgain: { id: "apply.email.panel.tryAgain", defaultMessage: "Try again" },
  sending: { id: "apply.email.panel.sending", defaultMessage: "Sending…" },
  saving: { id: "apply.email.panel.saving", defaultMessage: "Saving…" },
  mailAppTitle: { id: "apply.email.panel.mailAppTitle", defaultMessage: "Send it from your mail app" },
  mailAppStepFiles: {
    id: "apply.email.panel.mailAppStepFiles",
    defaultMessage: "Save the PDFs to attach them.",
  },
  mailAppStepOpen: {
    id: "apply.email.panel.mailAppStepOpen",
    defaultMessage: "Open the message in your mail app, attach the PDFs and send it.",
  },
  mailAppStepDone: {
    id: "apply.email.panel.mailAppStepDone",
    defaultMessage: "Then mark it as sent here, so your tracker keeps the files you used.",
  },
  saveCv: { id: "apply.email.panel.saveCv", defaultMessage: "Save CV as PDF" },
  saveLetter: { id: "apply.email.panel.saveLetter", defaultMessage: "Save cover letter as PDF" },
  openMailApp: { id: "apply.email.panel.openMailApp", defaultMessage: "Open in your mail app" },
  copyMessage: { id: "apply.email.panel.copyMessage", defaultMessage: "Copy message" },
  iSentIt: { id: "apply.email.panel.iSentIt", defaultMessage: "I sent it" },
  savedFile: { id: "apply.email.panel.savedFile", defaultMessage: "Saved {fileName}" },
  saveFailed: { id: "apply.email.panel.saveFailed", defaultMessage: "Couldn't save the file. Try again." },
  mailAppFailed: {
    id: "apply.email.panel.mailAppFailed",
    defaultMessage: "Couldn't open your mail app. Copy the message and paste it there instead.",
  },
  copied: { id: "apply.email.panel.copied", defaultMessage: "Message copied" },
  copyFailed: { id: "apply.email.panel.copyFailed", defaultMessage: "Couldn't copy the message. Select it and copy it instead." },
  sendingToast: {
    id: "apply.email.panel.sendingToast",
    defaultMessage: "Sending to {address}",
    description: "Undo-send toast; the toast adds the live countdown 'Sends in 9 s'",
  },
  undo: { id: "apply.email.panel.undo", defaultMessage: "Undo" },
  sendNow: { id: "apply.email.panel.sendNow", defaultMessage: "Send now" },
  notSent: { id: "apply.email.panel.notSent", defaultMessage: "Not sent. Your draft is saved." },
  sentToast: { id: "apply.email.panel.sentToast", defaultMessage: "Sent to {company}. Marked as Applied." },
  viewInTracker: { id: "apply.email.panel.viewInTracker", defaultMessage: "View in Tracker" },
  markedApplied: { id: "apply.email.panel.markedApplied", defaultMessage: "Marked as applied: {company}" },
  sendingTitle: { id: "apply.email.panel.sendingTitle", defaultMessage: "Sending to {address}" },
  sendsIn: {
    id: "apply.email.panel.sendsIn",
    defaultMessage: "{seconds, plural, one {Sends in # second. You can still undo it.} other {Sends in # seconds. You can still undo it.}}",
  },
  sendingNow: { id: "apply.email.panel.sendingNow", defaultMessage: "On its way…" },
  sentTitle: { id: "apply.email.panel.sentTitle", defaultMessage: "Sent to {company}" },
  sentBody: {
    id: "apply.email.panel.sentBody",
    defaultMessage: "Marked as Applied. Your tracker keeps the files you sent.",
  },
  failedTitle: { id: "apply.email.panel.failedTitle", defaultMessage: "Couldn't send to {address}" },
  failedBody: {
    id: "apply.email.panel.failedBody",
    defaultMessage: "Your draft is saved. Check the details and try again.",
  },
  recordedTitle: { id: "apply.email.panel.recordedTitle", defaultMessage: "Marked as applied" },
  recordedBody: {
    id: "apply.email.panel.recordedBody",
    defaultMessage: "{company} is in your tracker as Applied, with the files you sent.",
  },
});

/** A CV PDF is about this size; the size check uses it until the real PDFs are made. */
const PDF_ESTIMATE_BYTES = 120_000;

// ─── Entry ─────────────────────────────────────────────────────────────────────────────────────

/** The email composer for `jobId`; reads its data itself. `onClose` keeps the draft. */
export function EmailApplyPanel({
  jobId,
  onClose,
  onTailor,
}: {
  readonly jobId: string;
  readonly onClose: () => void;
  /** "Tailor for this job": opens the tailor review for this CV version (null = its current one). */
  readonly onTailor: (cvId: string, revisionId: string | null) => void;
}) {
  const intl = useIntl();
  return (
    <ApplyGate jobId={jobId} fallbackTitle={intl.formatMessage(messages.fallbackTitle)} onClose={onClose}>
      {(input) => (
        // Design build: a forced state (`?letter=ai`) starts its own composer (designState.ts).
        <Composer key={`${jobId}${__BFHR_DESIGN__ ? designSessionSuffix() : ""}`} input={input} onClose={onClose} onTailor={onTailor} />
      )}
    </ApplyGate>
  );
}

// ─── Composer ──────────────────────────────────────────────────────────────────────────────────

/** Whole seconds until `sendAt`, ticking while the send is scheduled (the real clock, like the toast). */
function useSecondsUntil(sendAt: Date | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sendAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [sendAt]);
  return sendAt === null ? 0 : Math.max(0, Math.ceil((sendAt.getTime() - now) / 1000));
}

type Busy = "sending" | "recording" | null;

function Composer({
  input,
  onClose,
  onTailor,
}: {
  readonly input: ApplyInput;
  readonly onClose: () => void;
  readonly onTailor: (cvId: string, revisionId: string | null) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const repository = useJobsRepository();
  const trackerRepository = useTrackerRepository();
  const tracker = useTrackerData();
  const online = useConnectivity().status !== "offline";
  const { job } = input;

  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const documents = useApplyDocuments(input, { makePdfs: (current) => current.step === "review" });
  const { session, draft, update, values, resolved, pdfs, pdfsFailed, revision } = documents;
  const ctx = { intl, locale: intl.locale, ...documents.ctx };
  const model = composerModel(input, draft, values, { online }, ctx);
  const accounts = sendingAccounts(input.mailAccounts);
  const accountId = accounts.find((account) => account.id === draft.accountId)?.id ?? accounts[0]?.id ?? null;
  const account = accounts.find((candidate) => candidate.id === accountId) ?? null;
  const recipients = parseRecipients(draft.to).addresses;
  const firstAddress = recipients[0] ?? draft.to.trim();

  const reviewBlocker = draftBlocker(draft, values, { online: true, canSend: account !== null });
  const actionBlocker = draftBlocker(draft, values, { online, canSend: account !== null });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ids = { from: useId(), to: useId(), subject: useId(), body: useId(), letterOn: useId(), blocker: useId() };

  const edit = (patch: Partial<typeof draft>) => {
    setActionError(null);
    documents.edit(patch);
  };

  // Focus the heading when the step (or outcome) changes, so screen readers hear where they are.
  const sendApplication = tracker.status === "ready" && session.sendApplicationId !== null
    ? (tracker.data.applications.find((candidate) => candidate.id === session.sendApplicationId) ?? null)
    : null;
  const emailSend = sendApplication?.emailSend ?? null;
  const sendState = session.sendApplicationId === null ? null : (emailSend?.state ?? "scheduled");
  const view =
    session.recordedApplicationId !== null
      ? "recorded"
      : sendState === "sent"
        ? "sent"
        : sendState === "failed"
          ? "failed"
          : sendState === "scheduled" || sendState === "sending"
            ? "sending"
            : model.applied
              ? "applied"
              : session.step;
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);
  // Design build: the forced letter state opens scrolled to the letter (critique captures).
  useEffect(() => {
    if (__BFHR_DESIGN__ && designSessionSuffix() !== "")
      document.getElementById(ids.letterOn)?.scrollIntoView({ block: "start" });
    // Once, when the forced state opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openTracker = useCallback(
    (applicationId: string) => void navigate({ to: "/tracker/applications/$applicationId", params: { applicationId } }),
    [navigate],
  );

  // Outcome of the send, as the application's `emailSend` reports it (F6).
  const lastState = useRef(sendState);
  useEffect(() => {
    if (sendState === lastState.current) return;
    lastState.current = sendState;
    const applicationId = session.sendApplicationId;
    if (sendState === "sent" && applicationId !== null) {
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.sentToast, { company: job.company }),
        action: { label: intl.formatMessage(messages.viewInTracker), run: () => openTracker(applicationId) },
      });
    }
    // "cancelled" (Undo here or on another device) needs nothing: the view falls back to Review.
  }, [sendState, session.sendApplicationId, toast, intl, job.company, openTracker]);

  const sendAt = emailSend?.sendAt ?? session.sendAt;
  const secondsLeft = useSecondsUntil(view === "sending" ? sendAt : null);

  const failMessage = (error: unknown) => sendErrorSentence(sendErrorKind(error, online), ctx);

  const undoSend = async (applicationId: string) => {
    try {
      await repository.cancelEmail(applicationId);
      update((current) => ({ ...current, sendApplicationId: null, sendAt: null, step: "review" }));
      toast.show({ variant: "info", message: intl.formatMessage(messages.notSent) });
    } catch (error) {
      toast.show({ variant: "info", message: failMessage(error) });
    }
  };

  const sendNow = (applicationId: string) => {
    repository.sendEmailNow(applicationId).catch((error: unknown) => {
      toast.show({ variant: "info", message: failMessage(error) });
    });
  };

  /** Device files go to Storage first (`mail-attachments`); rendered files go by id. */
  const extraAttachments = async (): Promise<MailSendAttachment[]> =>
    Promise.all(
      draft.extras.map(async (extra) =>
        extraAttachment(
          extra,
          extra.kind === "local"
            ? (await repository.uploadMailAttachment({ fileName: extra.fileName, contentType: extra.contentType, bytes: extra.bytes }))
                .storagePath
            : null,
        ),
      ),
    );

  const send = async () => {
    if (busy !== null || actionBlocker !== null || accountId === null || pdfs === null) return;
    setBusy("sending");
    setActionError(null);
    try {
      const pins = await documents.uploadPins(pdfs);
      const extras = await extraAttachments();
      const response = await repository.sendEmail(
        buildSendRequest(resolved, draft, { accountId, applicationId: input.application?.id ?? null, jobId: job.id }, pins, extras),
      );
      const scheduledAt = new Date(response.sendAt);
      update((current) => ({ ...current, sendApplicationId: response.applicationId, sendAt: scheduledAt }));
      toast.show({
        variant: "undoSend",
        message: intl.formatMessage(messages.sendingToast, { address: firstAddress }),
        sendAt: scheduledAt,
        action: { label: intl.formatMessage(messages.undo), run: () => void undoSend(response.applicationId) },
        sendNow: () => sendNow(response.applicationId),
      });
    } catch (error) {
      console.error("Email apply failed", error);
      setActionError(failMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const undoRecord = (recorded: { readonly applicationId: string; readonly eventId: string | null; readonly created: boolean }) => {
    update((current) => ({ ...current, recordedApplicationId: null }));
    if (recorded.created) {
      trackerRepository.deleteApplications([recorded.applicationId]);
      return;
    }
    const data = tracker.status === "ready" ? tracker.data : null;
    const application = data?.applications.find((candidate) => candidate.id === recorded.applicationId);
    const event = data?.applicationEvents.find((candidate) => candidate.id === recorded.eventId);
    if (!data || !application || !event) return;
    trackerRepository.undo([
      {
        application,
        event,
        events: data.applicationEvents.filter((candidate) => candidate.applicationId === application.id),
      },
    ]);
  };

  const recordSent = async () => {
    if (busy !== null || actionBlocker !== null || pdfs === null) return;
    setBusy("recording");
    setActionError(null);
    try {
      const pins = await documents.uploadPins(pdfs);
      const recorded = repository.recordApplied(applyRecord(input, pins)).ids;
      update((current) => ({ ...current, recordedApplicationId: recorded.applicationId }));
      toast.show({
        variant: "undo",
        message: intl.formatMessage(messages.markedApplied, { company: job.company }),
        action: { label: intl.formatMessage(messages.undo), run: () => undoRecord(recorded) },
        secondaryAction: {
          label: intl.formatMessage(messages.viewInTracker),
          run: () => openTracker(recorded.applicationId),
        },
      });
    } catch (error) {
      console.error("Recording the email application failed", error);
      setActionError(failMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const savePdf = async (file: { readonly fileName: string; readonly bytes: Uint8Array }) => {
    try {
      const path = await saveExportFile(file.bytes, file.fileName, "pdf");
      if (path !== null)
        toast.show({ variant: "info", message: intl.formatMessage(messages.savedFile, { fileName: file.fileName }) });
    } catch (error) {
      console.error("Saving the PDF failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.saveFailed) });
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(resolved.body);
      toast.show({ variant: "info", message: intl.formatMessage(messages.copied) });
    } catch {
      toast.show({ variant: "info", message: intl.formatMessage(messages.copyFailed) });
    }
  };

  const openMailApp = async () => {
    try {
      await openMailto(mailtoMessage(resolved, draft));
    } catch (error) {
      console.error("Opening the mail app failed", error);
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.mailAppFailed),
        action: { label: intl.formatMessage(messages.copyMessage), run: () => void copyMessage() },
      });
    }
  };

  const goReview = () => {
    if (reviewBlocker !== null) return;
    setActionError(null);
    update((current) => ({ ...current, step: "review" }));
  };

  const primary =
    view === "compose" ? goReview : view === "review" ? (account ? () => void send() : () => void recordSent()) : null;
  useKeyBindings([
    {
      id: "apply.primary",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.keyPrimary),
      group: intl.formatMessage(messages.keyGroup),
      enabled: primary !== null,
      run: (event) => {
        event.preventDefault();
        primary?.();
      },
    },
  ]);

  const extrasBytes = draft.extras.reduce((sum, extra) => sum + extraBytes(extra), 0);
  const pdfBytes = pdfs
    ? pdfs.cv.bytes.byteLength + (pdfs.letter?.bytes.byteLength ?? 0)
    : PDF_ESTIMATE_BYTES * (draft.letterOn ? 2 : 1);
  const tooLarge = pdfs ? attachmentsTooLarge(pdfBytes + extrasBytes, account?.provider ?? null, ctx) : null;
  const cv = input.cvs.find((candidate) => candidate.id === draft.cvId) ?? null;
  const chips: AttachmentChipVM[] = [
    ...(cv
      ? [{ key: "cv", name: pdfs?.cv.fileName ?? cv.title, size: pdfs ? fileSize(pdfs.cv.bytes.byteLength, ctx.locale) : null, removable: false }]
      : []),
    ...(draft.letterOn
      ? [{
          key: "letter",
          name: pdfs?.letter?.fileName ?? intl.formatMessage(messages.letter),
          size: pdfs?.letter ? fileSize(pdfs.letter.bytes.byteLength, ctx.locale) : null,
          removable: false,
        }]
      : []),
    ...draft.extras.map((extra) => ({
      key: extra.key,
      name: extraName(extra),
      size: fileSize(extraBytes(extra), ctx.locale),
      removable: true,
    })),
  ];
  const shell = { title: model.title, subtitle: model.subtitle, headingRef, onClose };

  // ── Outcomes ──
  if (view === "applied" && model.applied) {
    const applicationId = input.application?.id;
    return (
      <Shell {...shell}>
        <EmptyState
          kind="subArea"
          body={model.applied.text}
          {...(applicationId
            ? {
                primary: { label: intl.formatMessage(messages.viewInTracker), onClick: () => openTracker(applicationId) },
              }
            : {})}
        />
      </Shell>
    );
  }
  if (view === "sending" && session.sendApplicationId !== null) {
    const applicationId = session.sendApplicationId;
    return (
      <Shell {...shell}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Send aria-hidden="true" className="text-accent-text mt-1 size-5 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-body font-semibold">{intl.formatMessage(messages.sendingTitle, { address: firstAddress })}</p>
              <p role="timer" className="text-fg-secondary text-callout tabular-nums">
                {secondsLeft > 0 && sendState === "scheduled"
                  ? intl.formatMessage(messages.sendsIn, { seconds: secondsLeft })
                  : intl.formatMessage(messages.sendingNow)}
              </p>
            </div>
          </div>
          {sendState === "scheduled" && secondsLeft > 0 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void undoSend(applicationId)}>
                {intl.formatMessage(messages.undo)}
              </Button>
              <Button variant="plain" onClick={() => sendNow(applicationId)}>
                {intl.formatMessage(messages.sendNow)}
              </Button>
            </div>
          )}
        </div>
      </Shell>
    );
  }
  if (view === "sent" && session.sendApplicationId !== null) {
    const applicationId = session.sendApplicationId;
    return (
      <Shell {...shell} footer={<OutcomeFooter onView={() => openTracker(applicationId)} onClose={onClose} />}>
        <Outcome title={intl.formatMessage(messages.sentTitle, { company: job.company })} body={intl.formatMessage(messages.sentBody)} />
      </Shell>
    );
  }
  if (view === "recorded" && session.recordedApplicationId !== null) {
    const applicationId = session.recordedApplicationId;
    return (
      <Shell {...shell} footer={<OutcomeFooter onView={() => openTracker(applicationId)} onClose={onClose} />}>
        <Outcome
          title={intl.formatMessage(messages.recordedTitle)}
          body={intl.formatMessage(messages.recordedBody, { company: job.company })}
        />
      </Shell>
    );
  }
  if (view === "failed") {
    return (
      <Shell {...shell}>
        <InlineAlert
          tone="error"
          fromAction
          title={intl.formatMessage(messages.failedTitle, { address: firstAddress })}
          action={{
            label: intl.formatMessage(messages.tryAgain),
            onClick: () => update((current) => ({ ...current, sendApplicationId: null, sendAt: null, step: "review" })),
          }}
        >
          {intl.formatMessage(messages.failedBody)}
        </InlineAlert>
      </Shell>
    );
  }

  // ── Review ──
  if (view === "review") {
    const ready = pdfs !== null;
    const blocked = actionBlocker
      ? blockerSentence(actionBlocker, ctx)
      : (tooLarge ?? (ready ? null : intl.formatMessage(pdfsFailed ? messages.prepareFailed : messages.preparing)));
    const footer = (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {actionError && (
            <p role="alert" className="text-danger-text text-footnote">
              {actionError}
            </p>
          )}
          <BlockerLine id={ids.blocker} text={actionError ? null : blocked} />
        </div>
        <Button variant="secondary" onClick={() => update((current) => ({ ...current, step: "compose" }))}>
          {intl.formatMessage(messages.edit)}
        </Button>
        {account ? (
          <Button
            variant="primary"
            icon={Send}
            shortcut="Mod+Enter"
            loading={busy === "sending"}
            loadingLabel={intl.formatMessage(messages.sending)}
            disabledReason={blocked}
            className="max-w-[min(100%,24rem)]"
            onClick={() => void send()}
          >
            <span className="block truncate">{model.sendLabel}</span>
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={CircleCheck}
            shortcut="Mod+Enter"
            loading={busy === "recording"}
            loadingLabel={intl.formatMessage(messages.saving)}
            disabledReason={blocked}
            onClick={() => void recordSent()}
          >
            {intl.formatMessage(messages.iSentIt)}
          </Button>
        )}
      </div>
    );
    return (
      <Shell {...shell} footer={footer}>
        <div className="flex flex-col gap-4">
          <section aria-label={intl.formatMessage(messages.details)} className="border-line-subtle rounded-lg border p-4">
            <h3 className="text-callout font-semibold">{intl.formatMessage(messages.details)}</h3>
            <dl className="text-callout mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2">
              <dt className="text-fg-secondary">{intl.formatMessage(messages.from)}</dt>
              <dd className="min-w-0 truncate">{account ? account.address : intl.formatMessage(messages.noSender)}</dd>
              <dt className="text-fg-secondary">{intl.formatMessage(messages.to)}</dt>
              <dd className="min-w-0 break-words">{recipients.join(", ")}</dd>
              <dt className="text-fg-secondary">{intl.formatMessage(messages.subject)}</dt>
              <dd className="min-w-0 break-words">{resolved.subject}</dd>
              <dt className="text-fg-secondary">{intl.formatMessage(messages.attachments)}</dt>
              <dd className="min-w-0">
                <ul className="flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <AttachmentChip key={chip.key} chip={{ ...chip, removable: false }} />
                  ))}
                </ul>
              </dd>
            </dl>
            {pdfsFailed && (
              <InlineAlert
                tone="error"
                className="mt-3"
                title={intl.formatMessage(messages.prepareFailed)}
                action={{ label: intl.formatMessage(messages.tryAgain), onClick: documents.retryPdfs }}
              />
            )}
          </section>
          <section aria-label={intl.formatMessage(messages.message)}>
            <h3 className="text-footnote text-fg-secondary font-medium">{intl.formatMessage(messages.message)}</h3>
            <p className="bg-surface-sunken text-callout mt-1 rounded-md p-3 leading-relaxed whitespace-pre-wrap">{resolved.body}</p>
          </section>
          {!account && (
            <section aria-label={intl.formatMessage(messages.mailAppTitle)} className="flex flex-col gap-3">
              <h3 className="text-callout font-semibold">{intl.formatMessage(messages.mailAppTitle)}</h3>
              <ol className="text-callout flex list-decimal flex-col gap-3 pl-5">
                <li>
                  <p>{intl.formatMessage(messages.mailAppStepFiles)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      icon={Download}
                      disabledReason={pdfs ? null : intl.formatMessage(messages.preparing)}
                      onClick={() => pdfs && void savePdf(pdfs.cv)}
                    >
                      {intl.formatMessage(messages.saveCv)}
                    </Button>
                    {draft.letterOn && (
                      <Button
                        icon={Download}
                        disabledReason={pdfs?.letter ? null : intl.formatMessage(messages.preparing)}
                        onClick={() => pdfs?.letter && void savePdf(pdfs.letter)}
                      >
                        {intl.formatMessage(messages.saveLetter)}
                      </Button>
                    )}
                  </div>
                </li>
                <li>
                  <p>{intl.formatMessage(messages.mailAppStepOpen)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button icon={Mail} onClick={() => void openMailApp()}>
                      {intl.formatMessage(messages.openMailApp)}
                    </Button>
                    <Button variant="plain" icon={Copy} onClick={() => void copyMessage()}>
                      {intl.formatMessage(messages.copyMessage)}
                    </Button>
                  </div>
                </li>
                <li>
                  <p>{intl.formatMessage(messages.mailAppStepDone)}</p>
                </li>
              </ol>
              <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.noAccount)}</p>
            </section>
          )}
        </div>
      </Shell>
    );
  }

  // ── Compose ──
  const reviewReason = reviewBlocker ? blockerSentence(reviewBlocker, ctx) : null;
  const footer = (
    <div className="flex items-center gap-3">
      {/* Nothing blocks: say what goes with the email, since the attachments sit below the fold. */}
      <BlockerLine
        id={ids.blocker}
        text={reviewReason ?? intl.formatMessage(messages.attaching, { files: chips.map((chip) => chip.name).join(" · ") })}
      />
      <Button variant="primary" shortcut="Mod+Enter" disabledReason={reviewReason} onClick={goReview}>
        {intl.formatMessage(messages.review)}
      </Button>
    </div>
  );
  const revisionRef =
    draft.cvId !== null && revision.status === "ready" && revision.value
      ? { cvId: draft.cvId, revisionId: revision.value.id }
      : null;
  return (
    <Shell {...shell} footer={footer}>
      <form
        className="flex max-w-[44rem] flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          goReview();
        }}
      >
        {model.accounts.length > 0 ? (
          <Field id={ids.from} label={intl.formatMessage(messages.from)}>
            <select
              id={ids.from}
              value={accountId ?? ""}
              onChange={(event) => edit({ accountId: event.target.value })}
              className={inputClass}
            >
              {model.accounts.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-fg-secondary text-footnote flex items-start gap-2">
            <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>{intl.formatMessage(messages.noAccount)}</span>
          </p>
        )}
        <Field id={ids.to} label={intl.formatMessage(messages.to)} hint={model.toSource}>
          <input
            id={ids.to}
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={draft.to}
            aria-describedby={model.toSource ? `${ids.to}-hint` : undefined}
            aria-invalid={reviewBlocker?.kind === "invalidRecipient" || reviewBlocker?.kind === "noRecipient" ? true : undefined}
            onChange={(event) => edit({ to: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id={ids.subject} label={intl.formatMessage(messages.subject)} hint={model.languageHint}>
          <input
            id={ids.subject}
            type="text"
            value={draft.subject}
            maxLength={998}
            aria-describedby={`${ids.subject}-hint`}
            onChange={(event) => edit({ subject: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id={ids.body} label={intl.formatMessage(messages.message)}>
          <textarea
            id={ids.body}
            rows={9}
            value={draft.body}
            onChange={(event) => edit({ body: event.target.value, bodyEdited: true })}
            className={textareaClass}
          />
        </Field>
        <CvField
          options={model.cvs}
          draft={draft}
          online={online}
          onChange={edit}
          onTailor={() => draft.cvId !== null && onTailor(draft.cvId, draft.cvRevisionId)}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.letterOn} className="text-callout inline-flex items-center gap-2 self-start">
            <input
              id={ids.letterOn}
              type="checkbox"
              checked={draft.letterOn}
              onChange={(event) => update((current) => ({ ...current, draft: toggleLetter(current.draft, event.target.checked, input) }))}
              className="accent-accent-solid size-4"
            />
            {intl.formatMessage(messages.letterToggle)}
          </label>
          {draft.letterOn && (
            <>
              <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.letterHint)}</p>
              <CoverLetterEditor
                input={input}
                draft={draft}
                values={values}
                revision={revisionRef}
                aiEnabled={input.profile?.aiEnabled ?? true}
                onChange={edit}
              />
            </>
          )}
        </div>
        <FieldsToFill fields={resolved.unresolved} draft={draft} onChange={edit} />
        <AttachmentPicker
          chips={chips}
          draft={draft}
          renderedFiles={input.renderedFiles}
          provider={account?.provider ?? null}
          accountLabel={account?.address ?? null}
          pdfBytes={pdfBytes}
          onAdd={(extras) => edit({ extras: [...draft.extras, ...extras] })}
          onRemove={(key) => edit({ extras: draft.extras.filter((extra) => extra.key !== key) })}
        />
      </form>
    </Shell>
  );
}
