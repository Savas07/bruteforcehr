/**
 * View-model blocks that more than one core screen shows through the same shared component
 * (components.md): the mail review proposal (Today + Mail), automatic changes (Today + Mail
 * Updates + Tracker timeline), nudges (Today + Tracker), timeline rows and the application
 * summary (Job detail + Tracker). Screen view-models embed these; the components in
 * `src/shared/ui/` render them. Build them with the helpers in `./build-blocks.ts`.
 */
import type { MailCategory } from "@bfhr/core";
import type { CompanyVM, SourceVM, StatusVM, TimeVM } from "./types";

/** Durable Undo (decisions.md D11): offered while the change is the application's latest move. */
export type UndoVM =
  | { readonly available: true }
  /** "Can't undo — the status changed since." */
  | { readonly available: false; readonly reason: string };

/** A status move "{application} from {from} to {to}" (`ProposalSentence`). */
export interface StatusMoveVM {
  readonly applicationId: string | null;
  /** "Acme · Frontend Engineer", or the company + role the classifier proposes for a new one. */
  readonly applicationLabel: string;
  /** Null when the move creates the application. */
  readonly from: StatusVM | null;
  readonly to: StatusVM;
}

/** One email waiting in the review queue (`ReviewDetailPane`, Today "To review", Mail list). */
export interface ReviewProposalVM {
  readonly messageId: string;
  readonly company: CompanyVM;
  readonly subject: string;
  /** "Acme Careers <careers@acme.example>". */
  readonly from: string;
  /** Inbox it arrived in ("deniz.aksoy@example.com"). */
  readonly account: string;
  readonly receivedAt: TimeVM;
  readonly category: { readonly key: MailCategory; readonly label: string };
  /**
   * One line for rows: hedged below the auto-apply threshold ("Looks like an interview invite
   * from Acme"), factual above it. Rejections read "Decision" (D18).
   */
  readonly headline: string;
  readonly hedged: boolean;
  /** Proposed status move; null when the email only adds information (no status change). */
  readonly move: StatusMoveVM | null;
  /** `ReasonLine`: the evidence as one sentence ("Same thread as your application email"). */
  readonly reason: string;
  /** Quoted snippet from the email. */
  readonly evidence: string | null;
  /** Dates the classifier found ("Interview · Tomorrow, 14:00"). */
  readonly dates: readonly { readonly label: string; readonly at: TimeVM }[];
  readonly source: SourceVM;
  readonly pendingSync: boolean;
}

/** A change applied automatically, with its source, reason and Undo (`AutoChangeRow`). */
export interface AutoChangeVM {
  readonly eventId: string;
  readonly applicationId: string;
  readonly company: CompanyVM;
  readonly role: string;
  readonly from: StatusVM;
  readonly to: StatusVM;
  readonly occurredAt: TimeVM;
  /** "From an email by Acme" (rule / ai actors) */
  readonly source: SourceVM;
  readonly reason: string;
  /** The email behind it, for "View source". */
  readonly mailMessageId: string | null;
  readonly undo: UndoVM;
  readonly pendingSync: boolean;
}

/** Follow-up or no-response suggestion (`NudgeCard`). Never auto-applies. */
export interface NudgeVM {
  readonly applicationId: string;
  readonly kind: "followUp" | "noResponse";
  readonly company: CompanyVM;
  readonly role: string;
  /** "Applied 8 days ago · no reply yet" / "No reply in 21 days. Mark as no response?" */
  readonly message: string;
  /** "Draft follow-up" / "Mark as no response". */
  readonly primaryLabel: string;
  /** "Not needed" / "Keep waiting". */
  readonly secondaryLabel: string;
  readonly since: TimeVM;
  readonly pendingSync: boolean;
}

export type TimelineEventKind = "created" | "status" | "note" | "mailReceived" | "mailSent" | "interview";

/** One row of an application's history (`TimelineRow`). */
export interface TimelineEventVM {
  readonly id: string;
  readonly kind: TimelineEventKind;
  /** "Moved to Interviewing", "Email from Acme Careers", "Note". */
  readonly title: string;
  /** Subject line, note text or comment. */
  readonly detail: string | null;
  readonly at: TimeVM;
  /** Who did it: "You", "Automatic · Mail". */
  readonly source: SourceVM;
  readonly move: { readonly from: StatusVM; readonly to: StatusVM } | null;
  /** Automatic changes only: why, and whether Undo is still possible. */
  readonly reason: string | null;
  /** The email behind an automatic change or a received / sent email, for "View source". */
  readonly mailMessageId: string | null;
  readonly undo: UndoVM | null;
  /** Undone later: shown with an "Undone" tag (never a strikethrough on status names). */
  readonly reverted: boolean;
  readonly pendingSync: boolean;
}

/** Status, channel, date and the pinned documents of an application (`ApplicationSummaryBlock`). */
export interface ApplicationSummaryVM {
  readonly applicationId: string;
  readonly status: StatusVM;
  /** "Email", "Company site", "Referral". */
  readonly channel: string | null;
  readonly appliedAt: TimeVM | null;
  readonly cv: { readonly id: string; readonly label: string } | null;
  readonly coverLetter: { readonly id: string; readonly label: string } | null;
  /** "What usually happens next" line for the current status. */
  readonly nextStep: string | null;
}
