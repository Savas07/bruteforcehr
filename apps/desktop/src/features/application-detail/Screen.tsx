/**
 * Application detail, full page (`/tracker/applications/$applicationId`; BRIEF §4.6,
 * research/tracker.md "Record detail", IA.md deep links). The record header with the stage strip
 * and one next action; a main column with the suggestion card (Up next), the interview rounds and
 * the timeline; a side column with reminders, documents used, contacts, notes and the
 * application summary. Below ~900 px of content width the columns stack.
 *
 * Keys (group "Application"): Esc back to Tracker, M Move to…, H Later (snooze), D Not needed /
 * Keep waiting, N add a note, Mod+Enter the next action, Mod+S save notes.
 */
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileQuestion, MoreHorizontal, Trash2 } from "lucide-react";
import { AlertDialog, DropdownMenu } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { ApplicationSummaryBlock } from "../../shared/ui/ApplicationSummaryBlock";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { MenuContent, MenuItem } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { SkeletonBlock, SkeletonCircle, SkeletonRegion, SkeletonText } from "../../shared/ui/Skeleton";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { ContactsSection } from "./Contacts";
import { DocumentsSection } from "./Documents";
import { Section } from "./fields";
import { RecordHeader } from "./Header";
import { type InterviewEditing, InterviewsSection } from "./Interviews";
import type { ApplicationDetailModel, ApplicationDetailVM, NextActionVM } from "./model";
import { NotesSection } from "./Notes";
import { RemindersSection } from "./Reminders";
import { answerSuggestion, SnoozedLine, SuggestionCard } from "./Suggestion";
import { TimelineSection } from "./Timeline";
import { type DetailActions, useDetailActions, usePostingUrl } from "./useDetailActions";

const messages = defineMessages({
  pageTitle: {
    id: "application-detail.screen.pageTitle",
    defaultMessage: "Application",
    description: "Page title while the application loads or can't be shown",
  },
  back: { id: "application-detail.screen.back", defaultMessage: "Back to Tracker" },
  loading: { id: "application-detail.screen.loading", defaultMessage: "Loading the application" },
  errorTitle: {
    id: "application-detail.screen.errorTitle",
    defaultMessage: "We couldn't load this application",
  },
  errorBody: {
    id: "application-detail.screen.errorBody",
    defaultMessage: "Our server didn't respond. Your saved data is safe. Try again in a moment.",
  },
  notFoundTitle: {
    id: "application-detail.screen.notFoundTitle",
    defaultMessage: "This application was deleted",
  },
  notFoundBody: {
    id: "application-detail.screen.notFoundBody",
    defaultMessage:
      "It's no longer in your tracker, maybe removed on another device. Your other applications are where you left them.",
  },
  upNext: { id: "application-detail.screen.upNext", defaultMessage: "Up next" },
  more: { id: "application-detail.screen.more", defaultMessage: "More actions" },
  delete: { id: "application-detail.screen.delete", defaultMessage: "Delete application…" },
  deleteTitle: { id: "application-detail.screen.deleteTitle", defaultMessage: "Delete {company} · {role}?" },
  deleteBody: {
    id: "application-detail.screen.deleteBody",
    defaultMessage:
      "Its timeline, interview rounds and notes are deleted too. Contacts stay in your address book. You can't undo this.",
  },
  deleteConfirm: { id: "application-detail.screen.deleteConfirm", defaultMessage: "Delete application" },
  cancel: { id: "application-detail.screen.cancel", defaultMessage: "Cancel" },
  group: { id: "application-detail.keys.group", defaultMessage: "Application" },
  keyBack: { id: "application-detail.keys.back", defaultMessage: "Back to Tracker" },
  keyMove: { id: "application-detail.keys.move", defaultMessage: "Move to…" },
  keySnooze: { id: "application-detail.keys.snooze", defaultMessage: "Later (snooze the suggestion)" },
  keyDecline: { id: "application-detail.keys.decline", defaultMessage: "Not needed / Keep waiting" },
  keyNote: { id: "application-detail.keys.note", defaultMessage: "Add a note" },
  keyNext: { id: "application-detail.keys.next", defaultMessage: "Next action" },
});

