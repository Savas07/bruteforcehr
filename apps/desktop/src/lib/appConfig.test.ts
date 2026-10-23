import { describe, expect, it } from "vitest";
import { parseVersionRequirement } from "./appConfig";

describe("parseVersionRequirement", () => {
  it("reads the minimum and the download page", () => {
    expect(
      parseVersionRequirement({
        minSupportedVersion: "0.2.0",
        downloadUrl: "https://bruteforcehr.web.app/download",
        latestVersion: "0.2.1",
      }),
    ).toEqual({ minSupportedVersion: "0.2.0", downloadUrl: "https://bruteforcehr.web.app/download" });
  });

  it("never blocks on a missing document or minimum", () => {
    expect(parseVersionRequirement(undefined)).toBeNull();
    expect(parseVersionRequirement({ latestVersion: "0.2.0" })).toBeNull();
    expect(parseVersionRequirement({ minSupportedVersion: "two" })).toBeNull();
  });

  it("keeps the gate when only the download page is unusable", () => {
    expect(parseVersionRequirement({ minSupportedVersion: "0.2.0", downloadUrl: "not a url" })).toEqual({
      minSupportedVersion: "0.2.0",
      downloadUrl: null,
    });
  });
});
