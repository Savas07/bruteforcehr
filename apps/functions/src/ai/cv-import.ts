import { importCv } from "@bfhr/ai";
import { type CvImportResponse, CvImportRequestSchema, CvImportResponseSchema } from "@bfhr/core";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  ANTHROPIC_API_KEY,
  AiCallableError,
  aiProvider,
  logAiEvent,
  requireAiEnabled,
  toCallableError,
  verifiedUid,
} from "./common";
import { firestoreUsageLedger } from "./usage-ledger";

/** Same limit as storage.rules for `users/{uid}/cv-imports/{fileId}`. */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/**
 * `cvImport({ storagePath, kind })`: reads an uploaded CV and returns it as JSON Resume with a
 * confidence per field. JSON Resume files and LinkedIn exports map deterministically; PDF and
 * DOCX text is structured by Claude and every value is grounded in the file's text
 * (docs/adr/0010-ai.md). The AI toggle and the daily cost cap apply only to PDF/DOCX.
 */
export const cvImport = onCall(
  { secrets: [ANTHROPIC_API_KEY], memory: "1GiB", timeoutSeconds: 180 },
  async (request): Promise<CvImportResponse> => {
    const started = Date.now();
    const parsed = CvImportRequestSchema.safeParse(request.data);
    const kind = parsed.success ? parsed.data.kind : undefined;
    try {
      const uid = verifiedUid(request);
      if (!parsed.success) throw new HttpsError("invalid-argument", "Expected { storagePath, kind }.");
      const { storagePath } = parsed.data;
      if (storagePath.split("/")[1] !== uid) {
        throw new HttpsError("permission-denied", "That file belongs to another account.");
      }
      const usesAi = parsed.data.kind === "pdf" || parsed.data.kind === "docx";
      if (usesAi) await requireAiEnabled(uid);

      const file = getStorage().bucket().file(storagePath);
      const [exists] = await file.exists();
      if (!exists)
        throw new AiCallableError("not-found", "file_not_found", "The uploaded file was not found.");
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size ?? 0) > MAX_IMPORT_BYTES) {
        throw new AiCallableError("invalid-argument", "file_too_large", "The file is larger than 20 MB.");
      }
      const [buffer] = await file.download();

      const result = await importCv(parsed.data.kind, new Uint8Array(buffer), {
        provider: aiProvider(),
        ledger: firestoreUsageLedger(uid),
      });
      const response = CvImportResponseSchema.parse({
        resume: result.resume,
        confidence: result.confidence,
        warnings: result.warnings,
        model: result.model,
        promptVersion: result.promptVersion,
      });
      const usage = result.metered?.usage;
      logAiEvent({
        task: "cvImport",
        outcome: "ok",
        kind: parsed.data.kind,
        model: result.model,
        promptVersion: result.promptVersion,
        latencyMs: Date.now() - started,
        sourceChars: result.sourceChars,
        droppedValues: result.droppedValues,
        ...(result.metered === undefined
          ? {}
          : {
              attempts: result.metered.attempts,
              costMicroUsd: result.metered.costMicroUsd,
            }),
        ...(usage === undefined
          ? {}
          : {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadTokens: usage.cacheReadTokens,
              cacheWriteTokens: usage.cacheWriteTokens,
            }),
      });
      return response;
    } catch (error) {
      const mapped = toCallableError(error);
      logAiEvent({
        task: "cvImport",
        outcome: mapped.outcome,
        ...(kind === undefined ? {} : { kind }),
        latencyMs: Date.now() - started,
      });
      throw mapped.error;
    }
  },
);
