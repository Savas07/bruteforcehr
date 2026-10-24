import { draftCoverLetter } from "@bfhr/ai";
import { firestorePaths } from "@bfhr/api";
import {
  type CoverLetterDraftResponse,
  CoverLetterDraftRequestSchema,
  CoverLetterDraftResponseSchema,
  STARTER_COVER_LETTER_TEMPLATES,
} from "@bfhr/core";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifiedUid } from "../callable";
import { adminConverters } from "../converters";
import { loadApplySources } from "./apply-sources";
import {
  AiCallableError,
  ANTHROPIC_API_KEY,
  aiProvider,
  logAiEvent,
  requireAiEnabled,
  toCallableError,
} from "./common";
import { firestoreUsageLedger } from "./usage-ledger";

/** A starter template, or the caller's `coverLetters` document with `isTemplate: true`. */
export async function coverLetterTemplateBody(
  db: Firestore,
  uid: string,
  templateId: string,
): Promise<string> {
  const starter = STARTER_COVER_LETTER_TEMPLATES.find((template) => template.id === templateId);
  if (starter !== undefined) return starter.body;
  const snapshot = await db.doc(firestorePaths.coverLetter(uid, templateId)).get();
  if (snapshot.exists) {
    try {
      const letter = adminConverters.coverLetter.fromSnapshot(snapshot);
      if (letter.isTemplate) return letter.body;
    } catch {
      // An unreadable document is not a template.
    }
  }
  throw new AiCallableError("not-found", "template_not_found", "This template was not found.");
}

/**
 * `coverLetterDraft({ cvId, revisionId, jobId, tone, language, templateId? })`: a cover letter
 * from the CV revision, the job and the tone, optionally following a template (BRIEF §4.4.2).
 * Claims about the candidate must come from the CV and claims about the company from the posting;
 * unsupported sentences are removed and unknown numbers become `[X]` (docs/adr/0010-ai.md "Cover
 * letters"). The editor saves the result as a `coverLetters` document (`author: "ai"`).
 */
export const coverLetterDraft = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 },
  async (request): Promise<CoverLetterDraftResponse> => {
    const started = Date.now();
    const parsed = CoverLetterDraftRequestSchema.safeParse(request.data);
    const tone = parsed.success ? parsed.data.tone : undefined;
    try {
      const uid = verifiedUid(request);
      if (!parsed.success) {
        throw new HttpsError(
          "invalid-argument",
          "Expected { cvId, revisionId, jobId, tone, language, templateId? }.",
        );
      }
      await requireAiEnabled(uid);
      const db = getFirestore();
      const [{ cv, revision, job }, profileSnapshot, template] = await Promise.all([
        loadApplySources(db, uid, parsed.data),
        db.doc(firestorePaths.user(uid)).get(),
        parsed.data.templateId === undefined
          ? null
          : coverLetterTemplateBody(db, uid, parsed.data.templateId),
      ]);
      const basics = revision.content.basics;
      const profileField = (field: string): string | null => {
        const value: unknown = profileSnapshot.get(field);
        return typeof value === "string" && value.trim() !== "" ? value : null;
      };
      const result = await draftCoverLetter(
        {
          content: revision.content,
          cvLanguage: cv.language,
          job,
          tone: parsed.data.tone,
          language: parsed.data.language,
          template,
          mergeValues: {
            name: profileField("fullName") ?? basics?.name ?? null,
            email: profileField("email") ?? basics?.email ?? null,
            phone: profileField("phone") ?? basics?.phone ?? null,
            job_source: job.sources[0]?.source ?? null,
          },
        },
        { provider: aiProvider(), ledger: firestoreUsageLedger(uid) },
      );
      const response = CoverLetterDraftResponseSchema.parse({
        subject: result.subject,
        body: result.body,
        placeholders: result.placeholders,
        unresolvedFields: result.unresolvedFields,
        droppedSentences: result.droppedSentences,
        model: result.model,
        promptVersion: result.promptVersion,
      });
      logAiEvent({
        task: "coverLetterDraft",
        outcome: "ok",
        tone: parsed.data.tone,
        targetLanguage: parsed.data.language,
        templated: template !== null,
        model: result.model,
        promptVersion: result.promptVersion,
        latencyMs: Date.now() - started,
        attempts: result.attempts,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
        cacheWriteTokens: result.usage.cacheWriteTokens,
        costMicroUsd: result.costMicroUsd,
        sourceChars: JSON.stringify(revision.content).length + job.description.length,
        placeholdersInserted: result.placeholders.length,
        droppedSentences: result.droppedSentences,
      });
      return response;
    } catch (error) {
      const mapped = toCallableError(error);
      logAiEvent({
        task: "coverLetterDraft",
        outcome: mapped.outcome,
        ...(tone === undefined ? {} : { tone }),
        latencyMs: Date.now() - started,
      });
      throw mapped.error;
    }
  },
);
