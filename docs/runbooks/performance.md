# Performance budgets

The four budgets in [BRIEF §9](../BRIEF.md#9-quality-bar-and-testing), how each one is measured, where CI enforces it, and how to re-run it.

## Results

| Budget                                            | Measured on                                                                 | Result                                                                                                                                                                      | Status                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Desktop cold start < 2.5 s (median of 5)          | CI `macos-latest`, `windows-latest`                                         | Not measured yet: run pending on PR #38                                                                                                                                     | Pending                                                                                                  |
| 60 fps scrolling, 5,000 jobs / 1,000 applications | Local, Playwright Chromium (M1 MacBook Pro on AC power, 2026-10-25, 3 runs) | Jobs, table and board: p95 frame time 16.7–16.8 ms, 0 dropped frames; p95 frame work ≤ 7.4 ms; no long tasks                                                                | Met                                                                                                      |
| Same, WebKit                                      | Local, Playwright WebKit (same machine and run)                             | Jobs p95 work 14 ms (3/2,886 frames dropped), table 4 ms (0 dropped), board 6 ms (2/1,956 dropped); p95 frame time 18 ms against a measured 17–18 ms refresh; no long tasks | Met. Earlier on battery, Low Power Mode held WebKit at 30 Hz (table p95 work 35 ms); measure on AC power |
| iOS launch to interactive < 2 s                   | Simulator (stands in for a recent iPhone)                                   | Not measured yet                                                                                                                                                            | Pending                                                                                                  |
| Incremental sync of 3 mail accounts < 30 s        | CI `ubuntu-latest`, emulators (no local JDK)                                | Not measured yet: run pending on PR #38                                                                                                                                     | Pending                                                                                                  |

Fixes made because of these measurements:

- The Jobs list is virtualized. Before the change it rendered all 5,000 rows: 377 of 377 frames were dropped in WebKit, and Chromium logged a 65 ms long task.
- The rows of the Tracker table are memoized. Before the change, every scroll event re-rendered every visible row.

## How each one is measured

### Desktop cold start

Run `pnpm --filter @bfhr/desktop perf:cold-start [--runs 5] [--budget-scale 1]` against the test build, with the emulators running.

1. `e2e/perf/session.e2e.ts` signs in a fresh account on the Auth emulator and seeds the populated fixtures' tracker and jobs. Today then shows them once.
2. `scripts/perf-cold-start.ts` launches the binary once to warm up, then `--runs` more times. Each run is timed from spawn until the app prints `bfhr-perf today-interactive`. The app prints that line after Today's data is painted and the main thread is free (`src/lib/perf.ts` → `src-tauri/src/perf.rs`, test builds only). The app then quits.
3. The run passes when the median is under 2.5 s. The script writes `artifacts/perf/desktop-cold-start-<platform>.json`.

Locally, run `scripts/with-emulators.sh pnpm perf:cold-start`. The Firestore emulator needs Java, so this only works on CI. To check the plumbing without emulators, run `pnpm build:e2e:design && node scripts/perf-cold-start.ts`: the design build opens on Today with fixture data.

CI runs this as desktop.yml › "Cold-start budget" on both runners, with no slack factor yet.

### Scrolling

Run `pnpm --filter @bfhr/desktop perf:scroll [--engines webkit,chromium] [--surfaces jobs,table,board] [--runs 3] [--budget-scale 1] [--reuse-build]`.

The harness builds the design build with production React, then opens three screens on `?fixture=scaled`: Jobs, Tracker › Table and Tracker › Board. That fixture is `scaledDataset()` in `@bfhr/fixtures`, with 5,000 jobs and 1,000 applications in the memory stores. On each screen, the harness scrolls the largest scroll container to the end and back at 3,000 px/s from `requestAnimationFrame` and records:

- **Frame time:** the rAF delta.
- **Frame work:** time from the frame's timestamp until a task posted in the frame runs.
- **Long tasks:** Chromium reports them through the `longtask` API. WebKit has no such API, so a frame whose work exceeds 50 ms counts as one.

A screen passes when:

- its p95 frame time is at most 16.7 ms plus 0.5 ms of jitter;
- it has no long task over 50 ms.

When the page refreshes slower than 60 Hz, p95 frame work of at most 16.7 ms replaces the frame-time check. This happens when macOS Low Power Mode throttles WebKit to 30 Hz.

The harness writes `artifacts/perf/desktop-scroll.json`. CI runs it as desktop.yml › "Scrolling budget": WebKit on macOS, Chromium on Windows.

### iOS launch and scrolling

Run `apps/ios/scripts/with-ios-lock.sh apps/ios/scripts/perf.sh [--device "iPhone 17 Pro"] [--only launch|scroll] [--budget-scale 1]`, with `BFHR_DERIVED_DATA` set to the shared DerivedData.

This runs `BruteForceHRUITests/PerformanceTests`, which has three tests:

- **`testLaunchToInteractive`:** `XCTApplicationLaunchMetric(waitUntilResponsive: true)` over 5 launches of the signed-in design state: `-BFHRDesign populated -BFHRScreen today`.
- **`testScrollJobsFeed` and `testScrollTrackerBoard`:** `XCTOSSignpostMetric.scrollingAndDecelerationMetric` on `-BFHRDesign scaled`, the Swift port of the scaled dataset.

`scripts/perf-report.ts` then reads the result bundle and checks two budgets. Both are medians:

- launch under 2 s;
- hitch time ratio under 5 ms/s.

It writes `artifacts/perf/ios.json`. CI runs it as ios.yml › "Performance budgets (simulator)".

The simulator runs on the Mac's CPU and GPU, so it is a proxy for a recent iPhone, not a measurement of one. Design mode exists only in Debug builds, so these numbers are conservative.

### Incremental mail sync

The test is `apps/functions/src/mail/emulator/sync-budget.emulator.test.ts`. It runs in `pnpm --filter @bfhr/functions test:emulator`, which is the CI `rules` job.

Setup:

- Three IMAP accounts, each on its own in-process server.
- Each mailbox holds 2,000 inbox messages spread over a year, 150 spam and 300 sent.
- The account tracks 1,000 applications.

The test then runs 3 rounds of new mail. Each round delivers, per account, 30 inbox messages and 3 spam messages. Of the inbox messages, 5 are about applications; the rest are everyday mail.

Each round is timed the way `mailPoll` and `mailSyncTask` run it: list the accounts, then sync each one to completion, one after another. Classification is rules only. Each round must finish in under 30 s. The test writes `artifacts/perf/mail-sync.json`.
