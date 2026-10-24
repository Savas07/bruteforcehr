/**
 * "Tailor for this job" (BRIEF §4.4.1, research/apply.md "Tailor review"): what the review shows
 * for a `cvTailor` answer. One card per proposed edit (where in the CV, before → after, why, and
 * the CV values its facts come from), the user's decision per card, the CV with the accepted
 * edits applied by @bfhr/core `applyTailorEdits` (the live preview, and the revision that is
 * saved), and the edits that could not be applied, said calmly. No React, no Firebase.
 */
import {
  applyTailorEdits,
  type CvContent,
  type CvTailorResponse,
  pointerSegments,
  type TailorApplyResult,
  type TailorEdit,
  type TailorEditOp,
  type TailorIntensity,
  type TailorSkipReason,
  tailorItemLabel,
  valueAtPointer,
} from "@bfhr/core";
import { PLACEHOLDER_PATTERN } from "@bfhr/cv-render";
import { defineMessages, type IntlShape } from "react-intl";
import { type AssistErrorKind, classifyAssistError } from "../../cv-editor/assist";

export type TailorDecision = "accepted" | "kept";

/** The review's state for one answer: the edits and what the user decided so far. */
export interface TailorReviewState {
  readonly response: CvTailorResponse;
  readonly decisions: Readonly<Record<string, TailorDecision>>;
}

export interface TailorCardVM {
  readonly id: string;
  readonly op: TailorEditOp;
  /** "Reworded", "Added", "Removed", "New order". */
  readonly opLabel: string;
  /** "Experience · Paynova · bullet 2". */
  readonly location: string;
  /** What the preview outlines for this card (the array for inserts and new orders). */
  readonly focusPath: string;
  /** The original text (null for an added bullet). */
  readonly before: string | null;
  /** The suggestion (null for a removal). */
  readonly after: string | null;
  readonly reason: string;
  /** Where its facts come from, other than the edited value itself ("Skills · Infrastructure"). */
  readonly groundedIn: readonly string[];
  /** A `[X%]`-style gap in the suggestion: it can't be accepted as it is. */
  readonly gap: string | null;
  readonly decision: TailorDecision | null;
  /** Accepted but not applied (the CV changed, or another edit already changes the same place). */
  readonly skipped: string | null;
}

export interface TailorReviewVM {
  readonly cards: readonly TailorCardVM[];
  /** The CV with the accepted edits applied. */
  readonly content: CvContent;
  readonly result: TailorApplyResult;
  readonly accepted: number;
  readonly pending: number;
  /** "3 suggested edits". */
  readonly heading: string;
  /** "2 accepted · 1 kept as it was · 1 to decide". */
  readonly tally: string;
  /** "2 suggestions were left out because …"; null when none were. */
  readonly droppedNote: string | null;
  /** Why "Save as new version" is unavailable; null when it can save. */
  readonly saveBlocker: string | null;
}

const messages = defineMessages({
  heading: {
    id: "apply.tailor.heading",
    defaultMessage: "{count, plural, one {# suggested edit} other {# suggested edits}}",
  },
  tally: {
    id: "apply.tailor.tally",
    defaultMessage: "{accepted} accepted · {kept} kept as it was{pending, plural, =0 {} other { · # to decide}}",
  },
  dropped: {
    id: "apply.tailor.dropped",
    defaultMessage:
      "{count, plural, one {# suggestion was left out because it would have added something your CV doesn't say.} other {# suggestions were left out because they would have added something your CV doesn't say.}}",
  },
  nothingAccepted: {
    id: "apply.tailor.nothingAccepted",
    defaultMessage: "Accept at least one suggestion to save a tailored version.",
  },
  nothingApplied: {
    id: "apply.tailor.nothingApplied",
    defaultMessage: "None of the accepted suggestions fit your CV as it is now, so there's nothing to save.",
  },
  diffSummary: {
    id: "apply.tailor.diffSummary",
    defaultMessage: "Tailored for {company} · {role}: {applied} of {total} suggestions",
    description: "Stored with the tailored version (Version history)",
  },
  replace: { id: "apply.tailor.op.replace", defaultMessage: "Reworded" },
  insert: { id: "apply.tailor.op.insert", defaultMessage: "Added" },
  remove: { id: "apply.tailor.op.remove", defaultMessage: "Removed" },
  reorder: { id: "apply.tailor.op.reorder", defaultMessage: "New order" },
  stale: {
    id: "apply.tailor.skipped.stale",
    defaultMessage: "Not applied: this part of your CV changed after the suggestion was made.",
  },
  conflict: {
    id: "apply.tailor.skipped.conflict",
    defaultMessage: "Not applied: another accepted suggestion already changes this part.",
  },
  invalid_path: {
    id: "apply.tailor.skipped.invalidPath",
    defaultMessage: "Not applied: tailoring doesn't change this part of a CV.",
  },
});

