/**
 * The match section of the job detail (job-detail.md "Decision — Desktop" 4, "Our rules"): band
 * label first, "72 of 100" second, the segmented band bar, the CV basis line with Change, summary
 * counts, then the breakdown (requirements, skills, why it matches, AI summary, gaps) open for
 * Strong / Good and folded for Partial / Stretch. Never "%", never a gauge.
 */
import {
  Check,
  ChevronDown,
  CircleDashed,
  CircleDot,
  Circle,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, DropdownMenu } from "radix-ui";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { MatchFactorStatus } from "@bfhr/core";
import { cx } from "../../shared/cx";
import { AiBadge } from "../../shared/ui/AiBadge";
import { Button, IconButton } from "../../shared/ui/Button";
import { MatchBandBar } from "../../shared/ui/MatchBand";
import { MenuContent, MenuRadioGroup, MenuRadioItem } from "../../shared/ui/Menu";
import { NeedsConnection } from "../../shared/ui/NeedsConnection";
import { ProgressNote } from "../../shared/ui/ProgressNote";
import type { EvidenceVM, FactorVM, JobDetailCopyVM, MatchSectionVM, RequirementVM } from "./model";

const messages = defineMessages({
  heading: { id: "job-detail.view.matchHeading", defaultMessage: "How this job fits" },
  showBreakdown: { id: "job-detail.view.showBreakdown", defaultMessage: "Show the breakdown" },
  hideBreakdown: { id: "job-detail.view.hideBreakdown", defaultMessage: "Hide the breakdown" },
  inCv: { id: "job-detail.view.skillsInCv", defaultMessage: "In your CV" },
  notInCv: { id: "job-detail.view.skillsNotInCv", defaultMessage: "Not in your CV yet" },
  cvMenu: { id: "job-detail.view.cvMenu", defaultMessage: "Match against" },
  rescoring: {
    id: "job-detail.view.rescoring",
    defaultMessage: "Checking how this job fits “{cv}”…",
  },
  helpful: { id: "job-detail.view.aiHelpful", defaultMessage: "This summary is helpful" },
  notHelpful: { id: "job-detail.view.aiNotHelpful", defaultMessage: "This summary is wrong or unhelpful" },
  feedbackThanks: {
    id: "job-detail.view.aiFeedbackThanks",
    defaultMessage: "Thanks. Your feedback helps us write better summaries.",
  },
  haveThisDone: {
    id: "job-detail.view.haveThisDone",
    defaultMessage: "Added to your profile. We'll update the match.",
  },
  undo: { id: "job-detail.view.undoGap", defaultMessage: "Undo" },
  evidence: { id: "job-detail.view.evidence", defaultMessage: "{from}: “{quote}”" },
});

const statusIcon: Readonly<Record<MatchFactorStatus, LucideIcon>> = {
  met: Check,
  partial: CircleDot,
  missing: Circle,
  outside_prefs: TriangleAlert,
  not_stated: CircleDashed,
};

const statusTone: Readonly<Record<MatchFactorStatus, string>> = {
  met: "text-accent-text",
  partial: "text-fg-secondary",
  missing: "text-fg-tertiary",
  outside_prefs: "text-warning-text",
  not_stated: "text-fg-tertiary",
};

function Evidence({ evidence }: { evidence: EvidenceVM }) {
  const intl = useIntl();
  return (
    <p className="text-fg-tertiary text-footnote mt-0.5">
      {intl.formatMessage(messages.evidence, { from: evidence.fromLabel, quote: evidence.quote })}
    </p>
  );
}

function Requirement({ item, copy }: { item: RequirementVM; copy: JobDetailCopyVM }) {
  const Icon = statusIcon[item.status];
  return (
    <li className="flex gap-2">
      <Icon aria-hidden="true" className={cx("mt-0.5 size-4 shrink-0", statusTone[item.status])} strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-callout">
          <span className="sr-only">{item.statusLabel}: </span>
          {item.text}
          <span className="text-fg-tertiary text-footnote whitespace-nowrap">
            {" · "}
            {item.impactLabel}
            {item.ai && ` · ${copy.aiFactor}`}
          </span>
        </p>
        {item.evidence && <Evidence evidence={item.evidence} />}
      </div>
    </li>
  );
}

