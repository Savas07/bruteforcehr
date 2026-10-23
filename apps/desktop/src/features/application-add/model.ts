/**
 * Log an application (BRIEF §4.6 manual add; IA.md Tracker "Log an application"): the choices the
 * dialog offers and what it checks, built from the user's data. Statuses are grouped by phase with
 * the shared labels ("Not selected", "No response"); the applied date defaults to today in the
 * user's zone; the CV picker lists the non-archived base CVs with their variants; a CV's versions
 * come from `data.cvRevisions` (the host adds the picked CV's revisions as they load). An open
 * application with the same company and role is pointed out, never blocked.
 */
import {
  ACTIVE_STATUSES,
  type ApplicationStatus,
  type Channel,
  ChannelSchema,
  type Cv,
  type CvRevision,
  isActiveStatus,
  OUTCOME_STATUSES,
  SIDE_EXIT_STATUSES,
  type StatusPhase,
} from "@bfhr/core";
import { defineMessages } from "react-intl";
import { snoozeDateInstant, zonedIsoDay } from "../../data/tracker/snooze";
import { CHANNEL_MESSAGES } from "../../shared/model/build-blocks";
import { shortDate } from "../../shared/model/format";
import type { ModelContext, ScreenData } from "../../shared/model/types";
import { PHASE_MESSAGES, STATUS_MESSAGES } from "../../shared/model/vocabulary";

const messages = defineMessages({
  revision: {
    id: "application-add.model.revision",
    defaultMessage:
      "{date} · {source, select, import {Imported} ai_tailor {Tailored with AI} other {Edited}}",
    description: "A CV version in the version picker: its date, then how it was made",
  },
  currentRevision: {
    id: "application-add.model.currentRevision",
    defaultMessage:
      "{date} · {source, select, import {Imported} ai_tailor {Tailored with AI} other {Edited}} (current)",
    description: "The CV's current version in the version picker",
  },
  currentOnly: {
    id: "application-add.model.currentOnly",
    defaultMessage: "Current version",
    description: "Version picker entry while the CV's versions load",
  },
  duplicate: {
    id: "application-add.model.duplicate",
    defaultMessage: "You're already tracking {role} at {company} ({status}).",
    description: "Calm note when an open application has the same company and role",
  },
});

export interface OptionVM<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface StatusGroupVM {
  /** "Shortlist", "In progress", "Closed". */
  readonly label: string;
  readonly options: readonly OptionVM<ApplicationStatus>[];
}

export interface CvRevisionOptionVM {
  readonly id: string;
  /** "12 Oct · Edited (current)". */
  readonly label: string;
}

export interface CvOptionVM {
  readonly id: string;
  readonly label: string;
  /** The version picked by default. */
  readonly currentRevisionId: string;
  /** Newest first; only the current version until the CV's versions have loaded. */
  readonly revisions: readonly CvRevisionOptionVM[];
}

/** A base CV and its variants (the base CV first). */
export interface CvGroupVM {
  readonly label: string;
  readonly options: readonly CvOptionVM[];
}

export interface OpenApplicationVM {
  readonly applicationId: string;
  /** `duplicateKey(company, role)`. */
  readonly key: string;
  /** "You're already tracking Frontend Engineer at Acme (Interviewing)." */
  readonly note: string;
}

export interface AddApplicationModel {
  readonly statusGroups: readonly StatusGroupVM[];
  /** Applied. */
  readonly defaultStatus: ApplicationStatus;
  /** Statuses from Applied on: they show the applied date. */
  readonly datedStatuses: readonly ApplicationStatus[];
  readonly channels: readonly OptionVM<Channel>[];
  /** Empty when the user has no CVs (or only archived ones). */
  readonly cvGroups: readonly CvGroupVM[];
  /** `YYYY-MM-DD` in the user's zone: the applied date's default and latest value. */
  readonly today: string;
  readonly timeZone: string;
  /** Active applications, for `findDuplicate`. */
  readonly openApplications: readonly OpenApplicationVM[];
}

const PHASES: readonly (readonly [StatusPhase, readonly ApplicationStatus[]])[] = [
  ["shortlist", ["saved", "preparing"]],
  ["in_progress", ACTIVE_STATUSES.filter((status) => status !== "saved" && status !== "preparing")],
  ["closed", [...OUTCOME_STATUSES, ...SIDE_EXIT_STATUSES]],
];

const UNDATED: readonly ApplicationStatus[] = ["saved", "preparing"];

