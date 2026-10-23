/**
 * Job-alert and interview-time eval (docs/adr/0012-mail-sync.md): deterministic, no model or key.
 *
 *   pnpm --filter @bfhr/ai eval:mail-alerts
 *
 * Scores `parseJobAlert` and `interviewSuggestionFromMail` on eval/mail/fixtures/{alerts,invites}.ts
 * and writes eval/mail/report-alerts.md. The CI gate is alerts-gate.test.ts.
 */
import { writeFile } from "node:fs/promises";
import { renderAlertsReport } from "./report";
import {
  ALERT_CASES,
  computeAlertMetrics,
  computeInviteMetrics,
  heldOutInviteCheck,
  INVITE_CASES,
  scoreAlertCase,
  scoreInviteCase,
} from "./score";

const alertResults = ALERT_CASES.map(scoreAlertCase);
const inviteResults = INVITE_CASES.map(scoreInviteCase);
const alerts = { metrics: computeAlertMetrics(alertResults), results: alertResults };
const invites = { metrics: computeInviteMetrics(inviteResults), results: inviteResults };
const heldOut = heldOutInviteCheck();
await writeFile(
  new URL("report-alerts.md", import.meta.url),
  renderAlertsReport({ date: new Date().toISOString().slice(0, 10), alerts, invites, heldOut }),
);
console.log(
  `postings: recall ${(alerts.metrics.recall * 100).toFixed(1)} %, precision ${(alerts.metrics.precision * 100).toFixed(1)} %; interviews: start ${(invites.metrics.startAccuracy * 100).toFixed(1)} %, all fields ${(invites.metrics.exact * 100).toFixed(1)} %; held out ${heldOut.correct}/${heldOut.cases}`,
);
console.log("wrote eval/mail/report-alerts.md");
