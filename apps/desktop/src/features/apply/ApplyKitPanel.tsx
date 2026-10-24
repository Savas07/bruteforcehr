/**
 * External-apply kit (BRIEF §4.4.3, research/apply.md "External channel: kit in the panel"; Maze
 * file rows, Superhuman/Plain answers, Unify inline copy): what the Jobs screen shows in the
 * detail column after "Apply on company site" (`?apply=1` on an external posting).
 *
 * - "Did you submit your application to …?" once the site was opened (Yes pins the CV version and
 *   the PDFs the kit made; Not yet; I'm not applying), with `Y` / `N`.
 * - **Open company site** (the system browser, so password managers and ATS logins work).
 * - **Files:** the CV (its current or tailored version, "Tailor for this job") as a PDF saved to
 *   `Downloads/BruteForceHR`: Open, Show in Finder / Explorer, Copy path. The cover letter (the
 *   same editor as the email composer): Copy text, Save as PDF; unresolved fields and gaps block
 *   both, with the reason.
 * - **Answers** that fit the job (`answersForJob`), grouped, each with Copy; `1`–`9` copy the n-th
 *   row while the panel has focus. None yet: a way to Settings › Application answers.
 */
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCopy, Copy, Download, ExternalLink, FileText, FolderOpen, Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { saveExportFile } from "../../lib/cvExport";
import { chrome } from "../../lib/desktop";
import { openKitFile, revealKitFile, saveKitFile } from "../../lib/kitFiles";
import type { AppliedPins } from "../job-detail/useJobsActions";
import { useConnectivity } from "../../shared/connectivity";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { SubmitPrompt } from "../../shared/ui/SubmitPrompt";
import { useToast } from "../../shared/ui/Toast";
import { CoverLetterEditor, FieldsToFill } from "./CoverLetterEditor";
import { CvField } from "./CvField";
import { ApplyGate } from "./gate";
import { kitAnswerGroups, siteHost } from "./kit";
import {
  type ApplyInput,
  blockerSentence,
  composerModel,
  fileSize,
  gapsIn,
  letterDay,
  toggleLetter,
} from "./model";
import { makeLetterPdf, type PdfFile } from "./pdf";
import { useApplyDocuments } from "./useApplyDocuments";
import { Shell } from "./ui";

