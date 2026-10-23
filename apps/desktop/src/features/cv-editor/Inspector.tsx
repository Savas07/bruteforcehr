/**
 * The CV editor's right inspector (research/cv-editor.md "Right inspector"): Design · Check ·
 * Suggestions · History, one tab at a time. Docked beside the preview on wide windows, an overlay
 * over the preview otherwise. Toggle: Mod+Shift+D.
 */
import { AlertDialog, Tabs } from "radix-ui";
import { Check as CheckIcon, FileText, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { ScrollStrip } from "../../shared/ui/ScrollStrip";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { SourceTag } from "../../shared/ui/SourceTag";
import { StatusPill } from "../../shared/ui/StatusPill";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import type { CvCoverage } from "./coverage";
import type { CvDraft } from "./draft";
import type { CvEditorVM, CvRevisionVM } from "./model";
import { hasUnfilledPlaceholders, type CvSuggestionVM } from "./suggestions";

export type InspectorTab = "design" | "check" | "suggestions" | "history";

const messages = defineMessages({
  label: { id: "cv-editor.inspector.label", defaultMessage: "Inspector" },
  close: { id: "cv-editor.inspector.close", defaultMessage: "Hide inspector" },
  compare: { id: "cv-editor.history.compare", defaultMessage: "Compare with now" },
  design: { id: "cv-editor.inspector.design", defaultMessage: "Design" },
  check: { id: "cv-editor.inspector.check", defaultMessage: "Check" },
  suggestions: { id: "cv-editor.inspector.suggestions", defaultMessage: "Suggestions" },
  history: { id: "cv-editor.inspector.history", defaultMessage: "History" },
  template: { id: "cv-editor.design.templateHeading", defaultMessage: "Template" },
  atsSafe: { id: "cv-editor.design.atsSafe", defaultMessage: "ATS-safe" },
  templateNote: {
    id: "cv-editor.design.templateNote",
    defaultMessage: "One column, standard headings and real text, so application systems read every section.",
  },
  paper: { id: "cv-editor.design.paperHeading", defaultMessage: "Paper" },
  density: { id: "cv-editor.design.densityHeading", defaultMessage: "Spacing" },
  accent: { id: "cv-editor.design.accentHeading", defaultMessage: "Accent and fonts" },
  personal: { id: "cv-editor.design.personalHeading", defaultMessage: "Photo and date of birth" },
  originalFile: { id: "cv-editor.design.originalFile", defaultMessage: "Original file" },
  checkJob: { id: "cv-editor.check.job", defaultMessage: "Check against" },
  checkAll: { id: "cv-editor.check.all", defaultMessage: "All {count, number}" },
  checkMissing: { id: "cv-editor.check.missing", defaultMessage: "Missing {count, number}" },
  checkCovered: { id: "cv-editor.check.covered", defaultMessage: "Covered {count, number}" },
  checkFilter: { id: "cv-editor.check.filter", defaultMessage: "Show keywords" },
  addToSkills: { id: "cv-editor.check.addToSkills", defaultMessage: "Add to Skills" },
  notMine: { id: "cv-editor.check.notMine", defaultMessage: "I don't have this" },
  inCv: { id: "cv-editor.check.inCv", defaultMessage: "In your CV" },
  disclaimer: {
    id: "cv-editor.check.disclaimer",
    defaultMessage: "Keyword checks are a guide, not a guarantee.",
  },
  noJobs: {
    id: "cv-editor.check.noJobs",
    defaultMessage: "Save a job, then check which of its keywords your CV covers.",
  },
  allCovered: {
    id: "cv-editor.check.allCovered",
    defaultMessage: "Your CV covers every keyword from this job.",
  },
  pendingCount: {
    id: "cv-editor.suggestions.count",
    defaultMessage: "{count, plural, one {# suggestion to review} other {# suggestions to review}}",
  },
  pendingNote: {
    id: "cv-editor.suggestions.note",
    defaultMessage: "Decide each one. Nothing changes in your CV until you use it.",
  },
  showInCv: { id: "cv-editor.suggestions.showInCv", defaultMessage: "Show in CV" },
  use: { id: "cv-editor.suggestions.use", defaultMessage: "Use suggestion" },
  keep: { id: "cv-editor.suggestions.keep", defaultMessage: "Keep original" },
  fillInCv: {
    id: "cv-editor.suggestions.fillInCv",
    defaultMessage: "Fill in {placeholders} in your CV first. Only you know the real number.",
  },
  keepRest: {
    id: "cv-editor.suggestions.keepRest",
    defaultMessage: "Keep original for the rest ({count, number})",
  },
  noSuggestions: {
    id: "cv-editor.suggestions.empty",
    defaultMessage: "No suggestions to review. Suggestions from tailoring a CV for a job show up here.",
  },
  aiDisclaimer: {
    id: "cv-editor.suggestions.disclaimer",
    defaultMessage: "Suggested by Claude. Check names, numbers and dates before you use it.",
  },
  keysGroup: { id: "cv-editor.suggestions.keysGroup", defaultMessage: "CV suggestions" },
  restoreTitle: {
    id: "cv-editor.restore.title",
    defaultMessage: "Restore the version from {date}?",
  },
  restoreBody: {
    id: "cv-editor.restore.body",
    defaultMessage: "Your current version stays in history, so you can switch back anytime.",
  },
  restore: { id: "cv-editor.restore.confirm", defaultMessage: "Restore" },
  cancel: { id: "cv-editor.restore.cancel", defaultMessage: "Cancel" },
  usedIn: { id: "cv-editor.history.usedIn", defaultMessage: "Sent with applications" },
});

const tabTrigger =
  "text-fg-secondary hover:text-fg-primary data-[state=active]:text-fg-primary data-[state=active]:border-accent-solid -mb-px border-b-2 border-transparent px-2 py-2 text-callout whitespace-nowrap";

function SectionHeading({ children }: { children: string }) {
  return <h3 className="text-fg-secondary mb-2 text-footnote font-semibold">{children}</h3>;
}

function DesignTab({
  editor,
  draft,
  onTheme,
  onPersonal,
}: {
  editor: CvEditorVM;
  draft: CvDraft;
  onTheme: (patch: Partial<Pick<CvDraft, "paperSize" | "density">>) => void;
  onPersonal: (patch: Partial<Pick<CvDraft, "showPhoto" | "showDateOfBirth">>) => void;
}) {
  const intl = useIntl();
  const { design, personalDetails, originalFile } = editor;
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeading>{intl.formatMessage(messages.template)}</SectionHeading>
        <div className="border-line-subtle flex items-start gap-3 rounded-md border p-3">
          <FileText aria-hidden className="text-fg-tertiary mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-callout font-semibold">
              {design.templateLabel}
              <span className="bg-success-subtle text-success-text ml-2 rounded-sm px-1.5 py-0.5 text-caption1 font-normal">
                {intl.formatMessage(messages.atsSafe)}
              </span>
            </p>
            <p className="text-fg-secondary mt-1 text-footnote">
              {intl.formatMessage(messages.templateNote)}
            </p>
          </div>
        </div>
      </section>
      <section>
        <SectionHeading>{intl.formatMessage(messages.paper)}</SectionHeading>
        <SegmentedControl
          size="sm"
          label={intl.formatMessage(messages.paper)}
          options={editor.designOptions.paper}
          value={draft.paperSize}
          onValueChange={(paperSize) => onTheme({ paperSize })}
        />
      </section>
      <section>
        <SectionHeading>{intl.formatMessage(messages.density)}</SectionHeading>
        <SegmentedControl
          size="sm"
          label={intl.formatMessage(messages.density)}
          options={editor.designOptions.density}
          value={draft.density}
          onValueChange={(density) => onTheme({ density })}
        />
      </section>
      <section>
        <SectionHeading>{intl.formatMessage(messages.accent)}</SectionHeading>
        <p className="flex items-center gap-2 text-callout">
          {/* The swatch shows the CV's own accent (CV content, not a UI colour). */}
          <span
            aria-hidden
            className="border-line-subtle size-4 rounded-full border"
            style={{ backgroundColor: design.accentColor }}
          />
          <span className="font-mono text-footnote">{design.accentColor}</span>
          <span className="text-fg-secondary">· {design.fontPairLabel}</span>
        </p>
      </section>
      {personalDetails && (
        <section>
          <SectionHeading>{intl.formatMessage(messages.personal)}</SectionHeading>
          <div className="flex flex-col gap-2">
            {(
              [
                ["showPhoto", personalDetails.photo.label],
                ["showDateOfBirth", personalDetails.dateOfBirth.label],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-callout">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(event) => onPersonal({ [key]: event.target.checked })}
                  className="accent-(--color-accent-solid) size-4"
                />
                {label}
              </label>
            ))}
            <p className="text-fg-secondary text-footnote">{personalDetails.note}</p>
          </div>
        </section>
      )}
      {originalFile && (
        <section>
          <SectionHeading>{intl.formatMessage(messages.originalFile)}</SectionHeading>
          <p className="text-callout">{originalFile.fileName}</p>
          <p className="text-fg-secondary text-footnote">
            {originalFile.kindLabel} · {originalFile.uploadedLabel}
          </p>
        </section>
      )}
    </div>
  );
}

