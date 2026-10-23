/**
 * AI suggestions as tracked changes (research/cv-editor.md "AI inline diff", decisions.md D13):
 * word-level diff, placeholders that block "Use suggestion" until the user fills them, and the
 * view-model for the inline change and the Suggestions tab. Every suggestion is decided one by
 * one; there is no accept-all (§2.4).
 */
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { textAt, type CvDraft, type CvTextTarget } from "./draft";

export type CvSuggestionMode = "shorten" | "strongerVerb" | "addResult" | "rewrite" | "translate";

/** A suggestion as the AI service returns it: where it applies and the proposed text. */
export interface CvSuggestionInput {
  readonly id: string;
  readonly cvId: string;
  readonly target: CvTextTarget;
  readonly mode: CvSuggestionMode;
  /** May contain placeholders like "[X%]" where only the user knows the fact. */
  readonly proposed: string;
}

export interface DiffToken {
  readonly kind: "same" | "del" | "ins";
  readonly text: string;
}

export interface CvSuggestionVM {
  readonly id: string;
  readonly target: CvTextTarget;
  readonly mode: CvSuggestionMode;
  /** "Shorten". */
  readonly modeLabel: string;
  /** Why, in one line: "Same facts in fewer words". */
  readonly reason: string;
  /** "Experience · Pazarbox · Bullet 3". */
  readonly location: string;
  readonly original: string;
  readonly proposed: string;
  readonly tokens: readonly DiffToken[];
  /** Distinct placeholders in `proposed`, in order ("[X%]"). */
  readonly placeholders: readonly string[];
  /** Text alternative to the coloured diff: "Removed: …. Added: …." */
  readonly spoken: string;
}

const messages = defineMessages({
  bullet: {
    id: "cv-editor.suggestion.bullet",
    defaultMessage: "Bullet {number, number}",
    description: "Location of a suggestion inside a CV entry: 'Bullet 3'",
  },
  location: {
    id: "cv-editor.suggestion.location",
    defaultMessage: "{section} · {item} · {bullet}",
    description: "Where a suggestion applies: 'Experience · Pazarbox · Bullet 3'",
  },
  spoken: {
    id: "cv-editor.suggestion.spoken",
    defaultMessage: "Removed: {removed}. Added: {added}.",
    description: "Screen-reader text of a tracked change",
  },
  nothing: {
    id: "cv-editor.suggestion.nothing",
    defaultMessage: "nothing",
    description: "Used in 'Removed: nothing' when a suggestion only adds words",
  },
});

/** Label ("Shorten") and one-line reason per mode; the label also names the "Improve with AI" action. */
export const SUGGESTION_MODE_MESSAGES: Readonly<
  Record<CvSuggestionMode, { label: MessageDescriptor; reason: MessageDescriptor }>
> = {
  shorten: defineMessages({
    label: { id: "cv-editor.suggestion.mode.shorten", defaultMessage: "Shorten" },
    reason: { id: "cv-editor.suggestion.reason.shorten", defaultMessage: "Same facts in fewer words." },
  }),
  strongerVerb: defineMessages({
    label: { id: "cv-editor.suggestion.mode.strongerVerb", defaultMessage: "Stronger verb" },
    reason: {
      id: "cv-editor.suggestion.reason.strongerVerb",
      defaultMessage: "Starts with what you did, not what you were responsible for.",
    },
  }),
  addResult: defineMessages({
    label: { id: "cv-editor.suggestion.mode.addResult", defaultMessage: "Add a result" },
    reason: {
      id: "cv-editor.suggestion.reason.addResult",
      defaultMessage: "Recruiters look for outcomes. Only you know the real number, so fill it in.",
    },
  }),
  rewrite: defineMessages({
    label: { id: "cv-editor.suggestion.mode.rewrite", defaultMessage: "Rewrite" },
    reason: { id: "cv-editor.suggestion.reason.rewrite", defaultMessage: "Clearer wording, same meaning." },
  }),
  translate: defineMessages({
    label: { id: "cv-editor.suggestion.mode.translate", defaultMessage: "Translate" },
    reason: {
      id: "cv-editor.suggestion.reason.translate",
      defaultMessage: "Same facts, in the language you chose. Check names and titles read right.",
    },
  }),
};

/** Words, with a bracketed placeholder ("[team size]") kept as one token. */
const WORD = /\[[^\]\n]{1,40}\]\S*|\S+/gu;
const PLACEHOLDER = /\[[^\]\n]{1,40}\]/gu;

