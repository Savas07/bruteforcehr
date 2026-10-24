/**
 * The interview an invite proposes (ADR 0012 "Interviews from invites", review-first): when,
 * how long, where, and what happens to it — Confirm adds it (pending), "Add interview" adds it
 * after an automatic status change, or it is already in the Tracker.
 */
import { CalendarPlus, CalendarCheck2, CalendarClock } from "lucide-react";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import type { MailInterviewVM } from "./model";

const messages = defineMessages({
  heading: { id: "mail-review.interview.heading", defaultMessage: "Suggested interview" },
  headingAdded: { id: "mail-review.interview.headingAdded", defaultMessage: "Interview" },
  add: { id: "mail-review.interview.add", defaultMessage: "Add interview" },
  addOffline: {
    id: "mail-review.interview.addOffline",
    defaultMessage: "Adding the interview needs a connection.",
  },
});

const ICONS = { suggested: CalendarClock, addable: CalendarPlus, added: CalendarCheck2 } as const;

export function InterviewSuggestion({
  interview,
  offline,
  onAdd,
}: {
  interview: MailInterviewVM;
  offline: boolean;
  onAdd: () => void;
}) {
  const intl = useIntl();
  const headingId = useId();
  const Icon = ICONS[interview.state];
  return (
    <section
      aria-labelledby={headingId}
      className="border-line-subtle bg-surface-sunken flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3"
    >
      <Icon aria-hidden="true" className="text-fg-secondary mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
      <div className="flex min-w-60 flex-1 flex-col gap-0.5">
        <h2 id={headingId} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(interview.state === "added" ? messages.headingAdded : messages.heading)}
        </h2>
        <p className="text-body text-fg-primary">{interview.title}</p>
        <p className="text-callout text-fg-primary">
          <time dateTime={interview.at.iso} title={interview.at.absolute}>
            {interview.when}
          </time>
          {interview.where && <span className="text-fg-secondary"> · {interview.where}</span>}
        </p>
        <p className="text-footnote text-fg-secondary">{interview.note}</p>
      </div>
      {interview.state === "addable" && (
        <Button
          size="sm"
          icon={CalendarPlus}
          disabledReason={offline ? intl.formatMessage(messages.addOffline) : null}
          onClick={onAdd}
        >
          {intl.formatMessage(messages.add)}
        </Button>
      )}
    </section>
  );
}
