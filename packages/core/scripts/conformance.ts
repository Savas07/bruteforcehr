// Writes the Swift conformance inputs derived from @bfhr/core:
// - conformance/state-machine.json (vectors the BFHRCore tests replay)
// - conformance/insights.json (Insights metrics vectors)
// - conformance/job-import.json (`jobImportUrl` responses from recorded pages)
// - conformance/mail.json (IMAP presets, preset detection, category → status targets)
// - conformance/apply.json (tailor edits, merge fields, answers kit)
// - packages/swift/BFHRCore/Sources/BFHRCore/Models.swift (Codable models from the zod schemas)
// `scripts/conformance.test.ts` fails when the committed files are stale.
import { writeFile } from "node:fs/promises";
import { buildApplyVectors } from "./apply-vectors";
import { buildInsightsVectors } from "./insights-vectors";
import { buildJobImportVectors } from "./job-import-vectors";
import { buildMailVectors } from "./mail-vectors";
import { buildStateMachineVectors } from "./state-machine-vectors";
import { renderSwiftModels } from "./swift-models";

/** Objects expand; every array element is one compact line, so the file stays small and diffable. */
function lineJson(value: unknown, indent = ""): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => inner + JSON.stringify(item)).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${lineJson(item, inner)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

await writeFile(
  new URL("../conformance/state-machine.json", import.meta.url),
  `${lineJson(buildStateMachineVectors())}\n`,
);
await writeFile(
  new URL("../conformance/insights.json", import.meta.url),
  `${lineJson(buildInsightsVectors())}\n`,
);
await writeFile(
  new URL("../conformance/job-import.json", import.meta.url),
  `${lineJson(buildJobImportVectors())}\n`,
);
await writeFile(new URL("../conformance/mail.json", import.meta.url), `${lineJson(buildMailVectors())}\n`);
await writeFile(new URL("../conformance/apply.json", import.meta.url), `${lineJson(buildApplyVectors())}\n`);
await writeFile(
  new URL("../../swift/BFHRCore/Sources/BFHRCore/Models.swift", import.meta.url),
  renderSwiftModels(),
);
console.log(
  "core: wrote conformance/{state-machine,insights,job-import,mail,apply}.json and swift/BFHRCore/Sources/BFHRCore/Models.swift",
);
