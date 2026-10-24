// CI gate for job-alert postings and interview times from invites (docs/adr/0012-mail-sync.md):
// deterministic parsers in @bfhr/core, no model. Fails below posting recall 0.90 or precision
// 0.95, or interview start accuracy 0.90. Report: `pnpm --filter @bfhr/ai eval:mail-alerts`.
import { ALERT_BOARDS } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import {
  ALERT_CASES,
  ALERT_PRECISION_GATE,
  ALERT_RECALL_GATE,
  computeAlertMetrics,
  computeInviteMetrics,
  INTERVIEW_START_GATE,
  INVITE_CASES,
  scoreAlertCase,
  scoreInviteCase,
} from "./score";

describe("alert and invite eval sets", () => {
  it("cover every board in EN/TR/DE and enough invites", () => {
    expect(ALERT_CASES.length).toBeGreaterThanOrEqual(12);
    for (const board of ALERT_BOARDS)
      expect(
        ALERT_CASES.some((c) => c.board === board),
        board,
      ).toBe(true);
    for (const language of ["en", "tr", "de"]) {
      expect(
        ALERT_CASES.some((c) => c.language === language),
        language,
      ).toBe(true);
      expect(
        INVITE_CASES.some((c) => c.language === language),
        language,
      ).toBe(true);
    }
    expect(new Set(ALERT_CASES.map((c) => c.format))).toEqual(new Set(["text", "html"]));
    expect(INVITE_CASES.length).toBeGreaterThanOrEqual(8);
    const ids = [...ALERT_CASES, ...INVITE_CASES].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("job-alert and interview-time gate", () => {
  it("postings: recall and precision", () => {
    const metrics = computeAlertMetrics(ALERT_CASES.map(scoreAlertCase));
    expect(metrics.recall).toBeGreaterThanOrEqual(ALERT_RECALL_GATE);
    expect(metrics.precision).toBeGreaterThanOrEqual(ALERT_PRECISION_GATE);
  });

  it("interviews: start accuracy", () => {
    const metrics = computeInviteMetrics(INVITE_CASES.map(scoreInviteCase));
    expect(metrics.startAccuracy).toBeGreaterThanOrEqual(INTERVIEW_START_GATE);
  });
});
