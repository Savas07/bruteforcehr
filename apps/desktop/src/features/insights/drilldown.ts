/**
 * The Tracker table's "From Insights" chip: a readable name for a drill-down parsed from the
 * route (`parseInsightsDrillDown`), e.g. "Interview · 25 Jul – 22 Oct 2026 · Greenhouse".
 */
import { INSIGHTS_DIMENSIONS, type InsightsDrillDown } from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { dimensionValueLabel, type InsightsLabels } from "./model";

const messages = defineMessages({
  applied: { id: "insights.drill.applied", defaultMessage: "Applied" },
  responded: { id: "insights.drill.responded", defaultMessage: "Got a response" },
  interview: { id: "insights.drill.interview", defaultMessage: "Reached interview" },
  offer: { id: "insights.drill.offer", defaultMessage: "Reached offer" },
  waiting: { id: "insights.drill.waiting", defaultMessage: "Still waiting" },
  noResponse: { id: "insights.drill.noResponse", defaultMessage: "No response" },
  withdrawn: { id: "insights.drill.withdrawn", defaultMessage: "Withdrawn without a response" },
  activityApplied: { id: "insights.drill.activityApplied", defaultMessage: "Applications sent" },
  activityFollowUp: { id: "insights.drill.activityFollowUp", defaultMessage: "Follow-ups sent" },
  activityInterview: { id: "insights.drill.activityInterview", defaultMessage: "Interviews held" },
  since: { id: "insights.drill.since", defaultMessage: "since {from}" },
  until: { id: "insights.drill.until", defaultMessage: "until {to}" },
  span: { id: "insights.drill.span", defaultMessage: "{from} – {to}" },
  joined: {
    id: "insights.drill.joined",
    defaultMessage: "{first} · {rest}",
    description: "Joins the parts of a drill-down label",
  },
});

const KIND_MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  "stage:applied": messages.applied,
  "stage:responded": messages.responded,
  "stage:interview": messages.interview,
  "stage:offer": messages.offer,
  "stage:waiting": messages.waiting,
  "stage:no_response": messages.noResponse,
  "stage:withdrawn": messages.withdrawn,
  "activity:applied": messages.activityApplied,
  "activity:follow_up": messages.activityFollowUp,
  "activity:interview": messages.activityInterview,
};

const civil = (date: string, intl: IntlShape) =>
  new Intl.DateTimeFormat(intl.locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));

/** "Reached interview · 25 Jul 2026 – 22 Oct 2026 · Greenhouse". `labels` names CVs by id. */
export function drillDownLabel(
  intl: IntlShape,
  drill: InsightsDrillDown,
  labels: InsightsLabels = { cvTitles: {} },
): string {
  const kind = drill.stage === undefined ? `activity:${drill.activity}` : `stage:${drill.stage}`;
  const message = KIND_MESSAGES[kind];
  const parts = [message === undefined ? kind : intl.formatMessage(message)];
  if (drill.from !== undefined && drill.to !== undefined)
    parts.push(
      intl.formatMessage(messages.span, { from: civil(drill.from, intl), to: civil(drill.to, intl) }),
    );
  else if (drill.from !== undefined)
    parts.push(intl.formatMessage(messages.since, { from: civil(drill.from, intl) }));
  else if (drill.to !== undefined)
    parts.push(intl.formatMessage(messages.until, { to: civil(drill.to, intl) }));
  for (const dimension of INSIGHTS_DIMENSIONS) {
    const value = drill.filters?.[dimension];
    if (value !== undefined) parts.push(dimensionValueLabel(dimension, value, intl, labels));
  }
  return parts.reduce((first, rest) => intl.formatMessage(messages.joined, { first, rest }));
}
