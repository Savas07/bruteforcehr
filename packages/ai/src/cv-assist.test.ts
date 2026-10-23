import { describe, expect, it } from "vitest";
import { generateWithinBudget, DailyCapError } from "./budget";
import { assistCv, detectLanguage } from "./cv-assist";
import { AiProviderError } from "./provider";
import { memoryLedger, scriptedProvider } from "./test-helpers";
import { ZERO_USAGE } from "./models";
import { CvAssistOutputSchema } from "./prompts/cv-assist";

const context = { section: "work", role: "Backend Engineer", company: "Lumenfold GmbH" };

describe("assistCv", () => {
  it("turns invented metrics into placeholders and lists them", async () => {
    const provider = scriptedProvider([
      {
        suggestions: [
          "Cut API latency by 40% by redesigning the caching layer at Lumenfold GmbH.",
          "Redesigned the caching layer, reducing latency for [number] daily users.",
        ],
      },
    ]);
    const result = await assistCv(
      { text: "Worked on the caching layer to make the API faster.", action: "rewrite", context },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(result.suggestions).toEqual([
      {
        text: "Cut API latency by [X%] by redesigning the caching layer at Lumenfold GmbH.",
        placeholders: ["[X%]"],
      },
      { text: "Redesigned the caching layer, reducing latency for [X] daily users.", placeholders: ["[X]"] },
    ]);
    expect(result).toMatchObject({
      placeholdersInserted: 1,
      rejectedSuggestions: 0,
      promptVersion: "cv-assist@1",
    });
    expect(provider.requests[0]?.user).toContain("<company>Lumenfold GmbH</company>");
  });

  it("drops suggestions that name something not in the input, and retries once when none is left", async () => {
    const provider = scriptedProvider([
      { suggestions: ["Migrated services to Kubernetes on AWS.", "Led the Snowflake migration."] },
      { suggestions: ["Migrated the services to a new platform."] },
    ]);
    const result = await assistCv(
      { text: "Moved our services to a new platform.", action: "strongerVerb", context },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(result.suggestions).toEqual([
      { text: "Migrated the services to a new platform.", placeholders: [] },
    ]);
    expect(result.rejectedSuggestions).toBe(2);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.user).toMatch(/"Kubernetes", "AWS", "Snowflake"/);
  });

  it("returns no suggestion rather than an ungrounded one", async () => {
    const provider = scriptedProvider([
      { suggestions: ["Shipped the Stripe integration."] },
      { suggestions: ["Shipped the Stripe integration with PayPal."] },
    ]);
    const result = await assistCv(
      { text: "Worked on payments.", action: "rewrite", context: { section: "work" } },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(result.suggestions).toEqual([]);
    expect(result.rejectedSuggestions).toBe(2);
  });

  it("translates into German without flagging capitalized nouns, keeping names and numbers", async () => {
    const provider = scriptedProvider([
      {
        suggestions: [
          "Migration von 40 Diensten auf Kubernetes bei der Lumenfold GmbH, Kostensenkung um 28 %.",
        ],
      },
    ]);
    const result = await assistCv(
      {
        text: "Migrated 40 services to Kubernetes, cutting costs by 28%.",
        action: "translate",
        targetLanguage: "de",
        context,
      },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(result.suggestions).toHaveLength(1);
    expect(provider.requests[0]?.user).toContain("Action: translate into German");
  });

  it("drops duplicates and echoes of the input", async () => {
    const provider = scriptedProvider([
      {
        suggestions: [
          "Built the reporting pipeline.",
          "Built the reporting pipeline.",
          "built the reporting pipeline",
        ],
      },
    ]);
    const result = await assistCv(
      { text: "Built the reporting pipeline", action: "rewrite", context: { section: "work" } },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(result.suggestions).toEqual([]);
  });
});

describe("detectLanguage", () => {
  it.each([
    ["Led the migration of the billing service to the cloud", "en"],
    ["Ödeme servisinin buluta taşınmasını yönettim ve ekibi koordine ettim", "tr"],
    ["Leitung der Migration des Abrechnungsdienstes in die Cloud und Koordination mit dem Team", "de"],
    ["Kubernetes, Terraform", undefined],
  ])("%s → %s", (text, language) => {
    expect(detectLanguage(text)).toBe(language);
  });
});

describe("generateWithinBudget", () => {
  const request = {
    model: "claude-sonnet-5-5" as const,
    effort: "low" as const,
    system: "s",
    user: "u".repeat(250),
    schema: CvAssistOutputSchema,
    maxOutputTokens: 1_000,
  };

  it("reserves the worst case, then settles the actual cost", async () => {
    const { ledger, state } = memoryLedger();
    const result = await generateWithinBudget(scriptedProvider([{ suggestions: ["a"] }]), ledger, request);
    // (ceil(251 chars / 2.5) + 2000) tokens × $2 + 1000 × $10 per MTok, in micro-USD
    expect(state.reserves).toEqual([14_202]);
    expect(state.settles).toEqual([[14_202, 7_000]]);
    expect(result.costMicroUsd).toBe(7_000);
    expect(state.spent).toBe(7_000);
  });

  it("refuses before calling the model when the cap would be passed", async () => {
    const provider = scriptedProvider([{ suggestions: ["a"] }]);
    await expect(generateWithinBudget(provider, memoryLedger(10_000).ledger, request)).rejects.toBeInstanceOf(
      DailyCapError,
    );
    expect(provider.requests).toHaveLength(0);
  });

  it("settles what failed attempts cost", async () => {
    const { ledger, state } = memoryLedger();
    const failing = {
      generate: async () => {
        throw new AiProviderError("unavailable", { ...ZERO_USAGE, inputTokens: 500 }, 3, "HTTP 529");
      },
    };
    await expect(generateWithinBudget(failing, ledger, request)).rejects.toBeInstanceOf(AiProviderError);
    expect(state.settles).toEqual([[14_202, 1_000]]);
  });
});
