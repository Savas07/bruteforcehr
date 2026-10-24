/**
 * "Add a job from a link" (BRIEF §4.3 URL import, ADR 0005 "URL import"): the pure half of the
 * dialog. The link check before `jobImportUrl`, the confirm-and-edit form ↔ job mapping (the
 * import's draft, or a hand-entered `url_import` job when the page couldn't be read), validation,
 * the low-confidence flags, the provenance line, warning notes and the copy for every error reason.
 */
import {
  EmailSchema,
  type EmploymentType,
  type JobDraft,
  JOB_IMPORT_ERROR_REASONS,
  type JobImportErrorReason,
  type JobImportUrlResponse,
  type JobSourceLink,
  jobSourceKey,
  type KnownJobSource,
  manualJob,
  type RemoteType,
  type SalaryPeriod,
  type SalaryRange,
  type Seniority,
  UrlSchema,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";

/** Source id of jobs added from a pasted link, read or entered by hand. */
export const URL_IMPORT_SOURCE = "url_import" satisfies KnownJobSource;

/** Fields below this confidence (0..1, `response.confidence`) show "Check this". */
export const CHECK_THRESHOLD = 0.8;

/** Longest link the callable accepts (`JobImportUrlRequestSchema`). */
export const MAX_URL_LENGTH = 2048;

const messages = defineMessages({
  linkEmpty: { id: "jobs-import.link.empty", defaultMessage: "Paste the link to a job posting." },
  linkInvalid: {
    id: "jobs-import.link.invalid",
    defaultMessage: "That doesn't look like a link. Copy the full address from your browser.",
  },
  linkNotHttps: {
    id: "jobs-import.link.notHttps",
    defaultMessage: "Only secure links can be read. Use the address that starts with https://",
  },
  linkTooLong: { id: "jobs-import.link.tooLong", defaultMessage: "This link is too long to read." },
  titleMissing: { id: "jobs-import.form.titleMissing", defaultMessage: "Enter the role, for example “Frontend Engineer”." },
  companyMissing: { id: "jobs-import.form.companyMissing", defaultMessage: "Enter the company's name." },
  urlInvalid: { id: "jobs-import.form.urlInvalid", defaultMessage: "Enter the full address, starting with https://" },
  emailInvalid: {
    id: "jobs-import.form.emailInvalid",
    defaultMessage: "Enter an email address like jobs@company.com.",
  },
  amountInvalid: { id: "jobs-import.form.amountInvalid", defaultMessage: "Enter an amount, for example 65000." },
  rangeInverted: {
    id: "jobs-import.form.rangeInverted",
    defaultMessage: "The lowest amount can't be more than the highest.",
  },
  currencyInvalid: {
    id: "jobs-import.form.currencyInvalid",
    defaultMessage: "Use a 3-letter currency code, for example EUR.",
  },
  provenanceData: {
    id: "jobs-import.provenance.data",
    defaultMessage: "Read from the page's job data · {host}",
    description: "The import came from the page's structured job data (schema.org or the site's own data)",
  },
  provenanceAi: {
    id: "jobs-import.provenance.ai",
    defaultMessage: "Read by AI · can be wrong · {host}",
    description: "The import was extracted by AI from the page text",
  },
  existing: {
    id: "jobs-import.review.existing",
    defaultMessage: "You already have this job. We'll add this link to it.",
  },
  noteTruncated: {
    id: "jobs-import.note.truncated",
    defaultMessage: "The description was very long, so we kept the first part.",
  },
  noteNoDescription: {
    id: "jobs-import.note.noDescription",
    defaultMessage: "We couldn't find a description on the page. You can paste it below.",
  },
  noteSiteData: {
    id: "jobs-import.note.siteData",
    defaultMessage: "The site's own job data wasn't available, so we read the page instead.",
  },
  noteNotPosting: {
    id: "jobs-import.note.notPosting",
    defaultMessage: "This page may not be a job posting. Check the details before you save.",
  },
  noteDropped: {
    id: "jobs-import.note.dropped",
    defaultMessage: "We left out the {field} because the page didn't clearly say it.",
    description: "{field} is a lower-case field name such as “salary” or “apply email”",
  },
});

/** Lower-case field names for "We left out the {field} …" (`dropped_ungrounded:<field>`). */
const DROPPED_FIELD_MESSAGES = defineMessages({
  title: { id: "jobs-import.note.field.title", defaultMessage: "role" },
  company: { id: "jobs-import.note.field.company", defaultMessage: "company" },
  locations: { id: "jobs-import.note.field.locations", defaultMessage: "location" },
  remoteType: { id: "jobs-import.note.field.remoteType", defaultMessage: "work mode" },
  employmentType: { id: "jobs-import.note.field.employmentType", defaultMessage: "employment type" },
  seniority: { id: "jobs-import.note.field.seniority", defaultMessage: "seniority" },
  salary: { id: "jobs-import.note.field.salary", defaultMessage: "salary" },
  visaSponsorship: { id: "jobs-import.note.field.visaSponsorship", defaultMessage: "visa sponsorship" },
  applyUrl: { id: "jobs-import.note.field.applyUrl", defaultMessage: "apply link" },
  applyEmail: { id: "jobs-import.note.field.applyEmail", defaultMessage: "apply email" },
  postedAt: { id: "jobs-import.note.field.postedAt", defaultMessage: "posting date" },
  expiresAt: { id: "jobs-import.note.field.expiresAt", defaultMessage: "closing date" },
});

export const REMOTE_MESSAGES: Readonly<Record<RemoteType, MessageDescriptor>> = defineMessages({
  onsite: { id: "jobs-import.remote.onsite", defaultMessage: "On-site" },
  hybrid: { id: "jobs-import.remote.hybrid", defaultMessage: "Hybrid" },
  remote: { id: "jobs-import.remote.remote", defaultMessage: "Remote" },
});

export const EMPLOYMENT_MESSAGES: Readonly<Record<EmploymentType, MessageDescriptor>> = defineMessages({
  full_time: { id: "jobs-import.employment.fullTime", defaultMessage: "Full-time" },
  part_time: { id: "jobs-import.employment.partTime", defaultMessage: "Part-time" },
  contract: { id: "jobs-import.employment.contract", defaultMessage: "Contract" },
  internship: { id: "jobs-import.employment.internship", defaultMessage: "Internship" },
  temporary: { id: "jobs-import.employment.temporary", defaultMessage: "Temporary" },
});

export const SENIORITY_MESSAGES: Readonly<Record<Seniority, MessageDescriptor>> = defineMessages({
  intern: { id: "jobs-import.seniority.intern", defaultMessage: "Intern" },
  junior: { id: "jobs-import.seniority.junior", defaultMessage: "Junior" },
  mid: { id: "jobs-import.seniority.mid", defaultMessage: "Mid-level" },
  senior: { id: "jobs-import.seniority.senior", defaultMessage: "Senior" },
  staff: { id: "jobs-import.seniority.staff", defaultMessage: "Staff" },
  principal: { id: "jobs-import.seniority.principal", defaultMessage: "Principal" },
  lead: { id: "jobs-import.seniority.lead", defaultMessage: "Lead" },
  manager: { id: "jobs-import.seniority.manager", defaultMessage: "Manager" },
  director: { id: "jobs-import.seniority.director", defaultMessage: "Director" },
});

export const PERIOD_MESSAGES: Readonly<Record<SalaryPeriod, MessageDescriptor>> = defineMessages({
  year: { id: "jobs-import.period.year", defaultMessage: "a year" },
  month: { id: "jobs-import.period.month", defaultMessage: "a month" },
  day: { id: "jobs-import.period.day", defaultMessage: "a day" },
  hour: { id: "jobs-import.period.hour", defaultMessage: "an hour" },
});

export const VISA_MESSAGES: Readonly<Record<VisaChoice, MessageDescriptor>> = defineMessages({
  unknown: { id: "jobs-import.visa.unknown", defaultMessage: "Not stated" },
  yes: { id: "jobs-import.visa.yes", defaultMessage: "Offered" },
  no: { id: "jobs-import.visa.no", defaultMessage: "Not offered" },
});

/* ------------------------------------------------------------------------------------------------
 * Step 1: the link
 * ---------------------------------------------------------------------------------------------- */

export type LinkProblem = "empty" | "invalid" | "notHttps" | "tooLong";

/**
 * Checks a pasted link before calling the server. A bare address ("jobs.acme.com/42") gets
 * `https://`; anything but https is refused (the callable only fetches https).
 */
export function checkLink(text: string): { readonly url: string } | { readonly problem: LinkProblem } {
  const trimmed = text.trim();
  if (trimmed === "") return { problem: "empty" };
  if (trimmed.length > MAX_URL_LENGTH) return { problem: "tooLong" };
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  // "mailto:…", "javascript:…" (a scheme without "//"); "jobs.acme.com:8080/1" is a host and port.
  if (!hasScheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed)) return { problem: "invalid" };
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return { problem: "invalid" };
  }
  if (parsed.protocol !== "https:") return { problem: "notHttps" };
  // A host needs a dot (or is an IP literal); "https://jobs" is a typo, not a page.
  if (!parsed.hostname.includes(".") && !parsed.hostname.startsWith("[")) return { problem: "invalid" };
  return { url: parsed.href };
}

