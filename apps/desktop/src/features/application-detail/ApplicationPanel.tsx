/**
 * The application in the right side panel (board, table, calendar; research/tracker.md "Record
 * detail": panel and full page share one model). Compact header with the status pill (`M`), the
 * suggestion card (`H` / `D`), the summary and the timeline with Undo; "Open full page"
 * (Mod+Enter) goes to `/tracker/applications/$applicationId`. Builds its own model, so the host
 * passes only the id and its prev / next scope ("3 of 12 in Interviewing", K / J).
 */
import { useNavigate } from "@tanstack/react-router";
import { FileQuestion, Maximize2 } from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useTrackerModel } from "../../data/tracker/model";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { ApplicationSummaryBlock } from "../../shared/ui/ApplicationSummaryBlock";
import { IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonRegion } from "../../shared/ui/Skeleton";
import { DetailSidePanel } from "../../shared/ui/SplitView";
import { RecordHeader } from "./Header";
import { type ApplicationDetailVM, buildApplicationDetailModel } from "./model";
import { DetailSkeleton } from "./Screen";
import { answerSuggestion, SnoozedLine, SuggestionCard } from "./Suggestion";
import { TimelineSection } from "./Timeline";
import { useDetailActions, usePostingUrl } from "./useDetailActions";

const messages = defineMessages({
  label: { id: "application-detail.panel.label", defaultMessage: "Application details" },
  openFull: { id: "application-detail.panel.openFull", defaultMessage: "Open full page" },
  loading: { id: "application-detail.panel.loading", defaultMessage: "Loading the application" },
  errorTitle: {
    id: "application-detail.panel.errorTitle",
    defaultMessage: "We couldn't load this application",
  },
  errorBody: {
    id: "application-detail.panel.errorBody",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  notFoundTitle: {
    id: "application-detail.panel.notFoundTitle",
    defaultMessage: "This application was deleted",
  },
  notFoundBody: {
    id: "application-detail.panel.notFoundBody",
    defaultMessage: "It's no longer in your tracker. Close this panel to go on.",
  },
  close: { id: "application-detail.panel.close", defaultMessage: "Close panel" },
  group: { id: "application-detail.panel.keys.group", defaultMessage: "Application panel" },
  keyOpenFull: {
    id: "application-detail.panel.keys.openFull",
    defaultMessage: "Open the application as a full page",
  },
  keyMove: { id: "application-detail.panel.keys.move", defaultMessage: "Move to… (panel)" },
  keySnooze: { id: "application-detail.panel.keys.snooze", defaultMessage: "Later (panel suggestion)" },
  keyDecline: {
    id: "application-detail.panel.keys.decline",
    defaultMessage: "Not needed / Keep waiting (panel)",
  },
});

export interface ApplicationPanelProps {
  applicationId: string;
  /** Position in the host's scope ("3 of 12 in Interviewing") with its neighbours; null hides it. */
  nav: { label: string; previousId: string | null; nextId: string | null } | null;
  /** Shows another application (K / J, ‹ ›). */
  onSelect: (applicationId: string) => void;
  onClose: () => void;
}

export function ApplicationPanel({ applicationId, nav, onSelect, onClose }: ApplicationPanelProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const model = useTrackerModel(buildApplicationDetailModel, { applicationId });
  const panelRef = useRef<HTMLDivElement>(null);
  const openFull = () =>
    void navigate({ to: "/tracker/applications/$applicationId", params: { applicationId } });
  useKeyBindings([
    {
      id: "applicationPanel.openFull",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.keyOpenFull),
      group: intl.formatMessage(messages.group),
      run: openFull,
    },
  ]);

  return (
    <div ref={panelRef} className="contents">
      <DetailSidePanel
        open
        label={intl.formatMessage(messages.label)}
        onClose={onClose}
        {...(nav && {
          nav: {
            label: nav.label,
            onPrevious: () => nav.previousId !== null && onSelect(nav.previousId),
            onNext: () => nav.nextId !== null && onSelect(nav.nextId),
          },
        })}
        actions={
          <IconButton
            icon={Maximize2}
            size="sm"
            label={intl.formatMessage(messages.openFull)}
            shortcut="Mod+Enter"
            onClick={openFull}
          />
        }
      >
        <div className="flex flex-col gap-6 px-5 pt-4 pb-8">
          {model.status === "loading" ? (
            <SkeletonRegion
              loading
              label={intl.formatMessage(messages.loading)}
              skeleton={<DetailSkeleton compact />}
            >
              {null}
            </SkeletonRegion>
          ) : model.status === "error" ? (
            <PaneError
              title={intl.formatMessage(messages.errorTitle)}
              body={intl.formatMessage(messages.errorBody)}
              onRetry={model.retry}
            />
          ) : model.data.status === "notFound" ? (
            <EmptyState
              kind="caughtUp"
              glyph={FileQuestion}
              title={intl.formatMessage(messages.notFoundTitle)}
              body={intl.formatMessage(messages.notFoundBody)}
              primary={{ label: intl.formatMessage(messages.close), onClick: onClose, keys: "Escape" }}
            />
          ) : (
            <PanelDetail key={applicationId} detail={model.data.detail} panelRef={panelRef} />
          )}
        </div>
      </DetailSidePanel>
    </div>
  );
}