/** Word-level diff (longest common subsequence), adjacent tokens of one kind merged. */
export function wordDiff(before: string, after: string): DiffToken[] {
  const a = before.match(WORD) ?? [];
  const b = after.match(WORD) ?? [];
  // lcs[i][j]: common words in a[i…] and b[j…].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] ?? [];
      row[j] = a[i] === b[j] ? (lcs[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const raw: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ kind: "same", text: a[i] ?? "" });
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || (lcs[i]?.[j + 1] ?? 0) >= (lcs[i + 1]?.[j] ?? 0))) {
      raw.push({ kind: "ins", text: b[j] ?? "" });
      j++;
    } else {
      raw.push({ kind: "del", text: a[i] ?? "" });
      i++;
    }
  }
  // A kept run of one or two words between two changes reads better as part of the change
  // ("~~a b~~ x y" instead of "~~a~~ x ~~b~~ y"): it moves into both the deletion and the insertion.
  const absorbed: DiffToken[] = [];
  for (let index = 0; index < raw.length; index++) {
    const token = raw[index];
    if (!token) continue;
    if (token.kind !== "same") {
      absorbed.push(token);
      continue;
    }
    let end = index;
    while (raw[end + 1]?.kind === "same") end++;
    // Kept runs are maximal, so one starting after index 0 always follows a change.
    const absorb = end - index < 2 && index > 0 && end + 1 < raw.length;
    for (const kept of raw.slice(index, end + 1)) {
      if (absorb) absorbed.push({ kind: "del", text: kept.text }, { kind: "ins", text: kept.text });
      else absorbed.push(kept);
    }
    index = end;
  }
  // Deletions before insertions within a changed run reads as "old → new".
  const ordered: DiffToken[] = [];
  let run: DiffToken[] = [];
  const flush = () => {
    ordered.push(...run.filter((token) => token.kind === "del"), ...run.filter((token) => token.kind === "ins"));
    run = [];
  };
  for (const token of absorbed) {
    if (token.kind === "same") {
      flush();
      ordered.push(token);
    } else run.push(token);
  }
  flush();
  const merged: DiffToken[] = [];
  for (const token of ordered) {
    const last = merged.at(-1);
    if (last?.kind === token.kind) merged[merged.length - 1] = { kind: token.kind, text: `${last.text} ${token.text}` };
    else merged.push(token);
  }
  return merged;
}

/** Distinct bracketed placeholders ("[X%]", "[X]", "[date]", "[team size]") in order of appearance. */
export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])];
}

/** `proposed` with each placeholder replaced by the user's fill (trimmed); unfilled ones stay. */
export function fillPlaceholders(text: string, fills: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER, (placeholder) => fills[placeholder]?.trim() || placeholder);
}

/** True while any placeholder is still unfilled (empty, or still bracketed). */
export function hasUnfilledPlaceholders(
  placeholders: readonly string[],
  fills: Readonly<Record<string, string>>,
): boolean {
  return placeholders.some((placeholder) => {
    const fill = fills[placeholder]?.trim() ?? "";
    // A fill still in brackets ("[X%]") hasn't been replaced with a real fact.
    return fill === "" || /\[[^\]\n]*\]/u.test(fill);
  });
}

/**
 * Suggestions for one CV against its draft. Inputs whose target is gone, or that wouldn't change
 * anything, are dropped. `sectionTitles` are the UI-language section names ("Experience").
 */
export function buildSuggestionVMs(
  inputs: readonly CvSuggestionInput[],
  draft: CvDraft,
  sectionTitles: Readonly<Record<string, string>>,
  intl: IntlShape,
): CvSuggestionVM[] {
  const result: CvSuggestionVM[] = [];
  for (const input of inputs) {
    if (input.cvId !== draft.cvId) continue;
    const original = textAt(draft, input.target);
    if (original === null || original === input.proposed) continue;
    const section = sectionTitles[input.target.sectionKey] ?? input.target.sectionKey;
    const item =
      input.target.itemId === null
        ? null
        : draft.sections
            .find((candidate) => candidate.key === input.target.sectionKey)
            ?.items.find((candidate) => candidate.id === input.target.itemId);
    const location =
      item && input.target.bulletIndex !== null
        ? intl.formatMessage(messages.location, {
            section,
            item: item.org || item.title,
            bullet: intl.formatMessage(messages.bullet, { number: input.target.bulletIndex + 1 }),
          })
        : section;
    const tokens = wordDiff(original, input.proposed);
    const join = (kind: DiffToken["kind"]) =>
      tokens
        .filter((token) => token.kind === kind)
        .map((token) => token.text)
        .join(" … ") || intl.formatMessage(messages.nothing);
    result.push({
      id: input.id,
      target: input.target,
      mode: input.mode,
      modeLabel: intl.formatMessage(SUGGESTION_MODE_MESSAGES[input.mode].label),
      reason: intl.formatMessage(SUGGESTION_MODE_MESSAGES[input.mode].reason),
      location,
      original,
      proposed: input.proposed,
      tokens,
      placeholders: findPlaceholders(input.proposed),
      spoken: intl.formatMessage(messages.spoken, { removed: join("del"), added: join("ins") }),
    });
  }
  return result;
}
