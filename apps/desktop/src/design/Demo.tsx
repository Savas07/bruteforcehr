/**
 * `#/design/demo`: proves the foundation end to end. The Today view-model rendered as a plain list
 * with the shared components, in every forced state. It is not Today's design (that comes from the
 * Today screen agent in `src/features/today/Screen.tsx`).
 */
import { CalendarClock, Inbox, Mail, Video } from "lucide-react";
import { useRef, useState } from "react";
import type { AttentionItemVM, TodayModel } from "../features/today/model";
import { useConnectivity } from "../shared/connectivity";
import { useKeyBindings } from "../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../shared/screen";
import { AutoChangeRow } from "../shared/ui/AutoChangeRow";
import { Button } from "../shared/ui/Button";
import { CompanyChip } from "../shared/ui/Company";
import { EmptyState } from "../shared/ui/EmptyState";
import { useListNavigation } from "../shared/ui/focus";
import { MatchBandPill } from "../shared/ui/MatchBand";
import { NeedsConnection } from "../shared/ui/NeedsConnection";
import { NudgeCard } from "../shared/ui/NudgeCard";
import { PaneError } from "../shared/ui/PaneError";
import { RelativeTimeChip } from "../shared/ui/RelativeTimeChip";
import { ReviewDetailPane } from "../shared/ui/ReviewDetailPane";
import { ScreenTitle } from "../shared/ui/ScreenTitle";
import { AttentionRowSkeleton, SkeletonRegion } from "../shared/ui/Skeleton";
import { SplitView } from "../shared/ui/SplitView";
import { StaleStamp } from "../shared/ui/StaleStamp";
import { StatusPill } from "../shared/ui/StatusPill";
import { SyncGlyph } from "../shared/ui/SyncGlyph";
import { useToast } from "../shared/ui/Toast";
import { DesignScreen } from "./DesignScreen";
import { todayScreen } from "./screens";

/** The trailing fact of a row, by kind. */
function RowMeta({ item }: { item: AttentionItemVM }) {
  switch (item.kind) {
    case "interview":
      return <RelativeTimeChip time={item.startsAt} />;
    case "review":
      return item.proposal.move ? <StatusPill status={item.proposal.move.to} size="sm" /> : null;
    case "autoUpdate":
      return <StatusPill status={item.change.to} size="sm" />;
    case "followUp":
      return <RelativeTimeChip time={item.nudge.since} />;
    case "deadline":
      return <RelativeTimeChip time={item.due} />;
    case "match":
      return <MatchBandPill match={item.match} />;
  }
}

/** The selected item in the detail pane, with the shared pattern component for its kind. */
function Detail({ item, offline }: { item: AttentionItemVM; offline: boolean }) {
  const toast = useToast();
  const restore = (message: string) => toast.show({ variant: "info", message });
  switch (item.kind) {
    case "review":
      return (
        <ReviewDetailPane
          proposal={item.proposal}
          offline={offline}
          onConfirm={() =>
            toast.show({
              message: item.proposal.move
                ? `Confirmed: ${item.proposal.company.name} moved to ${item.proposal.move.to.label}`
                : `Confirmed: ${item.proposal.company.name}`,
              action: { label: "Undo", run: () => restore("Restored"), keys: "Mod+Z" },
            })
          }
          onChange={() => toast.show({ variant: "info", message: "Change… opens the correction popover" })}
          onNotJobMail={() =>
            toast.show({
              message: `Marked as not job mail: ${item.proposal.subject}`,
              action: { label: "Undo", run: () => restore("Restored"), keys: "Mod+Z" },
            })
          }
        />
      );
    case "autoUpdate":
      return (
        <div className="p-6">
          <AutoChangeRow change={item.change} onUndo={() => restore(`Restored: ${item.company.name}`)} />
        </div>
      );
    case "followUp":
      return (
        <div className="p-6">
          <NudgeCard
            nudge={item.nudge}
            onPrimary={() =>
              toast.show({ variant: "info", message: "Draft follow-up opens the Apply panel" })
            }
            onSecondary={() =>
              toast.show({
                message: `Not needed: ${item.company.name}`,
                action: { label: "Undo", run: () => restore("Restored"), keys: "Mod+Z" },
              })
            }
            onSnooze={() =>
              toast.show({
                message: `Snoozed: ${item.company.name}`,
                glyph: CalendarClock,
                action: { label: "Undo", run: () => restore("Restored"), keys: "Mod+Z" },
              })
            }
          />
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-3 p-6">
          <CompanyChip company={item.company} />
          <h2 className="text-title2">{item.title}</h2>
          {item.context && <p className="text-fg-secondary text-callout">{item.context}</p>}
          <RowMeta item={item} />
          {item.kind === "interview" && item.join && (
            <NeedsConnection>
              {(reason) => (
                <Button
                  variant="primary"
                  icon={Video}
                  disabledReason={
                    reason ?? (item.join?.joinable ? null : `Join opens at ${item.join?.joinableAt.label}`)
                  }
                >
                  Join
                </Button>
              )}
            </NeedsConnection>
          )}
        </div>
      );
  }
}