const LINK_PROBLEM_MESSAGES: Readonly<Record<LinkProblem, MessageDescriptor>> = {
  empty: messages.linkEmpty,
  invalid: messages.linkInvalid,
  notHttps: messages.linkNotHttps,
  tooLong: messages.linkTooLong,
};

export function linkProblemMessage(intl: IntlShape, problem: LinkProblem): string {
  return intl.formatMessage(LINK_PROBLEM_MESSAGES[problem]);
}

/* ------------------------------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------------------------------- */

/** What went wrong reading the link: the callable's `details.reason`, or a transport problem. */
export type ImportErrorKind = JobImportErrorReason | "offline" | "timeout" | "signedOut" | "unknown";

/**
 * The way forward per error: `manual` offers "Enter it yourself" (the page can't be read, so the
 * empty form opens with the link prefilled), `retry` offers "Try again" with the same link, null
 * leaves the link to edit.
 */
const ERROR_RECOVERY: Readonly<Record<ImportErrorKind, "manual" | "retry" | null>> = {
  email_unverified: null,
  invalid_url: null,
  blocked_url: null,
  not_found: null,
  blocked_by_site: "manual",
  fetch_failed: "manual",
  too_large: null,
  not_html: "manual",
  no_job_found: "manual",
  ai_disabled: null,
  daily_cap: null,
  ai_unavailable: "retry",
  rate_limited: null,
  offline: "manual",
  timeout: "retry",
  signedOut: null,
  unknown: "retry",
};

