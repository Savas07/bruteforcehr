// CI gate for tailoring and cover letters (BRIEF §9 "grounding check", docs/adr/0010-ai.md):
// replays the recorded model replies of the last live run through the current pipeline and fails
// on any fabricated item (independent audit) or below the quality gates. A prompt change
// invalidates the recording: re-run `pnpm --filter @bfhr/ai eval:apply`.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { GroundingSource } from "../../src/grounding/grounding";
import { cvText } from "../../src/apply-grounding";
import { CV_TAILOR_MODEL } from "../../src/cv-tailor";
import { COVER_LETTER_PROMPT_VERSION } from "../../src/prompts/cover-letter";
import { CV_TAILOR_PROMPT_VERSION } from "../../src/prompts/cv-tailor";
import type { Recording } from "../mail/score";
import { APPLY_JOBS } from "./fixtures";
import {
  baitIn,
  computeMetrics,
  evalCv,
  gateFailures,
  LETTER_CASES,
  replayingProvider,
  runLetterCase,
  runTailorCase,
  scoreLetterCase,
  scoreTailorCase,
  TAILOR_CASES,
} from "./score";

describe("apply eval set", () => {
  it("covers EN, TR and DE CVs and postings, every case once", () => {
    const cvLanguages = APPLY_JOBS.map((job) => evalCv(job.cvId).language);
    for (const language of ["en", "tr", "de"] as const) {
      expect(cvLanguages.filter((cv) => cv === language).length, language).toBeGreaterThanOrEqual(4);
      expect(
        APPLY_JOBS.some((job) => job.language === language),
        language,
      ).toBe(true);
    }
    const ids = [...TAILOR_CASES, ...LETTER_CASES].map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("baits only with things the CV doesn't have, and keywords it does", () => {
    for (const job of APPLY_JOBS) {
      const text = cvText(evalCv(job.cvId).content);
      expect(job.bait.length, job.cvId).toBeGreaterThanOrEqual(2);
      expect(baitIn(text, job.bait), `${job.cvId} bait in CV`).toEqual([]);
      expect(baitIn(job.description, job.bait), `${job.cvId} bait not in posting`).toEqual(job.bait);
      const cv = new GroundingSource(text);
      for (const keyword of job.keywords)
        expect(cv.hasPhrase(keyword) || cv.hasEntity(keyword), `${job.cvId} ${keyword}`).toBe(true);
    }
  });
});

describe("apply gate (recorded replies)", () => {
  it("has no fabricated item and meets the quality gates", async () => {
    const recording = JSON.parse(
      await readFile(new URL(`recordings/${CV_TAILOR_MODEL}.json`, import.meta.url), "utf8"),
    ) as Recording;
    expect(recording.promptVersion, "recording is from other prompt versions: re-run eval:apply").toBe(
      `${CV_TAILOR_PROMPT_VERSION}+${COVER_LETTER_PROMPT_VERSION}`,
    );
    const tailor = [];
    for (const testCase of TAILOR_CASES) {
      const result = await runTailorCase(
        testCase,
        replayingProvider(recording, testCase.id),
        CV_TAILOR_MODEL,
      );
      tailor.push(scoreTailorCase(testCase, result));
    }
    const letters = [];
    for (const testCase of LETTER_CASES) {
      const result = await runLetterCase(
        testCase,
        replayingProvider(recording, testCase.id),
        CV_TAILOR_MODEL,
      );
      letters.push(scoreLetterCase(testCase, result));
    }
    const metrics = computeMetrics(tailor, letters);
    expect([...tailor, ...letters].flatMap((score) => score.fabrications)).toEqual([]);
    expect(gateFailures(metrics)).toEqual([]);
  });
});
