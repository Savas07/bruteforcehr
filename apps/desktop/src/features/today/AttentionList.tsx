/**
 * Today's center column (components.md `TodaySection`, `AttentionRow`, `NextUpCard`, `DoneGroup`):
 * the sections in their fixed order, one row per item, the interview hero card in Next up, the
 * "See all in Jobs" footer under New matches and the collapsed "Done today" group.
 */
import { ChevronDown, ChevronRight, Video, Zap } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { useId, useState, type ReactNode, type RefObject } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { Monogram } from "../../shared/ui/Company";
import type { ListNavigation } from "../../shared/ui/focus";
import { MatchBandPill } from "../../shared/ui/MatchBand";
import { ContextMenuContent } from "../../shared/ui/Menu";
import { NeedsConnection } from "../../shared/ui/NeedsConnection";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { StatusPill } from "../../shared/ui/StatusPill";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import type { AttentionItemVM, DoneItemVM, InterviewItemVM, TodaySectionId } from "./model";
import type { LocalDone } from "./useTodayActions";

const messages = defineMessages({
  automatic: {
    id: "today.row.automatic",
    defaultMessage: "Changed automatically",
    description: "Accessible name of the glyph on an automatic change's company tile",
  },
  actions: {
    id: "today.row.actions",
    defaultMessage: "Actions for {title}",
    description: "Accessible name of a row's context menu",
  },
  join: { id: "today.row.join", defaultMessage: "Join meeting", description: "Button on the Next up card" },
  doneToday: {
    id: "today.row.doneToday",
    defaultMessage: "Done today",
    description: "Collapsed group of items handled today",
  },
  doneEntry: {
    id: "today.row.doneEntry",
    defaultMessage: "{outcome} · {time}",
    description: "Done today row meta: 'Confirmed · 2 hours ago'",
  },
  count: {
    id: "today.row.count",
    defaultMessage: "· {count}",
    description: "Plain-text count after a section title ('To review · 2'), never a badge (D01)",
  },
  autoGroup: {
    id: "today.row.autoGroup",
    defaultMessage: "Updated automatically · you can undo these",
    description: "Sub-heading in To review above status changes the app applied on its own",
  },
});

/** One section as the screen shows it (items after local actions). */
export interface ListSection {
  readonly id: TodaySectionId | "later";
  readonly title: string;
  /** Plain-text count (To review only, D01); null for no count. */
  readonly count: number | null;
  readonly items: readonly AttentionItemVM[];
  /** Footer action ("See all in Jobs"). */
  readonly footer: { readonly label: string; readonly run: () => void } | null;
}

export interface AttentionListProps {
  sections: readonly ListSection[];
  containerRef: RefObject<HTMLDivElement | null>;
  nav: ListNavigation;
  selectedId: string | null;
  /** Below 1200 px: the item expanded inline under its row. */
  expandedId: string | null;
  /** Below 1200 px the detail opens under the row (aria-expanded on rows). */
  inline: boolean;
  /** Detail content for the expanded row. */
  renderDetail: (item: AttentionItemVM) => ReactNode;
  onRowClick: (id: string) => void;
  /** Context-menu items for a row (same actions as the keys). */
  menuFor: (item: AttentionItemVM) => ReactNode;
  /** Trailing meta override (the Later view's "Until tomorrow"). */
  metaFor?: (item: AttentionItemVM) => string | null;
  onJoin: (url: string) => void;
}

function RowMeta({ item }: { item: AttentionItemVM }) {
  switch (item.kind) {
    case "interview":
      return <RelativeTimeChip time={item.startsAt} />;
    case "review":
      // Received time, not the proposed status: a pill here would read as already applied.
      return <RelativeTimeChip time={item.proposal.receivedAt} />;
    case "autoUpdate":
      return <StatusPill status={item.change.to} size="sm" />;
    case "followUp":
      return null;
    case "deadline":
      return <RelativeTimeChip time={item.due} />;
    case "match":
      return <MatchBandPill match={item.match} />;
  }
}

function AutoBadge() {
  const label = useIntl().formatMessage(messages.automatic);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="bg-surface-elevated border-line-subtle text-fg-secondary inline-flex size-4 items-center justify-center rounded-full border"
    >
      <Zap aria-hidden="true" className="size-2.5" strokeWidth={2} />
    </span>
  );
}

