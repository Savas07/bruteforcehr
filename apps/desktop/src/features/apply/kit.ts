/**
 * The external-apply kit's answers (BRIEF §4.4.3, research/apply.md "External channel: kit"): the
 * rows of the answers library that fit the job, by @bfhr/core `answersForJob` (the job's country,
 * currency and language; the UI language as fallback), grouped by kind in kit order.
 */
import { ANSWER_KINDS, type Answer, type AnswerKind, answersForJob, type Job, type KitAnswer, type Profile } from "@bfhr/core";
import { defineMessages, type IntlShape } from "react-intl";

export const answerKindMessages = defineMessages({
  work_authorization: { id: "apply.answers.kind.workAuthorization", defaultMessage: "Work authorization" },
  notice_period: { id: "apply.answers.kind.noticePeriod", defaultMessage: "Availability" },
  salary_expectation: { id: "apply.answers.kind.salaryExpectation", defaultMessage: "Compensation" },
  link: { id: "apply.answers.kind.link", defaultMessage: "Links" },
  qa: { id: "apply.answers.kind.qa", defaultMessage: "Questions and answers" },
});

export interface KitAnswerGroup {
  readonly kind: AnswerKind;
  readonly title: string;
  readonly rows: readonly KitAnswer[];
}

/** The answers for `job`, grouped by kind (Work authorization, Availability, …); empty groups left out. */
export function kitAnswerGroups(
  answers: readonly Answer[],
  job: Pick<Job, "locations" | "salary" | "language">,
  profile: Pick<Profile, "uiLanguage"> | null,
  intl: IntlShape,
): KitAnswerGroup[] {
  const rows = answersForJob(answers, {
    countryCode: job.locations.find((location) => location.countryCode !== null)?.countryCode ?? null,
    currency: job.salary?.currency ?? null,
    language: job.language,
    fallbackLanguage: profile?.uiLanguage ?? intl.locale,
  });
  return ANSWER_KINDS.map((kind) => ({
    kind,
    title: intl.formatMessage(answerKindMessages[kind]),
    rows: rows.filter((row) => row.kind === kind),
  })).filter((group) => group.rows.length > 0);
}

/** The host shown on "Open company site" ("boards.greenhouse.io"). */
export function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}