const sectionMessages = defineMessages({
  basics: { id: "apply.tailor.section.basics", defaultMessage: "Profile" },
  summary: { id: "apply.tailor.section.summary", defaultMessage: "Summary" },
  label: { id: "apply.tailor.section.headline", defaultMessage: "Headline" },
  work: { id: "apply.tailor.section.work", defaultMessage: "Experience" },
  volunteer: { id: "apply.tailor.section.volunteer", defaultMessage: "Volunteering" },
  projects: { id: "apply.tailor.section.projects", defaultMessage: "Projects" },
  skills: { id: "apply.tailor.section.skills", defaultMessage: "Skills" },
  sectionOrder: { id: "apply.tailor.section.sectionOrder", defaultMessage: "Order of sections" },
  bullet: { id: "apply.tailor.part.bullet", defaultMessage: "bullet {number}" },
  bullets: { id: "apply.tailor.part.bullets", defaultMessage: "order of bullets" },
  keyword: { id: "apply.tailor.part.keyword", defaultMessage: "keyword {number}" },
  keywords: { id: "apply.tailor.part.keywords", defaultMessage: "order of keywords" },
  itemSummary: { id: "apply.tailor.part.summary", defaultMessage: "summary" },
  description: { id: "apply.tailor.part.description", defaultMessage: "description" },
  groupName: { id: "apply.tailor.part.groupName", defaultMessage: "group name" },
  order: { id: "apply.tailor.part.order", defaultMessage: "order" },
});

const SECTIONS = ["work", "volunteer", "projects", "skills"] as const;

/** Where a JSON pointer points, in words: "Experience · Paynova · bullet 3". */
export function pointerLabel(content: CvContent, pointer: string, intl: IntlShape): string {
  const [section, index, field, position] = pointerSegments(pointer);
  const format = intl.formatMessage;
  if (section === "basics")
    return field === undefined && (index === "summary" || index === "label")
      ? format(sectionMessages[index])
      : format(sectionMessages.basics);
  if (section === "meta") return format(sectionMessages.sectionOrder);
  const known = SECTIONS.find((candidate) => candidate === section);
  if (!known) return pointer;
  const parts = [format(sectionMessages[known])];
  if (typeof index !== "number") return [...parts, format(sectionMessages.order)].join(" · ");
  parts.push(tailorItemLabel(valueAtPointer(content, `/${known}/${index}`)));
  if (field === "highlights")
    parts.push(typeof position === "number" ? format(sectionMessages.bullet, { number: position + 1 }) : format(sectionMessages.bullets));
  else if (field === "keywords")
    parts.push(typeof position === "number" ? format(sectionMessages.keyword, { number: position + 1 }) : format(sectionMessages.keywords));
  else if (field === "summary") parts.push(format(sectionMessages.itemSummary));
  else if (field === "description") parts.push(format(sectionMessages.description));
  else if (field === "name") parts.push(format(sectionMessages.groupName));
  return parts.join(" · ");
}

/** The array an insert or new order changes; the value itself otherwise. */
function focusPath(edit: TailorEdit): string {
  return edit.op === "insert" ? edit.path.slice(0, edit.path.lastIndexOf("/")) : edit.path;
}

/** Ids the user accepted, in the response's order. */
export function acceptedIds(state: TailorReviewState): string[] {
  return state.response.edits.filter((edit) => state.decisions[edit.id] === "accepted").map((edit) => edit.id);
}

/** A suggestion with a `[gap]` waits for a real value: it can only be kept as it was. */
export function editGap(edit: TailorEdit): string | null {
  return edit.after?.match(PLACEHOLDER_PATTERN)?.[0] ?? null;
}

/** Accept everything that can be accepted (suggestions without gaps). */
export function acceptAll(state: TailorReviewState): TailorReviewState {
  return {
    ...state,
    decisions: Object.fromEntries(
      state.response.edits.map((edit) => [edit.id, editGap(edit) === null ? "accepted" : "kept"]),
    ),
  };
}

/** "Keep original for the rest": every undecided card keeps the CV as it was. */
export function keepRest(state: TailorReviewState): TailorReviewState {
  return {
    ...state,
    decisions: Object.fromEntries(state.response.edits.map((edit) => [edit.id, state.decisions[edit.id] ?? "kept"])),
  };
}