function Row({ item, props, hero }: { item: AttentionItemVM; props: AttentionListProps; hero: boolean }) {
  const intl = useIntl();
  const rowId = useId();
  const regionId = useId();
  const { nav, selectedId, expandedId, inline, renderDetail, onRowClick, menuFor, metaFor } = props;
  const selected = item.id === selectedId;
  const expanded = inline && item.id === expandedId;
  const meta = metaFor?.(item);
  const interview: InterviewItemVM | null = hero && item.kind === "interview" ? item : null;
  return (
    <li
      className={cx(
        "flex flex-col",
        hero && "bg-surface-base border-line-subtle rounded-lg border",
        expanded && !hero && "bg-surface-base rounded-lg",
      )}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            id={rowId}
            {...nav.itemProps(item.id)}
            aria-expanded={inline ? expanded : undefined}
            aria-controls={expanded ? regionId : undefined}
            onClick={() => onRowClick(item.id)}
            className={cx(
              "group flex w-full items-start gap-3 rounded-lg px-3 text-left transition-colors duration-(--bfhr-duration-fast) select-none",
              hero ? "py-3.5" : "py-2.5",
              selected ? "bg-surface-selected" : "hover:bg-surface-hover",
            )}
          >
            <Monogram
              company={item.company}
              size="md"
              {...(item.kind === "autoUpdate" && { badge: <AutoBadge /> })}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-footnote text-fg-secondary min-w-0 break-words">
                  {item.company.name}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {item.pendingSync && <SyncGlyph />}
                  {meta !== undefined && meta !== null ? (
                    <span className="text-caption1 text-fg-secondary whitespace-nowrap">{meta}</span>
                  ) : (
                    <RowMeta item={item} />
                  )}
                </span>
              </span>
              <span
                className={cx(
                  "text-fg-primary font-medium text-pretty",
                  hero ? "text-headline" : "text-callout",
                )}
              >
                {item.title}
              </span>
              {item.context && (
                <span className="text-footnote text-fg-secondary text-pretty">{item.context}</span>
              )}
              {interview?.interviewerTime && (
                <span className="text-footnote text-fg-secondary">{interview.interviewerTime}</span>
              )}
            </span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenuContent aria-label={intl.formatMessage(messages.actions, { title: item.title })}>
          {menuFor(item)}
        </ContextMenuContent>
      </ContextMenu.Root>
      {interview?.join?.joinable && (
        <div className="px-3 pb-3 pl-14">
          <NeedsConnection>
            {(reason) => (
              <Button
                variant="primary"
                size="sm"
                icon={Video}
                disabledReason={reason}
                onClick={() => {
                  if (interview.join) props.onJoin(interview.join.url);
                }}
              >
                {intl.formatMessage(messages.join)}
              </Button>
            )}
          </NeedsConnection>
        </div>
      )}
      {expanded && (
        <div id={regionId} role="region" aria-labelledby={rowId} className="px-3 pt-2 pb-4 pl-14">
          {renderDetail(item)}
        </div>
      )}
    </li>
  );
}

/** One entry of "Done today": from the data, or handled on Today in this session. */
export type DoneEntry =
  | { readonly from: "data"; readonly item: DoneItemVM }
  | { readonly from: "local"; readonly entry: LocalDone };

function DoneGroup({ entries }: { entries: readonly DoneEntry[] }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="text-callout text-fg-secondary hover:bg-surface-hover -mx-1 inline-flex items-center gap-1 rounded-md px-1 py-1 font-semibold"
        >
          {open ? (
            <ChevronDown aria-hidden="true" className="size-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          )}
          {intl.formatMessage(messages.doneToday)}
        </button>
      </h2>
      {open && (
        <ul id={listId} className="flex flex-col">
          {entries.map((entry) => {
            const company = entry.from === "data" ? entry.item.company : entry.entry.item.company;
            const title = entry.from === "data" ? entry.item.title : entry.entry.item.title;
            const key = entry.from === "data" ? entry.item.id : `local:${entry.entry.item.id}`;
            return (
              <li key={key} className="flex items-start gap-3 px-3 py-2">
                <Monogram company={company} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-callout text-fg-secondary text-pretty">
                    {company.name} · {title}
                  </span>
                  <span className="text-footnote text-fg-tertiary">
                    {entry.from === "data"
                      ? intl.formatMessage(messages.doneEntry, {
                          outcome: entry.item.outcome,
                          time: entry.item.doneAt.label,
                        })
                      : entry.entry.outcome}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AttentionList(props: AttentionListProps & { done: readonly DoneEntry[]; empty: ReactNode }) {
  const intl = useIntl();
  const { sections, containerRef, done, empty } = props;
  return (
    // Bottom padding clears the Undo toast (bottom-left of the content area), so the last rows
    // and "Done today" can always scroll above it.
    <div ref={containerRef} className="flex flex-col gap-7 px-4 pb-28">
      {sections.length === 0 && empty}
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`today-${section.id}`} className="flex flex-col gap-1.5">
          <h2 id={`today-${section.id}`} className="text-callout text-fg-primary px-3 font-semibold">
            {section.title}
            {section.count !== null && (
              <span className="text-fg-tertiary font-normal">
                {" "}
                {intl.formatMessage(messages.count, { count: section.count })}
              </span>
            )}
          </h2>
          {(section.id === "toReview"
            ? [
                section.items.filter((item) => item.kind !== "autoUpdate"),
                section.items.filter((item) => item.kind === "autoUpdate"),
              ]
            : [section.items]
          ).map((group, index) =>
            group.length === 0 ? null : (
              <div key={index} className="flex flex-col gap-1">
                {index === 1 && (
                  <h3 id={`today-${section.id}-auto`} className="text-footnote text-fg-secondary mt-2 px-3">
                    {intl.formatMessage(messages.autoGroup)}
                  </h3>
                )}
                <ul
                  className="flex flex-col gap-0.5"
                  {...(index === 1 && { "aria-labelledby": `today-${section.id}-auto` })}
                >
                  {group.map((item) => (
                    <Row key={item.id} item={item} props={props} hero={section.id === "nextUp"} />
                  ))}
                </ul>
              </div>
            ),
          )}
          {section.footer && (
            <div className="px-1">
              <Button variant="plain" size="sm" onClick={section.footer.run}>
                {section.footer.label}
              </Button>
            </div>
          )}
        </section>
      ))}
      <DoneGroup entries={done} />
    </div>
  );
}
