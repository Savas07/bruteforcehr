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
} from "@bfhr/core";
import { designTailorEdits } from "../features/apply/designState";

export { designTailorEdits };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function limitError(): Error {
  return Object.assign(new Error("daily_cap"), { code: "functions/resource-exhausted", details: { reason: "daily_cap" } });
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
