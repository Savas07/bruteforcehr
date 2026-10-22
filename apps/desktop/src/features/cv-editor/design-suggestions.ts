/**
 * Design build only: pending AI suggestions on the fixture CV (`cv-en`), so the critique can see
 * tracked changes, a placeholder that blocks "Use suggestion", and the Suggestions tab. Imported
 * only by `Screen.tsx`, which only the design build reaches (src/design glob); production never
 * bundles it. Real suggestions come from the AI service in M2 (data model: ADR 0002 follow-up).
 */
import type { CvSuggestionInput } from "./suggestions";

export const designSuggestions: readonly CvSuggestionInput[] = [
  {
    id: "design-suggestion-shorten",
    cvId: "cv-en",
    target: { sectionKey: "work", itemId: "work-0", bulletIndex: 2 },
    mode: "shorten",
    proposed: "Introduced Playwright visual tests that caught 40+ regressions before release in Q1.",
  },
  {
    id: "design-suggestion-result",
    cvId: "cv-en",
    target: { sectionKey: "work", itemId: "work-1", bulletIndex: 0 },
    mode: "addResult",
    proposed: "Built a React Native driver app used by 3,500 drivers daily, cutting delivery check-in time by [X%].",
  },
  {
    id: "design-suggestion-verb",
    cvId: "cv-en",
    target: { sectionKey: "work", itemId: "work-2", bulletIndex: 0 },
    mode: "strongerVerb",
    proposed: "Raised the Lighthouse accessibility score of customer-facing booking forms to 98.",
  },
];
