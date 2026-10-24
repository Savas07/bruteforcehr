/**
 * Design build only (`__BFHR_DESIGN__`): route params that force an Apply state for the critique
 * captures (src/design/matrix.ts), read from the hash once when a panel starts:
 * - `letter=ai`: the composer opens with the cover letter on, drafted by AI with an unresolved
 *   `{hiring_manager}` field and an extra attachment;
 * - `tailor-step=review`: the tailor review opens on the design answer with some edits decided.
 * Production builds never call these (every call site checks `__BFHR_DESIGN__` first).
 */
import type { CvContent, RenderedFile, TailorEdit } from "@bfhr/core";
import type { ApplyDraft } from "./model";

function hashParam(name: string): string | null {
  const query = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get(name);
}

export function designDraft(draft: ApplyDraft, renderedFiles: readonly RenderedFile[]): ApplyDraft {
  if (hashParam("letter") !== "ai") return draft;
  const extra = renderedFiles.find((file) => file.cvRevisionId !== null);
  return {
    ...draft,
    letterOn: true,
    body: draft.body.replace("Meinen Lebenslauf finden Sie im Anhang.", "Meinen Lebenslauf und mein Anschreiben finden Sie im Anhang."),
    letterAuthor: "ai",
    letterTemplateId: null,
    letter:
      "Sehr geehrte/r {hiring_manager},\n\nhiermit bewerbe ich mich um die Stelle als Frontend-Entwickler:in (Vue.js) bei Fernweh Reisen. Bei Pazarbox habe ich das Designsystem neu aufgebaut und die Ladezeit des Checkouts mehr als halbiert.\n\nÜber die Gelegenheit zu einem persönlichen Gespräch freue ich mich.\n\nMit freundlichen Grüßen\nDeniz Aksoy",
    extras: extra ? [{ key: `rendered-${extra.id}`, kind: "rendered", file: extra }] : [],
  };
}

export function designTailorStep(): "review" | null {
  return hashParam("tailor-step") === "review" ? "review" : null;
}

/** Keeps the forced-letter draft apart from the plain one when captures switch screens in one page. */
export function designSessionSuffix(): string {
  return hashParam("letter") === "ai" ? ":design-letter" : "";
}
const REASONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    reword: "Puts the result the job asks for (fast, measurable UIs) first.",
    order: "Leads with the performance work the posting mentions twice.",
    keyword: "TypeScript is the first requirement in the posting.",
    gap: "The job asks about scale; a number makes this concrete.",
  },
  tr: {
    reword: "İlanın istediği sonucu (hızlı, ölçülebilir arayüzler) öne çıkarır.",
    order: "İlanda iki kez geçen performans çalışmasını başa alır.",
    keyword: "TypeScript, ilandaki ilk gereksinim.",
    gap: "İlan ölçeği soruyor; bir sayı bunu somutlaştırır.",
  },
  de: {
    reword: "Stellt das Ergebnis nach vorn, das die Stelle sucht (schnelle, messbare UIs).",
    order: "Beginnt mit der Performance-Arbeit, die die Anzeige zweimal nennt.",
    keyword: "TypeScript ist die erste Anforderung der Anzeige.",
    gap: "Die Stelle fragt nach Größenordnung; eine Zahl macht das greifbar.",
  },
};

function edit(fields: Partial<TailorEdit> & Pick<TailorEdit, "id" | "path" | "op" | "reason">): TailorEdit {
  return { before: null, after: null, order: null, groundedIn: [fields.path], ...fields };
}

/** Edits against `content`, phrased for whatever its first job's bullets say. */
export function designTailorEdits(content: CvContent, locale: string): TailorEdit[] {
  const reasons = REASONS[locale] ?? REASONS["en"] ?? {};
  const edits: TailorEdit[] = [];
  const first = content.work?.[0]?.highlights ?? [];
  const second = content.work?.[1]?.highlights ?? [];
  const bullet = first[1];
  if (bullet !== undefined)
    edits.push(
      edit({
        id: "e1",
        path: "/work/0/highlights/1",
        op: "replace",
        before: bullet,
        after: bullet
          .replace(/^Cut checkout Largest Contentful Paint/u, "Made checkout faster: Largest Contentful Paint down")
          .replace(/^Largest Contentful Paint im Checkout/u, "Checkout beschleunigt: Largest Contentful Paint"),
        reason: reasons["reword"] ?? "",
        groundedIn: ["/work/0/highlights/1", "/basics/summary"],
      }),
    );
  if (first.length >= 2)
    edits.push(
      edit({
        id: "e2",
        path: "/work/0/highlights",
        op: "reorder",
        before: first.join(" · "),
        after: [first[1], first[0], ...first.slice(2)].join(" · "),
        order: [1, 0, ...first.slice(2).map((_, index) => index + 2)],
        reason: reasons["order"] ?? "",
      }),
    );
  const keywords = content.skills?.[0]?.keywords ?? [];
  if (keywords.length >= 2)
    edits.push(
      edit({
        id: "e3",
        path: "/skills/0/keywords",
        op: "reorder",
        before: keywords.join(" · "),
        after: [keywords[1], keywords[0], ...keywords.slice(2)].join(" · "),
        order: [1, 0, ...keywords.slice(2).map((_, index) => index + 2)],
        reason: reasons["keyword"] ?? "",
      }),
    );
  const scaled = second[1];
  if (scaled !== undefined)
    edits.push(
      edit({
        id: "e4",
        path: "/work/1/highlights/1",
        op: "replace",
        before: scaled,
        after: `${scaled.replace(/\.$/u, "")}, used by [X] customers.`,
        reason: reasons["gap"] ?? "",
      }),
    );
  return edits;
}