export default function ApplicationDetailScreen({ model }: ScreenProps<ApplicationDetailModel>) {
  const intl = useIntl();
  const navigate = useNavigate();
  const back = () => void navigate({ to: "/tracker" });
  const group = intl.formatMessage(messages.group);
  useKeyBindings([
    {
      id: "applicationDetail.back",
      keys: "Escape",
      label: intl.formatMessage(messages.keyBack),
      group,
      run: back,
    },
  ]);

  const stale =
    model.status === "ready" && model.fromCache ? (
      <StaleStamp prefix="updated" time={model.updatedAt} clock={model.updatedClock} />
    ) : null;

  if (model.status === "ready" && model.data.status === "found")
    return (
      <Page onBack={back} stale={stale}>
        <ReadyDetail detail={model.data.detail} group={group} onBack={back} />
      </Page>
    );

  // The visible content names the state; the page's h1 stays for the window title and focus.
  const title = <ScreenTitle title={intl.formatMessage(messages.pageTitle)} className="sr-only" />;
  return (
    <Page onBack={back} stale={stale}>
      {title}
      {model.status === "error" ? (
        <PaneError
          title={intl.formatMessage(messages.errorTitle)}
          body={intl.formatMessage(messages.errorBody)}
          onRetry={model.retry}
          secondary={{ label: intl.formatMessage(messages.back), onClick: back }}
        />
      ) : model.status === "ready" ? (
        <EmptyState
          kind="caughtUp"
          glyph={FileQuestion}
          title={intl.formatMessage(messages.notFoundTitle)}
          body={intl.formatMessage(messages.notFoundBody)}
          primary={{ label: intl.formatMessage(messages.back), onClick: back, keys: "Escape" }}
        />
      ) : (
        <SkeletonRegion loading label={intl.formatMessage(messages.loading)} skeleton={<DetailSkeleton />}>
          {null}
        </SkeletonRegion>
      )}
    </Page>
  );
}

