import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { conformanceDocuments } from "./documents";

// The Swift port decodes committed copies; regenerate with `pnpm --filter @bfhr/fixtures conformance`.
describe("committed conformance documents", () => {
  for (const [name, document] of Object.entries(conformanceDocuments())) {
    it(`${name}.json matches the fixtures`, async () => {
      const committed: unknown = JSON.parse(
        await readFile(new URL(`../conformance/${name}.json`, import.meta.url), "utf8"),
      );
      expect(committed).toEqual(JSON.parse(JSON.stringify(document)));
    });
  }
});