function Factor({
  factor,
  copy,
  resolved,
  onHaveThis,
  onUndoHaveThis,
  onAddToCv,
}: {
  factor: FactorVM;
  copy: JobDetailCopyVM;
  resolved: boolean;
  onHaveThis?: () => void;
  onUndoHaveThis?: () => void;
  onAddToCv?: () => void;
}) {
  const intl = useIntl();
  const Icon = statusIcon[resolved ? "met" : factor.status];
  return (
    <li className="border-line-subtle flex gap-3 rounded-md border p-3">
      <Icon
        aria-hidden="true"
        className={cx("mt-0.5 size-4 shrink-0", statusTone[resolved ? "met" : factor.status])}
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className={cx("text-callout min-w-0 flex-1", resolved && "text-fg-secondary")}>
            {factor.text}
          </p>
          <span className="text-fg-tertiary text-footnote shrink-0 whitespace-nowrap">
            {factor.impactLabel}
            {factor.ai && ` · ${copy.aiFactor}`}
          </span>
        </div>
        {factor.evidence && <Evidence evidence={factor.evidence} />}
        {factor.correctable &&
          (resolved ? (
            <p className="text-fg-secondary text-footnote mt-2 flex flex-wrap items-center gap-2" role="status">
              {intl.formatMessage(messages.haveThisDone)}
              <Button size="sm" variant="plain" onClick={onUndoHaveThis}>
                {intl.formatMessage(messages.undo)}
              </Button>
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={onHaveThis}>
                {copy.haveThis}
              </Button>
              <Button size="sm" variant="plain" onClick={onAddToCv}>
                {copy.addToCv}
              </Button>
            </div>
          ))}
      </div>
    </li>
  );
}

export interface MatchSectionProps {
  match: MatchSectionVM;
  copy: JobDetailCopyVM;
  /** Gap texts the user marked "I have this" (optimistic). */
  resolvedGaps: ReadonlySet<string>;
  onHaveThis: (gap: FactorVM) => void;
  onUndoHaveThis: (gap: FactorVM) => void;
  onAddToCv: (cvId: string) => void;
  /** A CV picked from Change other than the scored one: the section waits for the new score. */
  rescoringCv: { readonly id: string; readonly title: string } | null;
  onChangeCv: (cvId: string) => void;
  feedback: "up" | "down" | null;
  onFeedback: (value: "up" | "down" | null) => void;
}