function errorField(error: unknown, field: string): unknown {
  return error !== null && typeof error === "object" ? (error as Record<string, unknown>)[field] : undefined;
}

/** Maps a `jobImportUrl` rejection (`FunctionsError`: `code` + `details.reason`) to what the user sees. */
export function classifyImportError(error: unknown, { online }: { readonly online: boolean }): ImportErrorKind {
  if (!online) return "offline";
  const rawReason = errorField(errorField(error, "details"), "reason");
  const reason = JOB_IMPORT_ERROR_REASONS.find((known) => known === rawReason);
  if (reason) return reason;
  const code = errorField(error, "code");
  switch (code) {
    case "functions/unauthenticated":
      return "signedOut";
    case "functions/deadline-exceeded":
      return "timeout";
    case "functions/unavailable":
      return "offline";
    default:
      return "unknown";
  }
}

const ERROR_MESSAGES: Readonly<Record<ImportErrorKind, MessageDescriptor>> = defineMessages({
  email_unverified: {
    id: "jobs-import.error.emailUnverified",
    defaultMessage: "Confirm your email address first, then read the link again.",
  },
  invalid_url: {
    id: "jobs-import.error.invalidUrl",
    defaultMessage: "That doesn't look like a web address. Check the link and try again.",
  },
  blocked_url: {
    id: "jobs-import.error.blockedUrl",
    defaultMessage: "We can only read public pages on the web. Check that the link is the posting itself.",
  },
  not_found: {
    id: "jobs-import.error.notFound",
    defaultMessage: "This posting isn't online any more. It may have been filled or taken down.",
  },
  blocked_by_site: {
    id: "jobs-import.error.blockedBySite",
    defaultMessage: "This site doesn't let us read its pages. You can enter the details yourself.",
  },
  fetch_failed: {
    id: "jobs-import.error.fetchFailed",
    defaultMessage: "We couldn't reach the page. Try again later, or enter the details yourself.",
  },
  too_large: {
    id: "jobs-import.error.tooLarge",
    defaultMessage: "This page is too large to read. Try the link to the posting itself.",
  },
  not_html: {
    id: "jobs-import.error.notHtml",
    defaultMessage: "This link opens a file, not a web page. You can enter the details yourself.",
  },
  no_job_found: {
    id: "jobs-import.error.noJobFound",
    defaultMessage: "We couldn't find a job posting on this page. You can enter the details yourself.",
  },
  ai_disabled: {
    id: "jobs-import.error.aiDisabled",
    defaultMessage: "This page needs AI to read, and AI features are turned off in Settings.",
  },
  daily_cap: {
    id: "jobs-import.error.dailyCap",
    defaultMessage: "You've read as many links as you can today. You can read more tomorrow.",
  },
  ai_unavailable: {
    id: "jobs-import.error.aiUnavailable",
    defaultMessage: "Our reader is having trouble right now. Try again in a few minutes.",
  },
  rate_limited: {
    id: "jobs-import.error.rateLimited",
    defaultMessage: "We've read a lot from this site today. Try this link again tomorrow.",
  },
  offline: {
    id: "jobs-import.error.offline",
    defaultMessage: "Reading a link needs a connection. You can enter the details yourself now.",
  },
  timeout: {
    id: "jobs-import.error.timeout",
    defaultMessage: "The page took too long to answer. Try again in a moment.",
  },
  signedOut: {
    id: "jobs-import.error.signedOut",
    defaultMessage: "You're signed out. Sign in again, then read the link.",
  },
  unknown: {
    id: "jobs-import.error.unknown",
    defaultMessage: "Something went wrong reading the link. Try again in a moment.",
  },
});

