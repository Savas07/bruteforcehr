/**
 * `AgendaRail` (components.md "Today", D09): the read-only list of the next 7 days' interviews and
 * deadlines, shown from 1440 px. An entry that is on Today's list selects it; any other entry (an
 * interview after the 48 h Next up window) opens its application.
 */
import { CalendarClock, Video } from "lucide-react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { SkeletonText } from "../../shared/ui/Skeleton";
import type { AgendaEntryVM, AgendaVM } from "./model";

const messages = defineMessages({
  interview: {
    id: "today.rail.interview",
    defaultMessage: "Interview",
    description: "Screen-reader kind of an agenda entry",
  },
  deadline: {
    id: "today.rail.deadline",
    defaultMessage: "Deadline",
    description: "Screen-reader kind of an agenda entry",
  },
  loading: { id: "today.rail.loading", defaultMessage: "Loading the next 7 days" },
});

function Entry({
  entry,
  selected,
  onSelect,
  onOpenApplication,
}: {
  entry: AgendaEntryVM;
  selected: boolean;
  onSelect: (itemId: string) => void;
  onOpenApplication: (applicationId: string) => void;
}) {
  const intl = useIntl();
  const Icon = entry.kind === "interview" ? Video : CalendarClock;
  const { itemId, applicationId } = entry;
  const content = (
    <>
      <time
        dateTime={entry.at.iso}
        title={entry.at.absolute}
        className="text-fg-secondary w-11 shrink-0 tabular-nums"
      >
        {entry.time}
      </time>
      <Icon aria-hidden="true" className="text-fg-tertiary mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="sr-only">
          {intl.formatMessage(entry.kind === "interview" ? messages.interview : messages.deadline)}:{" "}
        </span>
        <span className="text-fg-primary block">{entry.title}</span>
        <span className="text-fg-secondary block">{entry.company.name}</span>
      </span>
    </>
  );
  const rowClass = "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-footnote";
  const run = itemId ? () => onSelect(itemId) : applicationId ? () => onOpenApplication(applicationId) : null;
  return run ? (
    <button
      type="button"
      aria-current={selected || undefined}
      className={cx(rowClass, "hover:bg-surface-hover aria-[current=true]:bg-surface-selected")}
      onClick={run}
    >
      {content}
    </button>
  ) : (
    <div className={rowClass}>{content}</div>
  );
}

export function AgendaRail({
  agenda,
  selectedId,
  onSelect,
  onOpenApplication,
}: {
  agenda: AgendaVM;
  selectedId: string | null;
  onSelect: (itemId: string) => void;
  onOpenApplication: (applicationId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-6 pb-6">
      <h2 className="text-headline text-fg-primary px-2">{agenda.title}</h2>
      {agenda.emptyLabel && <p className="text-footnote text-fg-secondary mt-2 px-2">{agenda.emptyLabel}</p>}
      {agenda.days.map((day) => (
        <section key={day.id} className="mt-4" aria-labelledby={`rail-${day.id}`}>
          <h3 id={`rail-${day.id}`} className="text-footnote text-fg-secondary mb-1 px-2 font-medium">
            {day.label}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {day.entries.map((entry) => (
              <li key={entry.id}>
                <Entry
                  entry={entry}
                  selected={entry.itemId !== null && entry.itemId === selectedId}
                  onSelect={onSelect}
                  onOpenApplication={onOpenApplication}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Row skeletons for the rail while Today loads (states.md desktop "Today"). */
export function AgendaRailSkeleton() {
  const intl = useIntl();
  return (
    <div className="flex flex-col gap-4 px-5 pt-6" aria-busy="true">
      <span role="status" className="sr-only">
        {intl.formatMessage(messages.loading)}
      </span>
      <SkeletonText lines={1} widths={[50]} />
      {[0, 1, 2].map((index) => (
        <SkeletonText key={index} lines={2} widths={[80, 50]} />
      ))}
    </div>
  );
}