const messages = defineMessages({
  title: { id: "apply.kit.title", defaultMessage: "Your application kit" },
  subtitle: { id: "apply.kit.subtitle", defaultMessage: "{company} · {role}" },
  intro: { id: "apply.kit.intro", defaultMessage: "Copy what the form asks for, then come back here." },
  openSite: { id: "apply.kit.openSite", defaultMessage: "Open company site" },
  openSiteAgain: { id: "apply.kit.openSiteAgain", defaultMessage: "Open company site again" },
  siteHint: { id: "apply.kit.siteHint", defaultMessage: "Opens {host} in your browser." },
  keyGroup: { id: "apply.kit.keyGroup", defaultMessage: "Application kit" },
  keyOpen: { id: "apply.kit.keyOpen", defaultMessage: "Open company site" },
  keyCopy: { id: "apply.kit.keyCopy", defaultMessage: "Copy answer {number}" },
  keyYes: { id: "apply.kit.keyYes", defaultMessage: "Yes, I applied" },
  keyNotYet: { id: "apply.kit.keyNotYet", defaultMessage: "Not yet" },
  files: { id: "apply.kit.files", defaultMessage: "Files" },
  cvFile: { id: "apply.kit.cvFile", defaultMessage: "CV" },
  cvFileHint: {
    id: "apply.kit.cvFileHint",
    defaultMessage: "Saved in Downloads › BruteForceHR when you open, show or copy it, so the form's upload button finds it.",
  },
  preparing: { id: "apply.kit.preparing", defaultMessage: "Preparing the PDF…" },
  prepareFailed: { id: "apply.kit.prepareFailed", defaultMessage: "Couldn't make the PDF. Try again." },
  tryAgain: { id: "apply.kit.tryAgain", defaultMessage: "Try again" },
  open: { id: "apply.kit.open", defaultMessage: "Open" },
  revealMac: { id: "apply.kit.revealMac", defaultMessage: "Show in Finder" },
  revealWindows: { id: "apply.kit.revealWindows", defaultMessage: "Show in Explorer" },
  copyPath: { id: "apply.kit.copyPath", defaultMessage: "Copy path" },
  pathCopied: { id: "apply.kit.pathCopied", defaultMessage: "Path copied: {fileName}" },
  fileFailed: { id: "apply.kit.fileFailed", defaultMessage: "Couldn't save or open the file. Try again." },
  letterToggle: { id: "apply.kit.letterToggle", defaultMessage: "Add a cover letter" },
  letterFile: { id: "apply.kit.letterFile", defaultMessage: "Cover letter" },
  copyLetter: { id: "apply.kit.copyLetter", defaultMessage: "Copy text" },
  saveLetter: { id: "apply.kit.saveLetter", defaultMessage: "Save as PDF" },
  letterCopied: { id: "apply.kit.letterCopied", defaultMessage: "Cover letter copied" },
  savedFile: { id: "apply.kit.savedFile", defaultMessage: "Saved {fileName}" },
  answers: { id: "apply.kit.answers", defaultMessage: "Answers" },
  answersHint: {
    id: "apply.kit.answersHint",
    defaultMessage: "Picked for this job's country, currency and language.",
  },
  copy: { id: "apply.kit.copy", defaultMessage: "Copy" },
  copyNamed: { id: "apply.kit.copyNamed", defaultMessage: "Copy {label}" },
  copied: { id: "apply.kit.copied", defaultMessage: "{label} copied" },
  copyFailed: { id: "apply.kit.copyFailed", defaultMessage: "Couldn't copy. Select the text and copy it instead." },
  showMore: { id: "apply.kit.showMore", defaultMessage: "Show all" },
  showLess: { id: "apply.kit.showLess", defaultMessage: "Show less" },
  noAnswers: {
    id: "apply.kit.noAnswers",
    defaultMessage: "Save answers you give often, like your notice period, salary expectation and links, to copy them here.",
  },
  noMatchingAnswers: {
    id: "apply.kit.noMatchingAnswers",
    defaultMessage: "None of your saved answers are for this job's country or currency.",
  },
  manageAnswers: { id: "apply.kit.manageAnswers", defaultMessage: "Application answers" },
});

/** Answers longer than this start collapsed. */
const LONG_ANSWER = 160;

export type SubmitAnswer = "yes" | "notYet" | "notApplying";

export function ApplyKitPanel({
  jobId,
  siteUrl,
  showSubmitPrompt,
  onOpenSite,
  onSubmitAnswer,
  onClose,
  onTailor,
}: {
  readonly jobId: string;
  /** The posting's apply link. */
  readonly siteUrl: string;
  /** "Did you submit?" after the site was opened, until answered. */
  readonly showSubmitPrompt: boolean;
  readonly onOpenSite: () => void;
  /** The answer; "Yes" comes with the documents to pin (the kit's PDFs once made). */
  readonly onSubmitAnswer: (answer: SubmitAnswer, pins: AppliedPins | null) => void;
  readonly onClose: () => void;
  readonly onTailor: (cvId: string, revisionId: string | null) => void;
}) {
  const intl = useIntl();
  return (
    <ApplyGate jobId={jobId} fallbackTitle={intl.formatMessage(messages.title)} onClose={onClose}>
      {(input) => (
        <Kit
          key={jobId}
          input={input}
          siteUrl={siteUrl}
          showSubmitPrompt={showSubmitPrompt}
          onOpenSite={onOpenSite}
          onSubmitAnswer={onSubmitAnswer}
          onClose={onClose}
          onTailor={onTailor}
        />
      )}
    </ApplyGate>
  );
}

