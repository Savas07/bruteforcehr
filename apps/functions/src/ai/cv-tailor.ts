import { tailorCv } from "@bfhr/ai";
import { type CvTailorResponse, CvTailorRequestSchema, CvTailorResponseSchema } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { verifiedUid } from "../callable";
import { loadApplySources } from "./apply-sources";
import { ANTHROPIC_API_KEY, aiProvider, logAiEvent, requireAiEnabled, toCallableError } from "./common";
import { firestoreUsageLedger } from "./usage-ledger";

/**
 * `cvTailor({ cvId, revisionId, jobId, locale, intensity })`: edits that tailor one CV revision to a
 * job, as a diff the user accepts or rejects per edit (BRIEF §4.4.1). Edits only rephrase, reorder
 * or emphasise what the CV states; proposals adding an employer, number, date, title, degree or
 * skill are dropped by the grounding check (docs/adr/0010-ai.md "Tailoring"). The client applies
 * the accepted edits with `applyTailorEdits` and writes the `ai_tailor` revision itself.
 */
export const cvTailor = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 },
  async (request): Promise<CvTailorResponse> => {
    const started = Date.now();
    const parsed = CvTailorRequestSchema.safeParse(request.data);
    const intensity = parsed.success ? parsed.data.intensity : undefined;
    try {
      const uid = verifiedUid(request);
      if (!parsed.success) {
        throw new HttpsError("invalid-argument", "Expected { cvId, revisionId, jobId, locale, intensity }.");
      }
      await requireAiEnabled(uid);
      const { cv, revision, job } = await loadApplySources(getFirestore(), uid, parsed.data);
      const result = await tailorCv(
        {
          content: revision.content,
          cvLanguage: cv.language,
          job,
          locale: parsed.data.locale,
          intensity: parsed.data.intensity,
        },
        { provider: aiProvider(), ledger: firestoreUsageLedger(uid) },
      );
      const response = CvTailorResponseSchema.parse({
        edits: result.edits,
        dropped: result.dropped,
        model: result.model,
        promptVersion: result.promptVersion,
      });
      logAiEvent({
        task: "cvTailor",
        outcome: "ok",
        intensity: parsed.data.intensity,
        targetLanguage: parsed.data.locale,
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
        edits: result.edits.length,
        droppedEdits: result.dropped,
      });
      return response;
    } catch (error) {
      const mapped = toCallableError(error);
      logAiEvent({
        task: "cvTailor",
        outcome: mapped.outcome,
        ...(intensity === undefined ? {} : { intensity }),
        latencyMs: Date.now() - started,
      });
      throw mapped.error;
    }
  },
);
