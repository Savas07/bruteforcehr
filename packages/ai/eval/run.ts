/**
 * Live eval against the Claude API (cost-bounded). Imports every synthetic CV in
 * eval/fixtures/files through the production pipeline (extractor → model → grounding check),
 * scores each field against the fixture's expected JSON Resume, audits the result for fabricated
 * values, runs the cvAssist cases, and writes eval/report.md.
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter @bfhr/ai eval [--model claude-haiku-5-5] [--effort medium]
 *     [--only en-0] [--budget-usd 3] [--skip-assist] [--skip-import]
 *
 * The offline, CI-safe part (grounding adversarial cases, extractors) is `pnpm --filter @bfhr/ai test`.
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { JsonResume } from "@bfhr/core";
import { AnthropicProvider } from "../src/anthropic";
import { DailyCapError, type UsageLedger } from "../src/budget";
import { assistCv, CV_ASSIST_EFFORT, CV_ASSIST_MODEL, detectLanguage } from "../src/cv-assist";
import { CV_IMPORT_EFFORT, CV_IMPORT_MODEL, importCv } from "../src/cv-import";
import { extractDocxText, extractPdfText } from "../src/extract/text";
import { GroundingSource, findUngrounded, fold } from "../src/grounding/grounding";
import { MODELS, type ModelId } from "../src/models";
import { CV_ASSIST_PROMPT_VERSION } from "../src/prompts/cv-assist";
import { CV_IMPORT_PROMPT_VERSION } from "../src/prompts/cv-import";
import type { Effort } from "../src/provider";
import { leafPointers } from "../src/resume-pointers";
import { ASSIST_CASES } from "./fixtures/assist-cases";
import { CV_FIXTURES } from "./fixtures/cvs";
import type { CvFixture } from "./fixtures/types";

const { values: args } = parseArgs({
  options: {
    model: { type: "string" },
    effort: { type: "string" },
    only: { type: "string" },
    "budget-usd": { type: "string", default: "3" },
    "skip-assist": { type: "boolean", default: false },
    "skip-import": { type: "boolean", default: false },
  },
});

const apiKey = process.env["ANTHROPIC_API_KEY"];
if (apiKey === undefined || apiKey === "") {
  console.error("Set ANTHROPIC_API_KEY (the eval calls the real API).");
  process.exit(1);
}
const model = (args.model ?? undefined) as ModelId | undefined;
if (model !== undefined && !(model in MODELS)) throw new Error(`unknown model ${model}`);
const effort = args.effort as Effort | undefined;
const budgetMicroUsd = Math.round(Number(args["budget-usd"]) * 1e6);

/** In-memory ledger with the eval budget as its cap: the run stops before overspending. */
let spentMicroUsd = 0;
const ledger: UsageLedger = {
  async reserve(microUsd) {
    if (spentMicroUsd + microUsd > budgetMicroUsd) throw new DailyCapError();
    spentMicroUsd += microUsd;
  },
  async settle(reserved, actual) {
    spentMicroUsd += actual - reserved;
  },
};
const provider = new AnthropicProvider({ apiKey });
const deps = {
  provider,
  ledger,
  ...(model === undefined ? {} : { model }),
  ...(effort === undefined ? {} : { effort }),
};

/* ------------------------------------------------------------------------------------------------
 * Field comparison
 * ---------------------------------------------------------------------------------------------- */

