import type { ApplicationStatus, ExtractedDateKind, MailCategory } from "@bfhr/core";

/**
 * Labeled mail for the classification eval (BRIEF §4.7 acceptance: ≥ 150 messages, every
 * category, hard cases; gate macro-F1 ≥ 0.90 and precision ≥ 0.97 on automatic transitions).
 *
 * Every party is fictional: invented people and companies, `example.*` / invented company
 * domains, phone numbers in the 555 / +90 555 / +49 151 ranges. Real ATS and job-board sender
 * domains (greenhouse-mail.io, hire.lever.co, myworkday.com, linkedin.com, kariyer.net, …) are
 * used on purpose, because the pre-filter keys on them.
 */
export type EvalLanguage = "en" | "tr" | "de";

/** An application in the persona's tracker when the message arrives. */
export interface MailEvalApplication {
  /** `<lang>-app-<slug>`, unique across all fixture files. */
  id: string;
  company: string;
  /** Lowercase registrable domain (`acme-robotics.example`), or null when unknown. */
  companyDomain: string | null;
  role: string;
  status: ApplicationStatus;
  /** Provider thread ids of messages the user sent for this application (email channel). */
  threadIds: string[];
  /** RFC 822 Message-IDs (with angle brackets) of messages the user sent. */
  sentMessageIds: string[];
  /** ISO 8601 instant. */
  appliedAt: string | null;
}

export interface MailEvalMessage {
  from: { name: string | null; address: string };
  subject: string;
  /** Plain-text body as a mail client would show it (signature, footer, quoted text included). */
  bodyText: string;
  /** ISO 8601 instant with offset, e.g. `2026-10-14T09:12:00+03:00`. */
  receivedAt: string;
  folder: "inbox" | "spam";
  /** Provider thread id; equal to an application's `threadIds` entry when it replies in that thread. */
  threadId: string | null;
  /** In-Reply-To Message-ID (with angle brackets) or null. */
  inReplyTo: string | null;
  /** The message carries a `List-Unsubscribe` header (newsletters, alerts, many ATS notifications). */
  listUnsubscribe: boolean;
  /** `Precedence: bulk` / `Auto-Submitted: auto-generated`. */
  bulk: boolean;
}

export interface MailEvalExpected {
  category: MailCategory;
  /** The tracker application this message belongs to, or null (new / unrelated). */
  applicationId: string | null;
  /**
   * Status the message proposes (`expectedSuggestedStatus` rules in fixtures/README in types):
   * application_received → acknowledged; rejection → rejected; interview_invite → interviewing,
   * or screening for a first recruiter / phone screen; assessment → screening; offer → offer;
   * every other category → null. When linked to an application, null unless the move is forward
   * (or to rejected) from that application's status; never from a closed status.
   */
  suggestedStatus: ApplicationStatus | null;
  /** Employer the message is about (as written in the message), null when none. */
  company: string | null;
  /** Role title as written in the message, null when none. */
  role: string | null;
  /** Dates the extraction must find (instant ± 1 minute). */
  dates?: { kind: ExtractedDateKind; at: string }[];
  meetingUrls?: string[];
}

export interface MailEvalCase {
  /** `<lang>-<nnn>`, e.g. `de-017`. */
  id: string;
  language: EvalLanguage;
  /**
   * `synthetic`: written for this set. `template`: follows the wording of a widely used ATS or
   * job-board template (Greenhouse, Workday, Personio, LinkedIn alerts…) with fictional parties.
   */
  origin: "synthetic" | "template";
  /** Why the case is hard, when it is (shown in the report). */
  hard: string | null;
  message: MailEvalMessage;
  expected: MailEvalExpected;
}
