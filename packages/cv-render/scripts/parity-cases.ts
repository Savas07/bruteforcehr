// The fixed CV set of the print-engine parity check (scripts/parity.ts, scripts/parity-server.ts):
// 3 templates × A4/Letter × EN/DE/TR, plus the every-section CV (photo, date of birth, a placeholder)
// per template and paper. renderCvHtml is deterministic, so every machine builds the same HTML.
import { type CvRenderResult, renderCvHtml } from "../src/index";
import { deCv, enCv, fullCv, inputFor, PAPERS, PHOTO_DATA_URL, TEMPLATE_IDS, trCv } from "../test/samples";

export interface ParityCase {
  /** `<paper>-<template>-<lang>[-full]`, also the case's directory / file name. */
  readonly name: string;
  readonly result: CvRenderResult;
}

const CONTENTS = [
  ["en", enCv, false],
  ["de", deCv, false],
  ["tr", trCv, false],
  ["en", fullCv, true],
] as const;

export const PARITY_CASES: readonly ParityCase[] = PAPERS.flatMap((paper) =>
  TEMPLATE_IDS.flatMap((templateId) =>
    CONTENTS.map(([locale, content, full]) => {
      const input = inputFor(content, locale, templateId, paper);
      return {
        name: `${paper}-${templateId}-${locale}${full ? "-full" : ""}`,
        result: renderCvHtml(full ? { ...input, photo: { dataUrl: PHOTO_DATA_URL } } : input),
      };
    }),
  ),
);