export function MatchSection({
  match,
  copy,
  resolvedGaps,
  onHaveThis,
  onUndoHaveThis,
  onAddToCv,
  rescoringCv,
  onChangeCv,
  feedback,
  onFeedback,
}: MatchSectionProps) {
  const intl = useIntl();
  const headingId = useId();
  const [open, setOpen] = useState(match.state === "ready" && match.defaultOpen);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const explainerId = useId();

  const frame = (children: React.ReactNode) => (
    <section aria-labelledby={headingId} className="border-line-subtle flex flex-col gap-4 rounded-lg border p-5">
      <h3 id={headingId} className="text-fg-secondary text-subheadline font-medium">
        {intl.formatMessage(messages.heading)}
      </h3>
      {children}
    </section>
  );

  if (match.state === "pending") return frame(<ProgressNote label={match.label} />);
  if (match.state === "noCv") return frame(<p className="text-body">{match.label}</p>);

  const cvMenu = (
    <NeedsConnection>
      {(reason) => (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button size="sm" variant="plain" disabledReason={reason}>
              {copy.changeCv}
              <ChevronDown aria-hidden="true" className="ml-0.5 inline size-3.5 align-[-2px]" strokeWidth={1.75} />
            </Button>
          </DropdownMenu.Trigger>
          <MenuContent aria-label={intl.formatMessage(messages.cvMenu)}>
            <MenuRadioGroup
              label={intl.formatMessage(messages.cvMenu)}
              value={rescoringCv?.id ?? match.basedOnCvId}
              onValueChange={onChangeCv}
            >
              {match.cvOptions.map((cv) => (
                <MenuRadioItem key={cv.id} value={cv.id}>
                  {cv.title}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </DropdownMenu.Root>
      )}
    </NeedsConnection>
  );

  if (rescoringCv)
    return frame(
      <>
        <div className="flex flex-wrap items-center gap-x-2">
          <ProgressNote label={intl.formatMessage(messages.rescoring, { cv: rescoringCv.title })} />
          {cvMenu}
        </div>
      </>,
    );

  return frame(
    <Collapsible.Root open={open} onOpenChange={setOpen} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-title2">{match.bandText}</span>
            <span className="text-fg-secondary text-callout tabular-nums">{match.scoreCaption}</span>
          </p>
          <Collapsible.Trigger asChild>
            <Button size="sm" variant="plain">
              {intl.formatMessage(open ? messages.hideBreakdown : messages.showBreakdown)}
              <ChevronDown
                aria-hidden="true"
                className={cx(
                  "ml-1 inline size-3.5 align-[-2px] transition-transform duration-(--bfhr-duration-fast)",
                  open && "rotate-180",
                )}
                strokeWidth={1.75}
              />
            </Button>
          </Collapsible.Trigger>
        </div>
        <div className="max-w-120">
          <MatchBandBar match={match.match} />
        </div>
        <p className="text-fg-secondary text-footnote flex flex-wrap items-center gap-x-1">
          <span>{match.basisLine}</span>
          <span aria-hidden="true">·</span>
          {cvMenu}
        </p>
        <p className="text-callout">{match.countsLine}</p>
        {match.outsidePreferences && !open && (
          <p className="text-warning-text text-callout flex gap-2">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            {match.outsidePreferences}
          </p>
        )}
      </div>

      <Collapsible.Content className="flex flex-col gap-6">
        {match.requirements.length > 0 && (
          <div>
            <h4 className="text-headline mb-2">{copy.requirements}</h4>
            <ul className="grid gap-x-6 gap-y-3 @min-[1000px]:grid-cols-2">
              {match.requirements.map((item) => (
                <Requirement key={item.facet} item={item} copy={copy} />
              ))}
            </ul>
          </div>
        )}

        {match.skills.matched.length + match.skills.unmatched.length > 0 && (
          <div>
            <h4 className="text-headline mb-2">{copy.skills}</h4>
            <dl className="flex flex-col gap-2">
              {match.skills.matched.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <dt className="text-fg-secondary text-footnote mr-1">{intl.formatMessage(messages.inCv)}</dt>
                  {match.skills.matched.map((skill) => (
                    <dd
                      key={skill}
                      className="bg-accent-subtle text-accent-text inline-flex h-6 items-center gap-1 rounded-full px-2 text-footnote font-medium"
                    >
                      <Check aria-hidden="true" className="size-3" strokeWidth={2} />
                      {skill}
                    </dd>
                  ))}
                </div>
              )}
              {match.skills.unmatched.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <dt className="text-fg-secondary text-footnote mr-1">{intl.formatMessage(messages.notInCv)}</dt>
                  {match.skills.unmatched.map((skill) => (
                    <dd
                      key={skill}
                      className="bg-surface-sunken text-fg-secondary inline-flex h-6 items-center rounded-full px-2 text-footnote"
                    >
                      {skill}
                    </dd>
                  ))}
                </div>
              )}
            </dl>
          </div>
        )}

        {match.whyItMatches.length > 0 && (
          <div>
            <h4 className="text-headline mb-2">{copy.whyItMatches}</h4>
            <ul className="flex flex-col gap-2">
              {match.whyItMatches.map((factor) => (
                <Factor key={factor.text} factor={factor} copy={copy} resolved={false} />
              ))}
            </ul>
          </div>
        )}

        {match.aiSummary ? (
          <div className="bg-surface-sunken flex flex-col gap-2 rounded-md p-4">
            <div className="flex flex-wrap items-center gap-2">
              <AiBadge />
              <span className="text-fg-secondary text-footnote">{copy.aiSummary}</span>
            </div>
            <p className="text-body">{match.aiSummary}</p>
            <div className="flex items-center gap-1">
              <IconButton
                icon={ThumbsUp}
                size="sm"
                label={intl.formatMessage(messages.helpful)}
                pressed={feedback === "up"}
                onClick={() => onFeedback(feedback === "up" ? null : "up")}
              />
              <IconButton
                icon={ThumbsDown}
                size="sm"
                label={intl.formatMessage(messages.notHelpful)}
                pressed={feedback === "down"}
                onClick={() => onFeedback(feedback === "down" ? null : "down")}
              />
              <span role="status" className="text-fg-secondary text-footnote ml-2">
                {feedback && intl.formatMessage(messages.feedbackThanks)}
              </span>
            </div>
          </div>
        ) : (
          match.summaryNote && <p className="text-fg-tertiary text-footnote">{match.summaryNote}</p>
        )}

        {match.gaps.length > 0 && (
          <div>
            <h4 className="text-headline mb-2">{copy.gapsToConsider}</h4>
            <ul className="flex flex-col gap-2">
              {match.gaps.map((gap) => (
                <Factor
                  key={gap.text}
                  factor={gap}
                  copy={copy}
                  resolved={resolvedGaps.has(gap.text)}
                  onHaveThis={() => onHaveThis(gap)}
                  onUndoHaveThis={() => onUndoHaveThis(gap)}
                  onAddToCv={() => onAddToCv(match.basedOnCvId)}
                />
              ))}
            </ul>
          </div>
        )}
      </Collapsible.Content>

      <div>
        <Button
          size="sm"
          variant="plain"
          aria-expanded={explainerOpen}
          aria-controls={explainerId}
          onClick={() => setExplainerOpen((value) => !value)}
        >
          {copy.explainerLink}
        </Button>
        <p id={explainerId} hidden={!explainerOpen} className="text-fg-secondary text-footnote mt-1 max-w-150">
          {copy.explainer}
        </p>
      </div>
    </Collapsible.Root>,
  );
}
