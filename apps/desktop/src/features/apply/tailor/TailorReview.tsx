/**
 * Tailor review (research/apply.md "Decision — Desktop: Tailor review", WRITER + Grammarly): the
 * full content area, opened from the Apply panel's CV field or from CV Studio's Check tab with a
 * job picked.
 *
 * 1. **Choose:** Light or Thorough, then "Suggest edits" (`cvTailor`). AI off, the daily limit and
 *    failures each say what happened in one calm sentence; nothing in the CV changes.
 * 2. **Review:** the CV in the centre with the accepted edits applied (live), a 360 px rail of
 *    cards, each with where, the original → the suggestion, why, and what in the CV it is based
 *    on, plus Accept / Keep original. "Accept all" and "Keep original for the rest" decide in bulk.
 *    Accepted edits that no longer fit the CV are marked "Not applied" with the reason.
 * 3. **Save as new version:** an `ai_tailor` revision (`jobId`, `basedOnRevisionId`) pinned on the
 *    job's application. The CV's own current version doesn't change.
 *
 * Keys: `J` / `K` move between cards, `A` accepts, `R` keeps the original, `Mod+Enter` saves or
 * suggests, `Esc` closes. Answers are kept per job and CV version for the session, so reopening
 * doesn't ask the AI again.
 */
import type { Application, Cv, CvRevision, Job, JobMatch, TailorIntensity } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { Check, CircleCheck, Info, Sparkles, Undo2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsRepository } from "../../../data/jobs/repository";
import { useConnectivity } from "../../../shared/connectivity";
import { cx } from "../../../shared/cx";
import { useKeyBindings } from "../../../shared/keyboard/useKeyBindings";
import { AiBadge, AiDisclosureLine } from "../../../shared/ui/AiBadge";
import { Button, IconButton } from "../../../shared/ui/Button";
import { EmptyState } from "../../../shared/ui/EmptyState";
import { InlineAlert } from "../../../shared/ui/InlineAlert";
import { useToast } from "../../../shared/ui/Toast";
import { PreviewPane } from "../../cv-editor/PreviewPane";
import { renderCv } from "../../cv-editor/render";
import {
  acceptAll,
  decide,
  keepRest,
  TAILOR_INTENSITIES,
  type TailorCardVM,
  tailorDiffSummary,
  type TailorErrorKind,
  tailorErrorKind,
  tailorErrorSentence,
  type TailorReviewState,
  tailorReviewVM,
} from "./model";