/** The scroller, the back link and the cached-data stamp; the content goes in a 1200 px column. */
function Page({ onBack, stale, children }: { onBack: () => void; stale: ReactNode; children: ReactNode }) {
  const intl = useIntl();
  return (
    <div className="scrollbar-gutter-stable @container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-300 flex-col gap-4 px-8 pt-4 pb-10">
        <div className="flex min-h-8 items-center gap-3">
          <Button
            variant="plain"
            size="sm"
            icon={ArrowLeft}
            shortcut="Escape"
            className="-ms-2"
            onClick={onBack}
          >
            {intl.formatMessage(messages.back)}
          </Button>
          {stale && <span className="ms-auto">{stale}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Header-shaped skeleton, then the two columns (states.md: shape-matched, real chrome kept). */
export function DetailSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <SkeletonCircle size="lg" />
        <SkeletonText lines={2} widths={[55, 35]} className="flex-1 pt-1" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-6 w-28 rounded-full" />
        <SkeletonBlock className="h-6 w-24" />
      </div>
      <SkeletonBlock className="h-8 w-full" />
      <div className={compact ? "flex flex-col gap-4" : "grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_20rem]"}>
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-24 w-full rounded-lg" />
          <SkeletonText lines={4} />
        </div>
        {!compact && (
          <div className="flex flex-col gap-3">
            <SkeletonText lines={3} />
            <SkeletonBlock className="h-16 w-full rounded-lg" />
          </div>
        )}
      </div>
    </div>
  );
}

function ReadyDetail({
  detail,
  group,
  onBack,
}: {
  detail: ApplicationDetailVM;
  group: string;
  onBack: () => void;
}) {
  const intl = useIntl();
  const actions = useDetailActions();
  const postingUrl = usePostingUrl(detail.header.jobId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [interviewEditing, setInterviewEditing] = useState<InterviewEditing>(null);
  const [reminderEditing, setReminderEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { suggestion, applicationId } = detail;

  const runNextAction = (action: NextActionVM) => {
    if (action.kind === "prepareInterview") setInterviewEditing({ id: action.interviewId, focusPrep: true });
    else if (action.kind === "addInterview") setInterviewEditing({ id: "new", focusPrep: false });
    else setReminderEditing(true);
  };

  useKeyBindings([
    {
      id: "applicationDetail.move",
      keys: "M",
      label: intl.formatMessage(messages.keyMove),
      group,
      run: () => setMenuOpen(true),
    },
    {
      id: "applicationDetail.snooze",
      keys: "H",
      label: intl.formatMessage(messages.keySnooze),
      group,
      enabled: suggestion !== null,
      run: () => setSnoozeOpen(true),
    },
    {
      id: "applicationDetail.decline",
      keys: "D",
      label: intl.formatMessage(messages.keyDecline),
      group,
      enabled: suggestion !== null,
      run: () => suggestion && answerSuggestion(suggestion, actions, "secondary"),
    },
    {
      id: "applicationDetail.note",
      keys: "N",
      label: intl.formatMessage(messages.keyNote),
      group,
      run: (event) => {
        event.preventDefault();
        composerRef.current?.focus();
      },
    },
    {
      id: "applicationDetail.next",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.keyNext),
      group,
      enabled: detail.nextAction !== null,
      inTextFields: false,
      run: () => detail.nextAction && runNextAction(detail.nextAction),
    },
  ]);

  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <RecordHeader
            header={detail.header}
            progress={detail.progress}
            nextAction={detail.nextAction}
            title={
              <ScreenTitle
                title={detail.header.role}
                documentTitle={detail.documentTitle}
                className="text-pretty"
              />
            }
            postingUrl={postingUrl}
            menuOpen={menuOpen}
            onMenuOpenChange={setMenuOpen}
            onMove={(to) => actions.move(applicationId, to)}
            onNextAction={runNextAction}
            onOpenPosting={actions.openLink}
          />
        </div>
        <MoreMenu onDelete={() => setDeleting(true)} />
      </div>

      <div className="mt-4 grid gap-x-10 gap-y-8 @4xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="flex min-w-0 flex-col gap-8">
          {(suggestion !== null || detail.snoozed !== null) && (
            <Section title={intl.formatMessage(messages.upNext)}>
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
            </Section>
          )}
          <TimelineSection
            ref={composerRef}
            events={detail.timeline}
            onAddNote={(text) => actions.addNote(applicationId, text)}
            onUndo={actions.undoEvent}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <InterviewsSection
            applicationId={applicationId}
            interviews={detail.interviews}
            newInterview={detail.newInterview}
            exportAll={detail.exportAll}
            editing={interviewEditing}
            onEditingChange={setInterviewEditing}
            actions={actions}
          />
          <RemindersSection
            detail={detail}
            editing={reminderEditing}
            onEditingChange={setReminderEditing}
            actions={actions}
          />
          <DocumentsSection
            applicationId={applicationId}
            documents={detail.documents}
            applied={detail.summary.appliedAt !== null}
            actions={actions}
          />
          <ContactsSection
            applicationId={applicationId}
            contacts={detail.contacts}
            addressBook={detail.addressBook}
            newContact={detail.newContact}
            actions={actions}
          />
          <NotesSection
            text={detail.notes.text}
            pendingSync={detail.notes.pendingSync}
            group={group}
            onSave={(notes) => actions.updateApplication(applicationId, { notes }, { quiet: true })}
          />
          <ApplicationSummaryBlock summary={detail.summary} />
        </div>
      </div>

      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        detail={detail}
        actions={actions}
        onDeleted={onBack}
      />
    </>
  );
}

function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const intl = useIntl();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton icon={MoreHorizontal} label={intl.formatMessage(messages.more)} />
      </DropdownMenu.Trigger>
      <MenuContent align="end" aria-label={intl.formatMessage(messages.more)}>
        <MenuItem icon={Trash2} destructive onSelect={onDelete}>
          {intl.formatMessage(messages.delete)}
        </MenuItem>
      </MenuContent>
    </DropdownMenu.Root>
  );
}

/** Deleting asks first; focus starts on Cancel and Enter / Esc both cancel (IA.md). */
function DeleteDialog({
  open,
  onOpenChange,
  detail,
  actions,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: ApplicationDetailVM;
  actions: DetailActions;
  onDeleted: () => void;
}) {
  const intl = useIntl();
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <AlertDialog.Content className="bg-surface-elevated text-fg-primary shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg p-5">
          <div className="flex flex-col gap-1">
            <AlertDialog.Title className="font-display text-title3 text-pretty">
              {intl.formatMessage(messages.deleteTitle, {
                company: detail.header.company.name,
                role: detail.header.role,
              })}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-fg-secondary text-callout text-pretty">
              {intl.formatMessage(messages.deleteBody)}
            </AlertDialog.Description>
          </div>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button>{intl.formatMessage(messages.cancel)}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant="destructive"
                onClick={() => {
                  actions.deleteApplication(detail.applicationId);
                  onDeleted();
                }}
              >
                {intl.formatMessage(messages.deleteConfirm)}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
