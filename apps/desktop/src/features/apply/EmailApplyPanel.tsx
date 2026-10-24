/**
 * Apply by email (BRIEF §4.4, research/apply.md "Decision — Desktop", decisions.md D21–D24, F6):
 * a two-step composer the Jobs screen mounts for `?apply=1`.
 *
 * - **Compose:** From (accounts that can send), To (prefilled from the posting, with its source),
 *   Subject and Body from templates in the posting's language, the CV (pinned to its current
 *   revision) and an optional cover letter. `Mod+Enter` → Review.
 * - **Review:** "Sending details" (From, To, Subject, attachments with sizes) above the message;
 *   the PDFs are made here. With an account, "Send to …" schedules the email (`mailSend`): a
 *   toast counts down the 10 s undo window (Undo · Send now), and the application's `emailSend`
 *   reports sent or failed. Without one, the user saves the PDFs, opens the message in their mail
 *   app and confirms with "I sent it" (`recordApplied`, files pinned).
 *
 * `Esc` closes; the draft stays in memory for the session (`session.ts`).
 */
import type { CvRevision } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheck, Copy, Download, FileText, Mail, Send, X } from "lucide-react";
import { type ReactNode, type Ref, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { useJobsRepository } from "../../data/jobs/repository";
import { displayTimeZone, useTrackerData } from "../../data/tracker/live";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { type Lookup, useTrackerRepository } from "../../data/tracker/repository";
import { saveExportFile } from "../../lib/cvExport";
import { openMailto } from "../../lib/desktop";
import { useConnectivity } from "../../shared/connectivity";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion, SkeletonText } from "../../shared/ui/Skeleton";
import { useToast } from "../../shared/ui/Toast";
import {
  type ApplyInput,
  type ApplyPins,
  applyRecord,
  attachmentsTooLarge,
  buildSendRequest,
  composerModel,
  createDraft,
  draftBlocker,
  blockerSentence,
  fileSize,
  findApplyInput,
  jobCoverLetter,
  letterDay,
  letterLanguage,
  letterTitle,
  mailtoMessage,
  parseRecipients,
  sendErrorKind,
  sendErrorSentence,
  sendingAccounts,
  toggleLetter,
} from "./model";
import { type AttachmentPdfs, makeAttachmentPdfs } from "./pdf";
import { type ApplySession, applySessions } from "./session";

const messages = defineMessages({
  fallbackTitle: { id: "apply.email.panel.fallbackTitle", defaultMessage: "Apply by email" },
  close: {
    id: "apply.email.panel.close",
    defaultMessage: "Close (your draft is kept)",
    description: "Close button of the email composer; the draft stays for this session",
  },
  keyGroup: { id: "apply.email.panel.keyGroup", defaultMessage: "Apply" },
  keyPrimary: { id: "apply.email.panel.keyPrimary", defaultMessage: "Review, then send the application" },
  keyClose: { id: "apply.email.panel.keyClose", defaultMessage: "Close the email composer" },
  loading: { id: "apply.email.panel.loading", defaultMessage: "Loading the application" },
  loadFailedTitle: { id: "apply.email.panel.loadFailedTitle", defaultMessage: "Couldn't load this job" },
  loadFailedBody: {
    id: "apply.email.panel.loadFailedBody",
    defaultMessage: "Check your connection, then try again. Nothing was sent.",
  },
  missingJob: { id: "apply.email.panel.missingJob", defaultMessage: "This job isn't available anymore." },
  from: { id: "apply.email.panel.from", defaultMessage: "From" },
  to: { id: "apply.email.panel.to", defaultMessage: "To" },
  subject: { id: "apply.email.panel.subject", defaultMessage: "Subject" },
  message: { id: "apply.email.panel.message", defaultMessage: "Message" },
  cv: { id: "apply.email.panel.cv", defaultMessage: "CV" },
  cvHint: {
    id: "apply.email.panel.cvHint",
    defaultMessage: "Its current version is attached as a PDF and kept with the application.",
  },
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
  done: { id: "apply.email.panel.done", defaultMessage: "Done" },
});

// ─── Shell ─────────────────────────────────────────────────────────────────────────────────────

/** The panel frame: header (title, role, close), scrolling body, footer with the primary action. */
function Shell({
  title,
  subtitle,
  headingRef,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const intl = useIntl();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="bg-surface-base flex h-full min-h-0 w-full flex-col">
      <header className="border-line-subtle flex items-start gap-3 border-b px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-display text-title3 outline-none">
            {title}
          </h2>
          {subtitle && <p className="text-fg-secondary text-callout mt-0.5 truncate">{subtitle}</p>}
        </div>
        <IconButton icon={X} label={intl.formatMessage(messages.close)} shortcut="Escape" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="border-line-subtle border-t px-5 py-3">{footer}</footer>}
    </section>
  );
}

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";
const inputClass = `${controlClass} h-8`;
const textareaClass = `${controlClass} py-1.5 leading-relaxed resize-y`;

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-footnote text-fg-secondary font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-fg-tertiary text-footnote">
          {hint}
        </p>
      )}
    </div>
  );
}

