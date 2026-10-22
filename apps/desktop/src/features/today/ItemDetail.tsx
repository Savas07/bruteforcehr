/**
 * The selected Today item's evidence and actions (today-home.md "Decision — Desktop"): in the
 * detail pane at ≥ 1200 px, inline under the row below that. Each kind uses its shared pattern
 * component (ReviewDetailPane, AutoChangeRow, NudgeCard) or the facts it needs to act.
 */
import {
  AlarmClock,
  Bookmark,
  BookmarkCheck,
  Check,
  ExternalLink,
  FileText,
  Briefcase,
  MapPin,
  Video,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { AutoChangeRow } from "../../shared/ui/AutoChangeRow";
import { Button } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { MatchBandPill } from "../../shared/ui/MatchBand";
import { NeedsConnection } from "../../shared/ui/NeedsConnection";
import { NudgeCard } from "../../shared/ui/NudgeCard";
import { ReviewDetailPane } from "../../shared/ui/ReviewDetailPane";
import { SnoozeMenu, type SnoozePreset } from "../../shared/ui/SnoozeMenu";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import type { AttentionItemVM, DeadlineItemVM, InterviewItemVM, MatchItemVM } from "./model";
import type { SnoozeUntil, TodayActions } from "./useTodayActions";

const messages = defineMessages({
  join: {
    id: "today.detail.join",
    defaultMessage: "Join meeting",
    description: "Button: opens the video call",
  },
  joinOpensAt: {
    id: "today.detail.joinOpensAt",
    defaultMessage: "You can join from {time}",
    description: "Why Join is disabled. {time} is like 'Today, 14:50'",
  },
  openApplication: {
    id: "today.detail.openApplication",
    defaultMessage: "Open application",
    description: "Button",
  },
  openJob: { id: "today.detail.openJob", defaultMessage: "Open job", description: "Button" },
  openInJobs: { id: "today.detail.openInJobs", defaultMessage: "Open in Jobs", description: "Button" },
  openInMail: { id: "today.detail.openInMail", defaultMessage: "Open in Mail", description: "Button" },
  viewEmail: {
    id: "today.detail.viewEmail",
    defaultMessage: "View email",
    description: "Button: the email a deadline came from",
  },
  when: { id: "today.detail.when", defaultMessage: "When", description: "Interview fact label" },
  theirTime: {
    id: "today.detail.theirTime",
    defaultMessage: "Their time",
    description: "Interview fact label: the interviewer's time zone",
  },
  where: { id: "today.detail.where", defaultMessage: "Where", description: "Interview fact label" },
  with: {
    id: "today.detail.with",
    defaultMessage: "With",
    description: "Interview fact label: interviewers",
  },
  whenValue: {
    id: "today.detail.whenValue",
    defaultMessage: "{start} · {range}",
    description: "'Today, 15:00 · 15:00–17:00'",
  },
  person: {
    id: "today.detail.person",
    defaultMessage: "{name}, {title}",
    description: "Interviewer and their job title",
  },
  prep: {
    id: "today.detail.prep",
    defaultMessage: "Prep",
    description: "Heading: material for the interview",
  },
  cvSent: { id: "today.detail.cvSent", defaultMessage: "CV you sent", description: "Prep row label" },
  job: { id: "today.detail.job", defaultMessage: "Job posting", description: "Prep row label" },
  notes: { id: "today.detail.notes", defaultMessage: "Your notes", description: "Prep row label" },
  noPrep: {
    id: "today.detail.noPrep",
    defaultMessage: "No notes yet. Add them from the application.",
    description: "Empty prep notes",
  },
  autoKicker: {
    id: "today.detail.autoKicker",
    defaultMessage: "Updated automatically",
    description: "Heading above an automatic status change in the detail pane",
  },
  followUpKicker: {
    id: "today.detail.followUpKicker",
    defaultMessage: "Suggested follow-up",
    description: "Heading above a follow-up or no-response suggestion in the detail pane",
  },
  markDone: { id: "today.detail.markDone", defaultMessage: "Mark as done", description: "Button" },
  markSeen: { id: "today.detail.markSeen", defaultMessage: "Mark as seen", description: "Button" },
  snooze: {
    id: "today.detail.snooze",
    defaultMessage: "Snooze",
    description: "Button: opens the snooze menu",
  },
  save: { id: "today.detail.save", defaultMessage: "Save", description: "Button: save a job" },
  saved: { id: "today.detail.saved", defaultMessage: "Saved", description: "Button state: the job is saved" },
  notForMe: {
    id: "today.detail.notForMe",
    defaultMessage: "Not for me",
    description: "Button: hide a job (D19)",
  },
  whyMatch: { id: "today.detail.whyMatch", defaultMessage: "Why it matches", description: "Heading" },
  noReason: {
    id: "today.detail.noReason",
    defaultMessage: "Open the job to see how it compares with your CV.",
    description: "When a match has no rule-based reasons",
  },
  snoozedUntil: {
    id: "today.detail.snoozedUntil",
    defaultMessage:
      "{preset, select, laterToday {Snoozed until later today} tomorrow {Snoozed until tomorrow} nextWeek {Snoozed until next week} other {Snoozed until {date, date, long}}}",
    description: "Notice on a snoozed item in the Later view",
  },
  snoozedBody: {
    id: "today.detail.snoozedBody",
    defaultMessage: "It comes back to Today then. You can still act on it now.",
  },
  moveBack: {
    id: "today.detail.moveBack",
    defaultMessage: "Move back now",
    description: "Button: un-snooze",
  },
});

/** In-app destinations the detail links to (IA.md "One home per object"). */
export interface TodayLinks {
  readonly application: (applicationId: string) => void;
  readonly job: (jobId: string) => void;
  readonly mail: (messageId: string) => void;
  readonly cv: (cvId: string) => void;
}

export interface ItemDetailProps {
  item: AttentionItemVM;
  actions: TodayActions;
  links: TodayLinks;
  /** Opens the external meeting link. */
  onJoin: (url: string) => void;
  /** Draft follow-up: the job's Apply panel. */
  onDraftFollowUp: (item: Extract<AttentionItemVM, { kind: "followUp" }>) => void;
  /** `pickDate` was chosen: the screen opens its date dialog. */
  onPickDate: (item: AttentionItemVM) => void;
  /** Controlled snooze menu, so `H` opens it on the selected item. */
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
  /** Saved state of a match after Today's own toggles. */
  saved: boolean;
  /** Set in the Later view: when it comes back. */
  snoozedUntil: SnoozeUntil | null;
  offline: boolean;
  /** 2 in the detail pane, 3 inline under a row (sections are h2). */
  headingLevel: 2 | 3;
  className?: string;
}

function DetailHeader({
  item,
  headingLevel,
  children,
}: {
  item: AttentionItemVM;
  headingLevel: 2 | 3;
  children?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <header className="flex gap-3">
      <Monogram company={item.company} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-footnote text-fg-secondary">{item.company.name}</p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Heading className="text-title3 text-fg-primary font-semibold text-pretty">{item.title}</Heading>
          {item.pendingSync && <SyncGlyph />}
        </div>
        {item.context && <p className="text-callout text-fg-secondary text-pretty">{item.context}</p>}
        {children}
      </div>
    </header>
  );
}

function SnoozeButton({
  open,
  onOpenChange,
  onSnooze,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (preset: SnoozePreset) => void;
}) {
  const intl = useIntl();
  return (
    <SnoozeMenu
      open={open}
      onOpenChange={onOpenChange}
      onSnooze={onSnooze}
      trigger={
        <Button variant="plain" icon={AlarmClock} shortcut="H">
          {intl.formatMessage(messages.snooze)}
        </Button>
      }
    />
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-1.5">
      <dt className="text-footnote text-fg-secondary">{label}</dt>
      <dd className="text-callout text-fg-primary min-w-0 text-pretty">{children}</dd>
    </div>
  );
}

function InterviewDetail({
  item,
  links,
  onJoin,
  headingLevel,
}: Pick<ItemDetailProps, "links" | "onJoin" | "headingLevel"> & { item: InterviewItemVM }) {
  const intl = useIntl();
  const SubHeading = headingLevel === 2 ? "h3" : "h4";
  const { join } = item;
  const { cv, job, notes } = item.prep;
  return (
    <>
      <DetailHeader item={item} headingLevel={headingLevel} />
      <dl className="border-line-subtle divide-line-subtle divide-y border-y">
        <Fact label={intl.formatMessage(messages.when)}>
          {intl.formatMessage(messages.whenValue, { start: item.startsAt.label, range: item.timeRange })}
        </Fact>
        {item.interviewerTime && (
          <Fact label={intl.formatMessage(messages.theirTime)}>{item.interviewerTime}</Fact>
        )}
        {item.location && (
          <Fact label={intl.formatMessage(messages.where)}>
            <span className="inline-flex items-start gap-1.5">
              <MapPin
                aria-hidden="true"
                className="text-fg-tertiary mt-0.5 size-4 shrink-0"
                strokeWidth={1.75}
              />
              {item.location}
            </span>
          </Fact>
        )}
        {item.people.length > 0 && (
          <Fact label={intl.formatMessage(messages.with)}>
            <ul>
              {item.people.map((person) => (
                <li key={person.name}>
                  {person.title
                    ? intl.formatMessage(messages.person, { name: person.name, title: person.title })
                    : person.name}
                </li>
              ))}
            </ul>
          </Fact>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {join && (
          <NeedsConnection>
            {(reason) => (
              <Button
                variant="primary"
                icon={Video}
                disabledReason={
                  reason ??
                  (join.joinable
                    ? null
                    : intl.formatMessage(messages.joinOpensAt, { time: join.joinableAt.label }))
                }
                onClick={() => onJoin(join.url)}
              >
                {intl.formatMessage(messages.join)}
              </Button>
            )}
          </NeedsConnection>
        )}
        <Button shortcut="O" onClick={() => links.application(item.applicationId)}>
          {intl.formatMessage(messages.openApplication)}
        </Button>
      </div>
      <section className="flex flex-col gap-2" aria-labelledby={`${item.id}-prep`}>
        <SubHeading id={`${item.id}-prep`} className="text-headline text-fg-primary">
          {intl.formatMessage(messages.prep)}
        </SubHeading>
        <dl>
          {cv && (
            <Fact label={intl.formatMessage(messages.cvSent)}>
              <Button
                variant="plain"
                size="sm"
                icon={FileText}
                className="-ml-2"
                onClick={() => links.cv(cv.id)}
              >
                {cv.label}
              </Button>
            </Fact>
          )}
          {job && (
            <Fact label={intl.formatMessage(messages.job)}>
              <Button
                variant="plain"
                size="sm"
                icon={Briefcase}
                className="-ml-2"
                onClick={() => links.job(job.id)}
              >
                {job.label}
              </Button>
            </Fact>
          )}
          <Fact label={intl.formatMessage(messages.notes)}>
            {notes ? (
              <span className="whitespace-pre-line">{notes}</span>
            ) : (
              <span className="text-fg-secondary">{intl.formatMessage(messages.noPrep)}</span>
            )}
          </Fact>
        </dl>
      </section>
    </>
  );
}

function DeadlineDetail({
  item,
  actions,
  links,
  snooze,
  headingLevel,
}: Pick<ItemDetailProps, "actions" | "links" | "headingLevel"> & {
  item: DeadlineItemVM;
  snooze: ReactNode;
}) {
  const intl = useIntl();
  const { applicationId, jobId, mailMessageId } = item;
  return (
    <>
      <DetailHeader item={item} headingLevel={headingLevel}>
        <p className="text-callout text-fg-primary mt-1">
          <time dateTime={item.due.iso} className="font-medium">
            {item.due.label}
          </time>
          {item.due.absolute !== item.due.label && (
            <span className="text-fg-secondary"> · {item.due.absolute}</span>
          )}
        </p>
      </DetailHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Check} shortcut="E" onClick={() => actions.markDone(item)}>
          {intl.formatMessage(messages.markDone)}
        </Button>
        {snooze}
        {applicationId ? (
          <Button shortcut="O" onClick={() => links.application(applicationId)}>
            {intl.formatMessage(messages.openApplication)}
          </Button>
        ) : (
          jobId && (
            <Button shortcut="O" onClick={() => links.job(jobId)}>
              {intl.formatMessage(messages.openJob)}
            </Button>
          )
        )}
        {mailMessageId && (
          <Button variant="plain" icon={ExternalLink} onClick={() => links.mail(mailMessageId)}>
            {intl.formatMessage(messages.viewEmail)}
          </Button>
        )}
      </div>
    </>
  );
}

function MatchDetail({
  item,
  actions,
  links,
  saved,
  snooze,
  headingLevel,
}: Pick<ItemDetailProps, "actions" | "links" | "headingLevel" | "saved"> & {
  item: MatchItemVM;
  snooze: ReactNode;
}) {
  const intl = useIntl();
  const SubHeading = headingLevel === 2 ? "h3" : "h4";
  return (
    <>
      <DetailHeader item={{ ...item, context: null }} headingLevel={headingLevel}>
        <span className="mt-1">
          <MatchBandPill match={item.match} showScore />
        </span>
      </DetailHeader>
      <section className="flex flex-col gap-1" aria-labelledby={`${item.id}-why`}>
        <SubHeading id={`${item.id}-why`} className="text-headline text-fg-primary">
          {intl.formatMessage(messages.whyMatch)}
        </SubHeading>
        <p className="text-callout text-fg-secondary text-pretty">
          {item.reason ?? intl.formatMessage(messages.noReason)}
        </p>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" shortcut="O" onClick={() => links.job(item.jobId)}>
          {intl.formatMessage(messages.openInJobs)}
        </Button>
        <Button
          icon={saved ? BookmarkCheck : Bookmark}
          shortcut="S"
          aria-pressed={saved}
          onClick={() => actions.toggleSave(item)}
        >
          {intl.formatMessage(saved ? messages.saved : messages.save)}
        </Button>
        <Button variant="plain" icon={X} shortcut="D" onClick={() => actions.notForMe(item)}>
          {intl.formatMessage(messages.notForMe)}
        </Button>
        {snooze}
      </div>
    </>
  );
}

/** Detail for one item. Keys are bound by the screen; buttons show them in tooltips. */
export function ItemDetail(props: ItemDetailProps) {
  const {
    item,
    actions,
    links,
    onDraftFollowUp,
    onPickDate,
    snoozeOpen,
    onSnoozeOpenChange,
    snoozedUntil,
    offline,
    headingLevel,
    className,
  } = props;
  const intl = useIntl();
  const snoozeTo = (preset: SnoozePreset) =>
    preset === "pickDate" ? onPickDate(item) : actions.snooze(item, { preset });
  const snooze = <SnoozeButton open={snoozeOpen} onOpenChange={onSnoozeOpenChange} onSnooze={snoozeTo} />;

  let body: ReactNode;
  switch (item.kind) {
    case "interview":
      body = <InterviewDetail {...props} item={item} />;
      break;
    case "review":
      body = (
        <>
          <ReviewDetailPane
            proposal={item.proposal}
            offline={offline}
            headingLevel={headingLevel}
            onConfirm={() => actions.confirm(item)}
            onChange={() => links.mail(item.proposal.messageId)}
            onNotJobMail={() => actions.notJobMail(item)}
            onReviewLater={() => actions.snooze(item, { preset: "tomorrow" })}
          />
          <div>
            <Button
              variant="plain"
              icon={ExternalLink}
              shortcut="O"
              onClick={() => links.mail(item.proposal.messageId)}
            >
              {intl.formatMessage(messages.openInMail)}
            </Button>
          </div>
        </>
      );
      break;
    case "autoUpdate":
      body = (
        <>
          {headingLevel === 2 && (
            <h2 className="text-footnote text-fg-secondary font-medium">
              {intl.formatMessage(messages.autoKicker)}
            </h2>
          )}
          <AutoChangeRow
            change={item.change}
            className="border-line-subtle border p-4"
            onUndo={() => actions.undoAutoChange(item)}
            onViewSource={() => {
              if (item.change.mailMessageId) links.mail(item.change.mailMessageId);
            }}
            onAcknowledge={() => actions.acknowledge(item)}
          />
        </>
      );
      break;
    case "followUp":
      body = (
        <>
          {headingLevel === 2 && (
            <h2 className="text-footnote text-fg-secondary font-medium">
              {intl.formatMessage(messages.followUpKicker)}
            </h2>
          )}
          <NudgeCard
            nudge={item.nudge}
            className="p-4"
            onPrimary={() =>
              item.nudge.kind === "noResponse" ? actions.markNoResponse(item) : onDraftFollowUp(item)
            }
            onSecondary={() => actions.declineNudge(item)}
            onSnooze={snoozeTo}
            snoozeOpen={snoozeOpen}
            onSnoozeOpenChange={onSnoozeOpenChange}
          />
          <div>
            <Button variant="plain" shortcut="O" onClick={() => links.application(item.nudge.applicationId)}>
              {intl.formatMessage(messages.openApplication)}
            </Button>
          </div>
        </>
      );
      break;
    case "deadline":
      body = <DeadlineDetail {...props} item={item} snooze={snooze} />;
      break;
    case "match":
      body = <MatchDetail {...props} item={item} snooze={snooze} />;
      break;
  }

  return (
    <div className={cx("flex flex-col gap-5", className)}>
      {snoozedUntil && (
        <InlineAlert
          tone="info"
          title={intl.formatMessage(messages.snoozedUntil, {
            preset: snoozedUntil.preset,
            date: snoozedUntil.preset === "pickDate" ? snoozedUntil.date : null,
          })}
          action={{ label: intl.formatMessage(messages.moveBack), onClick: () => actions.unsnooze(item) }}
        >
          {intl.formatMessage(messages.snoozedBody)}
        </InlineAlert>
      )}
      {body}
    </div>
  );
}

/** "Mark as seen" for E on automatic changes; exported for the context menu label. */
export const DETAIL_MESSAGES = messages;