function TodayDemo({ model }: ScreenProps<TodayModel>) {
  const { status } = useConnectivity();
  const offline = status === "offline";
  const listRef = useRef<HTMLDivElement>(null);
  const ready = model.status === "ready" ? model.data : null;
  const [pickedId, setSelectedId] = useState<string | null>(null);
  const selectedId = pickedId ?? ready?.selectedId ?? null;
  const [detailOpen, setDetailOpen] = useState(false);
  const items = ready?.items ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const nav = useListNavigation({
    containerRef: listRef,
    ids: items.map((item) => item.id),
    activeId: selectedId,
    onActivate: setSelectedId,
    onOpen: () => setDetailOpen(true),
    group: "Today",
  });
  const toast = useToast();
  useKeyBindings([
    {
      id: "today.confirm",
      keys: "C",
      label: "Confirm review item",
      group: "Today",
      enabled: selected?.kind === "review",
      run: () => toast.show({ message: `Confirmed: ${selected?.company.name ?? ""}` }),
    },
  ]);

  const header = (
    <header className="px-6 pt-5 pb-3">
      <ScreenTitle title={ready?.title ?? "Today"} documentTitle="Component demo" />
      <p className="text-fg-secondary mt-1 text-callout">
        {ready?.dateLabel}
        {model.status === "ready" && model.fromCache && (
          <>
            {" · "}
            <StaleStamp prefix="Updated" time={model.updatedAt} clock={model.updatedClock} />
          </>
        )}
      </p>
      <p className="text-fg-tertiary mt-1 text-footnote">
        Foundation demo: the Today view-model as a plain list. Today&apos;s design comes from its screen.
      </p>
    </header>
  );

  let list;
  if (model.status === "loading") {
    list = (
      <SkeletonRegion
        loading
        label="Loading Today"
        skeleton={
          <div className="flex flex-col gap-1 px-6">
            <AttentionRowSkeleton />
            <AttentionRowSkeleton />
            <AttentionRowSkeleton />
          </div>
        }
      >
        {null}
      </SkeletonRegion>
    );
  } else if (model.status === "error") {
    list = (
      <PaneError
        title="We couldn't load Today"
        body="Our server didn't respond. Your saved data is safe. Try again in a moment."
        onRetry={model.retry}
        details="design build: forced ?state=error"
      />
    );
  } else if (ready && ready.items.length === 0) {
    list = (
      <div className="px-6">
        {ready.firstUse?.connectMail ? (
          <EmptyState
            kind="firstUse"
            glyph={Mail}
            title={ready.firstUse.connectMail.message}
            body={ready.firstUse.connectMail.estimate}
            primary={{ label: ready.firstUse.connectMail.actionLabel, onClick: () => undefined }}
            {...(ready.firstUse.findJobs && {
              secondary: { label: ready.firstUse.findJobs.actionLabel, onClick: () => undefined },
            })}
          />
        ) : (
          <EmptyState kind="caughtUp" glyph={Inbox} body={ready.caughtUp?.message ?? ""} />
        )}
      </div>
    );
  } else if (ready) {
    list = (
      <div ref={listRef} className="flex flex-col gap-6 px-6 pb-8">
        {ready.sections.map((section) => (
          <section key={section.id} aria-labelledby={`demo-${section.id}`}>
            <h2 id={`demo-${section.id}`} className="text-headline mb-1">
              {section.title}
              {section.countLabel && (
                <span className="text-fg-tertiary font-normal"> · {section.countLabel}</span>
              )}
            </h2>
            <ul className="divide-line-subtle divide-y">
              {section.items.map((item) => (
                <li
                  key={item.id}
                  {...nav.itemProps(item.id)}
                  className="hover:bg-surface-hover aria-[current=true]:bg-surface-selected -mx-2 flex cursor-default items-center gap-3 rounded-md px-2 py-2"
                  onClick={() => {
                    setSelectedId(item.id);
                    setDetailOpen(true);
                  }}
                >
                  <CompanyChip company={item.company} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-callout">{item.title}</span>
                    {item.context && (
                      <span className="text-fg-secondary block text-footnote">{item.context}</span>
                    )}
                  </span>
                  {item.pendingSync && <SyncGlyph />}
                  <RowMeta item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SplitView
        listLabel="Today"
        detailLabel="Details"
        backLabel="Back to Today"
        detailOpen={detailOpen}
        onBack={() => setDetailOpen(false)}
        list={
          <div className="min-h-0 flex-1 overflow-y-auto">
            {header}
            {list}
          </div>
        }
        detail={
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <Detail item={selected} offline={offline} />
            ) : (
              <EmptyState kind="subArea" body="Select an item to see the details." className="p-6" />
            )}
          </div>
        }
        {...(ready && {
          railLabel: ready.agenda.title,
          rail: (
            <div className="overflow-y-auto p-4">
              <h2 className="text-headline">{ready.agenda.title}</h2>
              {ready.agenda.emptyLabel && (
                <p className="text-fg-secondary mt-2 text-footnote">{ready.agenda.emptyLabel}</p>
              )}
              {ready.agenda.days.map((day) => (
                <section key={day.id} className="mt-3">
                  <h3 className="text-fg-secondary text-footnote">{day.label}</h3>
                  <ul>
                    {day.entries.map((entry) => (
                      <li key={entry.id} className="flex gap-2 py-1 text-footnote">
                        <span className="tabular-nums">{entry.time}</span>
                        <span>
                          {entry.company.name} · {entry.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ),
        })}
      />
    </div>
  );
}

export function Demo() {
  return <DesignScreen spec={todayScreen} view={TodayDemo} />;
}