/** SendBlockerLine: exactly one reason, next to the action it blocks. */
function BlockerLine({ text, id }: { text: string | null; id: string }) {
  return (
    <p id={id} role="status" className="text-fg-secondary text-footnote min-w-0 flex-1">
      {text}
    </p>
  );
}

function AttachmentChip({ name, size }: { name: string; size: string | null }) {
  return (
    <li className="bg-surface-sunken text-callout inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1">
      <FileText aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{name}</span>
      {size && <span className="text-fg-tertiary shrink-0 tabular-nums">{size}</span>}
    </li>
  );
}

// ─── Entry ─────────────────────────────────────────────────────────────────────────────────────

/** The email composer for `jobId`; reads its data itself. `onClose` keeps the draft. */
export function EmailApplyPanel({ jobId, onClose }: { readonly jobId: string; readonly onClose: () => void }) {
  const intl = useIntl();
  const tracker = useTrackerData();
  const jobs = useJobsData();
  useKeyBindings([
    {
      id: "apply.close",
      keys: "Escape",
      label: intl.formatMessage(messages.keyClose),
      group: intl.formatMessage(messages.keyGroup),
      inTextFields: true,
      run: (event) => {
        event.preventDefault();
        onClose();
      },
    },
  ]);

  if (tracker.status === "error" || jobs.status === "error") {
    const retry = () => {
      if (tracker.status === "error") tracker.retry();
      if (jobs.status === "error") jobs.retry();
    };
    return (
      <Shell title={intl.formatMessage(messages.fallbackTitle)} onClose={onClose}>
        <PaneError
          title={intl.formatMessage(messages.loadFailedTitle)}
          body={intl.formatMessage(messages.loadFailedBody)}
          onRetry={retry}
        />
      </Shell>
    );
  }
  if (tracker.status === "loading" || jobs.status === "loading") {
    return (
      <Shell title={intl.formatMessage(messages.fallbackTitle)} onClose={onClose}>
        <SkeletonRegion
          loading
          label={intl.formatMessage(messages.loading)}
          skeleton={
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex flex-col gap-1">
                  <SkeletonText widths={[20]} />
                  <SkeletonBlock className="h-8 w-full rounded-md" />
                </div>
              ))}
              <SkeletonBlock className="h-40 w-full rounded-md" />
            </div>
          }
        >
          {null}
        </SkeletonRegion>
      </Shell>
    );
  }
  const input = findApplyInput(jobId, tracker.data, jobs.data);
  if (!input) {
    return (
      <Shell title={intl.formatMessage(messages.fallbackTitle)} onClose={onClose}>
        <EmptyState kind="subArea" body={intl.formatMessage(messages.missingJob)} />
      </Shell>
    );
  }
  return <Composer key={jobId} input={input} onClose={onClose} />;
}

// ─── Composer ──────────────────────────────────────────────────────────────────────────────────

/** The CV's revision the application pins: its current one. */
function useCurrentRevision(cvId: string | null, revisionId: string | null): Lookup<CvRevision> {
  const repository = useTrackerRepository();
  const [state, setState] = useState<{ readonly cvId: string; readonly lookup: Lookup<readonly CvRevision[]> } | null>(null);
  useEffect(() => {
    if (cvId === null) return;
    return repository.watchCvRevisions(cvId, (lookup) => setState({ cvId, lookup }));
  }, [repository, cvId]);
  if (cvId === null) return { status: "ready", value: null };
  if (state?.cvId !== cvId || state.lookup.status === "loading") return { status: "loading" };
  return { status: "ready", value: state.lookup.value?.find((revision) => revision.id === revisionId) ?? null };
}

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