function PanelDetail({
  detail,
  panelRef,
}: {
  detail: ApplicationDetailVM;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const intl = useIntl();
  const actions = useDetailActions();
  const postingUrl = usePostingUrl(detail.header.jobId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const { suggestion, applicationId } = detail;
  const group = intl.formatMessage(messages.group);
  // The host (board, table) keeps its own M / H / D for its focused row; these act in the panel.
  const inPanel = (event: KeyboardEvent) =>
    event.target instanceof Node && panelRef.current?.contains(event.target) === true;
  useKeyBindings([
    {
      id: "applicationPanel.move",
      keys: "M",
      label: intl.formatMessage(messages.keyMove),
      group,
      when: inPanel,
      run: () => setMenuOpen(true),
    },
    {
      id: "applicationPanel.snooze",
      keys: "H",
      label: intl.formatMessage(messages.keySnooze),
      group,
      enabled: suggestion !== null,
      when: inPanel,
      run: () => setSnoozeOpen(true),
    },
    {
      id: "applicationPanel.decline",
      keys: "D",
      label: intl.formatMessage(messages.keyDecline),
      group,
      enabled: suggestion !== null,
      when: inPanel,
      run: () => suggestion && answerSuggestion(suggestion, actions, "secondary"),
    },
  ]);

  return (
    <>
      <RecordHeader
        compact
        header={detail.header}
        progress={detail.progress}
        nextAction={detail.nextAction}
        reminder={detail.reminder}
        title={
          <h2 className="text-fg-primary text-title3 font-semibold text-pretty">{detail.header.role}</h2>
        }
        postingUrl={postingUrl}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        onMove={(to) => actions.move(applicationId, to)}
        onNextAction={() => undefined}
        onOpenPosting={actions.openLink}
      />
      {suggestion && (
        <SuggestionCard
          suggestion={suggestion}
          actions={actions}
          snoozeMinDate={detail.snoozeMinDate}
          timeZone={detail.timeZone}
          snoozeOpen={snoozeOpen}
          onSnoozeOpenChange={setSnoozeOpen}
        />
      )}
      {detail.snoozed && (
        <SnoozedLine snoozed={detail.snoozed} applicationId={applicationId} actions={actions} />
      )}
      <ApplicationSummaryBlock summary={detail.summary} />
      <TimelineSection
        composer={false}
        events={detail.timeline}
        onAddNote={(text) => actions.addNote(applicationId, text)}
        onUndo={actions.undoEvent}
      />
    </>
  );
}
