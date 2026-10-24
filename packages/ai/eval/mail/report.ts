import { MailCategorySchema } from "@bfhr/core";
import {
  ALERT_PRECISION_GATE,
  ALERT_RECALL_GATE,
  type AlertCaseResult,
  type AlertMetrics,
  AUTO_PRECISION_GATE,
  autoCorrect,
  type CaseResult,
  INTERVIEW_START_GATE,
  type InviteCaseResult,
  type InviteMetrics,
  MACRO_F1_GATE,
  type Metrics,
} from "./score";

const pct = (value: number) => `${(value * 100).toFixed(1)} %`;
const pass = (ok: boolean) => (ok ? "✅ pass" : "❌ fail");

export function gatePasses(metrics: Metrics): { macroF1: boolean; autoPrecision: boolean } {
  return {
    macroF1: metrics.macroF1 >= MACRO_F1_GATE,
    autoPrecision: metrics.autoPrecision >= AUTO_PRECISION_GATE,
  };
}

function metricsTable(title: string, metrics: Metrics, gateF1: boolean): string {
  const gate = gatePasses(metrics);
  return [
    `### ${title}`,
    "",
    "| Metric | Value | Gate |",
    "| --- | --- | --- |",
    `| Macro-F1 (10 categories) | ${metrics.macroF1.toFixed(3)} | ${gateF1 ? `≥ ${MACRO_F1_GATE} ${pass(gate.macroF1)}` : "reported"} |`,
    `| Precision of automatic changes | ${pct(metrics.autoPrecision)} (${metrics.autoCorrect}/${metrics.autoApplied}) | ≥ ${pct(AUTO_PRECISION_GATE)} ${pass(gate.autoPrecision)} |`,
    `| Automatic coverage (labelled changes applied automatically) | ${pct(metrics.autoCoverage)} | — |`,
    `| Category accuracy | ${pct(metrics.accuracy)} | — |`,
    `| Application link accuracy | ${pct(metrics.linkAccuracy)} | — |`,
    `| Suggested status accuracy | ${pct(metrics.statusAccuracy)} | — |`,
    `| Company / role extraction | ${pct(metrics.companyAccuracy)} / ${pct(metrics.roleAccuracy)} | — |`,
    `| Date recall (± 1 min) | ${pct(metrics.dateRecall)} | — |`,
    `| Dropped by the pre-filter: job mail / not job | ${metrics.candidatesDropped.jobMail} / ${metrics.candidatesDropped.notJob} | — |`,
    `| Model cost | $${(metrics.costMicroUsd / 1e6).toFixed(4)} | — |`,
    "",
    "| Category | Support | Precision | Recall | F1 |",
    "| --- | --- | --- | --- | --- |",
    ...MailCategorySchema.options.map((category) => {
      const row = metrics.perCategory[category];
      return `| ${category} | ${row.support} | ${row.precision.toFixed(2)} | ${row.recall.toFixed(2)} | ${row.f1.toFixed(2)} |`;
    }),
    "",
  ].join("\n");
}

function errorsTable(results: readonly CaseResult[]): string {
  const rows = results.filter(
    (r) => !r.categoryOk || !r.linkOk || !r.statusOk || (r.analysis.decision.autoApply && !autoCorrect(r)),
  );
  if (rows.length === 0) return "No errors.\n";
  return [
    "| Case | Expected (category · application · status) | Got | Auto | Hard case |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((r) => {
      const e = r.testCase.expected;
      const a = r.analysis;
      return `| ${r.testCase.id} | ${e.category} · ${e.applicationId ?? "—"} · ${e.suggestedStatus ?? "—"} | ${a.category} (${a.confidence.toFixed(2)}) · ${a.link.applicationId ?? "—"} [${a.link.linkStrength}] · ${a.decision.suggestedStatus ?? "—"} | ${a.decision.autoApply ? (autoCorrect(r) ? "✓" : "✗ wrong") : ""} | ${(r.testCase.hard ?? "").replace(/\|/gu, "/")} |`;
    }),
    "",
  ].join("\n");
}

export function renderReport(input: {
  model: string;
  promptVersion: string;
  date: string;
  ai: { metrics: Metrics; results: readonly CaseResult[] } | null;
  rules: { metrics: Metrics; results: readonly CaseResult[] };
}): string {
  const { ai, rules } = input;
  const languages = (lang: string) => rules.results.filter((r) => r.testCase.language === lang).length;
  const hard = rules.results.filter((r) => r.testCase.hard !== null).length;
  return [
    "# Mail classification eval",
    "",
    `- Date: ${input.date}; model \`${input.model}\`; prompt \`${input.promptVersion}\`; auto-apply threshold 0.9 with a strong link (thread or company + role).`,
    `- Fixtures: ${rules.results.length} messages (EN ${languages("en")}, TR ${languages("tr")}, DE ${languages("de")}), ${hard} hard cases; every category covered. Synthetic and template-shaped mail with fictional parties (\`eval/mail/fixtures/\`).`,
    "- CI (`pnpm --filter @bfhr/ai test`) replays the recorded model replies through the current pipeline and fails below the gates; a changed prompt invalidates the recording. Live run: `pnpm --filter @bfhr/ai eval:mail`.",
    "",
    ...(ai === null ? [] : [metricsTable("AI on (model + rules cross-check)", ai.metrics, true)]),
    metricsTable("AI off (rules only; the default until the user allows AI for mail)", rules.metrics, false),
    ...(ai === null ? [] : ["## Errors with AI on", "", errorsTable(ai.results)]),
    "## Errors with rules only",
    "",
    errorsTable(rules.results),
  ].join("\n");
}

