/**
 * The job detail pane (job-detail.md "Decision — Desktop"): prev / next bar, header (company,
 * title, fact chips, salary with provenance), action row (Apply by route · Save · Not for me · Open
 * original · More), then a two-column body with a 280 px rail once the pane is ≥ 760 px wide
 * (match → description → application | Details · Found on); below that the facts sit under the
 * header as a grid and Found on moves to the end.
 */
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Building2,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  EyeOff,
  Link2,
  Mail,
  MessageSquareText,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { ApplicationSummaryBlock } from "../../shared/ui/ApplicationSummaryBlock";
import { Button, IconButton } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { MenuContent, MenuItem, MenuSeparator } from "../../shared/ui/Menu";
import { NeedsConnection } from "../../shared/ui/NeedsConnection";
import { SubmitPrompt } from "../../shared/ui/SubmitPrompt";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { MatchSection, type MatchSectionProps } from "./MatchSection";
import type { JobDetailCopyVM, JobDetailVM } from "./model";
import { DetailsCard, SourcesList } from "./Rail";

const messages = defineMessages({
  position: {
    id: "job-detail.view.position",
    defaultMessage: "{position} of {total}",
    description: "Place of the open job in the list, e.g. '3 of 37'",
  },
  previous: { id: "job-detail.view.previousJob", defaultMessage: "Previous job" },
  next: { id: "job-detail.view.nextJob", defaultMessage: "Next job" },
  more: { id: "job-detail.view.moreActions", defaultMessage: "More actions" },
  notForMeWithReason: { id: "job-detail.view.notForMeWithReason", defaultMessage: "Not for me, with a reason…" },
  hideCompany: { id: "job-detail.view.hideCompany", defaultMessage: "Hide all jobs from {company}" },
  copyLink: { id: "job-detail.view.copyLink", defaultMessage: "Copy link to the posting" },
  opensInBrowser: { id: "job-detail.view.applyOpensInBrowser", defaultMessage: "(opens in your browser)" },
  description: { id: "job-detail.view.description", defaultMessage: "About the job" },
  unhide: { id: "job-detail.view.unhide", defaultMessage: "Show in my feed again" },
  hiddenBody: {
    id: "job-detail.view.hiddenBody",
    defaultMessage: "It won't show up in your list. You can still read it and apply here.",
  },
  posted: { id: "job-detail.view.posted", defaultMessage: "Posted {time}" },
  applyOffline: {
    id: "job-detail.view.applyOffline",
    defaultMessage: "Applying needs a connection. You can save the job now and apply once you're back online.",
  },
});

export interface DetailActions {
  onPrevious: () => void;
  onNext: () => void;
  onApply: () => void;
  onToggleSave: () => void;
  onNotForMe: () => void;
  onNotForMeWithReason: () => void;
  onUnhide: () => void;
  onHideCompany: () => void;
  onCopyLink: () => void;
  onOpenUrl: (url: string) => void;
  onViewInTracker: (applicationId: string) => void;
  onOpenCv: (cvId: string) => void;
  onSubmitYes: () => void;
  onSubmitNotYet: () => void;
  onSubmitNotApplying: () => void;
}

function FactChip({ children }: { children: ReactNode }) {
  return (
    <li className="border-line-subtle text-fg-secondary inline-flex h-6 items-center rounded-full border px-2.5 text-footnote">
      {children}
    </li>
  );
}

