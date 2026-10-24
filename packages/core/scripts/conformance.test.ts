import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildApplyVectors } from "./apply-vectors";
import { buildInsightsVectors } from "./insights-vectors";
import { buildJobImportVectors } from "./job-import-vectors";
import { buildMailVectors } from "./mail-vectors";
import { buildStateMachineVectors } from "./state-machine-vectors";
import { renderSwiftModels } from "./swift-models";

// The Swift port is tested against committed outputs; regenerate with `pnpm --filter @bfhr/core conformance`.
describe("committed conformance outputs", () => {
  it("state-machine.json matches the TypeScript state machine", async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL("../conformance/state-machine.json", import.meta.url), "utf8"),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildStateMachineVectors())));
  });

  it("insights.json matches the TypeScript Insights metrics", async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL("../conformance/insights.json", import.meta.url), "utf8"),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildInsightsVectors())));
  });

  it("job-import.json matches the URL-import parsers", async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL("../conformance/job-import.json", import.meta.url), "utf8"),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildJobImportVectors())));
  });

  it("mail.json matches the mail presets and category targets", async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL("../conformance/mail.json", import.meta.url), "utf8"),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildMailVectors())));
  });

  it("apply.json matches the tailor, merge-field and answers logic", async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL("../conformance/apply.json", import.meta.url), "utf8"),
    );
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildApplyVectors())));
  });

  it("BFHRCore Models.swift matches the zod schemas", async () => {
    const committed = await readFile(
      new URL("../../swift/BFHRCore/Sources/BFHRCore/Models.swift", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(renderSwiftModels());
  });
});
