/**
 * The cold-start budget's starting point (scripts/perf-cold-start.ts, docs/runbooks/performance.md):
 * a fresh account signed in on the Auth emulator, with the populated fixtures' tracker and jobs in
 * the Firestore emulator, and Today showing them once. The session (IndexedDB) and Firestore's
 * offline cache stay in the app's data folder for the launches the script times.
 */
import { populatedDataset } from "@bfhr/fixtures";
import { $, browser } from "@wdio/globals";
import { ensureSignedIn, ensureSignedOut, expectHeading, testEmail } from "../support/auth";
import { signedInUid, writeDoc } from "../support/seed";

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
});
