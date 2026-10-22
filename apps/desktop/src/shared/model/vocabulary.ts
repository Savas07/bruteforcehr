/**
 * The shared display vocabulary (EN). One dictionary for statuses, phases and match bands so every
 * screen says the same thing (decisions.md U2, D15, D18). TR (siz) and DE (du) join when the
 * desktop i18n layer lands.
 */
import {
  type ApplicationStatus,
  matchBand,
  type MatchBand,
  statusPhase,
  type StatusPhase,
  type TransitionDenial,
} from "@bfhr/core";
import type { StatusKey } from "@bfhr/ui-tokens";
import type { CompanyVM, MatchVM, SourceKind, SourceVM, StatusVM } from "./types";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Fails to compile if `@bfhr/core` and `@bfhr/ui-tokens` disagree on the statuses (system.md). */
export const statusTokensMatchCore: Same<ApplicationStatus, StatusKey> = true;

export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  saved: "Saved",
  preparing: "Preparing",
  applied: "Applied",
  acknowledged: "Acknowledged",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  accepted: "Accepted",
  declined: "Declined",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  ghosted: "No response",
};

export const PHASE_LABELS: Readonly<Record<StatusPhase, string>> = {
  shortlist: "Shortlist",
  in_progress: "In progress",
  closed: "Closed",
};

export const MATCH_BAND_LABELS: Readonly<Record<MatchBand, string>> = {
  strong: "Strong",
  good: "Good",
  partial: "Partial",
  stretch: "Stretch",
};

/** Band pill wording (job-detail.md copy notes): Stretch never says "Low", "Poor" or "Weak". */
export const MATCH_BAND_PILL_LABELS: Readonly<Record<MatchBand, string>> = {
  strong: "Strong match",
  good: "Good match",
  partial: "Partial match",
  stretch: "Stretch",
};

export const SOURCE_LABELS: Readonly<Record<SourceKind, string>> = {
  you: "You",
  mail: "From email",
  cv: "From CV",
  ai: "AI-assisted",
  rule: "Automatic · Mail",
  job_board: "Job board",
  employer: "Direct from employer",
};

export function statusVM(status: ApplicationStatus): StatusVM {
  return { key: status, label: STATUS_LABELS[status], phase: statusPhase(status) };
}

export function matchVM(score: number): MatchVM {
  const band = matchBand(score);
  return { score, band, bandLabel: MATCH_BAND_LABELS[band], pillLabel: MATCH_BAND_PILL_LABELS[band] };
}

/** `label` overrides the default wording ("LinkedIn" for a job board). */
export function sourceVM(kind: SourceKind, label: string = SOURCE_LABELS[kind]): SourceVM {
  return { kind, label };
}

/** "Acme Robotics" → "AR", "Kervan" → "K", "n8n GmbH" → "NG". */
export function companyVM(name: string, domain: string | null): CompanyVM {
  const words = name.split(/[\s\-·&]+/u).filter((word) => /\p{L}|\p{N}/u.test(word));
  const initials = words
    .slice(0, 2)
    .map((word) => [...word][0] ?? "")
    .join("")
    .toLocaleUpperCase("en");
  return { name, domain, monogram: initials || "?" };
}

/**
 * Why a user can't pick a status in Move to… (decisions.md D16): the denials a *user* move can
 * hit. `same_status` is the current status (shown as current, not disabled); automation codes
 * never reach the UI.
 */
export const MOVE_DENIAL_REASONS: Readonly<
  Record<Extract<TransitionDenial, "outcome_requires_offer">, string>
> = {
  outcome_requires_offer: "Accepted and Declined come after an offer.",
};
