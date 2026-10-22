/**
 * Mail review (`/mail`, `/mail/review/$messageId`; mail-review.md "Decision — Desktop"): nested
 * folders in the sidebar, the list pane (360–440 px), the reading pane with the review card and
 * the details rail from 1440 px. Decisions are optimistic (M0 has no backend) and every one shows
 * an Undo toast; there is no Confirm all.
 */
import type { MailCategory } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { CalendarClock, Mail, MailX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { destinationMessages } from "../../lib/destinations";
import { useConnectivity } from "../../shared/connectivity";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ScreenProps } from "../../shared/screen";
import { EmptyState } from "../../shared/ui/EmptyState";
import { useListNavigation } from "../../shared/ui/focus";
import { useBreakpoints } from "../../shared/ui/layout";
import { PaneError } from "../../shared/ui/PaneError";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { MailRowSkeleton, SkeletonBlock, SkeletonRegion, SkeletonText } from "../../shared/ui/Skeleton";
import { SplitView } from "../../shared/ui/SplitView";
import { StaleStamp } from "../../shared/ui/StaleStamp";
import { useToast } from "../../shared/ui/Toast";
import { NEW_APPLICATION, type CorrectionDraft } from "./CorrectionPopover";
import { MailDetails } from "./MailDetails";
import { CompactFolders, FOLDER_KEYS, MailFolders } from "./MailFolders";
import { ListEmpty, ReauthCallouts, UpdatesMenu } from "./MailList";
import { BundleRow, MailRow } from "./MailRow";
import type { ReviewProposalVM } from "../../shared/model/blocks";
import type { MailEmptyAction, MailFolderId, MailReviewModel, MailRowVM } from "./model";
import { mailOutcomes, useMailOutcomes, type ReviewOutcome } from "./outcomes";
import { ReadingPane } from "./ReadingPane";
import type { ReviewLaterChoice } from "./ReviewLater";

const messages = defineMessages({
  group: { id: "mail-review.screen.group", defaultMessage: "Mail", description: "Shortcuts-sheet group" },
  listLabel: { id: "mail-review.screen.listLabel", defaultMessage: "Emails" },
  detailLabel: { id: "mail-review.screen.detailLabel", defaultMessage: "Email" },
  backToList: { id: "mail-review.screen.backToList", defaultMessage: "Back to emails" },
  loading: { id: "mail-review.screen.loading", defaultMessage: "Loading your job emails" },
  loadingEmail: { id: "mail-review.screen.loadingEmail", defaultMessage: "Loading the email" },
  errorTitle: { id: "mail-review.screen.errorTitle", defaultMessage: "We couldn't load your job emails" },
  errorBody: {
    id: "mail-review.screen.errorBody",
    defaultMessage: "Our server didn't respond. Your emails are safe in your inbox. Try again in a moment.",
  },
  selectEmail: { id: "mail-review.screen.selectEmail", defaultMessage: "Select an email to read it." },
  undo: { id: "mail-review.screen.undo", defaultMessage: "Undo" },
  confirm: { id: "mail-review.screen.keyConfirm", defaultMessage: "Confirm" },
  change: { id: "mail-review.screen.keyChange", defaultMessage: "Change…" },
  notJobMail: { id: "mail-review.screen.keyNotJobMail", defaultMessage: "Not job mail" },
  reviewLater: { id: "mail-review.screen.keyReviewLater", defaultMessage: "Review later" },
  openOriginal: { id: "mail-review.screen.keyOpenOriginal", defaultMessage: "Open original" },
  confirmedMove: {
    id: "mail-review.toast.confirmedMove",
    defaultMessage: "Confirmed: {application} moved to {status}",
  },
  confirmedCategory: {
    id: "mail-review.toast.confirmedCategory",
    defaultMessage: "Confirmed: {company} · {category}",
  },
  correctedMove: {
    id: "mail-review.toast.correctedMove",
    defaultMessage: "Corrected: {application} moved to {status}",
  },
  correctedCategory: {
    id: "mail-review.toast.correctedCategory",
    defaultMessage: "Corrected: saved as {category}",
  },
  notJobMailDone: {
    id: "mail-review.toast.notJobMail",
    defaultMessage: "Marked as not job mail. We won't keep this email.",
  },
  reviewLaterPreset: {
    id: "mail-review.toast.reviewLaterPreset",
    defaultMessage:
      "{preset, select, laterToday {We'll bring this email back later today} tomorrow {We'll bring this email back tomorrow} other {We'll bring this email back next week}}",
  },
  reviewLaterDate: {
    id: "mail-review.toast.reviewLaterDate",
    defaultMessage: "We'll bring this email back on the day you picked",
  },
  movedBack: { id: "mail-review.toast.movedBack", defaultMessage: "Moved {application} back to {status}" },
  markedSeen: {
    id: "mail-review.toast.markedSeen",
    defaultMessage: "{count, plural, one {Marked as seen} other {Marked # updates as seen}}",
  },
  openingOriginal: { id: "mail-review.toast.openingOriginal", defaultMessage: "Opening the original email…" },
  openingSignIn: {
    id: "mail-review.toast.openingSignIn",
    defaultMessage: "Opening the sign-in page in your browser…",
  },
  backfillLater: {
    id: "mail-review.toast.backfillLater",
    defaultMessage: "Reviewing the inbox scan isn't available in this version yet.",
  },
});

