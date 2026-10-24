/**
 * "Add a job from a link" (BRIEF §4.3 URL import, ADR 0005 "URL import"). Step 1: paste a link,
 * Enter or "Read posting" calls `jobImportUrl` (up to ~20 s; closing the dialog stops waiting).
 * Step 2: the confirm-and-edit form from the draft, with the source of the details, a quiet
 * "Check this" on low-confidence fields and calm notes for what was left out; Save stores it with
 * `saveImportedJob` and hands the job id to `onImported` (a server trigger saves its match). When
 * the page can't be read (or offline), "Enter it yourself" opens the same form empty with the link
 * prefilled; that works offline too.
 */
import { timing } from "@bfhr/ui-tokens";
import {
  EmploymentTypeSchema,
  type JobDraft,
  type JobImportUrlResponse,
  jobFromWire,
  RemoteTypeSchema,
  SalaryPeriodSchema,
  SenioritySchema,
} from "@bfhr/core";
import { CloudOff, Globe, LoaderCircle, Sparkles } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import { type ReactNode, useContext, useEffect, useId, useRef, useState } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { useJobsRepository } from "../../data/jobs/repository";
import { useTrackerData } from "../../data/tracker/live";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { useConnectivity } from "../../shared/connectivity";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { Keycaps } from "../../shared/ui/Keycaps";
import { useToast } from "../../shared/ui/Toast";
import { useUnsavedChanges } from "../../shared/unsavedChanges";
import {
  blankForm,
  buildImportReview,
  CHECKED_FIELDS,
  type CheckedField,
  checkLink,
  classifyImportError,
  EMPLOYMENT_MESSAGES,
  formFromJob,
  formProblems,
  type ImportErrorView,
  importErrorView,
  type ImportFieldKey,
  type ImportForm,
  type ImportReview,
  jobFromForm,
  type LinkProblem,
  linkProblemMessage,
  MAX_URL_LENGTH,
  manualImportJob,
  PERIOD_MESSAGES,
  problemMessage,
  REMOTE_MESSAGES,
  SENIORITY_MESSAGES,
  VISA_MESSAGES,
  type VisaChoice,
} from "./model";