export interface ImportErrorView {
  readonly kind: ImportErrorKind;
  /** One calm sentence: what happened and what to do. */
  readonly message: string;
  /** Offer "Enter it yourself" (the empty form with the link prefilled). */
  readonly offerManual: boolean;
  /** Offer "Try again" with the same link. */
  readonly offerRetry: boolean;
}

export function importErrorView(intl: IntlShape, kind: ImportErrorKind): ImportErrorView {
  return {
    kind,
    message: intl.formatMessage(ERROR_MESSAGES[kind]),
    offerManual: ERROR_RECOVERY[kind] === "manual",
    offerRetry: ERROR_RECOVERY[kind] === "retry",
  };
}

/* ------------------------------------------------------------------------------------------------
 * Step 2: the form
 * ---------------------------------------------------------------------------------------------- */

export type VisaChoice = "unknown" | "yes" | "no";

/** The confirm-and-edit form, as text the controls show. */
export interface ImportForm {
  /** The posting's address; editable only when entering the job by hand. */
  readonly postingUrl: string;
  readonly title: string;
  readonly company: string;
  /** All locations as one label ("Berlin · Munich"). */
  readonly location: string;
  readonly remoteType: RemoteType | "";
  readonly employmentType: EmploymentType | "";
  readonly seniority: Seniority | "";
  readonly salaryMin: string;
  readonly salaryMax: string;
  readonly salaryCurrency: string;
  readonly salaryPeriod: SalaryPeriod;
  /** True when the figure is an estimate rather than published in the posting. */
  readonly salaryEstimated: boolean;
  readonly visaSponsorship: VisaChoice;
  readonly applyUrl: string;
  readonly applyEmail: string;
  readonly description: string;
}

export type ImportFieldKey = keyof ImportForm;

