/**
 * The shared display vocabulary: one dictionary for statuses, phases, match bands and sources so
 * every screen says the same thing (decisions.md U2, D15, D16, D18). Messages live in the i18n
 * catalogs (src/i18n); builders format them with `ctx.intl`, views with `useIntl()`.
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
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import type { CompanyVM, MatchVM, SourceKind, SourceVM, StatusVM } from "./types";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Fails to compile if `@bfhr/core` and `@bfhr/ui-tokens` disagree on the statuses (system.md). */
export const statusTokensMatchCore: Same<ApplicationStatus, StatusKey> = true;

/** Status names: `rejected` reads "Not selected" (U2), `ghosted` "No response" (D15). */
export const STATUS_MESSAGES: Readonly<Record<ApplicationStatus, MessageDescriptor>> = defineMessages({
  saved: { id: "shared.status.saved", defaultMessage: "Saved" },
  preparing: { id: "shared.status.preparing", defaultMessage: "Preparing" },
  applied: { id: "shared.status.applied", defaultMessage: "Applied" },
  acknowledged: { id: "shared.status.acknowledged", defaultMessage: "Acknowledged" },
  screening: { id: "shared.status.screening", defaultMessage: "Screening" },
  interviewing: { id: "shared.status.interviewing", defaultMessage: "Interviewing" },
  offer: { id: "shared.status.offer", defaultMessage: "Offer" },
  accepted: { id: "shared.status.accepted", defaultMessage: "Accepted" },
  declined: {
    id: "shared.status.declined",
    defaultMessage: "Declined",
    description: "The user declined an offer",
  },
  rejected: { id: "shared.status.rejected", defaultMessage: "Not selected" },
  withdrawn: { id: "shared.status.withdrawn", defaultMessage: "Withdrawn" },
  ghosted: { id: "shared.status.ghosted", defaultMessage: "No response" },
});

export const PHASE_MESSAGES: Readonly<Record<StatusPhase, MessageDescriptor>> = defineMessages({
  shortlist: { id: "shared.phase.shortlist", defaultMessage: "Shortlist" },
  in_progress: { id: "shared.phase.inProgress", defaultMessage: "In progress" },
  closed: { id: "shared.phase.closed", defaultMessage: "Closed" },
});

export const MATCH_BAND_MESSAGES: Readonly<Record<MatchBand, MessageDescriptor>> = defineMessages({
  strong: { id: "shared.match.band.strong", defaultMessage: "Strong" },
  good: { id: "shared.match.band.good", defaultMessage: "Good" },
  partial: { id: "shared.match.band.partial", defaultMessage: "Partial" },
  stretch: { id: "shared.match.band.stretch", defaultMessage: "Stretch" },
});

/** Band pill wording (job-detail.md copy notes): Stretch never says "Low", "Poor" or "Weak". */
export const MATCH_BAND_PILL_MESSAGES: Readonly<Record<MatchBand, MessageDescriptor>> = defineMessages({
  strong: { id: "shared.match.pill.strong", defaultMessage: "Strong match" },
  good: { id: "shared.match.pill.good", defaultMessage: "Good match" },
  partial: { id: "shared.match.pill.partial", defaultMessage: "Partial match" },
  stretch: { id: "shared.match.pill.stretch", defaultMessage: "Stretch" },
});

export const SOURCE_MESSAGES: Readonly<Record<SourceKind, MessageDescriptor>> = defineMessages({
  you: { id: "shared.source.you", defaultMessage: "You" },
  mail: { id: "shared.source.mail", defaultMessage: "From email" },
  cv: { id: "shared.source.cv", defaultMessage: "From CV" },
  ai: { id: "shared.source.ai", defaultMessage: "AI-assisted" },
  rule: { id: "shared.source.rule", defaultMessage: "Automatic · Mail" },
  job_board: { id: "shared.source.jobBoard", defaultMessage: "Job board" },
  employer: { id: "shared.source.employer", defaultMessage: "Direct from employer" },
});

/**
 * Why a user can't pick a status in Move to… (D16): the denials a *user* move can hit.
 * `same_status` is the current status (shown as current, not disabled); automation codes never
 * reach the UI.
 */
export const MOVE_DENIAL_MESSAGES: Readonly<
  Record<Extract<TransitionDenial, "outcome_requires_offer">, MessageDescriptor>
> = defineMessages({
  outcome_requires_offer: {
    id: "shared.move.denied.outcomeRequiresOffer",
    defaultMessage: "Accepted and Declined come after an offer.",
  },
});

export function statusVM(status: ApplicationStatus, intl: IntlShape): StatusVM {
  return { key: status, label: intl.formatMessage(STATUS_MESSAGES[status]), phase: statusPhase(status) };
}

export function matchVM(score: number, intl: IntlShape): MatchVM {
  const band = matchBand(score);
  return {
    score,
    band,
    bandLabel: intl.formatMessage(MATCH_BAND_MESSAGES[band]),
    pillLabel: intl.formatMessage(MATCH_BAND_PILL_MESSAGES[band]),
  };
}

/** `label` overrides the default wording (a job board's own name, "From an email by Acme"). */
export function sourceVM(kind: SourceKind, intl: IntlShape, label?: string): SourceVM {
  return { kind, label: label ?? intl.formatMessage(SOURCE_MESSAGES[kind]) };
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
