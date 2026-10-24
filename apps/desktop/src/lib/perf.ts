/**
 * Cold-start mark for the performance budget (docs/runbooks/performance.md): test builds
 * (`__BFHR_E2E__`) tell the app (`perf_mark`, src-tauri/src/perf.rs) when a screen is first
 * interactive, and scripts/perf-cold-start.ts times the launch up to that line. Production builds
 * compile this to nothing; plain browsers (the design harness) have no Tauri to tell.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export type PerfMark = "today-interactive";

const marked = new Set<PerfMark>();

/**
 * Marks `label` once per launch, after the frame showing it is painted and the main thread is
 * free again (a task after the next animation frame), i.e. when input would be handled.
 */
export function markInteractive(label: PerfMark): void {
  if (!__BFHR_E2E__ || !isTauri() || marked.has(label)) return;
  marked.add(label);
  requestAnimationFrame(() => setTimeout(() => void invoke("perf_mark", { label }).catch(() => undefined)));
}
