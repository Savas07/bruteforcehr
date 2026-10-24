/**
 * Installs the recorded Apply AI answers (recordedData.ts) in the E2E app: E2E builds answer a
 * callable from `window.__BFHR_E2E_CALLABLES__` when it names it (src/data/jobs/firestore.ts).
 */
import { browser } from "@wdio/globals";
import { RECORDED_COVER_LETTER, RECORDED_CV_TAILOR } from "./recordedData";

export { APPLY_CV_CONTENT } from "./recordedData";

/** Installs the recorded answers in the app (until the next reload). */
export async function useRecordedCallables(): Promise<void> {
  await browser.execute(
    (tailor, letter) => {
      Object.assign(window, { __BFHR_E2E_CALLABLES__: { cvTailor: tailor, coverLetterDraft: letter } });
    },
    RECORDED_CV_TAILOR,
    RECORDED_COVER_LETTER,
  );
}
