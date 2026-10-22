import { describe, expect, it } from "vitest";
import { OTP_LOCALES, renderCodeEmail, resolveLocale } from "../src/otp/messages";

describe("resolveLocale", () => {
  it.each([
    ["de-AT", "de"],
    ["TR", "tr"],
    ["en_GB", "en"],
    ["fr-FR", "en"],
    ["", "en"],
    [undefined, "en"],
  ])("%s → %s", (tag, locale) => {
    expect(resolveLocale(tag)).toBe(locale);
  });
});

describe("renderCodeEmail", () => {
  it.each(OTP_LOCALES)("%s: code and validity in text and HTML, never in the subject", (locale) => {
    const email = renderCodeEmail(locale, "042917", 10);
    expect(email.subject).not.toContain("042917");
    expect(email.subject).toContain("BruteForceHR");
    expect(email.text).toContain("042917");
    expect(email.text).toContain("10");
    expect(email.html).toContain(">042917<");
    expect(email.html).toContain(`lang="${locale}"`);
  });

  it("localizes the subject", () => {
    expect(OTP_LOCALES.map((locale) => renderCodeEmail(locale, "000000", 10).subject)).toEqual([
      "Your BruteForceHR sign-in code",
      "BruteForceHR giriş kodunuz",
      "Dein Anmeldecode für BruteForceHR",
    ]);
  });
});