const messages = defineMessages({
  title: { id: "apply.tailor.title", defaultMessage: "Tailor your CV for {company}" },
  subtitle: { id: "apply.tailor.subtitle", defaultMessage: "{role} · from “{cv}”" },
  close: { id: "apply.tailor.close", defaultMessage: "Close tailoring" },
  keyGroup: { id: "apply.tailor.keyGroup", defaultMessage: "Tailoring" },
  keyNext: { id: "apply.tailor.keyNext", defaultMessage: "Next suggestion" },
  keyPrevious: { id: "apply.tailor.keyPrevious", defaultMessage: "Previous suggestion" },
  keyAccept: { id: "apply.tailor.keyAccept", defaultMessage: "Accept the suggestion" },
  keyKeep: { id: "apply.tailor.keyKeep", defaultMessage: "Keep the original" },
  keyPrimary: { id: "apply.tailor.keyPrimary", defaultMessage: "Suggest edits, or save the tailored version" },
  intensity: { id: "apply.tailor.intensity", defaultMessage: "How much to change" },
  light: { id: "apply.tailor.intensity.light", defaultMessage: "Light" },
  lightHint: {
    id: "apply.tailor.intensity.lightHint",
    defaultMessage: "Rewords and reorders your bullets and keywords.",
  },
  thorough: { id: "apply.tailor.intensity.thorough", defaultMessage: "Thorough" },
  thoroughHint: {
    id: "apply.tailor.intensity.thoroughHint",
    defaultMessage: "Also your headline and summary; adds or removes bullets and keywords, and reorders sections.",
  },
  intro: {
    id: "apply.tailor.intro",
    defaultMessage:
      "Suggests edits based on the job description. You review each one; names, dates, employers and titles are never changed.",
  },
  suggest: { id: "apply.tailor.suggest", defaultMessage: "Suggest edits" },
  reading: { id: "apply.tailor.reading", defaultMessage: "Reading the job description…" },
  cancel: { id: "apply.tailor.cancel", defaultMessage: "Cancel" },
  tryAgain: { id: "apply.tailor.tryAgain", defaultMessage: "Try again" },
  openAiSettings: { id: "apply.tailor.openAiSettings", defaultMessage: "Open AI settings" },
  disclosure: {
    id: "apply.tailor.disclosure",
    defaultMessage: "AI suggestions. Check every change before saving.",
  },
  nothingTitle: { id: "apply.tailor.nothingTitle", defaultMessage: "Nothing to change" },
  nothingBody: {
    id: "apply.tailor.nothingBody",
    defaultMessage: "Your CV already covers what this job asks for, in words the AI could back up. You can use it as it is.",
  },
  suggestions: { id: "apply.tailor.suggestions", defaultMessage: "Suggestions" },
  acceptAll: { id: "apply.tailor.acceptAll", defaultMessage: "Accept all" },
  keepRest: {
    id: "apply.tailor.keepRest",
    defaultMessage: "{count, plural, one {Keep original for the rest (#)} other {Keep original for the rest (#)}}",
  },
  accept: { id: "apply.tailor.accept", defaultMessage: "Accept" },
  keep: { id: "apply.tailor.keep", defaultMessage: "Keep original" },
  original: { id: "apply.tailor.original", defaultMessage: "Original" },
  suggestion: { id: "apply.tailor.suggestion", defaultMessage: "Suggestion" },
  removed: { id: "apply.tailor.removedText", defaultMessage: "This line is left out." },
  before: { id: "apply.tailor.before", defaultMessage: "Now" },
  after: { id: "apply.tailor.after", defaultMessage: "Suggested order" },
  why: { id: "apply.tailor.why", defaultMessage: "Why: {reason}" },
  basedOn: { id: "apply.tailor.basedOn", defaultMessage: "Based on: {sources}" },
  basedOnSelf: { id: "apply.tailor.basedOnSelf", defaultMessage: "Based on: the original line only" },
  gap: {
    id: "apply.tailor.gap",
    defaultMessage: "This suggestion has {gap} for a number only you know. Keep the original here, and add your real number in CV Studio.",
  },
  save: { id: "apply.tailor.save", defaultMessage: "Save as new version" },
  saving: { id: "apply.tailor.saving", defaultMessage: "Saving…" },
  saved: {
    id: "apply.tailor.saved",
    defaultMessage: "Saved a version tailored for {company}. It's used for this application; your CV itself is unchanged.",
  },
  saveFailed: {
    id: "apply.tailor.saveFailed",
    defaultMessage: "Couldn't save the tailored version. Your decisions are kept; try again.",
  },
  decisionAccepted: { id: "apply.tailor.decisionAccepted", defaultMessage: "Accepted" },
  decisionKept: { id: "apply.tailor.decisionKept", defaultMessage: "Original kept" },
  undoDecision: { id: "apply.tailor.undoDecision", defaultMessage: "Decide again" },
});

/** One answer per user, job and CV version for the session (reopening doesn't ask again). */
interface TailorSession {
  readonly intensity: TailorIntensity;
  readonly review: TailorReviewState | null;
}
export const tailorSessions = new Map<string, TailorSession>();

type Phase =
  | { readonly step: "choose" }
  | { readonly step: "loading"; readonly attempt: number }
  | { readonly step: "error"; readonly kind: TailorErrorKind }
  | { readonly step: "review" };