export function DetailPane({
  detail,
  copy,
  position,
  total,
  saved,
  hidden,
  showSubmitPrompt,
  actions,
  match,
}: {
  detail: JobDetailVM;
  copy: JobDetailCopyVM;
  /** 1-based place in the visible list; null when the job isn't listed (hidden, deep link). */
  position: number | null;
  total: number;
  saved: boolean;
  hidden: boolean;
  showSubmitPrompt: boolean;
  actions: DetailActions;
  match: Omit<MatchSectionProps, "match" | "copy">;
}) {
  const intl = useIntl();
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  // "Show more" only when the 12-line clamp actually cuts text.
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);
  useLayoutEffect(() => {
    const element = descriptionRef.current;
    if (element && !descriptionOpen) setClamped(element.scrollHeight > element.clientHeight + 1);
  }, [descriptionOpen, detail.description]);
  const descriptionId = `job-description-${detail.jobId}`;
  const external = detail.apply.external;
  const ApplyIcon = detail.apply.route === "email" ? Mail : undefined;

  const applyButton = (variant: "primary" | "secondary") =>
    detail.applied ? null : (
      <NeedsConnection>
        {(reason) => (
          <>
            <Button
              variant={variant}
              shortcut="A"
              disabledReason={reason}
              onClick={actions.onApply}
              className={variant === "secondary" ? "w-full" : undefined}
              {...(ApplyIcon && { icon: ApplyIcon })}
            >
              {detail.apply.label}
              {external && (
                <>
                  <ArrowUpRight aria-hidden="true" className="ml-1 inline size-4 align-[-3px]" strokeWidth={1.75} />
                  <span className="sr-only"> {intl.formatMessage(messages.opensInBrowser)}</span>
                </>
              )}
            </Button>
            {/* Offline: say why in place, not only in the tooltip (states.md "Offline"). */}
            {reason && variant === "primary" && (
              <span aria-hidden="true" className="text-fg-secondary text-footnote order-last basis-full">
                {intl.formatMessage(messages.applyOffline)}
              </span>
            )}
          </>
        )}
      </NeedsConnection>
    );

  const chips = [detail.where, detail.employmentType, detail.seniority].filter(
    (chip): chip is string => chip !== null,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-line-subtle flex h-11 shrink-0 items-center gap-1 border-b px-3">
        <IconButton
          icon={ChevronUp}
          label={intl.formatMessage(messages.previous)}
          shortcut="K"
          disabledReason={detail.previousJobId === null ? copy.noSelectionHint : null}
          onClick={actions.onPrevious}
        />
        <IconButton
          icon={ChevronDown}
          label={intl.formatMessage(messages.next)}
          shortcut="J"
          disabledReason={detail.nextJobId === null ? copy.noSelectionHint : null}
          onClick={actions.onNext}
        />
        {position !== null && (
          <span className="text-fg-secondary text-footnote ml-1 tabular-nums">
            {intl.formatMessage(messages.position, { position, total })}
          </span>
        )}
        {detail.pendingSync && (
          <span className="ml-auto">
            <SyncGlyph />
          </span>
        )}
      </div>

      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <article
          aria-labelledby={`job-title-${detail.jobId}`}
          className="mx-auto flex max-w-300 flex-col gap-5 px-6 pt-5 pb-10"
        >
          {hidden && (
            <InlineAlert
              tone="info"
              title={copy.hidden}
              action={{ label: intl.formatMessage(messages.unhide), onClick: actions.onUnhide }}
            >
              {intl.formatMessage(messages.hiddenBody)}
            </InlineAlert>
          )}
          {detail.delisted && (
            <InlineAlert tone="warning" title={detail.delisted} />
          )}
          {detail.submitPrompt && showSubmitPrompt && (
            <SubmitPrompt
              company={detail.company.name}
              variant="asking"
              onYes={actions.onSubmitYes}
              onNotYet={actions.onSubmitNotYet}
              onNotApplying={actions.onSubmitNotApplying}
            />
          )}

          <header className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Monogram company={detail.company} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-fg-secondary text-callout flex flex-wrap items-center gap-x-1.5">
                  <span className="text-fg-primary font-medium">{detail.company.name}</span>
                  {detail.posted && (
                    <>
                      <span aria-hidden="true">·</span>
                      <time dateTime={detail.posted.iso} title={detail.posted.absolute}>
                        {intl.formatMessage(messages.posted, { time: detail.posted.label })}
                      </time>
                    </>
                  )}
                </p>
                <h2 id={`job-title-${detail.jobId}`} tabIndex={-1} className="text-title2 mt-0.5 outline-none">
                  {detail.title}
                </h2>
              </div>
            </div>
            {chips.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={copy.details}>
                {chips.map((chip) => (
                  <FactChip key={chip}>{chip}</FactChip>
                ))}
              </ul>
            )}
            <p className={cx("text-callout", detail.salary.provenance === "notStated" && "text-fg-tertiary")}>
              {detail.salary.text}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {detail.applied ? (
                <p className="text-callout flex flex-wrap items-center gap-2">
                  <span className="font-medium">{detail.applied.label}</span>
                  <Button
                    size="sm"
                    variant="plain"
                    onClick={() => detail.applied && actions.onViewInTracker(detail.applied.applicationId)}
                  >
                    {detail.applied.linkLabel}
                  </Button>
                </p>
              ) : (
                applyButton("primary")
              )}
              <Button
                icon={saved ? BookmarkCheck : Bookmark}
                shortcut="S"
                aria-pressed={saved}
                onClick={actions.onToggleSave}
              >
                {saved ? copy.saved : copy.save}
              </Button>
              {!hidden && (
                <Button icon={EyeOff} shortcut="D" onClick={actions.onNotForMe}>
                  {copy.notForMe}
                </Button>
              )}
              <Button variant="plain" shortcut="O" onClick={() => actions.onOpenUrl(detail.originalUrl)}>
                {copy.openOriginal}
                <ArrowUpRight aria-hidden="true" className="ml-1 inline size-4 align-[-3px]" strokeWidth={1.75} />
                <span className="sr-only"> {intl.formatMessage(messages.opensInBrowser)}</span>
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <IconButton icon={Ellipsis} label={intl.formatMessage(messages.more)} />
                </DropdownMenu.Trigger>
                <MenuContent align="end">
                  {!hidden && (
                    <MenuItem icon={MessageSquareText} shortcut="Shift+D" onSelect={actions.onNotForMeWithReason}>
                      {intl.formatMessage(messages.notForMeWithReason)}
                    </MenuItem>
                  )}
                  <MenuItem icon={Building2} onSelect={actions.onHideCompany}>
                    {intl.formatMessage(messages.hideCompany, { company: detail.company.name })}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={Link2} onSelect={actions.onCopyLink}>
                    {intl.formatMessage(messages.copyLink)}
                  </MenuItem>
                </MenuContent>
              </DropdownMenu.Root>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 @min-[760px]:grid-cols-[minmax(0,1fr)_280px] @min-[760px]:gap-8">
            <div className="flex min-w-0 flex-col gap-6 @max-[759px]:order-2">
              <MatchSection key={detail.jobId} match={detail.match} copy={copy} {...match} />

              <section aria-labelledby={descriptionId} className="flex flex-col gap-2">
                <h3 id={descriptionId} className="text-headline">
                  {intl.formatMessage(messages.description)}
                </h3>
                {detail.noDescription ? (
                  <InlineAlert
                    tone="info"
                    title={detail.noDescription}
                    action={{ label: copy.openOriginalPosting, onClick: () => actions.onOpenUrl(detail.originalUrl) }}
                  />
                ) : (
                  <>
                    <div
                      ref={descriptionRef}
                      lang={detail.descriptionLanguage}
                      style={{ "--lines": detail.descriptionCollapsedLines } as CSSProperties}
                      className={cx("text-body max-w-180 space-y-3", !descriptionOpen && "line-clamp-(--lines)")}
                    >
                      {detail.description.map((paragraph, index) => (
                        <p key={index} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    <div hidden={!clamped && !descriptionOpen}>
                      <Button
                        size="sm"
                        variant="plain"
                        aria-expanded={descriptionOpen}
                        onClick={() => setDescriptionOpen((value) => !value)}
                      >
                        {descriptionOpen ? copy.showLess : copy.showMore}
                      </Button>
                    </div>
                  </>
                )}
              </section>

              {detail.application && (
                <ApplicationSummaryBlock
                  summary={detail.application}
                  headingLevel={3}
                  onOpenCv={actions.onOpenCv}
                />
              )}
            </div>

            <aside
              aria-label={copy.details}
              className="contents @min-[760px]:flex @min-[760px]:flex-col @min-[760px]:gap-4"
            >
              <div className="@max-[759px]:order-1">
                <DetailsCard facts={detail.facts} copy={copy} />
              </div>
              <div className="hidden @min-[760px]:block">{applyButton("secondary")}</div>
              <div className="@max-[759px]:order-3">
                <SourcesList sources={detail.sources} copy={copy} onOpen={actions.onOpenUrl} />
              </div>
            </aside>
          </div>
        </article>
      </div>
    </div>
  );
}