/** Report of the deterministic job-alert and interview-time eval (`eval/mail/report-alerts.md`). */
export function renderAlertsReport(input: {
  date: string;
  alerts: { metrics: AlertMetrics; results: readonly AlertCaseResult[] };
  invites: { metrics: InviteMetrics; results: readonly InviteCaseResult[] };
  heldOut: { cases: number; correct: number; wrong: string[]; none: string[] };
}): string {
  const { alerts, invites, heldOut } = input;
  const count = (rows: readonly { testCase: { language: string } }[], lang: string) =>
    rows.filter((row) => row.testCase.language === lang).length;
  const boards = [...new Set(alerts.results.map((r) => r.testCase.board))].join(", ");
  const alertErrors = alerts.results.filter((r) => r.wrong.length > 0 || r.missed.length > 0);
  const inviteErrors = invites.results.filter(
    (r) => !(r.startOk && r.timezoneOk && r.durationOk && r.meetingUrlOk),
  );
  return [
    "# Job-alert and interview-time eval",
    "",
    `- Date: ${input.date}. Deterministic (no model): \`parseJobAlert\` and \`interviewSuggestionFromMail\` in \`@bfhr/core\` (ADR 0012). CI: \`pnpm --filter @bfhr/ai test\` (\`alerts-gate.test.ts\`); report: \`pnpm --filter @bfhr/ai eval:mail-alerts\`.`,
    `- Alerts: ${alerts.results.length} emails (EN ${count(alerts.results, "en")}, TR ${count(alerts.results, "tr")}, DE ${count(alerts.results, "de")}; ${boards}), ${alerts.metrics.expected} labelled postings. Invites: ${invites.results.length} (EN ${count(invites.results, "en")}, TR ${count(invites.results, "tr")}, DE ${count(invites.results, "de")}), calendar parts and explicit times. Development set: written alongside the parsers.`,
    "",
    "## Postings",
    "",
    "| Metric | Value | Gate |",
    "| --- | --- | --- |",
    `| Recall (URL, title, company, location all right) | ${pct(alerts.metrics.recall)} (${alerts.metrics.correct}/${alerts.metrics.expected}) | ≥ ${pct(ALERT_RECALL_GATE)} ${pass(alerts.metrics.recall >= ALERT_RECALL_GATE)} |`,
    `| Precision | ${pct(alerts.metrics.precision)} (${alerts.metrics.correct}/${alerts.metrics.extracted}) | ≥ ${pct(ALERT_PRECISION_GATE)} ${pass(alerts.metrics.precision >= ALERT_PRECISION_GATE)} |`,
    `| Salary and posting date right (correct postings) | ${pct(alerts.metrics.detailAccuracy)} | — |`,
    "",
    alertErrors.length === 0
      ? "No posting errors.\n"
      : [
          "| Case | Wrong | Missed |",
          "| --- | --- | --- |",
          ...alertErrors.map(
            (r) =>
              `| ${r.testCase.id} | ${r.wrong.map((p) => `${p.title} · ${p.company}`).join("; ") || "—"} | ${r.missed.map((p) => `${p.title} · ${p.company}`).join("; ") || "—"} |`,
          ),
          "",
        ].join("\n"),
    "## Interview times",
    "",
    "| Metric | Value | Gate |",
    "| --- | --- | --- |",
    `| Start (± 1 min) | ${pct(invites.metrics.startAccuracy)} | ≥ ${pct(INTERVIEW_START_GATE)} ${pass(invites.metrics.startAccuracy >= INTERVIEW_START_GATE)} |`,
    `| Organizer zone | ${pct(invites.metrics.timezoneAccuracy)} | — |`,
    `| Duration | ${pct(invites.metrics.durationAccuracy)} | — |`,
    `| Meeting link | ${pct(invites.metrics.meetingUrlAccuracy)} | — |`,
    `| All fields | ${pct(invites.metrics.exact)} | — |`,
    `| Held out: classification-set invites with one labelled time (text only) | ${heldOut.correct}/${heldOut.cases} right; wrong: ${heldOut.wrong.join(", ") || "—"}; none: ${heldOut.none.join(", ") || "—"} | reported |`,
    "",
    inviteErrors.length === 0
      ? "No interview-time errors.\n"
      : [
          "| Case | Expected | Got |",
          "| --- | --- | --- |",
          ...inviteErrors.map(
            (r) =>
              `| ${r.testCase.id} | ${r.testCase.expected.startsAt} ${r.testCase.expected.timezone ?? "—"} ${r.testCase.expected.durationMinutes ?? "—"} min | ${r.suggestion === null ? "none" : `${r.suggestion.startsAt.toISOString()} ${r.suggestion.timezone ?? "—"} ${r.suggestion.durationMinutes ?? "—"} min`} |`,
          ),
          "",
        ].join("\n"),
  ].join("\n");
}
