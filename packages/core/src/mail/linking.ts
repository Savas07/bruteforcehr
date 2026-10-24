import { isActiveStatus } from "../status";
import type { MailSignals, TrackedApplication } from "./rules";
import type { LinkStrength } from "./schemas";
import { companiesMatch, rolesMatch } from "./text";

export interface LinkResult {
  applicationId: string | null;
  linkStrength: LinkStrength;
}

export interface LinkInput {
  signals: MailSignals;
  applications: readonly TrackedApplication[];
  /** Company and role named by the message (model or rules extraction). */
  company: string | null;
  role: string | null;
  /** The model's pick among the shortlisted applications (`llm` evidence), or null. */
  modelChoice: string | null;
}

/**
 * Links a message to an application using the strongest evidence available (BRIEF §4.7 step 5):
 *
 * 1. `thread` — a reply in the thread of a message we sent for the application (provider thread
 *    id, In-Reply-To or References).
 * 2. `ats_company_role` — the message names the application's company **and** role, and comes
 *    from an ATS, an assessment platform or the company's own domain, as verified by the provider
 *    (`senderAuthenticated`). The same match from an unverified sender is only `company_domain`.
 * 3. `company_domain` — exactly one application at that company (by sender domain, or by name
 *    from an ATS sender), role not confirmed.
 * 4. `llm` — the model picked one of the shortlisted applications.
 * 5. `none`.
 *
 * Only `thread` and `ats_company_role` are strong enough for automatic changes (flows.md §3).
 * Active applications are preferred when a closed one at the same company also matches.
 */
export function linkApplication({
  signals,
  applications,
  company,
  role,
  modelChoice,
}: LinkInput): LinkResult {
  if (signals.threadApplicationId !== null)
    return { applicationId: signals.threadApplicationId, linkStrength: "thread" };

  const trustedSender = signals.ats || signals.assessmentPlatform || signals.domainApplicationIds.length > 0;
  const atCompany = applications.filter(
    (application) =>
      signals.domainApplicationIds.includes(application.id) ||
      (company !== null && companiesMatch(application.company, company)) ||
      (company === null && signals.namedApplicationIds.includes(application.id)),
  );
  const preferActive = (list: TrackedApplication[]) => {
    const active = list.filter((application) => isActiveStatus(application.status));
    return active.length > 0 ? active : list;
  };

  if (role !== null) {
    const sameRole = preferActive(atCompany.filter((application) => rolesMatch(application.role, role)));
    if (sameRole.length === 1 && sameRole[0] !== undefined) {
      return {
        applicationId: sameRole[0].id,
        // A forged From can claim any ATS or company domain: strong only when authenticated.
        linkStrength: trustedSender && signals.senderAuthenticated ? "ats_company_role" : "company_domain",
      };
    }
  }
  const candidates = preferActive(atCompany);
  if (candidates.length === 1 && candidates[0] !== undefined && trustedSender) {
    // One application at that company, but the message didn't confirm the role.
    const only = candidates[0];
    const roleConflicts = role !== null && !rolesMatch(only.role, role);
    if (!roleConflicts) return { applicationId: only.id, linkStrength: "company_domain" };
  }
  const chosen =
    modelChoice === null ? undefined : applications.find((application) => application.id === modelChoice);
  if (chosen !== undefined) {
    // Two applications at one company and the message names no role: the model would be guessing.
    const sibling = applications.some(
      (application) => application.id !== chosen.id && companiesMatch(application.company, chosen.company),
    );
    if (role !== null || !sibling) return { applicationId: chosen.id, linkStrength: "llm" };
  }
  if (
    candidates.length === 1 &&
    candidates[0] !== undefined &&
    (role === null || rolesMatch(candidates[0].role, role))
  ) {
    return { applicationId: candidates[0].id, linkStrength: "llm" };
  }
  return { applicationId: null, linkStrength: "none" };
}

/** Link strengths that allow an automatic status change (with confidence ≥ the user's threshold). */
export const STRONG_LINK_STRENGTHS = [
  "thread",
  "ats_company_role",
] as const satisfies readonly LinkStrength[];

export function isStrongLink(strength: LinkStrength): boolean {
  return (STRONG_LINK_STRENGTHS as readonly LinkStrength[]).includes(strength);
}