/** Validated fields, in form order (focus and the error summary follow it). */
export const CHECKED_FIELDS = [
  "postingUrl",
  "title",
  "company",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "applyUrl",
  "applyEmail",
] as const satisfies readonly ImportFieldKey[];
export type CheckedField = (typeof CHECKED_FIELDS)[number];

/** The form filled from an import's draft. */
export function formFromJob(job: JobDraft, postingUrl: string): ImportForm {
  return {
    postingUrl,
    title: job.title,
    company: job.company,
    location: job.locations.map((location) => location.label).join(" · "),
    remoteType: job.remoteType ?? "",
    employmentType: job.employmentType ?? "",
    seniority: job.seniority ?? "",
    salaryMin: String(job.salary?.min ?? ""),
    salaryMax: String(job.salary?.max ?? ""),
    salaryCurrency: job.salary?.currency ?? "",
    salaryPeriod: job.salary?.period ?? "year",
    salaryEstimated: job.salary?.estimated ?? false,
    visaSponsorship: job.visaSponsorship === null ? "unknown" : job.visaSponsorship ? "yes" : "no",
    applyUrl: job.applyUrl ?? "",
    applyEmail: job.applyEmail ?? "",
    description: job.description,
  };
}

/** The empty form for "Enter it yourself": the link prefilled as the posting and apply link. */
export function blankForm(postingUrl: string, currency: string | null): ImportForm {
  return {
    postingUrl,
    title: "",
    company: "",
    location: "",
    remoteType: "",
    employmentType: "",
    seniority: "",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: currency ?? "",
    salaryPeriod: "year",
    salaryEstimated: false,
    visaSponsorship: "unknown",
    applyUrl: postingUrl,
    applyEmail: "",
    description: "",
  };
}

/**
 * Reads an amount typed with any common grouping: "65000", "65,000", "65.000", "65 000",
 * "22.50", "22,50". A single separator followed by exactly three digits groups thousands.
 * Null when empty; NaN when it isn't an amount.
 */