function Kit({
  input,
  siteUrl,
  showSubmitPrompt,
  onOpenSite,
  onSubmitAnswer,
  onClose,
  onTailor,
}: {
  readonly input: ApplyInput;
  readonly siteUrl: string;
  readonly showSubmitPrompt: boolean;
  readonly onOpenSite: () => void;
  readonly onSubmitAnswer: (answer: SubmitAnswer, pins: AppliedPins | null) => void;
  readonly onClose: () => void;
  readonly onTailor: (cvId: string, revisionId: string | null) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const jobs = useJobsData();
  const online = useConnectivity().status !== "offline";
  const { job } = input;
  const documents = useApplyDocuments(input, { makePdfs: () => true });
  const { draft, edit, values, resolved, pdfs, pdfsFailed, revision, session, update, pdfKey } = documents;
  const ctx = { intl, locale: intl.locale, ...documents.ctx };
  const model = composerModel(input, draft, values, { online }, ctx);
  const regionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const letterToggleId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const answers = jobs.status === "ready" ? jobs.data.answers : [];
  const groups = kitAnswerGroups(answers, job, input.profile, intl);
  const rows = groups.flatMap((group) => group.rows);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ variant: "info", message: intl.formatMessage(messages.copied, { label }) });
    } catch {
      toast.show({ variant: "info", message: intl.formatMessage(messages.copyFailed) });
    }
  };

  /** The kit's copy of `file` in Downloads/BruteForceHR (saved once per PDF set). */
  const kitPath = async (which: "cv" | "letter", file: PdfFile): Promise<string> => {
    const known = session.kitPaths?.key === pdfKey ? session.kitPaths[which] : null;
    if (known) return known;
    const path = await saveKitFile(file.bytes, file.fileName);
    update((current) => {
      const paths = current.kitPaths?.key === pdfKey ? current.kitPaths : { key: pdfKey, cv: null, letter: null };
      return { ...current, kitPaths: { ...paths, [which]: path } };
    });
    return path;
  };

  const fileAction = async (action: "open" | "reveal" | "copy", file: PdfFile) => {
    try {
      const path = await kitPath("cv", file);
      if (action === "open") await openKitFile(path);
      else if (action === "reveal") await revealKitFile(path);
      else {
        await navigator.clipboard.writeText(path);
        toast.show({ variant: "info", message: intl.formatMessage(messages.pathCopied, { fileName: file.fileName }) });
      }
    } catch (error) {
      console.error("Application kit file failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.fileFailed) });
    }
  };

  // Unresolved fields and gaps block copying or saving the letter, with the reason.
  const field = draft.letterOn ? resolved.unresolved[0] : undefined;
  const gap = draft.letterOn ? gapsIn(resolved.letter)[0] : undefined;
  const letterBlocker =
    field !== undefined
      ? blockerSentence({ kind: "field", field }, ctx)
      : gap !== undefined
        ? blockerSentence({ kind: "gap", gap }, ctx)
        : null;

  const saveLetterPdf = async () => {
    if (letterBlocker !== null || revision.status !== "ready" || !revision.value) return;
    try {
      const file =
        pdfs?.letter ??
        (await makeLetterPdf(revision.value.content, job, {
          body: resolved.letter,
          subject: resolved.subject,
          language: draft.letterLanguage,
          day: letterDay(ctx.now, ctx.timeZone),
        }));
      const path = await saveExportFile(file.bytes, file.fileName, "pdf");
      if (path !== null) toast.show({ variant: "info", message: intl.formatMessage(messages.savedFile, { fileName: file.fileName }) });
    } catch (error) {
      console.error("Saving the cover letter PDF failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.fileFailed) });
    }
  };

  /** "Yes, I applied": pins the CV version and, when made, the PDFs (as `renderedFiles`). */
  const answerYes = async () => {
    if (busy) return;
    setBusy(true);
    let pins: AppliedPins | null =
      draft.cvId !== null && revision.status === "ready" && revision.value
        ? { cvId: draft.cvId, cvRevisionId: revision.value.id }
        : null;
    try {
      if (pdfs && online && letterBlocker === null) {
        const uploaded = await documents.uploadPins(pdfs);
        pins = {
          cvId: uploaded.cvId,
          cvRevisionId: uploaded.cvRevisionId,
          cvFileId: uploaded.cvFile.id,
          coverLetterId: uploaded.coverLetterId,
          coverLetterFileId: uploaded.letterFile?.id ?? null,
        };
      }
    } catch (error) {
      // The answer still counts; the application keeps the CV version without the files.
      console.error("Uploading the kit's files failed", error);
    } finally {
      setBusy(false);
    }
    onSubmitAnswer("yes", pins);
  };

  const group = intl.formatMessage(messages.keyGroup);
  const inKit = () => regionRef.current?.contains(document.activeElement) ?? false;
  useKeyBindings([
    {
      id: "apply.kit.open",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.keyOpen),
      group,
      run: (event) => {
        event.preventDefault();
        onOpenSite();
      },
    },
    { id: "apply.kit.yes", keys: "Y", label: intl.formatMessage(messages.keyYes), group, enabled: showSubmitPrompt, run: () => void answerYes() },
    {
      id: "apply.kit.notYet",
      keys: "N",
      label: intl.formatMessage(messages.keyNotYet),
      group,
      enabled: showSubmitPrompt,
      run: () => onSubmitAnswer("notYet", null),
    },
    ...rows.slice(0, 9).map((row, index) => ({
      id: `apply.kit.copy.${index + 1}`,
      keys: String(index + 1),
      label: intl.formatMessage(messages.keyCopy, { number: index + 1 }),
      group,
      hidden: index > 0,
      when: inKit,
      run: () => void copy(row.text, row.label),
    })),
  ]);

  const revealLabel = intl.formatMessage(chrome.platform === "windows" ? messages.revealWindows : messages.revealMac);
  const cvReason = pdfsFailed ? intl.formatMessage(messages.prepareFailed) : pdfs ? null : intl.formatMessage(messages.preparing);
  const revisionRef =
    draft.cvId !== null && revision.status === "ready" && revision.value ? { cvId: draft.cvId, revisionId: revision.value.id } : null;

  const footer = (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-fg-secondary text-footnote min-w-0 flex-1">
        {intl.formatMessage(messages.siteHint, { host: siteHost(siteUrl) })}
      </p>
      <Button variant="primary" icon={ExternalLink} shortcut="Mod+Enter" onClick={onOpenSite}>
        {intl.formatMessage(showSubmitPrompt ? messages.openSiteAgain : messages.openSite)}
      </Button>
    </div>
  );

  return (
    <Shell
      title={intl.formatMessage(messages.title)}
      subtitle={intl.formatMessage(messages.subtitle, { company: job.company, role: job.title })}
      headingRef={headingRef}
      onClose={onClose}
      footer={footer}
    >
      <div ref={regionRef} className="flex max-w-[44rem] flex-col gap-6">
        {showSubmitPrompt && (
          <SubmitPrompt
            company={job.company}
            variant="asking"
            onYes={() => void answerYes()}
            onNotYet={() => onSubmitAnswer("notYet", null)}
            onNotApplying={() => onSubmitAnswer("notApplying", null)}
          />
        )}
        <p className="text-callout text-fg-secondary">{intl.formatMessage(messages.intro)}</p>

        <section aria-labelledby={`${letterToggleId}-files`} className="flex flex-col gap-3">
          <h3 id={`${letterToggleId}-files`} className="text-headline">
            {intl.formatMessage(messages.files)}
          </h3>
          <CvField
            options={model.cvs}
            draft={draft}
            online={online}
            onChange={edit}
            onTailor={() => draft.cvId !== null && onTailor(draft.cvId, draft.cvRevisionId)}
          />
          <FileRow
            name={pdfs?.cv.fileName ?? intl.formatMessage(messages.cvFile)}
            size={pdfs ? fileSize(pdfs.cv.bytes.byteLength, intl.locale) : null}
            hint={intl.formatMessage(messages.cvFileHint)}
            status={cvReason}
            onRetry={pdfsFailed ? documents.retryPdfs : null}
            actions={[
              { label: intl.formatMessage(messages.open), icon: FileText, run: () => pdfs && void fileAction("open", pdfs.cv) },
              { label: revealLabel, icon: FolderOpen, run: () => pdfs && void fileAction("reveal", pdfs.cv) },
              { label: intl.formatMessage(messages.copyPath), icon: ClipboardCopy, run: () => pdfs && void fileAction("copy", pdfs.cv) },
            ]}
            disabledReason={cvReason}
          />
          <div className="flex flex-col gap-2">
            <label htmlFor={letterToggleId} className="text-callout inline-flex items-center gap-2 self-start">
              <input
                id={letterToggleId}
                type="checkbox"
                checked={draft.letterOn}
                onChange={(event) => update((current) => ({ ...current, draft: toggleLetter(current.draft, event.target.checked, input) }))}
                className="accent-accent-solid size-4"
              />
              {intl.formatMessage(messages.letterToggle)}
            </label>
            {draft.letterOn && (
              <>
                <CoverLetterEditor
                  input={input}
                  draft={draft}
                  values={values}
                  revision={revisionRef}
                  aiEnabled={input.profile?.aiEnabled ?? true}
                  onChange={edit}
                />
                <FieldsToFill fields={resolved.unresolved} draft={draft} onChange={edit} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    icon={Copy}
                    disabledReason={letterBlocker}
                    onClick={() => void copy(resolved.letter, intl.formatMessage(messages.letterFile))}
                  >
                    {intl.formatMessage(messages.copyLetter)}
                  </Button>
                  <Button size="sm" icon={Download} disabledReason={letterBlocker} onClick={() => void saveLetterPdf()}>
                    {intl.formatMessage(messages.saveLetter)}
                  </Button>
                  {letterBlocker && (
                    <p role="status" className="text-fg-secondary text-footnote min-w-0 flex-1">
                      {letterBlocker}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby={`${letterToggleId}-answers`} className="flex flex-col gap-3">
          <div>
            <h3 id={`${letterToggleId}-answers`} className="text-headline">
              {intl.formatMessage(messages.answers)}
            </h3>
            {rows.length > 0 && <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.answersHint)}</p>}
          </div>
          {rows.length === 0 ? (
            <EmptyState
              kind="subArea"
              body={intl.formatMessage(answers.length === 0 ? messages.noAnswers : messages.noMatchingAnswers)}
              primary={{
                label: intl.formatMessage(messages.manageAnswers),
                onClick: () => void navigate({ to: "/settings/$pane", params: { pane: "answers" } }),
              }}
            />
          ) : (
            groups.map((answerGroup) => (
              <div key={answerGroup.kind} className="flex flex-col gap-1">
                <h4 className="text-footnote text-fg-secondary font-semibold">{answerGroup.title}</h4>
                <ul className="divide-line-subtle flex flex-col divide-y">
                  {answerGroup.rows.map((row) => {
                    const index = rows.indexOf(row);
                    const long = row.text.length > LONG_ANSWER;
                    const open = expanded.has(row.id);
                    return (
                      <li key={row.id} className="flex items-start gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-callout font-medium">{row.label}</p>
                          <p className={cx("text-callout text-fg-secondary break-words whitespace-pre-wrap", long && !open && "line-clamp-3")}>
                            {row.text}
                          </p>
                          {long && (
                            <Button
                              size="sm"
                              variant="plain"
                              className="-ml-2"
                              aria-expanded={open}
                              onClick={() =>
                                setExpanded((current) => {
                                  const next = new Set(current);
                                  if (open) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                })
                              }
                            >
                              {intl.formatMessage(open ? messages.showLess : messages.showMore)}
                            </Button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          icon={Copy}
                          aria-label={intl.formatMessage(messages.copyNamed, { label: row.label })}
                          {...(index < 9 && { shortcut: String(index + 1) })}
                          onClick={() => void copy(row.text, row.label)}
                        >
                          {intl.formatMessage(messages.copy)}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          <Button
            size="sm"
            variant="plain"
            icon={Settings}
            className="self-start"
            onClick={() => void navigate({ to: "/settings/$pane", params: { pane: "answers" } })}
          >
            {intl.formatMessage(messages.manageAnswers)}
          </Button>
        </section>
      </div>
    </Shell>
  );
}

function FileRow({
  name,
  size,
  hint,
  status,
  onRetry,
  actions,
  disabledReason,
}: {
  name: string;
  size: string | null;
  hint: string;
  status: string | null;
  onRetry: (() => void) | null;
  actions: readonly { readonly label: string; readonly icon: typeof FileText; readonly run: () => void }[];
  disabledReason: string | null;
}) {
  const intl = useIntl();
  const hintId = useId();
  return (
    <div className="border-line-subtle flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <FileText aria-hidden="true" className="text-fg-secondary mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-callout min-w-0 truncate font-medium">{name}</p>
          <p id={hintId} className="text-fg-tertiary text-footnote">
            {size && <span className="tabular-nums">{size} · </span>}
            {hint}
          </p>
          {status && (
            <p role="status" className="text-fg-secondary text-footnote">
              {status}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            size="sm"
            icon={action.icon}
            aria-describedby={hintId}
            disabledReason={disabledReason}
            onClick={action.run}
          >
            {action.label}
          </Button>
        ))}
        {onRetry && (
          <Button size="sm" variant="plain" onClick={onRetry}>
            {intl.formatMessage(messages.tryAgain)}
          </Button>
        )}
      </div>
    </div>
  );
}
