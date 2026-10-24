import type {
  AlertBoard,
  ApplicationStatus,
  ExtractedDateKind,
  MailCategory,
  SalaryPeriod,
} from "@bfhr/core";

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
  /**
   * The provider's `Authentication-Results` vouch for the From domain (DMARC pass / aligned DKIM).
   * Omitted = true (genuine mail); false for a forged sender (`fixtures/spoofed.ts`).
   */
  authenticated?: boolean;
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

/**
 * Job-alert email for the deterministic posting-extraction eval (no model; ADR 0012 "Job
 * alerts"). Same fictional-party rules as above; board sender domains and URL shapes are real.
 */
export interface AlertEvalCase {
  /** `alert-<lang>-<nn>`. */
  id: string;
  language: EvalLanguage;
  /** Board the sender is, or `generic` for other senders. */
  board: AlertBoard | "generic";
  /** Which body carries the postings. */
  format: "text" | "html";
  hard: string | null;
  message: {
    from: { name: string | null; address: string };
    subject: string;
    /** Text part (for HTML-only mail: what a client shows without links). */
    text: string;
    html: string | null;
    receivedAt: string;
  };
  /** Every posting the alert lists with a link; canonical URL, title, company, location as shown. */
  expected: {
    url: string;
    title: string;
    company: string;
    location: string | null;
    salary?: { min: number; max: number | null; currency: string; period: SalaryPeriod };
    /** ISO 8601 instant (± 1 hour). */
    postedAt?: string;
  }[];
}

/** Interview invite for the deterministic interview-time eval (ICS part or explicit wording). */
export interface InviteEvalCase {
  /** `invite-<lang>-<nn>`. */
  id: string;
  language: EvalLanguage;
  hard: string | null;
  message: {
    from: { name: string | null; address: string };
    subject: string;
    bodyText: string;
    /** `text/calendar` part, when the invite carries one. */
    calendar: string | null;
    receivedAt: string;
  };
  /** Profile zone of the persona (default `Europe/Istanbul`). */
  userTimeZone?: string;
  expected: {
    /** ISO 8601 instant. */
    startsAt: string;
    /** Organizer's zone as stated, null when the invite gives none. */
    timezone: string | null;
    durationMinutes: number | null;
    meetingUrl: string | null;
  };
}