/** Company + role compared without case, surrounding or repeated spaces. */
export function duplicateKey(company: string, role: string): string {
  return [company, role]
    .map((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase())
    .join("\u0000");
}

function revisionOptions(cv: Cv, revisions: readonly CvRevision[], ctx: ModelContext): CvRevisionOptionVM[] {
  const own = revisions
    .filter((revision) => revision.cvId === cv.id)
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (!own.some((revision) => revision.id === cv.currentRevisionId))
    return [{ id: cv.currentRevisionId, label: ctx.intl.formatMessage(messages.currentOnly) }];
  return own.map((revision) => ({
    id: revision.id,
    label: ctx.intl.formatMessage(
      revision.id === cv.currentRevisionId ? messages.currentRevision : messages.revision,
      { date: shortDate(revision.createdAt, ctx), source: revision.source },
    ),
  }));
}

function cvGroups(data: ScreenData, ctx: ModelContext): CvGroupVM[] {
  const live = data.cvs.filter((cv) => cv.archivedAt === null);
  const ids = new Set(live.map((cv) => cv.id));
  // A variant whose base is archived (or gone) stands as its own group.
  const bases = live.filter((cv) => cv.parentCvId === null || !ids.has(cv.parentCvId));
  return bases
    .toSorted((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.title.localeCompare(b.title, ctx.locale))
    .map((base) => ({
      label: base.title,
      options: [
        base,
        ...live
          .filter((cv) => cv.parentCvId === base.id)
          .toSorted((a, b) => a.title.localeCompare(b.title, ctx.locale)),
      ].map((cv) => ({
        id: cv.id,
        label: cv.title,
        currentRevisionId: cv.currentRevisionId,
        revisions: revisionOptions(cv, data.cvRevisions, ctx),
      })),
    }));
}

export function buildAddApplicationModel(data: ScreenData, ctx: ModelContext): AddApplicationModel {
  return {
    statusGroups: PHASES.map(([phase, statuses]) => ({
      label: ctx.intl.formatMessage(PHASE_MESSAGES[phase]),
      options: statuses.map((status) => ({ value: status, label: ctx.intl.formatMessage(STATUS_MESSAGES[status]) })),
    })),
    defaultStatus: "applied",
    datedStatuses: PHASES.flatMap(([, statuses]) => statuses).filter((status) => !UNDATED.includes(status)),
    channels: ChannelSchema.options.map((channel) => ({
      value: channel,
      label: ctx.intl.formatMessage(CHANNEL_MESSAGES[channel]),
    })),
    cvGroups: cvGroups(data, ctx),
    today: zonedIsoDay(ctx.now, 0, ctx.timeZone),
    timeZone: ctx.timeZone,
    openApplications: data.applications
      .filter((application) => isActiveStatus(application.status))
      .map((application) => ({
        applicationId: application.id,
        key: duplicateKey(application.company, application.role),
        note: ctx.intl.formatMessage(messages.duplicate, {
          company: application.company,
          role: application.role,
          status: ctx.intl.formatMessage(STATUS_MESSAGES[application.status]),
        }),
      })),
  };
}

/** The open application with this company and role, if any (both entered). */
export function findDuplicate(
  model: AddApplicationModel,
  company: string,
  role: string,
): OpenApplicationVM | null {
  if (company.trim() === "" || role.trim() === "") return null;
  const key = duplicateKey(company, role);
  return model.openApplications.find((open) => open.key === key) ?? null;
}

/** Whether `link` is empty or a full http(s) address. */
export function isValidLink(link: string): boolean {
  const value = link.trim();
  if (value === "") return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export type AppliedDateProblem = "missing" | "future";

/** Why `day` (`YYYY-MM-DD` from the date field) can't be the applied date, or null. */
export function appliedDateProblem(model: AddApplicationModel, day: string): AppliedDateProblem | null {
  if (snoozeDateInstant(day, model.timeZone) === null) return "missing";
  // ISO days compare in calendar order; typed dates can bypass `max` in some engines.
  return day > model.today ? "future" : null;
}

/**
 * When the user applied: now for today (so the timeline orders it after anything earlier today),
 * else 09:00 on that day in the user's zone. Null for an invalid or future day.
 */
export function appliedInstant(model: AddApplicationModel, day: string, now: Date): Date | null {
  if (appliedDateProblem(model, day) !== null) return null;
  return day === model.today ? now : snoozeDateInstant(day, model.timeZone);
}
