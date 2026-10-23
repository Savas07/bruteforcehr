/**
 * Test and vector helper: builds applications and their events by replaying moves through the
 * real state machine, so every history is legal. Not exported from the package.
 */
import type { Application, ApplicationEvent } from "../application";
import type { ApplicationStatus, Channel, EventActor } from "../enums";
import { revert, transition } from "../status";
import type { InsightsApplication } from "./journey";

export const DAY_MS = 86_400_000;
/** Thursday 2026-10-22 12:00 UTC. */
export const NOW = new Date("2026-10-22T12:00:00.000Z");
export const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

export type HistoryStep =
  | { readonly to: ApplicationStatus; readonly at: Date; readonly actor?: EventActor }
  | { readonly undo: number; readonly at: Date }
  | { readonly mail: "received" | "sent"; readonly at: Date; readonly messageId?: string };

export interface HistorySpec {
  readonly id: string;
  readonly created: Date;
  readonly initial?: ApplicationStatus;
  /** Overrides the derived `appliedAt` (imports carry the spreadsheet date). */
  readonly appliedAt?: Date | null;
  readonly steps?: readonly HistoryStep[];
  readonly channel?: Channel | null;
  readonly source?: string | null;
  readonly cvId?: string | null;
  readonly location?: string | null;
}

export interface History {
  readonly application: InsightsApplication;
  readonly events: ApplicationEvent[];
}

export function history(spec: HistorySpec): History {
  const initial = spec.initial ?? "saved";
  const events: ApplicationEvent[] = [
    {
      id: `${spec.id}-created`,
      applicationId: spec.id,
      type: "created",
      fromStatus: null,
      toStatus: initial,
      actor: "user",
      confidence: null,
      evidence: null,
      text: null,
      revertsEventId: null,
      occurredAt: spec.created,
      createdAt: spec.created,
    },
  ];
  let state: Pick<Application, "id" | "status" | "statusChangedAt" | "appliedAt"> = {
    id: spec.id,
    status: initial,
    statusChangedAt: spec.created,
    appliedAt: initial === "applied" ? spec.created : null,
  };
  (spec.steps ?? []).forEach((step, index) => {
    const id = `${spec.id}-e${index + 1}`;
    if ("undo" in step) {
      const target = events[step.undo];
      if (target === undefined) throw new Error(`${spec.id}: no event ${step.undo}`);
      const result = revert({ application: state, event: target, events, at: step.at });
      events.push({ id, ...result.event });
      state = { ...state, ...result.applicationPatch };
    } else if ("mail" in step) {
      events.push({
        id,
        applicationId: spec.id,
        type: step.mail === "received" ? "mail_received" : "mail_sent",
        fromStatus: null,
        toStatus: null,
        actor: "user",
        confidence: null,
        evidence:
          step.messageId === undefined ? null : { mailMessageId: step.messageId, reason: "Linked email" },
        text: "Subject",
        revertsEventId: null,
        occurredAt: step.at,
        createdAt: step.at,
      });
    } else {
      const actor = step.actor ?? "user";
      const automated = actor !== "user";
      const result = transition({
        application: state,
        to: step.to,
        actor,
        at: step.at,
        ...(automated ? { confidence: 0.9, evidence: { mailMessageId: null, reason: "Rule" } } : {}),
      });
      events.push({ id, ...result.event });
      state = { ...state, ...result.applicationPatch };
    }
  });
  return {
    application: {
      id: spec.id,
      status: state.status,
      appliedAt: spec.appliedAt === undefined ? state.appliedAt : spec.appliedAt,
      channel: spec.channel ?? null,
      source: spec.source ?? null,
      cvId: spec.cvId ?? null,
      location: spec.location ?? null,
    },
    events,
  };
}

export function combine(histories: readonly History[]) {
  return {
    applications: histories.map((entry) => entry.application),
    events: histories.flatMap((entry) => entry.events),
  };
}
