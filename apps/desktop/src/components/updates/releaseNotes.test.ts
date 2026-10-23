import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./releaseNotes";

describe("parseReleaseNotes", () => {
  it("turns Changesets markdown into headings, lists and paragraphs", () => {
    const notes = `### Patch Changes

- 3f9c2ab: Checks for **updates** every six hours.
- 8d41e07: Fixes [drag and drop](https://github.com/x/y/pull/1) on
  Windows.

Thanks for testing \`0.1.1\`.`;
    expect(parseReleaseNotes(notes)).toEqual([
      { kind: "heading", text: "Patch Changes" },
      {
        kind: "list",
        items: ["Checks for updates every six hours.", "Fixes drag and drop on Windows."],
      },
      { kind: "paragraph", text: "Thanks for testing 0.1.1." },
    ]);
  });

  it("never passes markup through", () => {
    const [block] = parseReleaseNotes("<img src=x onerror=alert(1)> plain");
    expect(block).toEqual({ kind: "paragraph", text: "<img src=x onerror=alert(1)> plain" });
  });

  it("handles empty notes", () => {
    expect(parseReleaseNotes("\n\n")).toEqual([]);
  });
});
