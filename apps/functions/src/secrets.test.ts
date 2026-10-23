import { defineSecret } from "firebase-functions/params";
import { afterEach, describe, expect, it } from "vitest";
import { secretOrNull, UNSET_SECRET } from "./secrets";

const SECRET = defineSecret("TEST_OPTIONAL_SECRET");

afterEach(() => {
  delete process.env["TEST_OPTIONAL_SECRET"];
});

describe("secretOrNull", () => {
  it("treats the `unset` sentinel and empty values as not configured", () => {
    process.env["TEST_OPTIONAL_SECRET"] = UNSET_SECRET;
    expect(secretOrNull(SECRET)).toBeNull();
    process.env["TEST_OPTIONAL_SECRET"] = "  unset\n";
    expect(secretOrNull(SECRET)).toBeNull();
    process.env["TEST_OPTIONAL_SECRET"] = "";
    expect(secretOrNull(SECRET)).toBeNull();
  });

  it("returns a real value trimmed", () => {
    process.env["TEST_OPTIONAL_SECRET"] = ' {"clientId":"id","clientSecret":"s"} ';
    expect(secretOrNull(SECRET)).toBe('{"clientId":"id","clientSecret":"s"}');
  });
});