function Composer({ input, onClose }: { readonly input: ApplyInput; readonly onClose: () => void }) {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const repository = useJobsRepository();
  const trackerRepository = useTrackerRepository();
  const tracker = useTrackerData();
  const environment = useContext(ModelEnvironmentContext);
  const online = useConnectivity().status !== "offline";
  const { job } = input;
  const key = `${repository.uid}:${job.id}`;

  const [session, setSession] = useState<ApplySession>(() => {
    const existing = applySessions.get(key);
    if (existing) return existing;
    const created: ApplySession = {
      draft: createDraft(input),
      step: "compose",
      pdfs: null,
      pins: null,
      sendApplicationId: null,
      sendAt: null,
      recordedApplicationId: null,
    };
    applySessions.set(key, created);
    return created;
  });
  /** Writes through to the session store, so toast actions after the panel closed still land. */
  const update = useCallback(
    (change: (current: ApplySession) => ApplySession) => {
      const current = applySessions.get(key);
      if (!current) return;
      const next = change(current);
      applySessions.set(key, next);
      setSession(next);
    },
    [key],
  );
  const { draft } = session;

  const ctx = {
    intl,
    locale: intl.locale,
    now: environment.now(),
    timeZone: environment.timeZone ?? displayTimeZone(input.profile),
  };
  const model = composerModel(input, draft, { online }, ctx);
  const accounts = sendingAccounts(input.mailAccounts);
  const accountId = accounts.find((account) => account.id === draft.accountId)?.id ?? accounts[0]?.id ?? null;
  const account = accounts.find((candidate) => candidate.id === accountId) ?? null;
  const cv = input.cvs.find((candidate) => candidate.id === draft.cvId) ?? null;
  const language = letterLanguage(job, cv);
  const revision = useCurrentRevision(cv?.id ?? null, cv?.currentRevisionId ?? null);
  const recipients = parseRecipients(draft.to).addresses;
  const firstAddress = recipients[0] ?? draft.to.trim();
  const day = letterDay(ctx.now, ctx.timeZone);
  const pdfKey = JSON.stringify([
    cv?.id,
    cv?.currentRevisionId,
    draft.letterOn ? [draft.letter, draft.subject, language, day] : null,
  ]);
  const pdfs = session.pdfs?.key === pdfKey ? session.pdfs.files : null;

  const reviewBlocker = draftBlocker(draft, { online: true, canSend: account !== null });
  const actionBlocker = draftBlocker(draft, { online, canSend: account !== null });
  /** The PDF set that failed to print (Try again clears it and prints again). */
  const [failedPdfKey, setFailedPdfKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pdfsFailed = failedPdfKey === pdfKey && pdfs === null;
  const [busy, setBusy] = useState<Busy>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ids = { from: useId(), to: useId(), subject: useId(), body: useId(), cv: useId(), letterOn: useId(), letter: useId(), blocker: useId() };

  const edit = (patch: Partial<typeof draft>) => {
    setActionError(null);
    update((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
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

  // Make the PDFs on Review (offline, by the OS webview).
  const content = revision.status === "ready" ? (revision.value?.content ?? null) : null;
  useEffect(() => {
    if (session.step !== "review" || content === null || cv === null || session.pdfs?.key === pdfKey) return;
    let cancelled = false;
    makeAttachmentPdfs({
      content,
      cvLanguage: cv.language,
      job,
      letter: draft.letterOn ? { body: draft.letter, subject: draft.subject, language, day } : null,
    }).then(
      (files) => {
        if (!cancelled) update((current) => ({ ...current, pdfs: { key: pdfKey, files } }));
      },
      (error: unknown) => {
        console.error("Couldn't make the application PDFs", error);
        if (!cancelled) setFailedPdfKey(pdfKey);
      },
    );
    return () => {
      cancelled = true;
    };
    // `pdfKey` covers the draft fields the PDFs depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.step, pdfKey, content, attempt]);

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
  }, [sendState, session.sendApplicationId, toast, intl, job.company, openTracker, update]);

  const sendAt = emailSend?.sendAt ?? session.sendAt;
  const secondsLeft = useSecondsUntil(view === "sending" ? sendAt : null);

  /** Saves the cover letter, uploads the PDFs as `renderedFiles` and returns the pins (once per PDF set). */
  const uploadPins = async (files: AttachmentPdfs): Promise<ApplyPins> => {
    const cached = applySessions.get(key)?.pins;
    if (cached?.key === pdfKey) return cached.value;
    if (cv === null || revision.status !== "ready" || revision.value === null) throw new Error("CV revision not loaded");
    const cvRevisionId = revision.value.id;
    const coverLetterId =
      draft.letterOn && files.letter
        ? repository.saveCoverLetter(
            {
              jobId: job.id,
              applicationId: input.application?.id ?? null,
              title: letterTitle(job),
              language,
              body: draft.letter,
            },
            jobCoverLetter(input.coverLetters, job.id),
          ).ids.coverLetterId
        : null;
    const cvFile = await repository.createRenderedFile({
      kind: "pdf",
      cvId: cv.id,
      cvRevisionId,
      coverLetterId: null,
      fileName: files.cv.fileName,
      bytes: files.cv.bytes,
    });
    const letterFile =
      files.letter && coverLetterId !== null
        ? await repository.createRenderedFile({
            kind: "pdf",
            cvId: null,
            cvRevisionId: null,
            coverLetterId,
            fileName: files.letter.fileName,
            bytes: files.letter.bytes,
          })
        : null;
    const pins: ApplyPins = { cvId: cv.id, cvRevisionId, cvFile, coverLetterId, letterFile };
    update((current) => ({ ...current, pins: { key: pdfKey, value: pins } }));
    return pins;
  };

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

  const send = async () => {
    if (busy !== null || actionBlocker !== null || accountId === null || pdfs === null) return;
    setBusy("sending");
    setActionError(null);
    try {
      const pins = await uploadPins(pdfs);
      const response = await repository.sendEmail(
        buildSendRequest(draft, { accountId, applicationId: input.application?.id ?? null, jobId: job.id }, pins),
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
      const pins = await uploadPins(pdfs);
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
      await navigator.clipboard.writeText(draft.body);
      toast.show({ variant: "info", message: intl.formatMessage(messages.copied) });
    } catch {
      toast.show({ variant: "info", message: intl.formatMessage(messages.copyFailed) });
    }
  };

  const openMailApp = async () => {
    try {
      await openMailto(mailtoMessage(draft));
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

  const tooLarge = pdfs
    ? attachmentsTooLarge(pdfs.cv.bytes.byteLength + (pdfs.letter?.bytes.byteLength ?? 0), account?.provider ?? null, ctx)
    : null;
  const attachments = [
    ...(cv ? [{ key: "cv", name: pdfs?.cv.fileName ?? cv.title, size: pdfs ? fileSize(pdfs.cv.bytes.byteLength, ctx.locale) : null }] : []),
    ...(draft.letterOn
      ? [{
          key: "letter",
          name: pdfs?.letter?.fileName ?? intl.formatMessage(messages.letter),
          size: pdfs?.letter ? fileSize(pdfs.letter.bytes.byteLength, ctx.locale) : null,
        }]
      : []),
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
              <dd className="min-w-0 break-words">{draft.subject}</dd>
              <dt className="text-fg-secondary">{intl.formatMessage(messages.attachments)}</dt>
              <dd className="min-w-0">
                <ul className="flex flex-wrap gap-2">
                  {attachments.map((item) => (
                    <AttachmentChip key={item.key} name={item.name} size={item.size} />
                  ))}
                </ul>
              </dd>
            </dl>
            {pdfsFailed && (
              <InlineAlert
                tone="error"
                className="mt-3"
                title={intl.formatMessage(messages.prepareFailed)}
                action={{
                  label: intl.formatMessage(messages.tryAgain),
                  onClick: () => {
                    setFailedPdfKey(null);
                    setAttempt((count) => count + 1);
                  },
                }}
              />
            )}
          </section>
          <section aria-label={intl.formatMessage(messages.message)}>
            <h3 className="text-footnote text-fg-secondary font-medium">{intl.formatMessage(messages.message)}</h3>
            <p className="bg-surface-sunken text-callout mt-1 rounded-md p-3 leading-relaxed whitespace-pre-wrap">{draft.body}</p>
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
        text={reviewReason ?? intl.formatMessage(messages.attaching, { files: attachments.map((item) => item.name).join(" · ") })}
      />
      <Button variant="primary" shortcut="Mod+Enter" disabledReason={reviewReason} onClick={goReview}>
        {intl.formatMessage(messages.review)}
      </Button>
    </div>
  );
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
        <Field id={ids.cv} label={intl.formatMessage(messages.cv)} hint={model.cvs.length > 0 ? intl.formatMessage(messages.cvHint) : null}>
          <select
            id={ids.cv}
            value={draft.cvId ?? ""}
            disabled={model.cvs.length === 0}
            aria-describedby={model.cvs.length > 0 ? `${ids.cv}-hint` : undefined}
            onChange={(event) => edit({ cvId: event.target.value })}
            className={inputClass}
          >
            {model.cvs.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
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
            <Field id={ids.letter} label={intl.formatMessage(messages.letter)} hint={intl.formatMessage(messages.letterHint)}>
              <textarea
                id={ids.letter}
                rows={10}
                value={draft.letter}
                aria-describedby={`${ids.letter}-hint`}
                onChange={(event) => edit({ letter: event.target.value })}
                className={textareaClass}
              />
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-footnote text-fg-secondary font-medium">{intl.formatMessage(messages.attachments)}</h3>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((item) => (
              <AttachmentChip key={item.key} name={item.name} size={item.size} />
            ))}
          </ul>
        </div>
      </form>
    </Shell>
  );
}

function Outcome({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <CircleCheck aria-hidden="true" className="text-success-text mt-1 size-5 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-body font-semibold">{title}</p>
        <p className="text-fg-secondary text-callout">{body}</p>
      </div>
    </div>
  );
}

function OutcomeFooter({ onView, onClose }: { onView: () => void; onClose: () => void }) {
  const intl = useIntl();
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onView}>
        {intl.formatMessage(messages.viewInTracker)}
      </Button>
      <Button variant="primary" onClick={onClose}>
        {intl.formatMessage(messages.done)}
      </Button>
    </div>
  );
}