const messages = defineMessages({
  title: { id: "jobs-import.dialog.title", defaultMessage: "Add a job from a link", description: "Dialog title" },
  linkDescription: {
    id: "jobs-import.dialog.linkDescription",
    defaultMessage: "Paste the link to a job posting. We'll read it, and you check the details before saving.",
  },
  reviewDescription: {
    id: "jobs-import.dialog.reviewDescription",
    defaultMessage: "Check the details we read and fix anything that's off. Nothing is saved until you do.",
  },
  manualDescription: {
    id: "jobs-import.dialog.manualDescription",
    defaultMessage: "Enter what you know about the job. Only the role and company are needed.",
  },
  link: { id: "jobs-import.dialog.link", defaultMessage: "Link to the posting", description: "Field label" },
  linkHint: {
    id: "jobs-import.dialog.linkHint",
    defaultMessage: "Company career pages, job boards and LinkedIn postings all work.",
    description: "Hint under the link field",
  },
  read: { id: "jobs-import.dialog.read", defaultMessage: "Read posting", description: "Primary button of step 1" },
  readKeysHint: {
    id: "jobs-import.dialog.readKeysHint",
    defaultMessage: "<keys></keys> to read",
    description: "Footer hint; the tag shows the Enter keycap",
  },
  reading: { id: "jobs-import.dialog.reading", defaultMessage: "Reading the posting…" },
  readingShort: {
    id: "jobs-import.dialog.readingShort",
    defaultMessage: "Reading…",
    description: "Read posting button while the posting is read",
  },
  readingLong: {
    id: "jobs-import.dialog.readingLong",
    defaultMessage: "Some pages take up to 20 seconds. Closing this window stops reading.",
    description: "Added under the wait after 10 s",
  },
  needsConnection: {
    id: "jobs-import.dialog.needsConnection",
    defaultMessage: "Reading a link needs a connection.",
    description: "Why Read posting is disabled offline",
  },
  enterYourself: {
    id: "jobs-import.dialog.enterYourself",
    defaultMessage: "Enter it yourself",
    description: "Opens the empty form with the link prefilled",
  },
  tryAgain: { id: "jobs-import.dialog.tryAgain", defaultMessage: "Try again", description: "Button" },
  back: { id: "jobs-import.dialog.back", defaultMessage: "Back", description: "Back to the link step" },
  cancel: { id: "jobs-import.dialog.cancel", defaultMessage: "Cancel", description: "Button" },
  save: { id: "jobs-import.dialog.save", defaultMessage: "Save job", description: "Primary button of step 2" },
  saveKeysHint: {
    id: "jobs-import.dialog.saveKeysHint",
    defaultMessage: "<keys></keys> to save · It goes to your Saved jobs.",
    description: "Footer hint; the tag shows the shortcut keycaps (⌘↩ / Ctrl Enter)",
  },
  offlineSave: {
    id: "jobs-import.dialog.offlineSave",
    defaultMessage: "You're offline. It's saved on this device and syncs when you're back online.",
  },
  checkThis: {
    id: "jobs-import.dialog.checkThis",
    defaultMessage: "Check this",
    description: "Quiet flag next to a field the import wasn't sure about",
  },
  checkThisReason: {
    id: "jobs-import.dialog.checkThisReason",
    defaultMessage: "We weren't sure about this one.",
    description: "Screen-reader description of the Check this flag",
  },
  role: { id: "jobs-import.dialog.role", defaultMessage: "Role", description: "Field label" },
  company: { id: "jobs-import.dialog.company", defaultMessage: "Company", description: "Field label" },
  location: {
    id: "jobs-import.dialog.location",
    defaultMessage: "Location",
    description: "Field label: where the job is (all places as one line)",
  },
  remoteType: { id: "jobs-import.dialog.remoteType", defaultMessage: "Work mode", description: "Field label" },
  employmentType: {
    id: "jobs-import.dialog.employmentType",
    defaultMessage: "Employment type",
    description: "Field label",
  },
  seniority: { id: "jobs-import.dialog.seniority", defaultMessage: "Seniority", description: "Field label" },
  notStated: {
    id: "jobs-import.dialog.notStated",
    defaultMessage: "Not stated",
    description: "Empty option of the work mode / employment type / seniority selects",
  },
  salary: { id: "jobs-import.dialog.salary", defaultMessage: "Salary", description: "Fieldset legend" },
  salaryMin: { id: "jobs-import.dialog.salaryMin", defaultMessage: "From", description: "Lowest salary amount" },
  salaryMax: { id: "jobs-import.dialog.salaryMax", defaultMessage: "To", description: "Highest salary amount" },
  salaryCurrency: { id: "jobs-import.dialog.salaryCurrency", defaultMessage: "Currency", description: "Field label" },
  salaryPeriod: { id: "jobs-import.dialog.salaryPeriod", defaultMessage: "Paid", description: "Field label: a year / a month …" },
  salaryEstimated: {
    id: "jobs-import.dialog.salaryEstimated",
    defaultMessage: "This is an estimate, not a figure from the posting",
    description: "Checkbox under the salary fields",
  },
  visa: { id: "jobs-import.dialog.visa", defaultMessage: "Visa sponsorship", description: "Field label" },
  applyUrl: { id: "jobs-import.dialog.applyUrl", defaultMessage: "Apply link", description: "Field label" },
  applyEmail: { id: "jobs-import.dialog.applyEmail", defaultMessage: "Apply by email", description: "Field label" },
  description: { id: "jobs-import.dialog.description", defaultMessage: "Description", description: "Field label" },
  descriptionPlaceholder: {
    id: "jobs-import.dialog.descriptionPlaceholder",
    defaultMessage: "Paste the posting's text here if you have it.",
  },
  summary: {
    id: "jobs-import.dialog.summary",
    defaultMessage: "{count, plural, one {# field needs a look} other {# fields need a look}}",
    description: "Error summary above the form",
  },
  saveFailed: {
    id: "jobs-import.dialog.saveFailed",
    defaultMessage: "We couldn't save that job. Check your connection and add it again.",
  },
  discardTitle: { id: "jobs-import.dialog.discardTitle", defaultMessage: "Discard this job?" },
  discardBody: { id: "jobs-import.dialog.discardBody", defaultMessage: "The details you changed here won't be saved." },
  keepEditing: { id: "jobs-import.dialog.keepEditing", defaultMessage: "Keep editing", description: "Button" },
  discard: { id: "jobs-import.dialog.discard", defaultMessage: "Discard", description: "Button" },
  unsavedLabel: {
    id: "jobs-import.dialog.unsavedLabel",
    defaultMessage: "Job from a link",
    description: "Names this dialog in “Save your changes before restarting?”",
  },
});

