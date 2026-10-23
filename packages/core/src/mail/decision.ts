import type { ApplicationStatus, EventActor, MailCategory, ReviewState } from "../enums";
import { canTransition, isActiveStatus } from "../status";
import { isStrongLink } from "./linking";
import type { LinkStrength } from "./schemas";

/**
 * What a classified, linked message does to the tracker (BRIEF §4.7 step 6, flows.md §3):
 * apply the transition automatically, queue it for review, or just file the message.
 */

/** Status a category points to; interview invites for a first recruiter/phone screen point to screening. */
export function categoryTargetStatus(category: MailCategory, screening: boolean): ApplicationStatus | null {
  switch (category) {
    case "application_received":
      return "acknowledged";
    case "rejection":
      return "rejected";
    case "interview_invite":
      return screening ? "screening" : "interviewing";
    case "assessment":
      return "screening";
    case "offer":
      return "offer";
    default:
      return null;
  }
}

export interface MailDecisionInput {
  category: MailCategory;
  confidence: number;
  screening: boolean;
  /** Linked application's current status, or null when unlinked. */
  applicationStatus: ApplicationStatus | null;
  linkStrength: LinkStrength;
  /** `rule` when the rules decided (AI off), `ai` when the model classified. */
  actor: Exclude<EventActor, "user">;
  /** `profile.settings.autoApplyConfidence` (default 0.9). */
  autoApplyConfidence: number;
}

export interface MailDecision {
  /** Proposed status: the forward move for a linked application, or the initial status for a new one. */
  suggestedStatus: ApplicationStatus | null;
  reviewState: Extract<ReviewState, "not_required" | "pending" | "auto_applied">;
  /** Apply `suggestedStatus` now as an automated event (the message's `appliedEventId` becomes the Undo target). */
  autoApply: boolean;
}

export function decideMailAction(input: MailDecisionInput): MailDecision {
  const target = categoryTargetStatus(input.category, input.screening);
  if (input.category === "job_alert") return { suggestedStatus: null, reviewState: "not_required", autoApply: false };

  if (input.applicationStatus === null) {
    // Unlinked: a proposal to create the application (backfill review), or plain job mail to look at.
    return { suggestedStatus: target, reviewState: "pending", autoApply: false };
  }

  const check = target === null ? null : canTransition(input.applicationStatus, target, input.actor);
  const suggestedStatus =
    target !== null && check?.allowed === true && (check.direction === "forward" || check.direction === "exit")
      ? target
      : null;

  if (suggestedStatus === null) {
    // Nothing to change (already there, closed, or not a status mail): file it on the application
    // when the link is certain, otherwise let the user confirm the link.
    const fileOnly = isStrongLink(input.linkStrength) && input.category !== "other_job";
    return { suggestedStatus: null, reviewState: fileOnly ? "not_required" : "pending", autoApply: false };
  }
  const autoApply = input.confidence >= input.autoApplyConfidence && isStrongLink(input.linkStrength);
  return { suggestedStatus, reviewState: autoApply ? "auto_applied" : "pending", autoApply };
}

const DAY_MS = 86_400_000;

/**
 * `mailMessages.bodyPurgeAt` (ADR 0002 retention): null while the linked application is active;
 * `closedAt + retentionDays` once it is closed; `receivedAt + retentionDays` for unlinked mail.
 */
export function mailBodyPurgeAt(input: {
  receivedAt: Date;
  retentionDays: number;
  application: { status: ApplicationStatus; statusChangedAt: Date } | null;
}): Date | null {
  const { application, retentionDays } = input;
  if (application === null) return new Date(input.receivedAt.getTime() + retentionDays * DAY_MS);
  if (isActiveStatus(application.status)) return null;
  return new Date(application.statusChangedAt.getTime() + retentionDays * DAY_MS);
}

const CATEGORY_REASON: Readonly<Record<MailCategory, string>> = {
  application_received: "Application confirmation",
  rejection: "Decision",
  interview_invite: "Interview invite",
  assessment: "Assessment",
  offer: "Offer",
  recruiter_outreach: "Recruiter message",
  info_request: "Request for information",
  job_alert: "Job alert",
  other_job: "Job-related email",
  not_job: "Not job mail",
};

const LINK_REASON: Readonly<Record<LinkStrength, string>> = {
  thread: "in the same email thread as your application",
  ats_company_role: "names the company and role",
  company_domain: "from the company",
  llm: "matched by AI",
  none: "not linked to an application",
};

/**
 * One-sentence evidence for events and the review card (English; clients localise from the
 * structured fields). Never contains body text: only category, sender domain and link kind.
 */
export function mailEvidenceReason(input: {
  category: MailCategory;
  senderDomain: string;
  linkStrength: LinkStrength;
  actor: Exclude<EventActor, "user">;
}): string {
  const by = input.actor === "rule" ? "Sorted by rules" : "Sorted by AI";
  return `${CATEGORY_REASON[input.category]} from ${input.senderDomain}, ${LINK_REASON[input.linkStrength]}. ${by}.`;
}
