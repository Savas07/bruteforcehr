import { describe, expect, it } from "vitest";
import { compareVersions, isBelowMinimum } from "./version";

describe("compareVersions", () => {
  it("orders by major, minor and patch numerically", () => {
    expect(compareVersions("0.1.0", "0.1.1")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "10.0.0")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("puts a pre-release before its release (semver §11)", () => {
    expect(compareVersions("1.0.0-beta.2", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-beta.2")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBe(-1);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
    expect(compareVersions("1.0.0-rc.1", "1.0.0-beta.11")).toBe(1);
  });

  it("refuses invalid versions", () => {
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
    expect(compareVersions("1.0.0", "v1.0.0")).toBeNull();
    expect(compareVersions("01.0.0", "1.0.0")).toBeNull();
  });
});

describe("isBelowMinimum", () => {
  it("blocks only a valid version below a valid minimum", () => {
    expect(isBelowMinimum("0.1.0", "0.2.0")).toBe(true);
    expect(isBelowMinimum("0.2.0-beta.1", "0.2.0")).toBe(true);
    expect(isBelowMinimum("0.2.0", "0.2.0")).toBe(false);
    expect(isBelowMinimum("0.3.0", "0.2.0")).toBe(false);
    expect(isBelowMinimum("0.1.0", "garbage")).toBe(false);
  });
});
