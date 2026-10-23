/**
 * Upcoming dates the user must act by, shared by Today's Deadlines and the Tracker calendar:
 * - reminders the user set on an open application (`nextAction` + `nextActionAt`);
 * - assessment deadlines and offer reply dates extracted from handled emails (pending ones show
 *   their dates inside the review proposal instead) of open applications;
 * - closing dates (`job.expiresAt`) of jobs that are saved and not applied to yet.
 */
import { isActiveStatus } from "@bfhr/core";
import type { UserData } from "../../shared/model/types";

export type DeadlineKind = "reminder" | "assessment" | "offerReply" | "jobClosing";

export interface Deadline {
  /** Stable per deadline: `reminder:<applicationId>`, `mail:<messageId>:<index>`, `job:<jobId>`. */
  readonly id: string;
  readonly at: Date;
  readonly kind: DeadlineKind;
  readonly applicationId: string | null;
  readonly jobId: string | null;
  readonly mailMessageId: string | null;
  readonly company: string;
  readonly companyDomain: string | null;
  /** The application's role or the job's title. */
  readonly title: string;
  /** The reminder's own text ("Send the portfolio"); null for the other kinds. */
  readonly label: string | null;
}

export type DeadlineData = Pick<UserData, "applications" | "mailMessages" | "jobs" | "jobMatches">;

/** Deadlines with `from ≤ at ≤ until`, soonest first. */
export function collectDeadlines(
  data: DeadlineData,
  range: { readonly from: Date; readonly until: Date },
): Deadline[] {
  const inRange = (date: Date) =>
    date.getTime() >= range.from.getTime() && date.getTime() <= range.until.getTime();
  const found: Deadline[] = [];

  for (const application of data.applications) {
    if (!isActiveStatus(application.status) || application.nextAction === null) continue;
    if (application.nextActionAt === null || !inRange(application.nextActionAt)) continue;
    found.push({
      id: `reminder:${application.id}`,
      at: application.nextActionAt,
      kind: "reminder",
      applicationId: application.id,
      jobId: application.jobId,
      mailMessageId: null,
      company: application.company,
      companyDomain: application.companyDomain,
      title: application.role,
      label: application.nextAction,
    });
  }

  const seen = new Set<string>();
  for (const message of data.mailMessages) {
    if (message.reviewState === "pending" || message.reviewState === "dismissed") continue;
    const application = data.applications.find((candidate) => candidate.id === message.applicationId);
    if (!application || !isActiveStatus(application.status)) continue;
    message.extracted.dates.forEach((date, index) => {
      const kind: DeadlineKind | null =
        date.kind === "assessment_deadline"
          ? "assessment"
          : date.kind === "reply_deadline" && message.category === "offer"
            ? "offerReply"
            : null;
      const key = `${application.id}|${kind}|${date.at.toISOString()}`;
      if (kind === null || !inRange(date.at) || seen.has(key)) return;
      seen.add(key);
      found.push({
        id: `mail:${message.id}:${index}`,
        at: date.at,
        kind,
        applicationId: application.id,
        jobId: application.jobId,
        mailMessageId: message.id,
        company: application.company,
        companyDomain: application.companyDomain,
        title: application.role,
        label: null,
      });
    });
  }

  for (const job of data.jobs) {
    if (!job.expiresAt || !inRange(job.expiresAt)) continue;
    const application = data.applications.find((candidate) => candidate.jobId === job.id);
    const saved = application
      ? application.status === "saved" || application.status === "preparing"
      : data.jobMatches.some((match) => match.id === job.id && match.state === "saved");
    if (!saved) continue;
    found.push({
      id: `job:${job.id}`,
      at: job.expiresAt,
      kind: "jobClosing",
      applicationId: application?.id ?? null,
      jobId: job.id,
      mailMessageId: null,
      company: job.company,
      companyDomain: job.companyDomain,
      title: job.title,
      label: null,
    });
  }

  return found.sort((a, b) => a.at.getTime() - b.at.getTime());
}