type KeywordFilter = "all" | "missing" | "covered";

function CheckTab({
  editor,
  jobId,
  onJob,
  coverage,
  onAddSkill,
  onExclude,
}: {
  editor: CvEditorVM;
  jobId: string | null;
  onJob: (jobId: string) => void;
  coverage: CvCoverage | null;
  onAddSkill: (keyword: string) => void;
  onExclude: (keyword: string) => void;
}) {
  const intl = useIntl();
  const [filter, setFilter] = useState<KeywordFilter>("missing");
  if (editor.check.jobs.length === 0 || coverage === null) {
    return <EmptyState kind="subArea" body={intl.formatMessage(messages.noJobs)} />;
  }
  const rows = [
    ...(filter === "covered" ? [] : coverage.missing.map((keyword) => ({ keyword, covered: false }))),
    ...(filter === "missing" ? [] : coverage.covered.map((keyword) => ({ keyword, covered: true }))),
  ];
  const ratio = coverage.total === 0 ? 0 : coverage.covered.length / coverage.total;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-fg-secondary text-footnote font-semibold">
          {intl.formatMessage(messages.checkJob)}
        </span>
        <select
          value={jobId ?? ""}
          onChange={(event) => onJob(event.target.value)}
          className="border-line-control bg-surface-base h-8 rounded-md border px-2 text-callout"
        >
          {editor.check.jobs.map((job) => (
            <option key={job.jobId} value={job.jobId}>
              {job.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="text-callout">{coverage.fact}</p>
        {/* Neutral bar: a fact, never a grade colour. */}
        <div aria-hidden className="bg-line-subtle mt-2 h-1.5 overflow-hidden rounded-full">
          <div className="bg-fg-secondary h-full rounded-full" style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>
      <SegmentedControl
        size="sm"
        label={intl.formatMessage(messages.checkFilter)}
        value={filter}
        onValueChange={setFilter}
        options={[
          {
            value: "missing",
            label: intl.formatMessage(messages.checkMissing, { count: coverage.missing.length }),
          },
          {
            value: "covered",
            label: intl.formatMessage(messages.checkCovered, { count: coverage.covered.length }),
          },
          { value: "all", label: intl.formatMessage(messages.checkAll, { count: coverage.total }) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState kind="subArea" body={intl.formatMessage(messages.allCovered)} />
      ) : (
        <ul className="divide-line-subtle flex flex-col divide-y">
          {rows.map(({ keyword, covered }) => (
            <li key={keyword} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
              <span className="min-w-0 flex-1 text-callout">
                {covered && <CheckIcon aria-hidden className="text-success-text mr-1.5 inline size-4" />}
                {keyword}
                {covered && <span className="sr-only"> · {intl.formatMessage(messages.inCv)}</span>}
              </span>
              {!covered && (
                <span className="flex gap-1">
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => onAddSkill(keyword)}>
                    {intl.formatMessage(messages.addToSkills)}
                  </Button>
                  <Button size="sm" variant="plain" onClick={() => onExclude(keyword)}>
                    {intl.formatMessage(messages.notMine)}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-fg-tertiary text-caption1">{intl.formatMessage(messages.disclaimer)}</p>
    </div>
  );
}

function SuggestionsTab({
  suggestions,
  fills,
  onUse,
  onKeep,
  onKeepAll,
  onShow,
}: {
  suggestions: readonly CvSuggestionVM[];
  fills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  onUse: (id: string) => void;
  onKeep: (id: string) => void;
  onKeepAll: () => void;
  onShow: (id: string) => void;
}) {
  const intl = useIntl();
  const focusedId = () =>
    (document.activeElement?.closest("[data-queue-id]") as HTMLElement | null)?.dataset.queueId ?? null;
  const blocked = (suggestion: CvSuggestionVM) =>
    hasUnfilledPlaceholders(suggestion.placeholders, fills[suggestion.id] ?? {});
  useKeyBindings([
    {
      id: "cv-editor.queue.use",
      keys: "A",
      label: intl.formatMessage(messages.use),
      group: intl.formatMessage(messages.keysGroup),
      when: () => focusedId() !== null,
      run: () => {
        const id = focusedId();
        const suggestion = suggestions.find((candidate) => candidate.id === id);
        if (suggestion && !blocked(suggestion)) onUse(suggestion.id);
      },
    },
    {
      id: "cv-editor.queue.keep",
      keys: "R",
      label: intl.formatMessage(messages.keep),
      group: intl.formatMessage(messages.keysGroup),
      when: () => focusedId() !== null,
      run: () => {
        const id = focusedId();
        if (id) onKeep(id);
      },
    },
    {
      id: "cv-editor.queue.show",
      keys: "E",
      label: intl.formatMessage(messages.showInCv),
      group: intl.formatMessage(messages.keysGroup),
      when: () => focusedId() !== null,
      run: () => {
        const id = focusedId();
        if (id) onShow(id);
      },
    },
  ]);

  if (suggestions.length === 0) {
    return <EmptyState kind="subArea" body={intl.formatMessage(messages.noSuggestions)} />;
  }
  const groups = new Map<string, CvSuggestionVM[]>();
  for (const suggestion of suggestions) {
    const section = suggestion.location.split(" · ")[0] ?? suggestion.location;
    groups.set(section, [...(groups.get(section) ?? []), suggestion]);
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-callout font-semibold">
          {intl.formatMessage(messages.pendingCount, { count: suggestions.length })}
        </p>
        <p className="text-fg-secondary text-footnote">{intl.formatMessage(messages.pendingNote)}</p>
      </div>
      {[...groups].map(([section, items]) => (
        <section key={section} aria-label={section}>
          <SectionHeading>{section}</SectionHeading>
          <ul className="flex flex-col gap-2">
            {items.map((suggestion) => {
              const reason = blocked(suggestion)
                ? intl.formatMessage(messages.fillInCv, {
                    placeholders: intl.formatList(suggestion.placeholders),
                  })
                : null;
              return (
                <li
                  key={suggestion.id}
                  data-queue-id={suggestion.id}
                  tabIndex={0}
                  aria-label={`${suggestion.modeLabel}, ${suggestion.location}`}
                  className="border-line-subtle focus-visible:border-line-focus rounded-md border p-3"
                >
                  <p className="flex items-center gap-1.5 text-footnote">
                    <Sparkles aria-hidden className="text-accent-text size-3.5 shrink-0" />
                    <span className="font-semibold">{suggestion.modeLabel}</span>
                  </p>
                  <p className="text-fg-secondary mt-0.5 text-caption1">{suggestion.location}</p>
                  <p className="mt-1.5 text-footnote leading-relaxed">
                    <span className="sr-only">{suggestion.spoken}</span>
                    <span aria-hidden>
                      {suggestion.tokens.map((token, index) => (
                        <span key={index}>
                          {index > 0 && " "}
                          {token.kind === "del" ? (
                            <del className="text-fg-secondary">{token.text}</del>
                          ) : token.kind === "ins" ? (
                            <ins className="bg-accent-subtle decoration-accent-text rounded-xs underline underline-offset-2">
                              {token.text}
                            </ins>
                          ) : (
                            token.text
                          )}
                        </span>
                      ))}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={CheckIcon}
                      shortcut="A"
                      disabledReason={reason}
                      onClick={() => onUse(suggestion.id)}
                    >
                      {intl.formatMessage(messages.use)}
                    </Button>
                    <Button
                      size="sm"
                      variant="plain"
                      icon={X}
                      shortcut="R"
                      onClick={() => onKeep(suggestion.id)}
                    >
                      {intl.formatMessage(messages.keep)}
                    </Button>
                    <Button size="sm" variant="plain" shortcut="E" onClick={() => onShow(suggestion.id)}>
                      {intl.formatMessage(messages.showInCv)}
                    </Button>
                  </div>
                  {reason && <p className="text-warning-text mt-1.5 text-caption1">{reason}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {suggestions.length >= 2 && (
        <Button size="sm" variant="plain" className="self-start" onClick={onKeepAll}>
          {intl.formatMessage(messages.keepRest, { count: suggestions.length })}
        </Button>
      )}
      <p className="text-fg-tertiary text-caption1">{intl.formatMessage(messages.aiDisclaimer)}</p>
    </div>
  );
}

function RestoreButton({ revision, onRestore }: { revision: CvRevisionVM; onRestore: () => void }) {
  const intl = useIntl();
  if (!revision.restoreLabel) return null;
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button size="sm" variant="plain" icon={RotateCcw}>
          {revision.restoreLabel}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <AlertDialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg p-5">
          <AlertDialog.Title className="text-headline">
            {intl.formatMessage(messages.restoreTitle, { date: revision.time.absolute })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-fg-secondary mt-2 text-callout">
            {intl.formatMessage(messages.restoreBody)}
          </AlertDialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{intl.formatMessage(messages.cancel)}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="primary" onClick={onRestore}>
                {intl.formatMessage(messages.restore)}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function HistoryTab({
  editor,
  onRestore,
  onCompare,
}: {
  editor: CvEditorVM;
  onRestore: (revision: CvRevisionVM) => void;
  onCompare: (revision: CvRevisionVM) => void;
}) {
  const intl = useIntl();
  return (
    <div className="flex flex-col gap-5">
      <p className="text-fg-secondary text-footnote">{editor.revisionCountLabel}</p>
      {editor.revisions.map((group) => (
        <section key={group.label}>
          <SectionHeading>{group.label}</SectionHeading>
          <ol className="flex flex-col gap-3">
            {group.revisions.map((revision) => (
              <li key={revision.revisionId} className="border-line-subtle border-l-2 pl-3">
                <p className="text-callout">
                  {revision.sentence}
                  {revision.latestLabel && (
                    <span className="bg-accent-subtle text-accent-text ml-2 rounded-sm px-1.5 py-0.5 text-caption1">
                      {revision.latestLabel}
                    </span>
                  )}
                </p>
                <p className="text-fg-secondary mt-1 flex flex-wrap items-center gap-2 text-footnote">
                  <SourceTag source={revision.source} />
                  <time dateTime={revision.time.iso} title={revision.time.absolute} className="tabular-nums">
                    {revision.clock}
                  </time>
                  {revision.pendingSync && <SyncGlyph />}
                </p>
                <div className="mt-1 -ml-2 flex flex-wrap gap-1">
                  {!revision.isLatest && (
                    <Button size="sm" variant="plain" onClick={() => onCompare(revision)}>
                      {intl.formatMessage(messages.compare)}
                    </Button>
                  )}
                  <RestoreButton revision={revision} onRestore={() => onRestore(revision)} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section>
        <SectionHeading>{intl.formatMessage(messages.usedIn)}</SectionHeading>
        {editor.pinnedApplications.length === 0 ? (
          <p className="text-fg-secondary text-footnote">{editor.pinnedLabel}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {editor.pinnedApplications.map((application) => (
              <li key={application.applicationId} className="text-footnote">
                <p className="text-fg-primary text-callout">{application.label}</p>
                <p className="text-fg-secondary mt-0.5 flex flex-wrap items-center gap-2">
                  <StatusPill status={application.status} size="sm" pendingSync={application.pendingSync} />
                  {application.versionLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Inspector({
  editor,
  draft,
  tab,
  onTab,
  overlay,
  onClose,
  suggestions,
  fills,
  coverage,
  jobId,
  onJob,
  onTheme,
  onPersonal,
  onAddSkill,
  onExclude,
  onUse,
  onKeep,
  onKeepAll,
  onShow,
  onRestore,
  onCompare,
}: {
  editor: CvEditorVM;
  draft: CvDraft;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Floats over the preview instead of docking beside it. */
  overlay: boolean;
  onClose: () => void;
  suggestions: readonly CvSuggestionVM[];
  fills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  coverage: CvCoverage | null;
  jobId: string | null;
  onJob: (jobId: string) => void;
  onTheme: (patch: Partial<Pick<CvDraft, "paperSize" | "density">>) => void;
  onPersonal: (patch: Partial<Pick<CvDraft, "showPhoto" | "showDateOfBirth">>) => void;
  onAddSkill: (keyword: string) => void;
  onExclude: (keyword: string) => void;
  onUse: (id: string) => void;
  onKeep: (id: string) => void;
  onKeepAll: () => void;
  onShow: (id: string) => void;
  onRestore: (revision: CvRevisionVM) => void;
  /** Opens the line diff between this revision and the working copy. */
  onCompare: (revision: CvRevisionVM) => void;
}) {
  const intl = useIntl();
  const tabs: readonly { value: InspectorTab; label: string; count?: number }[] = [
    { value: "design", label: intl.formatMessage(messages.design) },
    { value: "check", label: intl.formatMessage(messages.check) },
    { value: "suggestions", label: intl.formatMessage(messages.suggestions), count: suggestions.length },
    { value: "history", label: intl.formatMessage(messages.history) },
  ];
  return (
    <aside
      aria-label={intl.formatMessage(messages.label)}
      className={cx(
        "bg-surface-base border-line-subtle flex w-[340px] shrink-0 flex-col border-l",
        overlay && "shadow-overlay absolute inset-y-0 right-0 z-(--bfhr-layer-sticky)",
      )}
    >
      <Tabs.Root
        value={tab}
        onValueChange={(value) => onTab(value as InspectorTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-line-subtle flex h-11 shrink-0 items-end gap-1 border-b pr-1 pl-2">
          <ScrollStrip className="flex-1 items-end">
            <Tabs.List aria-label={intl.formatMessage(messages.label)} className="flex gap-1">
              {tabs.map((item) => (
                <Tabs.Trigger key={item.value} value={item.value} className={tabTrigger}>
                  {item.label}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="bg-surface-selected text-fg-secondary ml-1.5 rounded-full px-1.5 text-caption1 tabular-nums">
                      {item.count}
                    </span>
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </ScrollStrip>
          <div className="self-center">
            <IconButton
              size="sm"
              icon={X}
              label={intl.formatMessage(messages.close)}
              shortcut="Mod+Shift+D"
              onClick={onClose}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Tabs.Content value="design">
            <DesignTab editor={editor} draft={draft} onTheme={onTheme} onPersonal={onPersonal} />
          </Tabs.Content>
          <Tabs.Content value="check">
            <CheckTab
              editor={editor}
              jobId={jobId}
              onJob={onJob}
              coverage={coverage}
              onAddSkill={onAddSkill}
              onExclude={onExclude}
            />
          </Tabs.Content>
          <Tabs.Content value="suggestions">
            <SuggestionsTab
              suggestions={suggestions}
              fills={fills}
              onUse={onUse}
              onKeep={onKeep}
              onKeepAll={onKeepAll}
              onShow={onShow}
            />
          </Tabs.Content>
          <Tabs.Content value="history">
            <HistoryTab editor={editor} onRestore={onRestore} onCompare={onCompare} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </aside>
  );
}