type MessageRow = Exclude<MailRowVM, { kind: "bundle" }>;

const navId = (row: MailRowVM): string => (row.kind === "bundle" ? `bundle:${row.id}` : row.messageId);

function ReviewCardSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-190 flex-col gap-5 px-6 pt-14">
      <div className="border-line-subtle flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex gap-3">
          <SkeletonBlock className="size-8 rounded-md" />
          <SkeletonText lines={3} widths={[70, 45, 55]} className="flex-1" />
        </div>
        <SkeletonText lines={2} widths={[90, 60]} />
        <SkeletonText lines={3} widths={[40, 50, 35]} />
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-md" />
          <SkeletonBlock className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <SkeletonBlock className="h-40 w-full rounded-lg" />
    </div>
  );
}

export default function MailReviewScreen({ model }: ScreenProps<MailReviewModel>) {
  const intl = useIntl();
  const navigate = useNavigate();
  const toast = useToast();
  const { status: connection } = useConnectivity();
  const offline = connection === "offline";
  const { compact, narrow, wide } = useBreakpoints();
  const outcomes = useMailOutcomes();
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reviewLaterOpen, setReviewLaterOpen] = useState(false);
  const [activeBundle, setActiveBundle] = useState<string | null>(null);
  const data = model.status === "ready" ? model.data : null;
  const group = intl.formatMessage(messages.group);
  const title = data?.title ?? intl.formatMessage(destinationMessages.mail);

  /** Updates the Mail search params, keeping the others (design state, locale). */
  const setSearch = (next: Readonly<Record<string, string | undefined>>, replace = false) =>
    void navigate({
      to: "/mail",
      search: (previous: Readonly<Record<string, unknown>>) => ({ ...previous, ...next }),
      replace,
    });

  const folder = data?.folder ?? "review";
  const hidden = (messageId: string): boolean => {
    const decision = outcomes.reviewed.get(messageId);
    return decision !== undefined && (decision.outcome === "notJobMail" || folder === "review");
  };
  const rows = (data?.rows ?? []).filter((row) => row.kind === "bundle" || !hidden(row.messageId));
  const messageIds = rows.flatMap((row) => (row.kind === "bundle" ? [] : [row.messageId]));
  const selection = data?.selected && !hidden(data.selected.messageId) ? data.selected : null;
  const decision = selection ? outcomes.reviewed.get(selection.messageId) : undefined;
  const pending =
    selection?.mode === "review" && (decision === undefined || decision.outcome === "reviewLater");
  const activeId = activeBundle ?? selection?.messageId ?? null;

  const chipFor = (messageId: string): string | null => {
    const outcome = outcomes.reviewed.get(messageId)?.outcome;
    if (!data || outcome === undefined) return null;
    if (outcome === "confirmed") return data.copy.reviewedChips.confirmed;
    return outcome === "corrected" ? data.copy.reviewedChips.corrected : null;
  };

  const select = (messageId: string | null) => {
    setActiveBundle(null);
    setSearch({ messageId: messageId ?? undefined }, true);
  };
  const showFolder = (next: MailFolderId) => {
    setActiveBundle(null);
    setDetailOpen(false);
    setSearch({ folder: next, category: undefined, messageId: undefined });
  };
  const showCategory = (category: MailCategory) => {
    setActiveBundle(null);
    setDetailOpen(false);
    setSearch({ folder: "all", category, messageId: undefined });
  };

  const openBundle = (row: Extract<MailRowVM, { kind: "bundle" }>) => {
    if (row.target === "jobs") void navigate({ to: "/jobs" });
    else toast.show({ variant: "info", message: intl.formatMessage(messages.backfillLater) });
  };

  const nav = useListNavigation({
    containerRef: listRef,
    ids: rows.map(navId),
    activeId,
    group,
    onActivate: (id) => {
      if (id.startsWith("bundle:")) setActiveBundle(id);
      else select(id);
    },
    onOpen: (id) => {
      const bundle = rows.find((row) => row.kind === "bundle" && navId(row) === id);
      if (bundle?.kind === "bundle") openBundle(bundle);
      else setDetailOpen(true);
    },
  });

  // After a decision, focus follows the selection to the next email when it was in the list.
  useEffect(() => {
    if (pendingFocus.current !== null && pendingFocus.current === activeId) {
      nav.focusItem(activeId);
      pendingFocus.current = null;
    }
  });

  /** Records a decision, moves on to the next email and offers Undo. */
  const decide = (
    messageId: string,
    outcome: ReviewOutcome,
    category: MailCategory,
    message: string,
    glyph?: typeof CalendarClock,
  ) => {
    const index = messageIds.indexOf(messageId);
    const next = messageIds[index + 1] ?? messageIds[index - 1] ?? null;
    const leaves = outcome === "notJobMail" || folder === "review";
    if (leaves && listRef.current?.contains(document.activeElement)) pendingFocus.current = next;
    mailOutcomes.review(messageId, outcome, category);
    setCorrectionOpen(false);
    setReviewLaterOpen(false);
    if (leaves) select(next);
    toast.show({
      message,
      ...(glyph && { glyph }),
      action: { label: intl.formatMessage(messages.undo), run: () => mailOutcomes.reopen(messageId) },
      openAfterUndo: () => select(messageId),
    });
  };

  const confirm = (messageId: string, proposal: ReviewProposalVM) => {
    const { move, company, category } = proposal;
    decide(
      messageId,
      "confirmed",
      category.key,
      move
        ? intl.formatMessage(messages.confirmedMove, {
            application: move.applicationLabel,
            status: move.to.label,
          })
        : intl.formatMessage(messages.confirmedCategory, { company: company.name, category: category.label }),
    );
  };

  const notJobMail = () => {
    if (!selection) return;
    decide(
      selection.messageId,
      "notJobMail",
      selection.proposal.category.key,
      intl.formatMessage(messages.notJobMailDone),
      MailX,
    );
  };

  const saveCorrection = (draft: CorrectionDraft) => {
    if (!selection || !data) return;
    const application =
      draft.applicationId === NEW_APPLICATION
        ? selection.newApplicationLabel
        : data.correction.applications.find((candidate) => candidate.id === draft.applicationId)?.label;
    const status = data.correction.statuses.find((candidate) => candidate.key === draft.status);
    const category = data.correction.categories.find((candidate) => candidate.key === draft.category);
    decide(
      selection.messageId,
      "corrected",
      draft.category,
      application && status
        ? intl.formatMessage(messages.correctedMove, { application, status: status.label })
        : intl.formatMessage(messages.correctedCategory, { category: category?.label ?? "" }),
    );
  };

  const reviewLater = (choice: ReviewLaterChoice) => {
    if (!selection) return;
    decide(
      selection.messageId,
      "reviewLater",
      selection.proposal.category.key,
      "preset" in choice
        ? intl.formatMessage(messages.reviewLaterPreset, { preset: choice.preset })
        : intl.formatMessage(messages.reviewLaterDate),
      CalendarClock,
    );
  };

  const openApplication = (applicationId: string) =>
    void navigate({
      to: "/tracker",
      search: (previous: Readonly<Record<string, unknown>>) => ({
        ...previous,
        applicationId,
        folder: undefined,
        category: undefined,
        messageId: undefined,
      }),
    });

  const openOriginal = () =>
    toast.show({ variant: "info", message: intl.formatMessage(messages.openingOriginal) });

  const undoChange = (messageId: string) => {
    const row = rows.find(
      (candidate): candidate is MessageRow & { kind: "update" } =>
        candidate.kind === "update" && candidate.messageId === messageId,
    );
    const change = row?.change ?? (selection?.messageId === messageId ? selection.change : null);
    if (!change) return;
    mailOutcomes.undoChange(messageId);
    toast.show({
      variant: "info",
      message: intl.formatMessage(messages.movedBack, {
        application: `${change.company.name} · ${change.role}`,
        status: change.from.label,
      }),
    });
  };

  const markSeen = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    mailOutcomes.markSeen(ids);
    toast.show({
      message: intl.formatMessage(messages.markedSeen, { count: ids.length }),
      action: { label: intl.formatMessage(messages.undo), run: () => mailOutcomes.unmarkSeen(ids) },
      extended: ids.length > 1,
    });
  };

  const emptyAction = (target: MailEmptyAction) => {
    if (target === "connectEmail")
      toast.show({ variant: "info", message: intl.formatMessage(messages.openingSignIn) });
    else showFolder(target === "showUpdates" ? "updates" : "all");
  };

  useKeyBindings([
    {
      id: "mail.confirm",
      keys: "C",
      label: intl.formatMessage(messages.confirm),
      group,
      enabled: pending && selection.canConfirm,
      run: () => {
        if (selection) confirm(selection.messageId, selection.proposal);
      },
    },
    {
      id: "mail.change",
      keys: "M",
      label: intl.formatMessage(messages.change),
      group,
      enabled: pending,
      run: () => setCorrectionOpen(true),
    },
    {
      id: "mail.notJobMail",
      keys: "N",
      label: intl.formatMessage(messages.notJobMail),
      group,
      enabled: pending,
      run: notJobMail,
    },
    {
      id: "mail.reviewLater",
      keys: "H",
      label: intl.formatMessage(messages.reviewLater),
      group,
      enabled: pending,
      run: () => setReviewLaterOpen(true),
    },
    {
      id: "mail.openOriginal",
      keys: "O",
      label: intl.formatMessage(messages.openOriginal),
      group,
      enabled: selection !== null && !offline,
      run: openOriginal,
    },
    ...(data?.folders ?? []).map((candidate) => ({
      id: `mail.folder.${candidate.id}`,
      keys: FOLDER_KEYS[candidate.id],
      label: candidate.label,
      group,
      run: () => showFolder(candidate.id),
    })),
  ]);

  const decidedCount = outcomes.reviewed.size;
  const notJobCount = [...outcomes.reviewed.values()].filter(
    (entry) => entry.outcome === "notJobMail",
  ).length;
  const folders = (data?.folders ?? []).map((candidate) => ({
    ...candidate,
    count:
      candidate.id === "review"
        ? candidate.count - decidedCount
        : candidate.id === "all"
          ? candidate.count - notJobCount
          : candidate.count,
  }));
  const folderTitle =
    data?.categories.find((category) => category.selected)?.label ??
    folders.find((candidate) => candidate.id === folder)?.label ??
    "";

  const stamp =
    model.status === "ready" && model.fromCache ? (
      <StaleStamp prefix="updated" time={model.updatedAt} clock={model.updatedClock} />
    ) : data?.lastChecked ? (
      <StaleStamp prefix="lastChecked" time={data.lastChecked.at} clock={data.lastChecked.at.label} />
    ) : null;

  const header = (
    <header className="flex shrink-0 flex-col gap-1 px-4 pt-5 pb-3">
      <ScreenTitle title={title} />
      {data && data.empty?.kind !== "noAccount" && (
        <div className="flex min-h-7 items-center gap-2">
          <h2 className="text-headline text-fg-primary min-w-0 flex-1 truncate">{folderTitle}</h2>
          {stamp}
          {folder === "updates" && rows.length > 0 && (
            <UpdatesMenu
              onMarkAllSeen={() =>
                markSeen(messageIds.filter((id) => !outcomes.seen.has(id) && !outcomes.undone.has(id)))
              }
            />
          )}
        </div>
      )}
      {data && compact && data.empty?.kind !== "noAccount" && (
        <CompactFolders folders={folders} value={folder} onFolder={showFolder} />
      )}
    </header>
  );

  const sidebar = data && (
    <MailFolders
      folders={folders}
      categories={data.categories}
      accounts={data.accounts}
      onFolder={showFolder}
      onCategory={showCategory}
    />
  );

  // First use: nothing to split yet, so the explanation gets the whole content area.
  if (data?.empty?.kind === "noAccount") {
    const { empty } = data;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {sidebar}
        {header}
        <div className="flex flex-1 items-start justify-center pt-[10vh]">
          <EmptyState
            kind="firstUse"
            glyph={Mail}
            title={empty.title}
            body={empty.body ?? ""}
            {...(empty.action && {
              primary: { label: empty.action.label, onClick: () => emptyAction("connectEmail") },
            })}
          />
        </div>
      </div>
    );
  }

  const queueCleared = data !== null && folder === "review" && data.empty === null && rows.length === 0;
  const listEmpty =
    data?.empty ?? (queueCleared ? { ...data.copy.caughtUp, kind: "caughtUp" as const } : null);

  let listBody;
  if (model.status === "loading") {
    listBody = (
      <SkeletonRegion
        loading
        label={intl.formatMessage(messages.loading)}
        skeleton={Array.from({ length: 6 }, (_, index) => (
          <MailRowSkeleton key={index} />
        ))}
      >
        {null}
      </SkeletonRegion>
    );
  } else if (model.status === "error") {
    listBody = (
      <PaneError
        title={intl.formatMessage(messages.errorTitle)}
        body={intl.formatMessage(messages.errorBody)}
        onRetry={model.retry}
      />
    );
  } else if (listEmpty) {
    listBody = <ListEmpty empty={listEmpty} onAction={emptyAction} />;
  } else if (data) {
    listBody = (
      <ul ref={listRef} aria-label={folderTitle} className="flex flex-col">
        {rows.map((row) =>
          row.kind === "bundle" ? (
            <BundleRow key={navId(row)} row={row} nav={nav} onOpen={() => openBundle(row)} />
          ) : (
            <MailRow
              key={row.messageId}
              row={row}
              nav={nav}
              chip={chipFor(row.messageId)}
              undone={outcomes.undone.has(row.messageId)}
              seen={outcomes.seen.has(row.messageId)}
              onSelect={() => {
                select(row.messageId);
                if (narrow) setDetailOpen(true);
              }}
              onConfirm={() => {
                if (row.kind === "review" && row.canConfirm) confirm(row.messageId, row.proposal);
              }}
              onChange={() => {
                select(row.messageId);
                if (narrow) setDetailOpen(true);
                setCorrectionOpen(true);
              }}
              onUndo={() => undoChange(row.messageId)}
            />
          ),
        )}
      </ul>
    );
  }

  const list = (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {data && <ReauthCallouts reauth={data.reauth} onReconnect={() => emptyAction("connectEmail")} />}
      <div className="border-line-subtle mt-2 min-h-0 flex-1 overflow-y-auto border-t">
        {listBody}
        {offline && data && (
          <p className="text-footnote text-fg-tertiary px-4 py-3">{data.copy.offlineFootnote}</p>
        )}
      </div>
    </div>
  );

  let detail;
  if (model.status === "loading") {
    detail = (
      <SkeletonRegion
        loading
        label={intl.formatMessage(messages.loadingEmail)}
        skeleton={<ReviewCardSkeleton />}
      >
        {null}
      </SkeletonRegion>
    );
  } else if (selection && data) {
    detail = (
      <ReadingPane
        selection={selection}
        model={data}
        chip={chipFor(selection.messageId) ?? selection.reviewedChip}
        pending={pending}
        undone={outcomes.undone.has(selection.messageId)}
        seen={outcomes.seen.has(selection.messageId)}
        offline={offline}
        wide={wide}
        correctionOpen={correctionOpen}
        onCorrectionOpenChange={setCorrectionOpen}
        reviewLaterOpen={reviewLaterOpen}
        onReviewLaterOpenChange={setReviewLaterOpen}
        handlers={{
          onConfirm: () => confirm(selection.messageId, selection.proposal),
          onNotJobMail: notJobMail,
          onSaveCorrection: saveCorrection,
          onReviewLater: reviewLater,
          onOpenOriginal: openOriginal,
          onUndoChange: () => undoChange(selection.messageId),
          onMarkSeen: () => markSeen([selection.messageId]),
          onOpenApplication: openApplication,
        }}
      />
    );
  } else if (data) {
    const empty = queueCleared ? data.copy.caughtUp : data.noSelection;
    detail = empty ? (
      <EmptyState
        kind="caughtUp"
        className="pt-[14vh]"
        title={empty.title}
        body={empty.body ?? ""}
        {...(empty.action && {
          primary: {
            label: empty.action.label,
            onClick: () => emptyAction(empty.action?.target ?? "showAll"),
          },
        })}
      />
    ) : (
      <EmptyState kind="subArea" className="p-6" body={intl.formatMessage(messages.selectEmail)} />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sidebar}
      <SplitView
        listLabel={intl.formatMessage(messages.listLabel)}
        detailLabel={intl.formatMessage(messages.detailLabel)}
        backLabel={intl.formatMessage(messages.backToList)}
        listPane={{ min: 360, default: 360, max: 440 }}
        detailOpen={detailOpen && selection !== null}
        onBack={() => setDetailOpen(false)}
        list={list}
        detail={detail}
        {...(selection &&
          data && {
            railLabel: data.copy.detailsHeading,
            rail: (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <MailDetails
                  details={selection.details}
                  copy={data.copy}
                  layout="rail"
                  onOpenApplication={openApplication}
                  onCreateApplication={pending ? () => setCorrectionOpen(true) : null}
                />
              </div>
            ),
          })}
      />
    </div>
  );
}
