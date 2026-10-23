import { describe, expect, it } from "vitest";
import { findPlaceholders, hasUnfilledPlaceholders, wordDiff } from "./suggestions";

describe("placeholders", () => {
  it("finds [X%], [X] and [date] once each, in order", () => {
    expect(
      findPlaceholders("Cut costs by [X%] for [X] clients from [date]; again [X%] by [date]."),
    ).toEqual(["[X%]", "[X]", "[date]"]);
  });

  it("finds descriptive placeholders but not empty or unclosed brackets", () => {
    expect(findPlaceholders("Led a team of [team size].")).toEqual(["[team size]"]);
    expect(findPlaceholders("Shipped [] and [unclosed")).toEqual([]);
    expect(findPlaceholders("No facts missing here.")).toEqual([]);
  });

  it("keeps a placeholder and its trailing punctuation as one diff word", () => {
    expect(wordDiff("Grew sales.", "Grew sales by [X%].")).toEqual([
      { kind: "same", text: "Grew" },
      { kind: "del", text: "sales." },
      { kind: "ins", text: "sales by [X%]." },
    ]);
  });

  it("blocks use while any of [X%], [X], [date] is unfilled", () => {
    const placeholders = findPlaceholders("By [X%] for [X] since [date].");
    expect(hasUnfilledPlaceholders(placeholders, { "[X%]": "20%", "[X]": "40" })).toBe(true);
    expect(hasUnfilledPlaceholders(placeholders, { "[X%]": "20%", "[X]": "40", "[date]": "[date]" })).toBe(true);
    expect(hasUnfilledPlaceholders(placeholders, { "[X%]": "20%", "[X]": "40", "[date]": "2024" })).toBe(false);
  });
});
