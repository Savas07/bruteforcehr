/**
 * The cold-start budget's starting point (scripts/perf-cold-start.ts, docs/runbooks/performance.md):
 * a fresh account signed in on the Auth emulator, with the populated fixtures' tracker and jobs in
 * the Firestore emulator, and Today showing them once. The session (IndexedDB) and Firestore's
 * offline cache stay in the app's data folder for the launches the script times.
 *
 * Then, on that live data: the screens hold still while idle. For 10 s on Jobs, Today and the
 * Tracker board, after their data has loaded, no node in <main> may be removed (a listener
 * re-delivering unchanged data must not remount rows); text and attribute changes are counted
 * (relative times may tick). Writes artifacts/perf/desktop-idle-<platform>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { populatedDataset } from "@bfhr/fixtures";
import { $, browser, expect } from "@wdio/globals";
import { repoRoot } from "../capture/helpers";
import { ensureSignedIn, ensureSignedOut, expectHeading, testEmail } from "../support/auth";
import { signedInUid, writeDoc } from "../support/seed";

const IDLE_MS = 10_000;
/** The collections Today reads (tracker, interviews, jobs and their matches). */
const COLLECTIONS = [
  "applications",
  "applicationEvents",
  "interviews",
  "contacts",
  "jobs",
  "jobMatches",
] as const satisfies readonly (keyof typeof populatedDataset)[];

describe("cold-start session", () => {
  it("leaves a signed-in account with data on Today", async () => {
    // A fresh account on this run's emulators (a restored session may belong to an earlier step's).
    await ensureSignedOut();
    await ensureSignedIn(testEmail("perf"));
    const uid = await signedInUid();
    for (const collection of COLLECTIONS) {
      const docs: readonly { readonly id: string }[] = populatedDataset[collection];
      for (let start = 0; start < docs.length; start += 10)
        await Promise.all(
          docs
            .slice(start, start + 10)
            .map((doc) => writeDoc(`users/${uid}/${collection}/${doc.id}`, { ...doc })),
        );
    }
    await expectHeading("Today");
    // The attention list or the agenda shows the seeded applications.
    await $("main li").waitForExist({ timeout: 20_000, timeoutMsg: "Today showed none of the seeded data" });
    await browser.pause(1_000);
  });

  it("holds Jobs, Today and the Tracker board still while idle", async () => {
    const screens = [
      { name: "jobs", hash: "#/jobs", heading: "Jobs" },
      { name: "today", hash: "#/today", heading: "Today" },
      { name: "tracker-board", hash: "#/tracker?view=board", heading: "Tracker" },
    ] as const;
    const results: Record<string, { added: number; removed: number; text: number; attributes: number }> = {};
    for (const screen of screens) {
      await browser.execute((hash) => {
        location.hash = hash;
      }, screen.hash);
      await expectHeading(screen.heading, 20_000);
      await $("main li").waitForExist({ timeout: 20_000, timeoutMsg: `${screen.name} showed no data` });
      // Let the listeners settle (cache first, then the server's snapshot).
      await browser.pause(3_000);
      results[screen.name] = await browser.executeAsync(
        (
          idleMs: number,
          done: (counts: { added: number; removed: number; text: number; attributes: number }) => void,
        ) => {
          const counts = { added: 0, removed: 0, text: 0, attributes: 0 };
          const observer = new MutationObserver((records) => {
            for (const record of records) {
              if (record.type === "childList") {
                counts.added += record.addedNodes.length;
                counts.removed += record.removedNodes.length;
              } else if (record.type === "characterData") counts.text += 1;
              else counts.attributes += 1;
            }
          });
          observer.observe(document.querySelector("main") ?? document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });
          setTimeout(() => {
            observer.disconnect();
            done(counts);
          }, idleMs);
        },
        IDLE_MS,
      );
      console.log(`idle ${screen.name}: ${JSON.stringify(results[screen.name])}`);
    }
    const platform =
      process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
    const output = path.join(repoRoot, `artifacts/perf/desktop-idle-${platform}.json`);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify({ idleMs: IDLE_MS, screens: results }, null, 2)}\n`);
    for (const screen of screens) expect(results[screen.name]?.removed).toBe(0);
  });
});
