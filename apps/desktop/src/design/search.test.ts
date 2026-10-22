import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { createAppIntl } from "../i18n/intl";
import { resolveAppLocale } from "../i18n/locale";
import { clockTime } from "../shared/model/format";
import { fixtureContext } from "../shared/model/fixture-context";
import { CAPTURE_PIN, designHash } from "./matrix";
import { readDesignParams } from "./search";

describe("readDesignParams locale and time zone pin", () => {
  it("reads ?locale= and ?tz= and keeps them out of the screen's params", () => {
    const params = readDesignParams({ locale: "de-at", tz: "America/New_York", folder: "updates" });
    expect(params.locale).toBe("de-AT");
    expect(params.tz).toBe("America/New_York");
    expect(params.rest).toEqual({ folder: "updates" });
  });

  it("ignores invalid or missing values (the OS locale and persona zone apply)", () => {
    expect(readDesignParams({ locale: "not a locale", tz: "Mars/Olympus" })).toMatchObject({
      locale: null,
      tz: null,
    });
    expect(readDesignParams({})).toMatchObject({ locale: null, tz: null });
  });

  it("is what every capture route carries", () => {
    const search = Object.fromEntries(
      new URLSearchParams(designHash("today", "populated", CAPTURE_PIN).split("?")[1]),
    );
    expect(readDesignParams(search)).toMatchObject({ locale: "en-GB", tz: "Europe/Istanbul" });
  });
});

describe("a pinned context", () => {
  const meetingAt = new Date("2026-10-22T12:00:00Z");
  const pinnedFor = (osLocale: string, osZone: string) => {
    // What DesignRoot / DesignScreen do: the pin wins over the machine's locale and zone.
    const params = readDesignParams({ locale: CAPTURE_PIN.locale, tz: CAPTURE_PIN.tz });
    const intl = createAppIntl(resolveAppLocale([params.locale ?? osLocale]));
    return fixtureContext(populatedDataset, [], intl, params.tz ?? osZone);
  };

  it("formats the same text on a US Windows runner and a Turkish Mac", () => {
    const windows = pinnedFor("en-US", "America/Los_Angeles");
    const mac = pinnedFor("tr-TR", "Europe/Istanbul");
    expect(clockTime(meetingAt, windows)).toBe("15:00");
    expect(clockTime(meetingAt, mac)).toBe(clockTime(meetingAt, windows));
  });

  it("follows ?tz= over the persona's zone", () => {
    const intl = createAppIntl({ language: "en", locale: "en-GB" });
    expect(clockTime(meetingAt, fixtureContext(populatedDataset, [], intl, "UTC"))).toBe("12:00");
  });
});