export interface TailorReviewProps {
  readonly cv: Pick<Cv, "id" | "title" | "language">;
  /** The version to tailor (usually the CV's current one); the edits address it. */
  readonly revision: CvRevision;
  readonly job: Job;
  readonly match: JobMatch | null;
  readonly application: Application | null;
  /** `profile.aiEnabled`: off shows the AI-off state instead of asking. */
  readonly aiEnabled: boolean;
  readonly onClose: () => void;
  readonly onSaved: (saved: { readonly revisionId: string; readonly applicationId: string }) => void;
}

export function TailorReview({ cv, revision, job, match, application, aiEnabled, onClose, onSaved }: TailorReviewProps) {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const repository = useJobsRepository();
  const online = useConnectivity().status !== "offline";
  const key = `${repository.uid}:${job.id}:${revision.id}`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const intensityId = useId();

  const [session, setSession] = useState<TailorSession>(
    () => tailorSessions.get(key) ?? { intensity: "light", review: null },
  );
  const update = (next: TailorSession) => {
    tailorSessions.set(key, next);
    setSession(next);
  };
  const [phase, setPhase] = useState<Phase>(session.review ? { step: "review" } : { step: "choose" });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const railRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [phase.step]);

  const suggest = () => {
    if (!aiEnabled || phase.step === "loading") return;
    const attempt = Date.now();
    setPhase({ step: "loading", attempt });
    repository
      .tailorCv({ cvId: cv.id, revisionId: revision.id, jobId: job.id, locale: intlLanguage(intl.locale), intensity: session.intensity })
      .then(
        (response) => {
          setPhase((current) => {
            if (current.step !== "loading" || current.attempt !== attempt) return current;
            update({ ...session, review: { response, decisions: {} } });
            return { step: "review" };
          });
        },
        (error: unknown) => {
          console.error("cvTailor failed", error);
          setPhase((current) =>
            current.step === "loading" && current.attempt === attempt
              ? { step: "error", kind: tailorErrorKind(error, online) }
              : current,
          );
        },
      );
  };

  const review = session.review;
  const vm = useMemo(() => (review ? tailorReviewVM(revision.content, review, intl) : null), [review, revision.content, intl]);
  const rendered = useMemo(() => renderCv(vm?.content ?? revision.content, cv.language), [vm, revision.content, cv.language]);
  const focused = vm?.cards.find((card) => card.id === focusedId) ?? null;

  const setReview = (next: TailorReviewState) => update({ ...session, review: next });

  const save = () => {
    if (!vm || !review || vm.saveBlocker !== null || saving) return;
    setSaving(true);
    const write = repository.saveTailoredRevision({
      job,
      match,
      application,
      revision: {
        cvId: cv.id,
        content: vm.content,
        source: "ai_tailor",
        basedOnRevisionId: revision.id,
        jobId: job.id,
        diffSummary: tailorDiffSummary(job, vm, intl),
      },
    });
    write.done.catch((error: unknown) => {
      console.error("Saving the tailored version failed", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.saveFailed) });
    });
    tailorSessions.delete(key);
    toast.show({ variant: "info", message: intl.formatMessage(messages.saved, { company: job.company }) });
    setSaving(false);
    onSaved(write.ids);
  };

  const moveFocus = (step: 1 | -1) => {
    if (!vm || vm.cards.length === 0) return;
    const index = vm.cards.findIndex((card) => card.id === focusedId);
    const next = vm.cards[Math.min(vm.cards.length - 1, Math.max(0, index === -1 ? 0 : index + step))];
    if (!next) return;
    setFocusedId(next.id);
    railRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const group = intl.formatMessage(messages.keyGroup);
  const reviewing = phase.step === "review" && vm !== null;
  useKeyBindings([
    {
      id: "apply.tailor.close",
      keys: "Escape",
      label: intl.formatMessage(messages.close),
      group,
      inTextFields: true,
      run: (event) => {
        event.preventDefault();
        onClose();
      },
    },
    {
      id: "apply.tailor.primary",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.keyPrimary),
      group,
      enabled: phase.step === "choose" || phase.step === "error" || reviewing,
      run: (event) => {
        event.preventDefault();
        if (reviewing) save();
        else suggest();
      },
    },
    { id: "apply.tailor.next", keys: "J", label: intl.formatMessage(messages.keyNext), group, enabled: reviewing, run: () => moveFocus(1) },
    { id: "apply.tailor.previous", keys: "K", label: intl.formatMessage(messages.keyPrevious), group, enabled: reviewing, run: () => moveFocus(-1) },
    {
      id: "apply.tailor.accept",
      keys: "A",
      label: intl.formatMessage(messages.keyAccept),
      group,
      enabled: reviewing && focused !== null,
      run: () => review && focused && setReview(decide(review, focused.id, "accepted")),
    },
    {
      id: "apply.tailor.keep",
      keys: "R",
      label: intl.formatMessage(messages.keyKeep),
      group,
      enabled: reviewing && focused !== null,
      run: () => review && focused && setReview(decide(review, focused.id, "kept")),
    },
  ]);

  const header = (
    <header className="border-line-subtle flex items-start gap-3 border-b px-5 pt-4 pb-3">
      <div className="min-w-0 flex-1">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-display text-title3 outline-none">
          {intl.formatMessage(messages.title, { company: job.company })}
        </h2>
        <p className="text-fg-secondary text-callout mt-0.5 truncate">
          {intl.formatMessage(messages.subtitle, { role: job.title, cv: cv.title })}
        </p>
      </div>
      <IconButton icon={X} label={intl.formatMessage(messages.close)} shortcut="Escape" onClick={onClose} />
    </header>
  );

  if (!reviewing) {
    const loading = phase.step === "loading";
    return (
      <section aria-labelledby={headingId} className="bg-surface-base flex h-full min-h-0 w-full flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="mx-auto flex max-w-[36rem] flex-col gap-5">
            <p className="text-callout text-fg-secondary">{intl.formatMessage(messages.intro)}</p>
            {!aiEnabled && (
              <InlineAlert
                tone="info"
                title={tailorErrorSentence("aiDisabled", intl)}
                action={{
                  label: intl.formatMessage(messages.openAiSettings),
                  onClick: () => void navigate({ to: "/settings/$pane", params: { pane: "ai" } }),
                }}
              />
            )}
            <fieldset className="flex flex-col gap-2" disabled={loading || !aiEnabled}>
              <legend id={intensityId} className="text-footnote text-fg-secondary mb-1 font-medium">
                {intl.formatMessage(messages.intensity)}
              </legend>
              {TAILOR_INTENSITIES.map((intensity) => (
                <label
                  key={intensity}
                  className={cx(
                    "border-line-control flex cursor-default items-start gap-3 rounded-lg border p-3",
                    session.intensity === intensity && "border-accent-solid bg-accent-subtle",
                  )}
                >
                  <input
                    type="radio"
                    name={intensityId}
                    value={intensity}
                    checked={session.intensity === intensity}
                    onChange={() => update({ ...session, intensity })}
                    className="accent-accent-solid mt-1 size-4"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-callout font-medium">{intl.formatMessage(messages[intensity])}</span>
                    <span className="text-fg-secondary text-footnote">
                      {intl.formatMessage(intensity === "light" ? messages.lightHint : messages.thoroughHint)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {phase.step === "error" && (
              <InlineAlert
                tone={phase.kind === "aiDisabled" || phase.kind === "dailyCap" ? "info" : "error"}
                fromAction
                title={tailorErrorSentence(phase.kind, intl)}
                {...(phase.kind === "aiDisabled" || phase.kind === "dailyCap"
                  ? {}
                  : { action: { label: intl.formatMessage(messages.tryAgain), onClick: suggest } })}
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={Sparkles}
                shortcut="Mod+Enter"
                loading={loading}
                loadingLabel={intl.formatMessage(messages.reading)}
                disabledReason={aiEnabled ? null : tailorErrorSentence("aiDisabled", intl)}
                onClick={suggest}
              >
                {intl.formatMessage(messages.suggest)}
              </Button>
              {loading && (
                <>
                  <p role="status" className="text-fg-secondary text-callout">
                    {intl.formatMessage(messages.reading)}
                  </p>
                  <Button variant="plain" onClick={() => setPhase({ step: "choose" })}>
                    {intl.formatMessage(messages.cancel)}
                  </Button>
                </>
              )}
            </div>
            <AiDisclosureLine text={intl.formatMessage(messages.disclosure)} />
          </div>
        </div>
      </section>
    );
  }

  const undecided = vm.pending;
  return (
    <section aria-labelledby={headingId} className="bg-surface-base flex h-full min-h-0 w-full flex-col">
      {header}
      <div className="flex min-h-0 flex-1">
        <PreviewPane
          rendered={rendered}
          paperLabel={revision.content.meta.theme.paperSize === "letter" ? "Letter" : "A4"}
          highlightPath={focused?.focusPath ?? null}
          onLocate={(path) => {
            const card = vm.cards.find((candidate) => path === candidate.focusPath || path.startsWith(`${candidate.focusPath}/`));
            if (!card) return;
            setFocusedId(card.id);
            railRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(card.id)}"]`)?.focus();
          }}
        />
        <aside
          aria-label={intl.formatMessage(messages.suggestions)}
          className="border-line-subtle flex min-h-0 w-[22.5rem] shrink-0 flex-col border-l"
        >
          <div className="border-line-subtle flex flex-col gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-headline min-w-0 flex-1">{vm.heading}</h3>
              <AiBadge />
            </div>
            <AiDisclosureLine text={intl.formatMessage(messages.disclosure)} />
            {vm.droppedNote && (
              <p className="text-fg-secondary text-footnote flex items-start gap-1.5">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                <span>{vm.droppedNote}</span>
              </p>
            )}
            {vm.cards.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={Check} onClick={() => setReview(acceptAll(review as TailorReviewState))}>
                  {intl.formatMessage(messages.acceptAll)}
                </Button>
                {undecided > 0 && (
                  <Button size="sm" variant="plain" onClick={() => setReview(keepRest(review as TailorReviewState))}>
                    {intl.formatMessage(messages.keepRest, { count: undecided })}
                  </Button>
                )}
              </div>
            )}
          </div>
          {vm.cards.length === 0 ? (
            <div className="p-4">
              <EmptyState
                kind="subArea"
                title={intl.formatMessage(messages.nothingTitle)}
                body={intl.formatMessage(messages.nothingBody)}
              />
            </div>
          ) : (
            <ol ref={railRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
              {vm.cards.map((card) => (
                <SuggestionCard
                  key={card.id}
                  card={card}
                  focused={card.id === focusedId}
                  onFocus={() => setFocusedId(card.id)}
                  onDecide={(decision) => setReview(decide(review as TailorReviewState, card.id, decision))}
                  onUndecide={() => {
                    const { [card.id]: _removed, ...rest } = (review as TailorReviewState).decisions;
                    setReview({ ...(review as TailorReviewState), decisions: rest });
                  }}
                />
              ))}
            </ol>
          )}
          <footer className="border-line-subtle flex flex-wrap items-center gap-3 border-t px-4 py-3">
            <p role="status" className="text-fg-secondary text-footnote min-w-0 flex-1">
              {vm.cards.length > 0 ? vm.tally : null}
            </p>
            <Button
              variant="primary"
              icon={CircleCheck}
              shortcut="Mod+Enter"
              loading={saving}
              loadingLabel={intl.formatMessage(messages.saving)}
              disabledReason={vm.saveBlocker}
              onClick={save}
            >
              {intl.formatMessage(messages.save)}
            </Button>
          </footer>
        </aside>
      </div>
    </section>
  );
}

/** The UI language for the `locale` of the request (the edits' "Why" lines). */
function intlLanguage(locale: string): "en" | "tr" | "de" {
  const base = locale.toLowerCase().split("-")[0];
  return base === "tr" || base === "de" ? base : "en";
}

function SuggestionCard({
  card,
  focused,
  onFocus,
  onDecide,
  onUndecide,
}: {
  card: TailorCardVM;
  focused: boolean;
  onFocus: () => void;
  onDecide: (decision: "accepted" | "kept") => void;
  onUndecide: () => void;
}) {
  const intl = useIntl();
  const titleId = useId();
  const reorder = card.op === "reorder";
  return (
    <li>
      <article
        data-card-id={card.id}
        tabIndex={-1}
        aria-labelledby={titleId}
        onFocus={onFocus}
        onClick={onFocus}
        className={cx(
          "border-line-subtle bg-surface-base flex flex-col gap-2 rounded-lg border p-3 outline-none",
          focused && "border-accent-solid ring-line-focus ring-2",
          card.decision === "kept" && "bg-surface-sunken",
        )}
      >
        <p id={titleId} className="text-footnote text-fg-secondary flex flex-wrap items-center gap-x-2">
          <span className="bg-surface-selected text-fg-primary rounded-sm px-1.5 text-caption1 font-medium">
            {card.opLabel}
          </span>
          <span className="min-w-0 break-words">{card.location}</span>
        </p>
        {card.before !== null && (
          <div>
            <p className="text-caption1 text-fg-tertiary font-medium">
              {intl.formatMessage(reorder ? messages.before : messages.original)}
            </p>
            <p className={cx("text-callout text-fg-secondary break-words", !reorder && "line-through")}>{card.before}</p>
          </div>
        )}
        <div>
          <p className="text-caption1 text-fg-tertiary font-medium">
            {intl.formatMessage(reorder ? messages.after : messages.suggestion)}
          </p>
          <p className="text-callout break-words">{card.after ?? intl.formatMessage(messages.removed)}</p>
        </div>
        <p className="text-footnote">{intl.formatMessage(messages.why, { reason: card.reason })}</p>
        <p className="text-footnote text-fg-secondary">
          {card.groundedIn.length > 0
            ? intl.formatMessage(messages.basedOn, { sources: intl.formatList(card.groundedIn, { type: "conjunction" }) })
            : intl.formatMessage(messages.basedOnSelf)}
        </p>
        {card.gap && (
          <p className="text-warning-text text-footnote">{intl.formatMessage(messages.gap, { gap: card.gap })}</p>
        )}
        {card.skipped && (
          <p className="text-fg-secondary text-footnote flex items-start gap-1.5">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            <span>{card.skipped}</span>
          </p>
        )}
        {card.decision === null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={Check}
              shortcut="A"
              aria-describedby={titleId}
              disabledReason={card.gap ? intl.formatMessage(messages.gap, { gap: card.gap }) : null}
              onClick={() => onDecide("accepted")}
            >
              {intl.formatMessage(messages.accept)}
            </Button>
            <Button size="sm" variant="plain" shortcut="R" aria-describedby={titleId} onClick={() => onDecide("kept")}>
              {intl.formatMessage(messages.keep)}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className={cx("text-footnote flex items-center gap-1 font-medium", card.decision === "accepted" ? "text-success-text" : "text-fg-secondary")}>
              {card.decision === "accepted" && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
              {intl.formatMessage(card.decision === "accepted" ? messages.decisionAccepted : messages.decisionKept)}
            </p>
            <Button size="sm" variant="plain" icon={Undo2} aria-describedby={titleId} onClick={onUndecide}>
              {intl.formatMessage(messages.undoDecision)}
            </Button>
          </div>
        )}
      </article>
    </li>
  );
}
