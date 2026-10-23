/**
 * The contract between a core screen's view and whatever feeds it. A screen is
 * `src/features/<screen>/Screen.tsx` with a default export taking `ScreenProps<Model>`, where
 * `Model` is what `src/features/<screen>/model.ts` builds. Design builds feed it fixtures
 * (src/design/); later milestones feed it Firestore snapshots through the same props.
 */
import type { Loadable } from "./model/types";

export interface ScreenProps<Model> {
  readonly model: Loadable<Model>;
  /** Route params of the matched path, e.g. `{ jobId }` on `/jobs/$jobId`. */
  readonly params: Readonly<Record<string, string | undefined>>;
}

/** The core screens (M0's five plus Insights), also the `src/features/<id>` folder names. */
export const screenIds = [
  "today",
  "job-detail",
  "cv-editor",
  "tracker-board",
  "mail-review",
  "insights",
] as const;
export type ScreenId = (typeof screenIds)[number];
