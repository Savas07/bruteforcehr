/**
 * Cold-start marks for the performance budget (docs/runbooks/performance.md): test builds
 * (`__BFHR_E2E__`) tell the app (`perf_mark`, src-tauri/src/perf.rs) when the UI reaches each
 * step, and scripts/perf-cold-start.ts times the launch up to `today-interactive` and prints the
 * breakdown. Production builds compile this to nothing; plain browsers (the design harness) have
 * no Tauri to tell.
 *
 * - `script-start`: the bundle has loaded and main.tsx runs;
 * - `shell`: the signed-in shell (sidebar) has rendered;
 * - `today-interactive`: Today's data is painted and the main thread is free again (a task after
 *   the next animation frame), i.e. input would be handled.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export type PerfMark = "script-start" | "shell" | "today-interactive";

const marked = new Set<PerfMark>();

/** Sends `label` once per launch; `afterPaint` waits for the next frame to be rendered first. */
export function markPerf(label: PerfMark, afterPaint = false): void {
  if (!__BFHR_E2E__ || !isTauri() || marked.has(label)) return;
  marked.add(label);
  const send = () => void invoke("perf_mark", { label }).catch(() => undefined);
  if (afterPaint) requestAnimationFrame(() => setTimeout(send));
  else send();
}