export function decide(state: TailorReviewState, id: string, decision: TailorDecision): TailorReviewState {
  const edit = state.response.edits.find((candidate) => candidate.id === id);
  if (!edit || (decision === "accepted" && editGap(edit) !== null)) return state;
  return { ...state, decisions: { ...state.decisions, [id]: decision } };
}

export function tailorReviewVM(original: CvContent, state: TailorReviewState, intl: IntlShape): TailorReviewVM {
  const { edits, dropped } = state.response;
  const accepted = acceptedIds(state);
  const result = applyTailorEdits(original, edits, accepted);
  const skipped = new Map<string, TailorSkipReason>(result.skipped.map((entry) => [entry.id, entry.reason]));
  const cards = edits.map((edit): TailorCardVM => {
    const location = pointerLabel(original, edit.path, intl);
    const reason = skipped.get(edit.id);
    return {
      id: edit.id,
      op: edit.op,
      opLabel: intl.formatMessage(messages[edit.op]),
      location,
      focusPath: focusPath(edit),
      before: edit.before,
      after: edit.after,
      reason: edit.reason,
      groundedIn: [
        ...new Set(
          edit.groundedIn
            .filter((pointer) => pointer !== edit.path)
            .map((pointer) => pointerLabel(original, pointer, intl))
            .filter((label) => label !== location),
        ),
      ],
      gap: editGap(edit),
      decision: state.decisions[edit.id] ?? null,
      skipped: reason ? intl.formatMessage(messages[reason]) : null,
    };
  });
  const kept = cards.filter((card) => card.decision === "kept").length;
  const pending = cards.length - accepted.length - kept;
  return {
    cards,
    content: result.content,
    result,
    accepted: accepted.length,
    pending,
    heading: intl.formatMessage(messages.heading, { count: cards.length }),
    tally: intl.formatMessage(messages.tally, { accepted: accepted.length, kept, pending }),
    droppedNote: dropped > 0 ? intl.formatMessage(messages.dropped, { count: dropped }) : null,
    saveBlocker:
      accepted.length === 0
        ? intl.formatMessage(messages.nothingAccepted)
        : result.applied.length === 0
          ? intl.formatMessage(messages.nothingApplied)
          : null,
  };
}

/** `diffSummary` of the saved revision (Version history). */
export function tailorDiffSummary(
  job: { readonly company: string; readonly title: string },
  vm: Pick<TailorReviewVM, "result" | "cards">,
  intl: IntlShape,
): string {
  return intl
    .formatMessage(messages.diffSummary, {
      company: job.company,
      role: job.title,
      applied: vm.result.applied.length,
      total: vm.cards.length,
    })
    .slice(0, 2_000);
}

// ─── Requests and errors ───────────────────────────────────────────────────────────────────────

export const TAILOR_INTENSITIES: readonly TailorIntensity[] = ["light", "thorough"];

const errorMessages = defineMessages({
  aiDisabled: {
    id: "apply.tailor.error.aiDisabled",
    defaultMessage: "AI features are off in Settings. Turn them on in Settings › AI to get tailoring suggestions.",
  },
  dailyCap: {
    id: "apply.tailor.error.dailyCap",
    defaultMessage: "You've reached today's AI limit. It resets tomorrow; your CV is ready to use as it is.",
  },
  emailUnverified: {
    id: "apply.tailor.error.emailUnverified",
    defaultMessage: "Confirm your email address to use AI suggestions, then try again.",
  },
  signedOut: {
    id: "apply.tailor.error.signedOut",
    defaultMessage: "Sign in again to use AI suggestions.",
  },
  offline: {
    id: "apply.tailor.error.offline",
    defaultMessage: "Tailoring needs an internet connection. Your CV is unchanged.",
  },
  failed: {
    id: "apply.tailor.error.failed",
    defaultMessage: "Couldn't get suggestions right now. Your CV is unchanged. Try again in a moment.",
  },
});

export type TailorErrorKind = AssistErrorKind;

/** A `cvTailor` / `coverLetterDraft` failure, the same way as every AI callable (`classifyAssistError`). */
export function tailorErrorKind(error: unknown, online: boolean): TailorErrorKind {
  return classifyAssistError(error, { online });
}

export function tailorErrorSentence(kind: TailorErrorKind, intl: IntlShape): string {
  return intl.formatMessage(errorMessages[kind]);
}
