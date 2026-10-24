/**
 * Recorded answers of the Apply AI callables (`cvTailor`, `coverLetterDraft`) for the CV the apply
 * spec seeds (`APPLY_CV_CONTENT`), in the shape the deployed functions return them
 * (`CvTailorResponseSchema`, `CoverLetterDraftResponseSchema`). E2E builds answer a callable from
 * `window.__BFHR_E2E_CALLABLES__` when it names it (src/data/jobs/firestore.ts), so the specs run
 * without a model or the Anthropic key.
 */
import { browser } from "@wdio/globals";

const HIGHLIGHTS = [
  "Led the rebuild of the design system (62 components, React + TypeScript), adopted by 7 product teams.",
  "Cut checkout Largest Contentful Paint from 3.9 s to 1.8 s through code splitting and image budgets.",
  "Introduced Playwright visual tests that caught 40+ regressions before release.",
];

/** The seeded CV's content (one job, one skill group). */
export const APPLY_CV_CONTENT = {
  basics: { name: "Deniz Aksoy", label: "Frontend Engineer", email: "deniz.aksoy@example.com", summary: "Frontend engineer building fast, accessible product UIs in React and TypeScript." },
  work: [{ name: "Pazarbox", position: "Frontend Engineer", startDate: "2022-03", highlights: HIGHLIGHTS }],
  skills: [{ name: "Frontend", keywords: ["React", "TypeScript", "Next.js"] }],
  meta: {
    template: "classic",
    theme: { accentColor: "#0f766e", fontPair: "inter-source-serif", density: "comfortable", paperSize: "a4" },
    sectionOrder: ["basics", "work", "skills"],
    customSections: [],
  },
};

export const RECORDED_CV_TAILOR = {
  edits: [
    {
      id: "e1",
      path: "/work/0/highlights/1",
      op: "replace",
      before: HIGHLIGHTS[1],
      after: "Made checkout faster: Largest Contentful Paint down from 3.9 s to 1.8 s through code splitting and image budgets.",
      order: null,
      reason: "Puts the performance result the job asks for first.",
      groundedIn: ["/work/0/highlights/1"],
    },
    {
      id: "e2",
      path: "/work/0/highlights",
      op: "reorder",
      before: HIGHLIGHTS.join(" · "),
      after: [HIGHLIGHTS[1], HIGHLIGHTS[0], HIGHLIGHTS[2]].join(" · "),
      order: [1, 0, 2],
      reason: "Leads with the performance work the posting mentions twice.",
      groundedIn: ["/work/0/highlights"],
    },
    {
      id: "e3",
      path: "/skills/0/keywords",
      op: "reorder",
      before: "React · TypeScript · Next.js",
      after: "TypeScript · React · Next.js",
      order: [1, 0, 2],
      reason: "TypeScript is the first requirement in the posting.",
      groundedIn: ["/skills/0/keywords"],
    },
  ],
  dropped: 1,
  model: "claude-sonnet-5-5",
  promptVersion: "cv-tailor@1",
};

export const RECORDED_COVER_LETTER = {
  subject: null,
  body: "Dear {hiring_manager},\n\nI'm applying for the Frontend Engineer position. At Pazarbox I led the design-system rebuild and cut checkout load times by more than half.\n\nKind regards,\nDeniz Aksoy",
  placeholders: [],
  unresolvedFields: ["hiring_manager"],
  droppedSentences: 1,
  model: "claude-sonnet-5-5",
  promptVersion: "cover-letter@1",
};

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