const norm = (value: string): string =>
  fold(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const digits = (value: string): string => value.replace(/\D/g, "").slice(-9);

function similar(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  const wa = new Set(x.split(" "));
  const wb = new Set(y.split(" "));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / Math.max(wa.size, wb.size) >= 0.9;
}

interface Tally {
  correct: number;
  expected: number;
  extra: number;
}
const tallies = new Map<string, Tally>();
const byLanguage = new Map<string, Tally>();
function score(
  field: string,
  language: string,
  expected: string | undefined,
  actual: string | undefined,
  equal = similar,
): void {
  if (expected === undefined && actual === undefined) return;
  for (const [map, key] of [
    [tallies, field],
    [byLanguage, language],
  ] as const) {
    const tally = map.get(key) ?? { correct: 0, expected: 0, extra: 0 };
    if (expected === undefined) tally.extra++;
    else {
      tally.expected++;
      if (actual !== undefined && equal(expected, actual)) tally.correct++;
    }
    map.set(key, tally);
  }
}

/** Pairs expected and actual items by the best key similarity (greedy, in expected order). */
function align<T>(
  expected: readonly T[] = [],
  actual: readonly T[] = [],
  key: (item: T) => string,
): [T | undefined, T | undefined][] {
  const free = [...actual];
  const pairs: [T | undefined, T | undefined][] = [];
  for (const item of expected) {
    const k = norm(key(item));
    let best = -1;
    let bestScore = 0;
    free.forEach((candidate, i) => {
      const words = new Set(norm(key(candidate)).split(" "));
      const overlap = k.split(" ").filter((w) => words.has(w)).length / Math.max(1, k.split(" ").length);
      if (overlap > bestScore) {
        bestScore = overlap;
        best = i;
      }
    });
    if (best >= 0 && bestScore >= 0.5) pairs.push([item, free.splice(best, 1)[0]]);
    else pairs.push([item, undefined]);
  }
  for (const rest of free) pairs.push([undefined, rest]);
  return pairs;
}

type Fields<T> = readonly (keyof T & string)[];

function scoreItems<T extends Record<string, unknown>>(
  section: string,
  language: string,
  expected: readonly T[] | undefined,
  actual: readonly T[] | undefined,
  key: (item: T) => string,
  fields: Fields<T>,
  listFields: Fields<T> = [],
): void {
  for (const [e, a] of align(expected, actual, key)) {
    for (const field of fields) {
      const ev = e?.[field];
      const av = a?.[field];
      score(
        `${section}.${field}`,
        language,
        typeof ev === "string" ? ev : undefined,
        typeof av === "string" ? av : undefined,
        field.toLowerCase().includes("date") ? (x, y) => x === y : similar,
      );
    }
    for (const field of listFields) {
      const ev = (e?.[field] as string[] | undefined) ?? [];
      const av = (a?.[field] as string[] | undefined) ?? [];
      const remaining = [...av];
      for (const item of ev) {
        const index = remaining.findIndex((candidate) => similar(item, candidate));
        score(
          `${section}.${field}[]`,
          language,
          item,
          index >= 0 ? remaining.splice(index, 1)[0] : undefined,
        );
      }
      for (const item of remaining) score(`${section}.${field}[]`, language, undefined, item);
    }
  }
}

function scoreResume(fixture: CvFixture, actual: JsonResume): void {
  const e = fixture.expected;
  const l = fixture.language;
  for (const field of ["name", "label", "email", "url", "summary"] as const) {
    score(`basics.${field}`, l, e.basics?.[field], actual.basics?.[field]);
  }
  score("basics.phone", l, e.basics?.phone, actual.basics?.phone, (x, y) => digits(x) === digits(y));
  score("basics.location.city", l, e.basics?.location?.city, actual.basics?.location?.city);
  const profileKey = (p: { url?: string | undefined; username?: string | undefined }): string =>
    norm(p.url ?? p.username ?? "");
  const actualProfiles = (actual.basics?.profiles ?? []).map(profileKey);
  for (const profile of e.basics?.profiles ?? []) {
    score(
      "basics.profiles[]",
      l,
      profileKey(profile),
      actualProfiles.find((p) => p === profileKey(profile)),
    );
  }
  scoreItems(
    "work",
    l,
    e.work,
    actual.work,
    (w) => `${w.name ?? ""} ${w.position ?? ""}`,
    ["name", "position", "location", "startDate", "endDate", "summary"],
    ["highlights"],
  );
  scoreItems("education", l, e.education, actual.education, (x) => x.institution ?? "", [
    "institution",
    "area",
    "studyType",
    "startDate",
    "endDate",
    "score",
  ]);
  // Skills: grouping is a judgement call, so names and keywords are compared as one set.
  const flatten = (skills: JsonResume["skills"]): string[] =>
    (skills ?? []).flatMap((s) => [
      ...(s.keywords?.length ? s.keywords : s.name === undefined ? [] : [s.name]),
    ]);
  const actualSkills = flatten(actual.skills);
  for (const skill of flatten(e.skills)) {
    const index = actualSkills.findIndex((candidate) => similar(skill, candidate));
    score("skills[]", l, skill, index >= 0 ? actualSkills.splice(index, 1)[0] : undefined);
  }
  scoreItems("languages", l, e.languages, actual.languages, (x) => x.language ?? "", ["language", "fluency"]);
  scoreItems("certificates", l, e.certificates, actual.certificates, (x) => x.name ?? "", [
    "name",
    "issuer",
    "date",
  ]);
  scoreItems("projects", l, e.projects, actual.projects, (x) => x.name ?? "", [
    "name",
    "startDate",
    "endDate",
  ]);
  scoreItems(
    "volunteer",
    l,
    e.volunteer,
    actual.volunteer,
    (x) => `${x.organization ?? ""} ${x.position ?? ""}`,
    ["organization", "position", "startDate", "endDate"],
    ["highlights"],
  );
  scoreItems("awards", l, e.awards, actual.awards, (x) => x.title ?? "", ["title", "awarder", "date"]);
  scoreItems("publications", l, e.publications, actual.publications, (x) => x.name ?? "", [
    "name",
    "publisher",
    "releaseDate",
  ]);
  scoreItems("interests", l, e.interests, actual.interests, (x) => x.name ?? "", ["name"]);
}

/**
 * Fabrication audit, independent of the grounding code path that produced the result: a leaf is
 * fabricated when its value appears neither in the document text (loose verbatim match; dates by
 * value) nor anywhere in the fixture's expected resume (which holds only document values).
 */
function auditFabrications(actual: JsonResume, expected: JsonResume, sourceText: string): string[] {
  const source = new GroundingSource(sourceText);
  const expectedValues = new Set(
    leafPointers(expected).map((pointer) => norm(String(valueAt(expected, pointer)))),
  );
  const fabricated: string[] = [];
  for (const pointer of leafPointers(actual)) {
    const value = String(valueAt(actual, pointer));
    const isDate = /Date$|\/date$/.test(pointer);
    const inSource = isDate
      ? source.hasDate(value)
      : source.hasPhrase(value) || norm(sourceText).includes(norm(value));
    if (!inSource && !expectedValues.has(norm(value)))
      fabricated.push(`${pointer} = ${JSON.stringify(value)}`);
  }
  return fabricated;
}

function valueAt(root: unknown, pointer: string): unknown {
  return pointer
    .split("/")
    .slice(1)
    .reduce<unknown>(
      (node, key) =>
        (node as Record<string, unknown> | undefined)?.[key.replace(/~1/g, "/").replace(/~0/g, "~")],
      root,
    );
}

/* ------------------------------------------------------------------------------------------------
 * Runs
 * ---------------------------------------------------------------------------------------------- */

const report: string[] = [];
const started = new Date().toISOString();
const importModel = model ?? CV_IMPORT_MODEL;
const assistModel = model ?? CV_ASSIST_MODEL;
let totalDropped = 0;
let totalFabricated = 0;
const fixtureRows: string[] = [];
const fabricationLines: string[] = [];
const droppedLines: string[] = [];
let importCost = 0;

if (!args["skip-import"]) {
  for (const fixture of CV_FIXTURES.filter((f) => args.only === undefined || f.id.startsWith(args.only))) {
    const bytes = new Uint8Array(
      await readFile(new URL(`./fixtures/files/${fixture.id}.${fixture.format}`, import.meta.url)),
    );
    const text = fixture.format === "pdf" ? await extractPdfText(bytes) : await extractDocxText(bytes);
    const before = spentMicroUsd;
    const t0 = performance.now();
    try {
      const result = await importCv(fixture.format, bytes, deps);
      const ms = Math.round(performance.now() - t0);
      const cost = spentMicroUsd - before;
      importCost += cost;
      scoreResume(fixture, result.resume);
      const fabricated = auditFabrications(result.resume, fixture.expected, text);
      totalFabricated += fabricated.length;
      totalDropped += result.droppedValues;
      fabricationLines.push(...fabricated.map((line) => `- \`${fixture.id}\` ${line}`));
      droppedLines.push(
        ...result.warnings
          .filter((w) => w.startsWith("dropped") || w.startsWith("date_month"))
          .map((w) => `- \`${fixture.id}\` ${w}`),
      );
      const u = result.metered?.usage;
      fixtureRows.push(
        `| ${fixture.id} | ${fixture.format} | ${fixture.layout} | ${u?.inputTokens ?? 0} / ${u?.outputTokens ?? 0} | $${(cost / 1e6).toFixed(4)} | ${ms} ms | ${result.droppedValues} | ${fabricated.length} |`,
      );
      console.log(
        `${fixture.id}: ${ms} ms, $${(cost / 1e6).toFixed(4)}, dropped ${result.droppedValues}, fabricated ${fabricated.length}`,
      );
    } catch (error) {
      if (error instanceof DailyCapError) {
        console.error(`budget of $${args["budget-usd"]} reached; stopping`);
        break;
      }
      fixtureRows.push(
        `| ${fixture.id} | ${fixture.format} | ${fixture.layout} | – | – | – | error: ${(error as Error).message} | – |`,
      );
      console.error(fixture.id, error);
    }
  }
}

const pct = (t: Tally): string =>
  t.expected === 0 ? "–" : `${((100 * t.correct) / t.expected).toFixed(1)}%`;
const sum = (map: Map<string, Tally>): Tally =>
  [...map.values()].reduce(
    (a, t) => ({
      correct: a.correct + t.correct,
      expected: a.expected + t.expected,
      extra: a.extra + t.extra,
    }),
    { correct: 0, expected: 0, extra: 0 },
  );

report.push(`# AI eval report`, "");
report.push(
  `Run ${started} · import \`${importModel}\` effort \`${effort ?? CV_IMPORT_EFFORT}\` prompt \`${CV_IMPORT_PROMPT_VERSION}\` · assist \`${assistModel}\` effort \`${effort ?? CV_ASSIST_EFFORT}\` prompt \`${CV_ASSIST_PROMPT_VERSION}\` · budget $${args["budget-usd"]}`,
  "",
);
report.push(
  "Generated by `pnpm --filter @bfhr/ai eval` (eval/run.ts) against the live Claude API. Fixtures are synthetic (eval/fixtures).",
  "",
);

if (!args["skip-import"]) {
  const all = sum(tallies);
  report.push("## CV import", "");
  report.push(
    `- Fields correct: **${all.correct}/${all.expected} (${pct(all)})**; extra values not in the expected resume: ${all.extra}`,
  );
  report.push(
    `- **Fabrications after grounding: ${totalFabricated}** (audit: every returned value must occur in the document text or in the expected resume)`,
  );
  report.push(
    `- Values removed by the grounding check (model output not found in the source): ${totalDropped}`,
  );
  report.push(`- Cost: $${(importCost / 1e6).toFixed(4)} for ${fixtureRows.length} CVs`, "");
  report.push(
    "### Accuracy per field",
    "",
    "| Field | Correct | Expected | Accuracy | Extra |",
    "|---|---:|---:|---:|---:|",
  );
  for (const [field, t] of [...tallies.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    report.push(`| ${field} | ${t.correct} | ${t.expected} | ${pct(t)} | ${t.extra} |`);
  }
  report.push(
    "",
    "### Accuracy per language",
    "",
    "| Language | Correct | Expected | Accuracy |",
    "|---|---:|---:|---:|",
  );
  for (const [language, t] of byLanguage)
    report.push(`| ${language} | ${t.correct} | ${t.expected} | ${pct(t)} |`);
  report.push(
    "",
    "### Per CV",
    "",
    "| Fixture | Format | Layout | Tokens in/out | Cost | Latency | Dropped by grounding | Fabricated |",
    "|---|---|---|---|---:|---:|---:|---:|",
  );
  report.push(...fixtureRows);
  report.push(
    "",
    "### Fabrication audit",
    "",
    ...(fabricationLines.length === 0 ? ["None."] : fabricationLines),
  );
  report.push(
    "",
    "### Removed by the grounding check",
    "",
    ...(droppedLines.length === 0 ? ["None."] : droppedLines),
    "",
  );
}

if (!args["skip-assist"]) {
  report.push("## CV assist", "");
  report.push(
    "| Case | Action | Suggestions | mustKeep kept | Placeholder | Language | Rejected by grounding | Placeholders inserted by grounding | Ungrounded after check | Cost |",
    "|---|---|---:|---:|---|---|---:|---:|---:|---:|",
  );
  const samples: string[] = [];
  let ungroundedTotal = 0;
  let assistCost = 0;
  for (const testCase of ASSIST_CASES.filter((c) => args.only === undefined || c.id.startsWith(args.only))) {
    try {
      const result = await assistCv(
        {
          text: testCase.text,
          action: testCase.action,
          ...(testCase.targetLanguage === undefined ? {} : { targetLanguage: testCase.targetLanguage }),
          context: testCase.context,
        },
        deps,
      );
      assistCost += result.costMicroUsd;
      const source = new GroundingSource(
        [testCase.text, testCase.context.role ?? "", testCase.context.company ?? ""].join("\n"),
      );
      const ungrounded = result.suggestions.flatMap((s) =>
        findUngrounded(s.text, source, { entities: "hard" }),
      );
      ungroundedTotal += ungrounded.length;
      const kept =
        result.suggestions.length === 0
          ? 0
          : result.suggestions.filter((s) =>
              testCase.mustKeep.every((term) => norm(s.text).includes(norm(term))),
            ).length;
      const hasPlaceholder = result.suggestions.some((s) => s.placeholders.length > 0);
      const outLanguage = testCase.action === "translate" ? testCase.targetLanguage : testCase.language;
      const languageOk = result.suggestions.every((s) => {
        const detected = detectLanguage(s.text);
        return detected === undefined || detected === outLanguage;
      });
      report.push(
        `| ${testCase.id} | ${testCase.action} | ${result.suggestions.length} | ${kept}/${result.suggestions.length} | ${hasPlaceholder ? "yes" : "no"}${testCase.expectPlaceholder ? " (expected)" : ""} | ${languageOk ? "ok" : "MISMATCH"} | ${result.rejectedSuggestions} | ${result.placeholdersInserted} | ${ungrounded.length} | $${(result.costMicroUsd / 1e6).toFixed(4)} |`,
      );
      samples.push(
        `**${testCase.id}** (${testCase.action}${testCase.targetLanguage === undefined ? "" : ` → ${testCase.targetLanguage}`})`,
        "",
        `> ${testCase.text}`,
        "",
        ...result.suggestions.map((s) => `- ${s.text}`),
        ...(result.rejectedTerms.length === 0
          ? []
          : [
              "",
              `Rejected by the grounding check for: ${[...new Set(result.rejectedTerms)].map((t) => `\`${t}\``).join(", ")}`,
            ]),
        "",
      );
      console.log(
        `${testCase.id}: ${result.suggestions.length} suggestions, rejected ${result.rejectedSuggestions}`,
      );
    } catch (error) {
      if (error instanceof DailyCapError) {
        console.error(`budget of $${args["budget-usd"]} reached; stopping`);
        break;
      }
      report.push(
        `| ${testCase.id} | ${testCase.action} | error: ${(error as Error).message} | | | | | | | |`,
      );
      console.error(testCase.id, error);
    }
  }
  report.push(
    "",
    `- **Ungrounded entities/numbers/dates in returned suggestions: ${ungroundedTotal}**`,
    `- Cost: $${(assistCost / 1e6).toFixed(4)}`,
    "",
    "### Suggestions",
    "",
    ...samples,
  );
}

report.push(`Total spend: $${(spentMicroUsd / 1e6).toFixed(4)}`, "");
const isDefault = model === undefined && effort === undefined && args.only === undefined;
const file = isDefault
  ? "report.md"
  : `report-${importModel}-${effort ?? "default"}${args.only === undefined ? "" : `-${args.only}`}.md`;
await writeFile(new URL(`./${file}`, import.meta.url), report.join("\n"));
console.log(`wrote eval/${file}; spent $${(spentMicroUsd / 1e6).toFixed(4)}`);