/** What the error summary calls each checked field. */
const FIELD_NAMES: Readonly<Record<CheckedField, MessageDescriptor>> = {
  postingUrl: messages.link,
  title: messages.role,
  company: messages.company,
  salaryMin: messages.salaryMin,
  salaryMax: messages.salaryMax,
  salaryCurrency: messages.salaryCurrency,
  applyUrl: messages.applyUrl,
  applyEmail: messages.applyEmail,
};

export interface ImportJobDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Prefills the link (a shared or dropped address). */
  readonly initialUrl?: string;
  /** The saved job's id (new, or the existing job the link was added to). */
  readonly onImported: (jobId: string) => void;
}

/** The import dialog; mounts a fresh flow each time it opens. */
export function ImportJobDialog({ open, onOpenChange, initialUrl, onImported }: ImportJobDialogProps) {
  if (!open) return null;
  return <ImportFlow initialUrl={initialUrl ?? ""} onClose={() => onOpenChange(false)} onImported={onImported} />;
}

type Step =
  | { readonly kind: "link"; readonly error: ImportErrorView | null }
  | { readonly kind: "reading"; readonly startedAt: number }
  | {
      readonly kind: "review";
      readonly response: JobImportUrlResponse;
      readonly base: JobDraft;
      readonly review: ImportReview;
      readonly initial: ImportForm;
    }
  | { readonly kind: "manual"; readonly initial: ImportForm };

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";
const fieldClass = `${controlClass} h-8`;

