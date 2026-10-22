import { describe, expect, it } from "vitest";
import { createAppIntl } from "./intl";
import { resolveAppLocale } from "./locale";

describe("resolveAppLocale", () => {
  it("uses the OS tag when its language is supported", () => {
    expect(resolveAppLocale(["tr-TR", "en-US"])).toEqual({ language: "tr", locale: "tr-TR" });
    expect(resolveAppLocale(["de_AT"])).toEqual({ language: "de", locale: "de-AT" });
  });

  it("falls through unsupported or invalid tags, then to English", () => {
    expect(resolveAppLocale([null, "fr-FR", "de"])).toEqual({ language: "de", locale: "de-DE" });
    expect(resolveAppLocale(["not a tag", "nl-NL"])).toEqual({ language: "en", locale: "en-GB" });
  });
});

describe("createAppIntl", () => {
  it("falls back to the English message when a translation is missing", () => {
    const intl = createAppIntl({ language: "de", locale: "de-DE" });
    expect(intl.formatMessage({ id: "test.missing", defaultMessage: "Fallback {n}" }, { n: 2 })).toBe(
      "Fallback 2",
    );
  });
});
