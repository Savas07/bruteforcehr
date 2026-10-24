/**
 * The Apply AI callables in the design build: `cvTailor` and `coverLetterDraft` answer after a
 * short wait like the deployed functions would for the fixtures. Edits are built from the CV
 * version asked about (so they apply and the review shows real diffs): a reworded bullet, a new
 * bullet order, a keyword moved forward, and a suggestion with a `[X]` gap; the letter starts with
 * `{hiring_manager}` so "Fields to fill" shows. A posting whose company contains "Limit" answers
 * with the daily AI limit, like the server.
 */
import {
  type CoverLetterDraftRequest,
  type CoverLetterDraftResponse,
  type CvContent,
  type CvTailorRequest,
  type CvTailorResponse,
  fillMergeFields,
  type Job,
  STARTER_COVER_LETTER_TEMPLATES,
  type TailorEdit,
} from "@bfhr/core";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function limitError(): Error {
  return Object.assign(new Error("daily_cap"), { code: "functions/resource-exhausted", details: { reason: "daily_cap" } });
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
        after: bullet.replace(/^Cut checkout Largest Contentful Paint/u, "Made checkout faster: Largest Contentful Paint down"),
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

export async function designTailor(
  request: CvTailorRequest,
  content: CvContent | null,
  job: Job | undefined,
): Promise<CvTailorResponse> {
  await wait(1_500);
  if (job?.company.includes("Limit")) throw limitError();
  const edits = content ? designTailorEdits(content, request.locale) : [];
  return {
    edits,
    dropped: 2,
    model: "design-fixture",
    promptVersion: "design",
  };
}

const OPENINGS: Readonly<Record<string, string>> = {
  en: "Dear {hiring_manager},\n\nI'm applying for the {role} position at {company}. At Pazarbox I led the design-system rebuild and cut checkout load times by more than half, the kind of measurable frontend work your posting describes.",
  tr: "Sayın {hiring_manager},\n\n{company} bünyesindeki {role} pozisyonu için başvuruyorum. Pazarbox'ta tasarım sistemini yeniden kurdum ve ödeme sayfasının yüklenme süresini yarıdan fazla kısalttım.",
  de: "Sehr geehrte/r {hiring_manager},\n\nhiermit bewerbe ich mich um die Stelle als {role} bei {company}. Bei Pazarbox habe ich das Designsystem neu aufgebaut und die Ladezeit des Checkouts mehr als halbiert.",
};

const CLOSINGS: Readonly<Record<string, string>> = {
  en: "I'd welcome the chance to talk about how I can help.\n\nKind regards,\n{name}",
  tr: "Nasıl katkı sağlayabileceğimi konuşmaktan memnuniyet duyarım.\n\nSaygılarımla,\n{name}",
  de: "Über die Gelegenheit zu einem persönlichen Gespräch freue ich mich.\n\nMit freundlichen Grüßen\n{name}",
};

export async function designCoverLetter(
  request: CoverLetterDraftRequest,
  job: Job | undefined,
  name: string | null,
): Promise<CoverLetterDraftResponse> {
  await wait(1_500);
  if (job?.company.includes("Limit")) throw limitError();
  const template = STARTER_COVER_LETTER_TEMPLATES.find((candidate) => candidate.id === request.templateId);
  const body = template
    ? template.body.replace(/\[[^\]]+\]/gu, "").replace(/\n{3,}/gu, "\n\n")
    : `${OPENINGS[request.language] ?? OPENINGS["en"]}\n\n${CLOSINGS[request.language] ?? CLOSINGS["en"]}`;
  const filled = fillMergeFields(body, { name, role: job?.title ?? null, company: job?.company ?? null });
  return {
    subject: null,
    body: filled.text,
    placeholders: [],
    unresolvedFields: filled.unresolved,
    droppedSentences: 1,
    model: "design-fixture",
    promptVersion: "design",
  };
}