function Field({
  id,
  label,
  error,
  hint,
  flag,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** The "Check this" flag after the label. */
  flag?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-h-5 items-center gap-2">
        <label htmlFor={id} className="text-footnote text-fg-secondary font-medium">
          {label}
        </label>
        {flag}
      </div>
      {children}
      {error ? (
        <p id={`${id}-message`} className="text-danger-text text-footnote">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-message`} className="text-fg-tertiary text-footnote">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function ImportFlow({
  initialUrl,
  onClose,
  onImported,
}: {
  readonly initialUrl: string;
  readonly onClose: () => void;
  readonly onImported: (jobId: string) => void;
}) {
  const intl = useIntl();
  const repository = useJobsRepository();
  const tracker = useTrackerData();
  const environment = useContext(ModelEnvironmentContext);
  const connectivity = useConnectivity();
  const toast = useToast();
  const baseId = useId();
  const id = (field: string) => `${baseId}-${field}`;
  const contentRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Partial<Record<ImportFieldKey, HTMLElement | null>>>({});
  const offline = connectivity.status === "offline";
  const online = useRef(!offline);
  online.current = !offline;

  const [link, setLink] = useState(initialUrl);
  const [linkProblem, setLinkProblem] = useState<LinkProblem | null>(null);
  const [step, setStep] = useState<Step>({ kind: "link", error: null });
  const [form, setForm] = useState<ImportForm | null>(null);
  const [attempted, setAttempted] = useState(false);
  /** The step the discard question guards: closing the dialog, or Back to the link. */
  const [confirming, setConfirming] = useState<"close" | "back" | null>(null);
  const [longWait, setLongWait] = useState(false);
  const edit = (patch: Partial<ImportForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  /** Each read gets a number; a newer read, Back or closing makes older answers stale. */
  const readRun = useRef(0);
  useEffect(
    () => () => {
      readRun.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (step.kind !== "reading") return;
    const timer = setTimeout(() => setLongWait(true), Math.max(0, step.startedAt + timing.longWait - Date.now()));
    return () => clearTimeout(timer);
  }, [step]);

  const read = () => {
    const checked = checkLink(link);
    if ("problem" in checked) {
      setLinkProblem(checked.problem);
      linkRef.current?.focus();
      return;
    }
    if (offline) return;
    setLinkProblem(null);
    setLink(checked.url);
    const run = (readRun.current += 1);
    setLongWait(false);
    setStep({ kind: "reading", startedAt: Date.now() });
    repository.importUrl(checked.url).then(
      (response) => {
        if (readRun.current !== run) return;
        let base: JobDraft;
        try {
          base = jobFromWire(response.job);
        } catch (error) {
          console.error("jobImportUrl returned a job that doesn't parse", error);
          setStep({ kind: "link", error: importErrorView(intl, "unknown") });
          return;
        }
        const initial = formFromJob(base, response.finalUrl);
        setForm(initial);
        setAttempted(false);
        setStep({ kind: "review", response, base, review: buildImportReview(intl, response), initial });
      },
      (error: unknown) => {
        if (readRun.current !== run) return;
        setStep({ kind: "link", error: importErrorView(intl, classifyImportError(error, { online: online.current })) });
      },
    );
  };

  const enterYourself = () => {
    const checked = checkLink(link);
    const currency = tracker.status === "ready" ? (tracker.data.profile?.salaryFloor?.currency ?? null) : null;
    const initial = blankForm("url" in checked ? checked.url : link.trim(), currency);
    setForm(initial);
    setAttempted(false);
    setStep({ kind: "manual", initial });
  };

  const back = () => {
    readRun.current += 1;
    setForm(null);
    setStep({ kind: "link", error: null });
  };

  const reviewing = step.kind === "review" || step.kind === "manual";
  const manual = step.kind === "manual";
  const problems = form && reviewing ? formProblems(form, { manual }) : {};
  const invalid = CHECKED_FIELDS.filter((field) => problems[field] !== undefined);
  const shown = (field: CheckedField): string | undefined => {
    const problem = problems[field];
    return attempted && problem ? problemMessage(intl, problem) : undefined;
  };
  const initialForm = reviewing ? step.initial : null;
  const dirty =
    form !== null &&
    initialForm !== null &&
    (Object.keys(initialForm) as ImportFieldKey[]).some((key) => form[key] !== initialForm[key]);

  /** Saves the job; false (and points at the first problem) when the form isn't ready. */
  const save = (): boolean => {
    if (!form || !reviewing) return false;
    const [first] = invalid;
    if (first) {
      setAttempted(true);
      fieldRefs.current[first]?.focus();
      return false;
    }
    const job =
      step.kind === "review" ? jobFromForm(form, step.initial, step.base) : manualImportJob(form, environment.now());
    const existingJobId = step.kind === "review" ? step.response.existingJobId : null;
    const pending = repository.saveImportedJob(job, existingJobId);
    pending.done.catch((error: unknown) => {
      console.error("Saving the imported job failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.saveFailed) });
    });
    onImported(pending.ids.jobId);
    onClose();
    return true;
  };

  const requestClose = () => {
    if (dirty) setConfirming("close");
    else onClose();
  };

  const requestBack = () => {
    if (dirty) setConfirming("back");
    else back();
  };

  useKeyBindings([
    {
      id: "jobs-import.save",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.save),
      group: "General",
      inOverlays: true,
      enabled: reviewing && confirming === null,
      run: () => void save(),
    },
  ]);

  useUnsavedChanges(
    dirty
      ? {
          label: intl.formatMessage(messages.unsavedLabel),
          save: () => (save() ? Promise.resolve() : Promise.reject(new Error("The job isn't complete"))),
        }
      : null,
  );

  // Focus: the link field in step 1, the first field of the form once it shows.
  const focusedStep = useRef<Step["kind"] | null>(null);
  useEffect(() => {
    if (focusedStep.current === step.kind) return;
    focusedStep.current = step.kind;
    if (step.kind === "link") {
      linkRef.current?.focus();
      linkRef.current?.select();
    } else if (step.kind === "manual") fieldRefs.current.title?.focus();
    else if (step.kind === "review") {
      const flagged = (["title", "company", "location"] as const).find((key) => step.review.check.has(key));
      fieldRefs.current[flagged ?? "title"]?.focus();
    }
  }, [step]);

  const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;
  const flagged = (key: ImportFieldKey): boolean =>
    step.kind === "review" && step.review.check.has(key) && form !== null && form[key] === step.initial[key];
  const flagFor = (key: ImportFieldKey) =>
    flagged(key) ? (
      <span id={id(`${key}-flag`)} className="text-warning-text inline-flex items-center gap-1 text-caption1 font-medium">
        <span aria-hidden="true" className="bg-warning-solid size-1.5 shrink-0 rounded-full" />
        {intl.formatMessage(messages.checkThis)}
        <span className="sr-only">{intl.formatMessage(messages.checkThisReason)}</span>
      </span>
    ) : undefined;
  /** Common props of a form control: ref, invalid state and its descriptions (error, flag). */
  const control = (key: ImportFieldKey) => {
    const error = (CHECKED_FIELDS as readonly ImportFieldKey[]).includes(key) ? shown(key as CheckedField) : undefined;
    return {
      id: id(key),
      ref: (node: HTMLElement | null) => {
        fieldRefs.current[key] = node;
      },
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy(error && `${id(key)}-message`, flagged(key) && id(`${key}-flag`)),
    };
  };

  const description =
    step.kind === "review"
      ? intl.formatMessage(messages.reviewDescription)
      : step.kind === "manual"
        ? intl.formatMessage(messages.manualDescription)
        : intl.formatMessage(messages.linkDescription);

  const linkError = linkProblem ? linkProblemMessage(intl, linkProblem) : undefined;
  const readError = step.kind === "link" ? step.error : null;

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          ref={contentRef}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (linkRef.current ?? contentRef.current)?.focus();
          }}
          className={cx(
            "bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg outline-none",
            reviewing ? "w-[min(640px,calc(100vw-32px))]" : "w-[min(520px,calc(100vw-32px))]",
          )}
        >
          <div className="px-5 pt-5 pb-3">
            <Dialog.Title className="font-display text-title3">{intl.formatMessage(messages.title)}</Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">{description}</Dialog.Description>
          </div>
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (reviewing) save();
              else if (step.kind === "link") read();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-4">
              {!reviewing && (
                <div className="flex flex-col gap-4">
                  <Field id={id("link")} label={intl.formatMessage(messages.link)} error={linkError} hint={intl.formatMessage(messages.linkHint)}>
                    <input
                      id={id("link")}
                      ref={linkRef}
                      type="url"
                      inputMode="url"
                      aria-required="true"
                      aria-invalid={linkError ? true : undefined}
                      aria-describedby={`${id("link")}-message`}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={MAX_URL_LENGTH}
                      placeholder="https://"
                      readOnly={step.kind === "reading"}
                      value={link}
                      onChange={(event) => {
                        setLink(event.target.value);
                        setLinkProblem(null);
                      }}
                      className={cx(fieldClass, step.kind === "reading" && "text-fg-secondary")}
                    />
                  </Field>
                  {step.kind === "reading" && (
                    <div role="status" className="flex flex-col gap-1">
                      <p className="text-callout text-fg-primary flex items-center gap-2">
                        <LoaderCircle
                          aria-hidden="true"
                          className="text-fg-tertiary size-4 shrink-0 motion-safe:animate-spin"
                          strokeWidth={1.75}
                        />
                        {intl.formatMessage(messages.reading)}
                      </p>
                      {longWait && (
                        <p className="text-footnote text-fg-secondary pl-6">{intl.formatMessage(messages.readingLong)}</p>
                      )}
                    </div>
                  )}
                  {readError && (
                    <InlineAlert
                      tone="warning"
                      title={readError.message}
                      {...(readError.offerManual
                        ? { action: { label: intl.formatMessage(messages.enterYourself), onClick: enterYourself } }
                        : readError.offerRetry
                          ? { action: { label: intl.formatMessage(messages.tryAgain), onClick: read } }
                          : {})}
                    />
                  )}
                  {offline && step.kind === "link" && readError?.kind !== "offline" && (
                    <InlineAlert
                      tone="info"
                      title={intl.formatMessage(messages.needsConnection)}
                      action={{ label: intl.formatMessage(messages.enterYourself), onClick: enterYourself }}
                    />
                  )}
                </div>
              )}
              {reviewing && form && (
                <div className="flex flex-col gap-4">
                  {step.kind === "review" && (
                    <div className="flex flex-col gap-2">
                      <p className="text-fg-secondary text-footnote flex items-start gap-1.5">
                        {step.review.provenance.ai ? (
                          <Sparkles aria-hidden="true" className="text-info-text mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                        ) : (
                          <Globe aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                        )}
                        <span className="min-w-0 break-words">{step.review.provenance.text}</span>
                      </p>
                      {step.review.existingNote && <InlineAlert tone="info" title={step.review.existingNote} />}
                      {step.review.notes.length > 0 && (
                        <ul className="text-fg-secondary text-footnote flex list-disc flex-col gap-0.5 pl-5">
                          {step.review.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {attempted && invalid.length > 1 && (
                    <InlineAlert tone="error" fromAction title={intl.formatMessage(messages.summary, { count: invalid.length })}>
                      <ul className="flex flex-col gap-0.5">
                        {invalid.map((field) => (
                          <li key={field}>
                            <button
                              type="button"
                              className="text-fg-primary underline underline-offset-2"
                              onClick={() => fieldRefs.current[field]?.focus()}
                            >
                              {intl.formatMessage(FIELD_NAMES[field])}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </InlineAlert>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                    {manual && (
                      <Field
                        id={id("postingUrl")}
                        label={intl.formatMessage(messages.link)}
                        error={shown("postingUrl")}
                        className="col-span-2"
                      >
                        <input
                          {...control("postingUrl")}
                          type="url"
                          inputMode="url"
                          aria-required="true"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={MAX_URL_LENGTH}
                          placeholder="https://"
                          value={form.postingUrl}
                          onChange={(event) => edit({ postingUrl: event.target.value })}
                          className={fieldClass}
                        />
                      </Field>
                    )}
                    <Field id={id("title")} label={intl.formatMessage(messages.role)} error={shown("title")} flag={flagFor("title")}>
                      <input
                        {...control("title")}
                        aria-required="true"
                        autoComplete="off"
                        maxLength={200}
                        value={form.title}
                        onChange={(event) => edit({ title: event.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      id={id("company")}
                      label={intl.formatMessage(messages.company)}
                      error={shown("company")}
                      flag={flagFor("company")}
                    >
                      <input
                        {...control("company")}
                        aria-required="true"
                        autoComplete="organization"
                        maxLength={200}
                        value={form.company}
                        onChange={(event) => edit({ company: event.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      id={id("location")}
                      label={intl.formatMessage(messages.location)}
                      flag={flagFor("location")}
                      className="col-span-2"
                    >
                      <input
                        {...control("location")}
                        autoComplete="off"
                        maxLength={200}
                        value={form.location}
                        onChange={(event) => edit({ location: event.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field id={id("remoteType")} label={intl.formatMessage(messages.remoteType)} flag={flagFor("remoteType")}>
                      <select
                        {...control("remoteType")}
                        value={form.remoteType}
                        onChange={(event) => edit({ remoteType: event.target.value as ImportForm["remoteType"] })}
                        className={fieldClass}
                      >
                        <option value="">{intl.formatMessage(messages.notStated)}</option>
                        {RemoteTypeSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {intl.formatMessage(REMOTE_MESSAGES[value])}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      id={id("employmentType")}
                      label={intl.formatMessage(messages.employmentType)}
                      flag={flagFor("employmentType")}
                    >
                      <select
                        {...control("employmentType")}
                        value={form.employmentType}
                        onChange={(event) => edit({ employmentType: event.target.value as ImportForm["employmentType"] })}
                        className={fieldClass}
                      >
                        <option value="">{intl.formatMessage(messages.notStated)}</option>
                        {EmploymentTypeSchema.options.map((value) => (
                          <option key={value} value={value}>
                            {intl.formatMessage(EMPLOYMENT_MESSAGES[value])}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id={id("seniority")} label={intl.formatMessage(messages.seniority)} flag={flagFor("seniority")}>
                      <select
                        {...control("seniority")}
                        value={form.seniority}
                        onChange={(event) => edit({ seniority: event.target.value as ImportForm["seniority"] })}
                        className={fieldClass}
                      >
                        <option value="">{intl.formatMessage(messages.notStated)}</option>
                        {SenioritySchema.options.map((value) => (
                          <option key={value} value={value}>
                            {intl.formatMessage(SENIORITY_MESSAGES[value])}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id={id("visaSponsorship")} label={intl.formatMessage(messages.visa)} flag={flagFor("visaSponsorship")}>
                      <select
                        {...control("visaSponsorship")}
                        value={form.visaSponsorship}
                        onChange={(event) => edit({ visaSponsorship: event.target.value as VisaChoice })}
                        className={fieldClass}
                      >
                        {(["unknown", "yes", "no"] as const).map((value) => (
                          <option key={value} value={value}>
                            {intl.formatMessage(VISA_MESSAGES[value])}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <fieldset className="col-span-2 flex min-w-0 flex-col gap-2">
                      <legend className="text-footnote text-fg-secondary mb-2 flex min-h-5 items-center gap-2 font-medium">
                        {intl.formatMessage(messages.salary)}
                        {flagFor("salaryMin")}
                      </legend>
                      <div className="grid grid-cols-[1fr_1fr_88px_1fr] gap-x-3 gap-y-1">
                        <Field id={id("salaryMin")} label={intl.formatMessage(messages.salaryMin)} error={shown("salaryMin")}>
                          <input
                            {...control("salaryMin")}
                            aria-describedby={describedBy(shown("salaryMin") && `${id("salaryMin")}-message`)}
                            inputMode="decimal"
                            autoComplete="off"
                            maxLength={20}
                            value={form.salaryMin}
                            onChange={(event) => edit({ salaryMin: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field id={id("salaryMax")} label={intl.formatMessage(messages.salaryMax)} error={shown("salaryMax")}>
                          <input
                            {...control("salaryMax")}
                            inputMode="decimal"
                            autoComplete="off"
                            maxLength={20}
                            value={form.salaryMax}
                            onChange={(event) => edit({ salaryMax: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field
                          id={id("salaryCurrency")}
                          label={intl.formatMessage(messages.salaryCurrency)}
                          error={shown("salaryCurrency")}
                        >
                          <input
                            {...control("salaryCurrency")}
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={3}
                            placeholder="EUR"
                            value={form.salaryCurrency}
                            onChange={(event) => edit({ salaryCurrency: event.target.value.toUpperCase() })}
                            className={cx(fieldClass, "uppercase")}
                          />
                        </Field>
                        <Field id={id("salaryPeriod")} label={intl.formatMessage(messages.salaryPeriod)}>
                          <select
                            {...control("salaryPeriod")}
                            value={form.salaryPeriod}
                            onChange={(event) => edit({ salaryPeriod: event.target.value as ImportForm["salaryPeriod"] })}
                            className={fieldClass}
                          >
                            {SalaryPeriodSchema.options.map((value) => (
                              <option key={value} value={value}>
                                {intl.formatMessage(PERIOD_MESSAGES[value])}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <label className="text-footnote text-fg-secondary flex min-h-6 items-center gap-2 self-start">
                        <input
                          type="checkbox"
                          checked={form.salaryEstimated}
                          onChange={(event) => edit({ salaryEstimated: event.target.checked })}
                          className="accent-(--bfhr-color-accent-solid) size-4"
                        />
                        {intl.formatMessage(messages.salaryEstimated)}
                      </label>
                    </fieldset>
                    <Field
                      id={id("applyUrl")}
                      label={intl.formatMessage(messages.applyUrl)}
                      error={shown("applyUrl")}
                      flag={flagFor("applyUrl")}
                      className="col-start-1"
                    >
                      <input
                        {...control("applyUrl")}
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={MAX_URL_LENGTH}
                        placeholder="https://"
                        value={form.applyUrl}
                        onChange={(event) => edit({ applyUrl: event.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      id={id("applyEmail")}
                      label={intl.formatMessage(messages.applyEmail)}
                      error={shown("applyEmail")}
                      flag={flagFor("applyEmail")}
                    >
                      <input
                        {...control("applyEmail")}
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={254}
                        value={form.applyEmail}
                        onChange={(event) => edit({ applyEmail: event.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field
                      id={id("description")}
                      label={intl.formatMessage(messages.description)}
                      flag={flagFor("description")}
                      className="col-span-2"
                    >
                      <textarea
                        {...control("description")}
                        rows={8}
                        maxLength={100_000}
                        placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                        value={form.description}
                        onChange={(event) => edit({ description: event.target.value })}
                        className={`${controlClass} resize-y py-1.5`}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
            <div className="border-line-subtle flex flex-wrap items-center gap-x-2 gap-y-2 border-t px-5 py-3">
              {reviewing && offline && (
                <p className="text-fg-secondary text-footnote flex basis-full items-center gap-1.5">
                  <CloudOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {intl.formatMessage(messages.offlineSave)}
                </p>
              )}
              {reviewing && (
                <Button variant="plain" onClick={requestBack}>
                  {intl.formatMessage(messages.back)}
                </Button>
              )}
              <p className="text-fg-secondary text-footnote flex min-w-0 flex-1 items-center gap-1.5">
                {step.kind === "link" &&
                  !offline &&
                  intl.formatMessage(messages.readKeysHint, { keys: () => <Keycaps keys="Enter" /> })}
                {reviewing &&
                  !offline &&
                  intl.formatMessage(messages.saveKeysHint, { keys: () => <Keycaps keys="Mod+Enter" /> })}
              </p>
              <div className="ml-auto flex shrink-0 gap-2">
                <Button variant="plain" onClick={requestClose} shortcut="Escape">
                  {intl.formatMessage(messages.cancel)}
                </Button>
                {reviewing ? (
                  <Button type="submit" variant="primary" shortcut="Mod+Enter">
                    {intl.formatMessage(messages.save)}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    shortcut="Enter"
                    loading={step.kind === "reading"}
                    loadingLabel={intl.formatMessage(messages.readingShort)}
                    disabledReason={offline ? intl.formatMessage(messages.needsConnection) : null}
                  >
                    {intl.formatMessage(messages.read)}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
      <AlertDialog.Root
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
          <AlertDialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg px-6 py-5">
            <AlertDialog.Title className="font-display text-title3">{intl.formatMessage(messages.discardTitle)}</AlertDialog.Title>
            <AlertDialog.Description className="text-fg-secondary text-callout">
              {intl.formatMessage(messages.discardBody)}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2 pt-2">
              <AlertDialog.Cancel asChild>
                <Button>{intl.formatMessage(messages.keepEditing)}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirming === "back") {
                      setConfirming(null);
                      back();
                    } else onClose();
                  }}
                >
                  {intl.formatMessage(messages.discard)}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Dialog.Root>
  );
}