export function parseAmount(text: string): number | null {
  const compact = text.replace(/[\s\u00a0\u202f'’_]/gu, "");
  if (compact === "") return null;
  if (!/^\d[\d.,]*$/u.test(compact)) return Number.NaN;
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    normalized = compact.split(group).join("").replace(decimal, ".");
  } else if (lastDot !== -1 || lastComma !== -1) {
    const separator = lastDot !== -1 ? "." : ",";
    const parts = compact.split(separator);
    const grouped = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    normalized = grouped ? parts.join("") : parts.length === 2 ? parts.join(".") : "x";
  } else {
    normalized = compact;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export type FieldProblem =
  | "titleMissing"
  | "companyMissing"
  | "urlInvalid"
  | "emailInvalid"
  | "amountInvalid"
  | "rangeInverted"
  | "currencyInvalid";

/** Problems by field; `manual` also checks the posting link (fixed when it came from the import). */
export function formProblems(form: ImportForm, { manual }: { readonly manual: boolean }): Partial<Record<CheckedField, FieldProblem>> {
  const problems: Partial<Record<CheckedField, FieldProblem>> = {};
  if (manual && !("url" in checkLink(form.postingUrl))) problems.postingUrl = "urlInvalid";
  if (form.title.trim() === "") problems.title = "titleMissing";
  if (form.company.trim() === "") problems.company = "companyMissing";
  const min = parseAmount(form.salaryMin);
  const max = parseAmount(form.salaryMax);
  if (Number.isNaN(min)) problems.salaryMin = "amountInvalid";
  if (Number.isNaN(max)) problems.salaryMax = "amountInvalid";
  else if (min !== null && max !== null && !Number.isNaN(min) && min > max) problems.salaryMax = "rangeInverted";
  if ((min !== null || max !== null) && !/^[A-Z]{3}$/u.test(form.salaryCurrency.trim().toUpperCase()))
    problems.salaryCurrency = "currencyInvalid";
  const applyUrl = form.applyUrl.trim();
  if (applyUrl !== "" && !UrlSchema.safeParse(applyUrl).success) problems.applyUrl = "urlInvalid";
  const applyEmail = form.applyEmail.trim();
  if (applyEmail !== "" && !EmailSchema.safeParse(applyEmail).success) problems.applyEmail = "emailInvalid";
  return problems;
}

const PROBLEM_MESSAGES: Readonly<Record<FieldProblem, MessageDescriptor>> = {
  titleMissing: messages.titleMissing,
  companyMissing: messages.companyMissing,
  urlInvalid: messages.urlInvalid,
  emailInvalid: messages.emailInvalid,
  amountInvalid: messages.amountInvalid,
  rangeInverted: messages.rangeInverted,
  currencyInvalid: messages.currencyInvalid,
};

export function problemMessage(intl: IntlShape, problem: FieldProblem): string {
  return intl.formatMessage(PROBLEM_MESSAGES[problem]);
}

function salaryFromForm(form: ImportForm): SalaryRange | null {
  const min = parseAmount(form.salaryMin);
  const max = parseAmount(form.salaryMax);
  if (min === null && max === null) return null;
  return {
    min,
    max,
    currency: form.salaryCurrency.trim().toUpperCase(),
    period: form.salaryPeriod,
    estimated: form.salaryEstimated,
  };
}

const SALARY_FIELDS: readonly ImportFieldKey[] = [
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryPeriod",
  "salaryEstimated",
];

/**
 * The job to save: `base` with what the user changed against `initial` (null: every field counts
 * as changed). Untouched fields keep the import's values exactly (all locations with their
 * city/country, the source's own wording). The `url_import` listing (`sources[0]` of a new import;
 * wherever it sits in a merged job) follows the edits of its title, location wording, salary and
 * apply route; `sourceKeys` stay as they are.
 */
export function jobFromForm(form: ImportForm, initial: ImportForm | null, base: JobDraft): JobDraft {
  const edited = (key: ImportFieldKey) => initial === null || form[key] !== initial[key];
  const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

  const salaryEdited = SALARY_FIELDS.some(edited);
  const salary = salaryEdited ? salaryFromForm(form) : base.salary;
  const location = form.location.trim();
  const locations = edited("location")
    ? location === ""
      ? []
      : [{ label: location.slice(0, 200), city: null, countryCode: null }]
    : base.locations;
  const applyUrl = edited("applyUrl") ? orNull(form.applyUrl) : base.applyUrl;
  const applyEmail = edited("applyEmail") ? (orNull(form.applyEmail)?.toLowerCase() ?? null) : base.applyEmail;
  const title = edited("title") ? form.title.trim() : base.title;

  const sourceIndex = Math.max(
    0,
    base.sources.findIndex((source) => source.source === URL_IMPORT_SOURCE),
  );
  const sources = base.sources.map((source, index): JobSourceLink => {
    if (index !== sourceIndex) return source;
    return {
      ...source,
      ...(edited("title") ? { title } : {}),
      ...(edited("location") ? { locationText: location === "" ? null : location.slice(0, 300) } : {}),
      ...(salaryEdited ? { salary } : {}),
      ...(edited("applyUrl") ? { applyUrl } : {}),
      ...(edited("applyEmail") ? { applyEmail } : {}),
    };
  });

  return {
    ...base,
    sources,
    sourceKeys: base.sourceKeys,
    title,
    company: edited("company") ? form.company.trim() : base.company,
    locations,
    remoteType: edited("remoteType") ? form.remoteType || null : base.remoteType,
    employmentType: edited("employmentType") ? form.employmentType || null : base.employmentType,
    seniority: edited("seniority") ? form.seniority || null : base.seniority,
    salary,
    visaSponsorship: edited("visaSponsorship")
      ? form.visaSponsorship === "unknown"
        ? null
        : form.visaSponsorship === "yes"
      : base.visaSponsorship,
    applyUrl,
    applyEmail,
    description: edited("description") ? form.description.trim() : base.description,
  };
}

/**
 * "Enter it yourself": a `url_import` job built like `manualJob` (nothing fetched or guessed:
 * language `und`, no skills, the normalized company + title fingerprint) with the form's details.
 * Check `formProblems(form, { manual: true })` first.
 */
export function manualImportJob(form: ImportForm, at: Date): JobDraft {
  const checked = checkLink(form.postingUrl);
  const url = "url" in checked ? checked.url : form.postingUrl.trim();
  const plain = manualJob({ company: form.company.trim(), title: form.title.trim(), url, location: null, at });
  const [manualSource] = plain.sources;
  if (!manualSource) throw new Error("manualJob without a source");
  const source: JobSourceLink = { ...manualSource, source: URL_IMPORT_SOURCE };
  return jobFromForm({ ...form, postingUrl: url }, null, {
    ...plain,
    sources: [source],
    sourceKeys: [jobSourceKey(source)],
  });
}

/* ------------------------------------------------------------------------------------------------
 * Review: flags, provenance, notes
 * ---------------------------------------------------------------------------------------------- */

/** The form field (or group) each `confidence` key flags. */
const CONFIDENCE_FIELDS: Readonly<Record<string, ImportFieldKey>> = {
  title: "title",
  company: "company",
  locations: "location",
  remoteType: "remoteType",
  employmentType: "employmentType",
  seniority: "seniority",
  salary: "salaryMin",
  visaSponsorship: "visaSponsorship",
  applyUrl: "applyUrl",
  applyEmail: "applyEmail",
  description: "description",
};

/** Fields to show "Check this" on: confidence below `CHECK_THRESHOLD` (salary flags its group as `salaryMin`). */
export function fieldsToCheck(confidence: Readonly<Record<string, number>>): ReadonlySet<ImportFieldKey> {
  const flagged = new Set<ImportFieldKey>();
  for (const [key, value] of Object.entries(confidence)) {
    const field = CONFIDENCE_FIELDS[key];
    if (field && value < CHECK_THRESHOLD) flagged.add(field);
  }
  return flagged;
}

export interface Provenance {
  /** "Read from the page's job data · jobs.acme.com", "Read by AI · can be wrong · …". */
  readonly text: string;
  /** AI read it: shown with the AI sparkle. */
  readonly ai: boolean;
}

export function provenance(intl: IntlShape, response: Pick<JobImportUrlResponse, "method" | "finalUrl">): Provenance {
  const host = (() => {
    try {
      return new URL(response.finalUrl).hostname.replace(/^www\./u, "");
    } catch {
      return response.finalUrl;
    }
  })();
  const ai = response.method === "ai";
  return { text: intl.formatMessage(ai ? messages.provenanceAi : messages.provenanceData, { host }), ai };
}

/** What the review shows around the form for one import. */
export interface ImportReview {
  readonly provenance: Provenance;
  /** "You already have this job. …" when the import merges into an existing job. */
  readonly existingNote: string | null;
  readonly notes: readonly string[];
  readonly check: ReadonlySet<ImportFieldKey>;
}

export function buildImportReview(intl: IntlShape, response: JobImportUrlResponse): ImportReview {
  return {
    provenance: provenance(intl, response),
    existingNote: response.existingJobId === null ? null : intl.formatMessage(messages.existing),
    notes: importNotes(intl, response.warnings),
    check: fieldsToCheck(response.confidence),
  };
}

/** Calm notes for the import's warnings, each once; codes the app doesn't know are left out. */
export function importNotes(intl: IntlShape, warnings: readonly string[]): readonly string[] {
  const notes = new Set<string>();
  for (const warning of warnings) {
    const [code, detail] = warning.split(":", 2);
    switch (code) {
      case "description_truncated":
        notes.add(intl.formatMessage(messages.noteTruncated));
        break;
      case "no_description":
      case "description_not_found":
        notes.add(intl.formatMessage(messages.noteNoDescription));
        break;
      case "site_api_failed":
        notes.add(intl.formatMessage(messages.noteSiteData));
        break;
      case "not_a_job_posting":
        notes.add(intl.formatMessage(messages.noteNotPosting));
        break;
      case "dropped_ungrounded": {
        const field = detail === undefined ? undefined : DROPPED_FIELD_MESSAGES[detail as keyof typeof DROPPED_FIELD_MESSAGES];
        if (field) notes.add(intl.formatMessage(messages.noteDropped, { field: intl.formatMessage(field) }));
        break;
      }
      default:
        break;
    }
  }
  return [...notes];
}
