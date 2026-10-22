import { useSyncExternalStore } from "react";

/**
 * CV-editor-only window-width breaks that `useBreakpoints()` doesn't cover (IA.md CVs row):
 * the CV list collapses to icons below 1280 px, and the inspector docks beside the preview only
 * when all four panes fit (sidebar 232 + list 264 + editor ≥ 520 + preview ≥ 520 + inspector 340).
 */
const QUERIES = {
  listIcons: "(max-width: 1279.98px)",
  inspectorDocked: "(min-width: 1880px)",
} as const;

export type CvWidthQuery = keyof typeof QUERIES;

export function useWindowQuery(query: CvWidthQuery): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(QUERIES[query]);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => matchMedia(QUERIES[query]).matches,
  );
}
