import { appConfigs, emptyDataset, FIXTURE_NOW, populatedDataset } from "../src/index";

/** Bumped when the document layout changes (not when fixture values change). */
export const FIXTURE_DOCUMENTS_FORMAT = 1;

/**
 * Exported conformance documents by file name: each dataset plus the fixture clock and the public
 * `appConfig/{platform}` documents.
 */
export function conformanceDocuments() {
  const shared = { format: FIXTURE_DOCUMENTS_FORMAT, now: FIXTURE_NOW, appConfigs };
  return {
    populated: { ...shared, ...populatedDataset },
    empty: { ...shared, ...emptyDataset },
  };
}
