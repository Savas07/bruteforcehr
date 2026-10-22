/**
 * Mail review (`/mail`, `/mail/review/$messageId`): the sidebar folders, the list pane rows and
 * the reading pane of the selected email (mail-review.md "Decision — Desktop", states.md Mail
 * rows, decisions.md D17–D19). Pure: every string is formatted here from `ctx`.
 *
 * Params: `messageId` (selected email), `folder` (`review` | `updates` | `all`, default
 * `review`), `category` (a mail category; filters All job mail).
 */
import {
  ACTIVE_STATUSES,
  type MailAccount,
  type MailAccountStatus,
  type MailCategory,
  type MailMessage,
  type MailProvider,
  TERMINAL_STATUSES,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import type {
  ApplicationSummaryVM,
  AutoChangeVM,
  ReviewProposalVM,
  TimelineEventVM,
} from "../../shared/model/blocks";
import {
  applicationLabel,
  applicationSummaryVM,
  autoChangeVM,
  MAIL_CATEGORY_MESSAGES,
  reviewProposalVM,
  timelineVMs,
} from "../../shared/model/build-blocks";
import {
  absoluteDateTime,
  calendarDaysFromNow,
  clockTime,
  dayAndTime,
  relativeTime,
  shortDate,
} from "../../shared/model/format";
import { statusVM } from "../../shared/model/vocabulary";
import type { CompanyVM, ModelContext, StatusVM, TimeVM, UserData } from "../../shared/model/types";

export type MailFolderId = "review" | "updates" | "all";

/** One of To review · Updates · All job mail. */
export interface MailFolderVM {
  readonly id: MailFolderId;
  /** "To review", "Updates", "All job mail". */
  readonly label: string;
  /** To review: emails waiting plus one per inbox-scan application (D17); Updates: automatic changes in the last 14 days; All: stored emails. */
  readonly count: number;
  /** "To review, 3". */
  readonly accessibleLabel: string;
  readonly selected: boolean;
}

/** A category under All job mail; `rejection` reads "Decision" (D18). */
export interface MailCategoryFolderVM {
  readonly key: MailCategory;
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
}

export type MailAccountHealth = "ok" | "reauth" | "error";

/** An inbox in the sidebar with its health dot: none when healthy, amber otherwise. Never red. */
export interface MailAccountVM {
  readonly id: string;
  readonly address: string;
  /** "Gmail", "iCloud", "Outlook". */
  readonly provider: string;
  readonly health: MailAccountHealth;
  /** "Connected", "Needs reconnecting", "Can't connect". */
  readonly healthLabel: string;
  readonly dot: "none" | "warning";
  /** "deniz.aksoy@example.net, Needs reconnecting". */
  readonly accessibleLabel: string;
}

/** The re-auth callout at the top of the list (states.md mail.reauth). */
export interface MailReauthVM {
  readonly accountId: string;
  readonly address: string;
  /** Callout title: "iCloud needs you to sign in again". */
  readonly title: string;
  /** "We paused checking deniz.aksoy@example.net on 21 Oct. Reconnect to pick up where we left off." */
  readonly body: string;
  readonly actionLabel: string;
}

/** Fields every email row shows (`MailRow`): only the subject truncates. */
export interface MailRowBase {
  readonly messageId: string;
  /** Sender name, or the address when the email has no name. */
  readonly sender: string;
  readonly company: CompanyVM;
  /** Classification label ("Interview invite", "Decision"). */
  readonly category: { readonly key: MailCategory; readonly label: string };
  readonly subject: string;
  readonly receivedAt: TimeVM;
  /** Inbox it arrived in; null when only one account is connected (no account dot). */
  readonly account: { readonly address: string; readonly provider: string } | null;
  /** Quiet chip after the user acted: "Confirmed" / "Corrected". */
  readonly reviewedChip: string | null;
  readonly pendingSync: boolean;
}

/** An email waiting for the user's decision; hover actions Confirm / Change. */
export interface MailReviewRowVM extends MailRowBase {
  readonly kind: "review";
  readonly proposal: ReviewProposalVM;
  /** "We couldn't tell what this email means. Open it to sort it yourself." Replaces the headline. */
  readonly unclassified: string | null;
  /** False when there is nothing to confirm (unclassified): the user sorts it with Change. */
  readonly canConfirm: boolean;
  /** Tooltip of the Confirm hover action: "Confirm: move to Screening". */
  readonly confirmHint: string;
}

/** An email behind an automatic change, with source, reason and Undo. */
export interface MailUpdateRowVM extends MailRowBase {
  readonly kind: "update";
  readonly change: AutoChangeVM;
}

/** Any other stored job email. */
export interface MailPlainRowVM extends MailRowBase {
  readonly kind: "plain";
}

/** One row standing for many emails (`BundleRow`). */
export interface MailBundleRowVM {
  readonly kind: "bundle";
  readonly id: "backfill" | "jobAlerts";
  /** "Inbox scan · 14 applications to review" / "Job alerts · 3 postings sent to Jobs". */
  readonly label: string;
  /** Opens Backfill Review, or Jobs filtered to postings from alert emails. */
  readonly target: "backfillReview" | "jobs";
  readonly messageIds: readonly string[];
  readonly latestAt: TimeVM;
  readonly pendingSync: boolean;
}

export type MailRowVM = MailReviewRowVM | MailUpdateRowVM | MailPlainRowVM | MailBundleRowVM;

/** Details rail (≥ 1440 px) or the folded section of the review card below that. */
export interface MailDetailsVM {
  readonly company: CompanyVM;
  /** The application's role, else the role named in the email. */
  readonly role: string | null;
  /** Null: "No application found" with "Create application". */
  readonly application: {
    readonly id: string;
    /** "Brightwave · Frontend Engineer, Editor". */
    readonly label: string;
    /** Current status, channel, applied date (`ApplicationSummaryBlock`). */
    readonly summary: ApplicationSummaryVM;
  } | null;
  readonly contact: {
    readonly name: string;
    readonly email: string | null;
    readonly role: string | null;
  } | null;
  /** Dates found in the email ("Interview · Tuesday, 17:00"). */
  readonly dates: ReviewProposalVM["dates"];
  readonly meetingUrl: string | null;
}

/** The reading pane of the selected email. */
export interface MailSelectionVM {
  readonly messageId: string;
  /** Review: Confirm / Change… / Not job mail. Update: the automatic change with Undo. Plain: read only. */
  readonly mode: "review" | "update" | "plain";
  readonly proposal: ReviewProposalVM;
  readonly unclassified: string | null;
  readonly canConfirm: boolean;
  readonly confirmHint: string;
  readonly change: AutoChangeVM | null;
  readonly reviewedChip: string | null;
  /** Plain-text body; null once purged (see `bodyNote`). */
  readonly body: string | null;
  /** "Email text kept until 4 Apr 2027" or "We no longer keep the text of this email." */
  readonly bodyNote: string | null;
  /** "Open in Gmail" (`O`). */
  readonly openOriginalLabel: string;
  /** The linked application's latest events, newest first (Linear Activity). */
  readonly activity: readonly TimelineEventVM[];
  readonly details: MailDetailsVM;
  /** "Create application" target in the correction popover: "Nordlicht Mobility · Frontend Engineer". */
  readonly newApplicationLabel: string;
}

/**
 * Options of the correction popover (Change…, `M`): Tab cycles Category → Application → Status.
 * "Create application" and "No status change" are the view's fixed first options.
 */
export interface MailCorrectionVM {
  readonly categories: readonly { readonly key: MailCategory; readonly label: string }[];
  /** Open applications first (most recently updated), then closed ones. */
  readonly applications: readonly {
    readonly id: string;
    /** "Brightwave · Frontend Engineer". */
    readonly label: string;
    readonly status: StatusVM;
  }[];
  /** Every status in progress order, then the closed outcomes: the user may move anywhere (§4.6). */
  readonly statuses: readonly StatusVM[];
}

export type MailEmptyAction = "connectEmail" | "showUpdates" | "showAll";

/**
 * Empty list pane. `noAccount` is first-use (icon, title, one line, primary CTA); `caughtUp`,
 * `noUpdates`, `noMail` are neutral; `noCategoryMail` is a filtered no-results line.
 */
export interface MailEmptyVM {
  readonly kind: "noAccount" | "caughtUp" | "noUpdates" | "noMail" | "noCategoryMail";
  readonly title: string;
  readonly body: string | null;
  readonly action: { readonly label: string; readonly target: MailEmptyAction } | null;
}

/** Reading pane with nothing selected. */
export interface MailNoSelectionVM {
  /** "4 emails to review. Select one to see what we found." / "Nothing to review". */
  readonly title: string;
  readonly body: string | null;
  readonly action: { readonly label: string; readonly target: MailEmptyAction } | null;
}

export interface MailReviewModel {
  readonly title: string;
  readonly folders: readonly MailFolderVM[];
  readonly categories: readonly MailCategoryFolderVM[];
  readonly accounts: readonly MailAccountVM[];
  readonly folder: MailFolderId;
  /** Category filter of All job mail; null shows every category. */
  readonly category: MailCategory | null;
  readonly rows: readonly MailRowVM[];
  readonly selectedMessageId: string | null;
  readonly selected: MailSelectionVM | null;
  readonly noSelection: MailNoSelectionVM | null;
  readonly empty: MailEmptyVM | null;
  /** One callout per account that needs signing in again. */
  readonly reauth: readonly MailReauthVM[];
  /** `StaleStamp` in the list header: "Last checked 10:24". Null before the first check. */
  readonly lastChecked: { readonly label: string; readonly at: TimeVM } | null;
  readonly copy: {
    readonly activityHeading: string;
    readonly detailsHeading: string;
    readonly openApplication: string;
    readonly noApplication: string;
    readonly createApplication: string;
    /** Under "Not job mail" (§8: the email is not kept). */
    readonly notJobMailFootnote: string;
    /** Under the list while offline (states.md mail.offlineFootnote). */
    readonly offlineFootnote: string;
    /** The quiet row chip after the user acted ("Confirmed", "Corrected"). */
    readonly reviewedChips: { readonly confirmed: string; readonly corrected: string };
    /** The queue after the user's last decision in this session ("Nothing to review", states.md mail.caughtUp). */
    readonly caughtUp: MailNoSelectionVM;
  };
  readonly correction: MailCorrectionVM;
  /** Earliest day "Review later › Pick a date…" offers: tomorrow in the user's zone (`yyyy-mm-dd`). */
  readonly reviewLaterMinDate: string;
}

const messages = defineMessages({
  title: { id: "mail-review.title", defaultMessage: "Mail", description: "Screen title" },
  folderReview: { id: "mail-review.folder.review", defaultMessage: "To review" },
  folderUpdates: { id: "mail-review.folder.updates", defaultMessage: "Updates" },
  folderAll: { id: "mail-review.folder.all", defaultMessage: "All job mail" },
  folderAccessible: {
    id: "mail-review.folder.accessibleLabel",
    defaultMessage: "{folder}, {count, number}",
    description: "Screen-reader label of a sidebar folder: folder name and its count",
  },
  providerEmail: {
    id: "mail-review.provider.imap",
    defaultMessage: "Email",
    description: "Name shown for an IMAP inbox without a display name",
  },
  openGmail: { id: "mail-review.openOriginal.gmail", defaultMessage: "Open in Gmail" },
  openOutlook: { id: "mail-review.openOriginal.microsoft", defaultMessage: "Open in Outlook" },
  openMailApp: { id: "mail-review.openOriginal.imap", defaultMessage: "Open in your mail app" },
  healthOk: { id: "mail-review.health.ok", defaultMessage: "Connected" },
  healthReauth: { id: "mail-review.health.reauth", defaultMessage: "Needs reconnecting" },
  healthError: { id: "mail-review.health.error", defaultMessage: "Can't connect" },
  accountAccessible: {
    id: "mail-review.account.accessibleLabel",
    defaultMessage: "{address}, {health}",
    description: "Screen-reader label of a sidebar inbox: address and connection health",
  },
  unclassified: {
    id: "mail-review.unclassified",
    defaultMessage: "We couldn't tell what this email means. Open it to sort it yourself.",
  },
  caughtUpTitle: { id: "mail-review.caughtUp.title", defaultMessage: "Nothing to review" },
  caughtUpBody: {
    id: "mail-review.caughtUp.body",
    defaultMessage: "When we're not sure what an email means, we'll ask you here.",
  },
  seeUpdates: { id: "mail-review.caughtUp.action", defaultMessage: "See recent updates" },
  activityHeading: { id: "mail-review.copy.activityHeading", defaultMessage: "Recent activity" },
  detailsHeading: { id: "mail-review.copy.detailsHeading", defaultMessage: "Details" },
  openApplication: { id: "mail-review.copy.openApplication", defaultMessage: "Open in Tracker" },
  noApplication: { id: "mail-review.copy.noApplication", defaultMessage: "No application found" },
  createApplication: { id: "mail-review.copy.createApplication", defaultMessage: "Create application" },
  notJobMailFootnote: {
    id: "mail-review.copy.notJobMailFootnote",
    defaultMessage: "We'll forget this email.",
  },
  offlineFootnote: {
    id: "mail-review.copy.offlineFootnote",
    defaultMessage: "New emails will appear when you're back online.",
  },
  reviewedConfirmed: { id: "mail-review.reviewed.confirmed", defaultMessage: "Confirmed" },
  reviewedCorrected: { id: "mail-review.reviewed.corrected", defaultMessage: "Corrected" },
  lastChecked: {
    id: "mail-review.lastChecked",
    defaultMessage: "Last checked {time}",
    description: "{time} is a clock time today, or a day and time",
  },
  bodyGone: { id: "mail-review.body.gone", defaultMessage: "We no longer keep the text of this email." },
  bodyKeptUntil: { id: "mail-review.body.keptUntil", defaultMessage: "Email text kept until {date}" },
  confirm: { id: "mail-review.confirm", defaultMessage: "Confirm" },
  confirmMove: {
    id: "mail-review.confirmMove",
    defaultMessage: "Confirm: move to {status}",
    description: "Tooltip of Confirm; {status} is an application status name",
  },
  backfillBundle: {
    id: "mail-review.bundle.backfill",
    defaultMessage: "Inbox scan · {count, plural, one {# application} other {# applications}} to review",
  },
  jobAlertsPostings: {
    id: "mail-review.bundle.jobAlertsPostings",
    defaultMessage: "Job alerts · {count, plural, one {# posting} other {# postings}} sent to Jobs",
  },
  jobAlertsEmails: {
    id: "mail-review.bundle.jobAlertsEmails",
    defaultMessage: "Job alerts · {count, plural, one {# email} other {# emails}}",
  },
  noSelection: {
    id: "mail-review.noSelection.title",
    defaultMessage:
      "{count, plural, one {# email} other {# emails}} to review. Select one to see what we found.",
  },
  reauthTitle: {
    id: "mail-review.reauth.title",
    defaultMessage: "{provider} needs you to sign in again",
    description: "{provider} is Gmail, Outlook, iCloud or the inbox's name",
  },
  reauthBody: {
    id: "mail-review.reauth.body",
    defaultMessage: "We paused checking {account} on {date}. Reconnect to pick up where we left off.",
  },
  reconnect: { id: "mail-review.reauth.action", defaultMessage: "Reconnect" },
  noAccountTitle: { id: "mail-review.noAccount.title", defaultMessage: "Connect your email" },
  noAccountBody: {
    id: "mail-review.noAccount.body",
    defaultMessage:
      "Connect your email and we'll find replies about your applications. When we're not sure what an email means, we'll ask you first.",
  },
  connectEmail: { id: "mail-review.noAccount.action", defaultMessage: "Connect email" },
  noUpdatesTitle: { id: "mail-review.noUpdates.title", defaultMessage: "No automatic updates" },
  noUpdatesBody: {
    id: "mail-review.noUpdates.body",
    defaultMessage: "Changes we make from your email in the last {days} days show up here, each with Undo.",
  },
  noCategoryTitle: { id: "mail-review.noCategoryMail.title", defaultMessage: "No emails in {category}" },
  showAll: { id: "mail-review.noCategoryMail.action", defaultMessage: "Show all job mail" },
  noMailTitle: { id: "mail-review.noMail.title", defaultMessage: "No job emails yet" },
  noMailBody: {
    id: "mail-review.noMail.body",
    defaultMessage: "Replies about your applications show up here after we check your inbox.",
  },
});

const FOLDER_MESSAGES: Readonly<Record<MailFolderId, MessageDescriptor>> = {
  review: messages.folderReview,
  updates: messages.folderUpdates,
  all: messages.folderAll,
};

/** Sidebar order (mail-review.md "Sidebar"). `not_job` is never stored (§8). */
const CATEGORY_ORDER: readonly Exclude<MailCategory, "not_job">[] = [
  "interview_invite",
  "assessment",
  "offer",
  "rejection",
  "recruiter_outreach",
  "info_request",
  "job_alert",
  "application_received",
  "other_job",
];

/** Brand names stay as data; only the generic IMAP name is translated. */
const PROVIDER_LABELS: Readonly<Record<Exclude<MailProvider, "imap">, string>> = {
  gmail: "Gmail",
  microsoft: "Outlook",
};

const OPEN_ORIGINAL_MESSAGES: Readonly<Record<MailProvider, MessageDescriptor>> = {
  gmail: messages.openGmail,
  microsoft: messages.openOutlook,
  imap: messages.openMailApp,
};

/** `disconnected` accounts are gone from the user's point of view. */
const ACCOUNT_HEALTH: Readonly<Record<Exclude<MailAccountStatus, "disconnected">, MailAccountHealth>> = {
  connected: "ok",
  syncing: "ok",
  needs_reauth: "reauth",
  error: "error",
};

const HEALTH_MESSAGES: Readonly<Record<MailAccountHealth, MessageDescriptor>> = {
  ok: messages.healthOk,
  reauth: messages.healthReauth,
  error: messages.healthError,
};

const UPDATES_WINDOW_DAYS = 14;
const ACTIVITY_LIMIT = 5;

function seeUpdates(intl: IntlShape): MailEmptyVM["action"] {
  return { label: intl.formatMessage(messages.seeUpdates), target: "showUpdates" };
}

function copyVM(intl: IntlShape): MailReviewModel["copy"] {
  return {
    activityHeading: intl.formatMessage(messages.activityHeading),
    detailsHeading: intl.formatMessage(messages.detailsHeading),
    openApplication: intl.formatMessage(messages.openApplication),
    noApplication: intl.formatMessage(messages.noApplication),
    createApplication: intl.formatMessage(messages.createApplication),
    notJobMailFootnote: intl.formatMessage(messages.notJobMailFootnote),
    offlineFootnote: intl.formatMessage(messages.offlineFootnote),
    reviewedChips: {
      confirmed: intl.formatMessage(messages.reviewedConfirmed),
      corrected: intl.formatMessage(messages.reviewedCorrected),
    },
    caughtUp: {
      title: intl.formatMessage(messages.caughtUpTitle),
      body: intl.formatMessage(messages.caughtUpBody),
      action: seeUpdates(intl),
    },
  };
}

function correctionVM(data: Pick<UserData, "applications">, intl: IntlShape): MailCorrectionVM {
  const applications = data.applications
    .map((application) => ({
      id: application.id,
      label: applicationLabel(application),
      status: statusVM(application.status, intl),
      updatedAt: application.updatedAt.getTime(),
    }))
    .toSorted(
      (a, b) =>
        Number(a.status.phase === "closed") - Number(b.status.phase === "closed") ||
        b.updatedAt - a.updatedAt,
    )
    .map(({ id, label, status }) => ({ id, label, status }));
  return {
    categories: CATEGORY_ORDER.map((key) => ({
      key,
      label: intl.formatMessage(MAIL_CATEGORY_MESSAGES[key]),
    })),
    applications,
    statuses: [...ACTIVE_STATUSES, ...TERMINAL_STATUSES].map((status) => statusVM(status, intl)),
  };
}

function isFolder(value: string | undefined): value is MailFolderId {
  return value === "review" || value === "updates" || value === "all";
}

function isStoredCategory(value: string | undefined): value is MailCategory {
  return CATEGORY_ORDER.some((key) => key === value);
}

function liveAccount(
  account: MailAccount,
): account is MailAccount & { status: Exclude<MailAccountStatus, "disconnected"> } {
  return account.status !== "disconnected";
}

function providerLabel(account: MailAccount, intl: IntlShape): string {
  if (account.displayName) return account.displayName;
  return account.provider === "imap"
    ? intl.formatMessage(messages.providerEmail)
    : PROVIDER_LABELS[account.provider];
}

/**
 * D17 proposal from the inbox scan: still pending and received before the inbox was connected,
 * so only the backfill can have found it.
 */
function isBackfillProposal(message: MailMessage, accounts: readonly MailAccount[]): boolean {
  const account = accounts.find((candidate) => candidate.id === message.accountId);
  return (
    message.reviewState === "pending" && account !== undefined && message.receivedAt < account.connectedAt
  );
}

const REVIEWED_CHIPS: Partial<Readonly<Record<MailMessage["reviewState"], MessageDescriptor>>> = {
  confirmed: messages.reviewedConfirmed,
  corrected: messages.reviewedCorrected,
};

function lastCheckedVM(accounts: readonly MailAccount[], ctx: ModelContext): MailReviewModel["lastChecked"] {
  const latest = accounts
    .flatMap((account) => (account.lastSyncedAt ? [account.lastSyncedAt] : []))
    .reduce<Date | null>((max, at) => (max === null || at > max ? at : max), null);
  if (latest === null) return null;
  const label =
    calendarDaysFromNow(latest, ctx) === 0 ? clockTime(latest, ctx) : dayAndTime(latest, ctx).label;
  return {
    label: ctx.intl.formatMessage(messages.lastChecked, { time: label }),
    at: { iso: latest.toISOString(), label, absolute: absoluteDateTime(latest, ctx) },
  };
}

function bodyNote(message: MailMessage, ctx: ModelContext): string | null {
  if (message.bodyText === null) return ctx.intl.formatMessage(messages.bodyGone);
  return message.bodyPurgeAt
    ? ctx.intl.formatMessage(messages.bodyKeptUntil, { date: shortDate(message.bodyPurgeAt, ctx) })
    : null;
}

export function buildMailReviewModel(
  data: UserData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): MailReviewModel {
  const accounts = data.mailAccounts.filter(liveAccount);
  const mails = data.mailMessages
    .filter((message) => message.reviewState !== "dismissed")
    .toSorted((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  const proposals = new Map(mails.map((message) => [message.id, reviewProposalVM(message, data, ctx)]));
  const proposalOf = (message: MailMessage): ReviewProposalVM => {
    const proposal = proposals.get(message.id);
    if (proposal === undefined) throw new Error(`No proposal for ${message.id}`);
    return proposal;
  };

  // Automatic changes behind each email, kept while the event exists.
  const changes = new Map<string, { change: AutoChangeVM; at: Date }>();
  for (const message of mails) {
    const event = data.applicationEvents.find((candidate) => candidate.id === message.appliedEventId);
    const change = event ? autoChangeVM(event, data, ctx) : null;
    if (event && change) changes.set(message.id, { change, at: event.occurredAt });
  }

  const { intl } = ctx;
  const accountDot = accounts.length > 1;
  const reviewInfo = (message: MailMessage) => {
    const proposal = proposalOf(message);
    const unclassified = message.category === "other_job" ? intl.formatMessage(messages.unclassified) : null;
    return {
      proposal,
      unclassified,
      canConfirm: unclassified === null,
      confirmHint: proposal.move
        ? intl.formatMessage(messages.confirmMove, { status: proposal.move.to.label })
        : intl.formatMessage(messages.confirm),
    };
  };

  const chipOf = (state: MailMessage["reviewState"]): string | null => {
    const chip = REVIEWED_CHIPS[state];
    return chip ? intl.formatMessage(chip) : null;
  };

  const rowOf = (message: MailMessage): MailReviewRowVM | MailUpdateRowVM | MailPlainRowVM => {
    const proposal = proposalOf(message);
    const account = accounts.find((candidate) => candidate.id === message.accountId);
    const base: MailRowBase = {
      messageId: message.id,
      sender: message.from.name ?? message.from.address,
      company: proposal.company,
      category: proposal.category,
      subject: proposal.subject,
      receivedAt: proposal.receivedAt,
      account:
        accountDot && account ? { address: account.address, provider: providerLabel(account, intl) } : null,
      reviewedChip: chipOf(message.reviewState),
      pendingSync: proposal.pendingSync,
    };
    if (message.reviewState === "pending") return { ...base, kind: "review", ...reviewInfo(message) };
    const change = changes.get(message.id);
    return change ? { ...base, kind: "update", change: change.change } : { ...base, kind: "plain" };
  };

  // To review: single emails, plus the inbox scan as one bundle (D17).
  const pending = mails.filter((message) => message.reviewState === "pending");
  const backfill = pending.filter((message) => isBackfillProposal(message, accounts));
  const singles = pending.filter((message) => !isBackfillProposal(message, accounts));
  // Proposals for the same application count once (D17).
  const backfillGroups = new Set(
    backfill.map(
      (message) =>
        message.applicationId ??
        `${message.extracted.company ?? message.from.address}\u0000${message.extracted.role ?? ""}`.toLowerCase(),
    ),
  ).size;
  const reviewCount = singles.length + backfillGroups;
  const latestBackfill = backfill[0];
  const backfillRow: MailBundleRowVM | null =
    latestBackfill === undefined
      ? null
      : {
          kind: "bundle",
          id: "backfill",
          label: intl.formatMessage(messages.backfillBundle, { count: backfillGroups }),
          target: "backfillReview",
          messageIds: backfill.map((message) => message.id),
          latestAt: relativeTime(latestBackfill.receivedAt, ctx),
          pendingSync: backfill.some((message) => ctx.pendingWrites.has(message.id)),
        };

  const updatesSince = ctx.now.getTime() - UPDATES_WINDOW_DAYS * 86_400_000;
  const updates = mails
    .filter((message) => (changes.get(message.id)?.at.getTime() ?? -Infinity) >= updatesSince)
    .toSorted((a, b) => (changes.get(b.id)?.at.getTime() ?? 0) - (changes.get(a.id)?.at.getTime() ?? 0));

  const category = isStoredCategory(params.category) ? params.category : null;
  const folder: MailFolderId = isFolder(params.folder) ? params.folder : category ? "all" : "review";

  let rows: MailRowVM[];
  if (folder === "review") {
    rows = [...(backfillRow ? [backfillRow] : []), ...singles.map(rowOf)];
  } else if (folder === "updates") {
    rows = updates.map(rowOf);
  } else if (category) {
    rows = mails.filter((message) => message.category === category).map(rowOf);
  } else {
    // Job alerts collapse into one bundle row where the newest alert would be.
    const alerts = mails.filter((message) => message.category === "job_alert");
    const postings = data.jobs.filter((job) =>
      job.sources.some((source) => source.source === "alert_email"),
    ).length;
    rows = mails.flatMap((message): MailRowVM[] => {
      if (message.category !== "job_alert") return [rowOf(message)];
      if (message !== alerts[0]) return [];
      return [
        {
          kind: "bundle",
          id: "jobAlerts",
          label:
            postings > 0
              ? intl.formatMessage(messages.jobAlertsPostings, { count: postings })
              : intl.formatMessage(messages.jobAlertsEmails, { count: alerts.length }),
          target: "jobs",
          messageIds: alerts.map((alert) => alert.id),
          latestAt: relativeTime(message.receivedAt, ctx),
          pendingSync: alerts.some((alert) => ctx.pendingWrites.has(alert.id)),
        },
      ];
    });
  }

  const requested = mails.find((message) => message.id === params.messageId);
  const firstRow = rows.find((row): row is Exclude<MailRowVM, MailBundleRowVM> => row.kind !== "bundle");
  const selectedMessage =
    requested ?? (firstRow ? mails.find((message) => message.id === firstRow.messageId) : undefined) ?? null;

  const selectionVM = (message: MailMessage): MailSelectionVM => {
    const row = rowOf(message);
    const review = row.kind === "review" ? row : null;
    const proposal = proposalOf(message);
    const application = data.applications.find((candidate) => candidate.id === message.applicationId);
    const account = data.mailAccounts.find((candidate) => candidate.id === message.accountId);
    const contactEmail = message.extracted.contactEmail ?? message.from.address;
    const contact = data.contacts.find(
      (candidate) =>
        candidate.email === contactEmail &&
        (application === undefined || candidate.applicationIds.includes(application.id)),
    );
    return {
      messageId: message.id,
      mode: row.kind,
      proposal,
      unclassified: review?.unclassified ?? null,
      canConfirm: review?.canConfirm ?? false,
      confirmHint: review?.confirmHint ?? intl.formatMessage(messages.confirm),
      change: row.kind === "update" ? row.change : null,
      reviewedChip: row.reviewedChip,
      body: message.bodyText,
      bodyNote: bodyNote(message, ctx),
      openOriginalLabel: intl.formatMessage(OPEN_ORIGINAL_MESSAGES[account?.provider ?? "imap"]),
      activity: application ? timelineVMs(application, data, ctx).slice(0, ACTIVITY_LIMIT) : [],
      details: {
        company: proposal.company,
        role: application?.role ?? message.extracted.role,
        application: application
          ? {
              id: application.id,
              label: applicationLabel(application),
              summary: applicationSummaryVM(application, data, ctx),
            }
          : null,
        contact: contact
          ? { name: contact.name, email: contact.email, role: contact.role }
          : message.extracted.contactName
            ? { name: message.extracted.contactName, email: message.extracted.contactEmail, role: null }
            : null,
        dates: proposal.dates,
        meetingUrl: message.extracted.meetingUrls[0] ?? null,
      },
      newApplicationLabel: message.extracted.role
        ? applicationLabel({ company: proposal.company.name, role: message.extracted.role })
        : proposal.company.name,
    };
  };

  const counts: Readonly<Record<MailFolderId, number>> = {
    review: reviewCount,
    updates: updates.length,
    all: mails.length,
  };
  const empty = emptyVM(intl, {
    accounts: accounts.length,
    rows: rows.length,
    folder,
    category,
    reviewCount,
  });

  return {
    title: intl.formatMessage(messages.title),
    folders: (["review", "updates", "all"] as const).map((id) => {
      const label = intl.formatMessage(FOLDER_MESSAGES[id]);
      return {
        id,
        label,
        count: counts[id],
        accessibleLabel: intl.formatMessage(messages.folderAccessible, { folder: label, count: counts[id] }),
        selected: id === folder && (id !== "all" || category === null),
      };
    }),
    categories: CATEGORY_ORDER.map((key) => ({
      key,
      label: intl.formatMessage(MAIL_CATEGORY_MESSAGES[key]),
      count: mails.filter((message) => message.category === key).length,
      selected: folder === "all" && category === key,
    })),
    accounts: accounts.map((account) => {
      const health = ACCOUNT_HEALTH[account.status];
      const healthLabel = intl.formatMessage(HEALTH_MESSAGES[health]);
      return {
        id: account.id,
        address: account.address,
        provider: providerLabel(account, intl),
        health,
        healthLabel,
        dot: health === "ok" ? "none" : "warning",
        accessibleLabel: intl.formatMessage(messages.accountAccessible, {
          address: account.address,
          health: healthLabel,
        }),
      };
    }),
    folder,
    category: folder === "all" ? category : null,
    rows,
    selectedMessageId: selectedMessage?.id ?? null,
    selected: selectedMessage ? selectionVM(selectedMessage) : null,
    noSelection:
      selectedMessage || accounts.length === 0
        ? null
        : reviewCount > 0
          ? {
              title: intl.formatMessage(messages.noSelection, { count: reviewCount }),
              body: null,
              action: null,
            }
          : {
              title: intl.formatMessage(messages.caughtUpTitle),
              body: intl.formatMessage(messages.caughtUpBody),
              action: seeUpdates(intl),
            },
    empty,
    reauth: accounts
      .filter((account) => account.status === "needs_reauth")
      .map((account) => {
        const pausedAt = account.lastError?.at ?? account.lastSyncedAt ?? account.updatedAt;
        return {
          accountId: account.id,
          address: account.address,
          title: intl.formatMessage(messages.reauthTitle, { provider: providerLabel(account, intl) }),
          body: intl.formatMessage(messages.reauthBody, {
            account: account.address,
            date: shortDate(pausedAt, ctx),
          }),
          actionLabel: intl.formatMessage(messages.reconnect),
        };
      }),
    lastChecked: lastCheckedVM(accounts, ctx),
    copy: copyVM(intl),
    correction: correctionVM(data, intl),
    // `en-CA` formats a date as yyyy-mm-dd, the `<input type="date">` value format.
    reviewLaterMinDate: new Intl.DateTimeFormat("en-CA", { timeZone: ctx.timeZone }).format(
      new Date(ctx.now.getTime() + 86_400_000),
    ),
  };
}

function emptyVM(
  intl: IntlShape,
  state: {
    readonly accounts: number;
    readonly rows: number;
    readonly folder: MailFolderId;
    readonly category: MailCategory | null;
    readonly reviewCount: number;
  },
): MailEmptyVM | null {
  if (state.accounts === 0) {
    return {
      kind: "noAccount",
      title: intl.formatMessage(messages.noAccountTitle),
      body: intl.formatMessage(messages.noAccountBody),
      action: { label: intl.formatMessage(messages.connectEmail), target: "connectEmail" },
    };
  }
  if (state.rows > 0) return null;
  switch (state.folder) {
    case "review":
      return {
        kind: "caughtUp",
        title: intl.formatMessage(messages.caughtUpTitle),
        body: intl.formatMessage(messages.caughtUpBody),
        action: seeUpdates(intl),
      };
    case "updates":
      return {
        kind: "noUpdates",
        title: intl.formatMessage(messages.noUpdatesTitle),
        body: intl.formatMessage(messages.noUpdatesBody, { days: UPDATES_WINDOW_DAYS }),
        action: null,
      };
    case "all":
      return state.category
        ? {
            kind: "noCategoryMail",
            title: intl.formatMessage(messages.noCategoryTitle, {
              category: intl.formatMessage(MAIL_CATEGORY_MESSAGES[state.category]),
            }),
            body: null,
            action: { label: intl.formatMessage(messages.showAll), target: "showAll" },
          }
        : {
            kind: "noMail",
            title: intl.formatMessage(messages.noMailTitle),
            body: intl.formatMessage(messages.noMailBody),
            action: null,
          };
  }
}
