// CI gate for sender trust (docs/adr/0012-mail-sync.md): automatic tracker changes need a sender the
// provider authenticated (DMARC pass or aligned DKIM, or a reply in our own thread) and never come
// from the spam folder. Checked three ways:
// 1. every case the recorded model applies automatically, replayed with its sender unauthenticated
//    (same prompt, same recorded reply) or moved to spam, goes to review instead;
// 2. the forged and spam cases in `fixtures/spoofed.ts`, rules only;
// 3. the same cases with a model that is fully convinced (right category, confidence 1, right
//    application), which is the attacker's best case.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MAIL_CLASSIFY_MODEL } from "../../src/mail-classify";
import { MailClassifyOutputSchema, type MailClassifyOutput } from "../../src/prompts/mail-classify";
import { ZERO_USAGE } from "../../src/models";
import type { AiProvider, StructuredRequest, StructuredResult } from "../../src/provider";
import { SPOOFED_CASES } from "./fixtures/spoofed";
import { analyzeCase, MAIL_EVAL_CASES, type Recording, replayProvider, unlimitedLedger } from "./score";
import type { MailEvalCase } from "./types";

const recording = async (): Promise<Recording> =>
  JSON.parse(
    await readFile(new URL(`recordings/${MAIL_CLASSIFY_MODEL}.json`, import.meta.url), "utf8"),
  ) as Recording;

/** Answers every request with `output`, whatever the prompt says. */
function fixedProvider(output: unknown): AiProvider {
  return {
    async generate<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      return {
        data: request.schema.parse(output),
        model: request.model,
        usage: ZERO_USAGE,
        attempts: 1,
      };
    },
  };
}

function convincedModel(testCase: MailEvalCase): AiProvider {
  const output: MailClassifyOutput = {
    category: testCase.expected.category,
    confidence: 1,
    language: testCase.language,
    screening: false,
    company: testCase.expected.company,
    role: testCase.expected.role,
    contactName: null,
    contactEmail: null,
    dates: [],
    meetingUrls: [],
    applicationId: testCase.expected.applicationId,
  };
  return fixedProvider(MailClassifyOutputSchema.parse(output));
}

const variant = (
  testCase: MailEvalCase,
  change: { authenticated?: boolean; folder?: "inbox" | "spam" },
): MailEvalCase => ({ ...testCase, message: { ...testCase.message, ...change } });

describe("sender trust gate", () => {
  it("sends recorded automatic changes to review when the sender isn't authenticated or it's spam", async () => {
    const recorded = await recording();
    let checked = 0;
    for (const testCase of MAIL_EVAL_CASES) {
      const ai = { provider: replayProvider(recorded, () => testCase.id), ledger: unlimitedLedger, model: MAIL_CLASSIFY_MODEL };
      const genuine = await analyzeCase(testCase, ai);
      if (!genuine.decision.autoApply) continue;
      checked += 1;

      // Same prompt (authentication isn't part of it), same recorded reply.
      const forged = await analyzeCase(variant(testCase, { authenticated: false }), ai);
      expect(forged.link.applicationId, testCase.id).toBe(genuine.link.applicationId);
      if (genuine.link.linkStrength === "thread") {
        // Our own thread's Message-IDs are known only to the recipient: still automatic.
        expect(forged.decision.autoApply, testCase.id).toBe(true);
      } else {
        expect(forged.link.linkStrength, testCase.id).not.toBe("ats_company_role");
        expect(forged.decision, testCase.id).toMatchObject({ autoApply: false, reviewState: "pending" });
      }

      // The folder is in the prompt, so the spam copy gets the genuine reply without the hash check.
      const reply = recorded.entries[testCase.id]?.output;
      const spam = await analyzeCase(variant(testCase, { folder: "spam" }), {
        provider: fixedProvider(reply),
        ledger: unlimitedLedger,
        model: MAIL_CLASSIFY_MODEL,
      });
      expect(spam.decision, testCase.id).toMatchObject({
        autoApply: false,
        reviewState: "pending",
        suggestedStatus: genuine.decision.suggestedStatus,
      });
      const rulesSpam = await analyzeCase(variant(testCase, { folder: "spam" }), null);
      expect(rulesSpam.decision.autoApply, testCase.id).toBe(false);
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it.each(SPOOFED_CASES.map((testCase) => [testCase.id, testCase] as const))(
    "%s: forged or spam mail never changes the tracker by itself",
    async (_id, testCase) => {
      const rules = await analyzeCase(testCase, null);
      expect(rules.decision.autoApply).toBe(false);
      const convinced = await analyzeCase(testCase, {
        provider: convincedModel(testCase),
        ledger: unlimitedLedger,
        model: MAIL_CLASSIFY_MODEL,
      });
      expect(convinced.category).toBe(testCase.expected.category);
      expect(convinced.link.applicationId).toBe(testCase.expected.applicationId);
      // The move is still proposed, for the user to confirm in review.
      expect(convinced.decision).toEqual({
        suggestedStatus: testCase.expected.suggestedStatus,
        reviewState: "pending",
        autoApply: false,
      });
    },
  );

  it("would apply the same convinced reply automatically from an authenticated inbox sender", async () => {
    // Guards the gate itself: the cases above are refused because of the sender or the folder.
    const ats = SPOOFED_CASES.find((testCase) => testCase.id === "en-spoof-01");
    if (ats === undefined) throw new Error("missing en-spoof-01");
    const genuine = variant(ats, { authenticated: true });
    const analysis = await analyzeCase(genuine, {
      provider: convincedModel(genuine),
      ledger: unlimitedLedger,
      model: MAIL_CLASSIFY_MODEL,
    });
    expect(analysis.link.linkStrength).toBe("ats_company_role");
    expect(analysis.decision).toMatchObject({ autoApply: true, reviewState: "auto_applied" });
  });
});
