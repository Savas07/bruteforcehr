// Invite-only sign-up (docs/adr/0008-auth-email-link.md): the blocking function's handler against the
// allowlist in the Firestore emulator.
import { serverOnlyPaths } from "@bfhr/api";
import { isSignupNotAllowed } from "@bfhr/core";
import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { checkNewUser, signupAllowed } from "./block-password-sign-up";
import { clearFirestore } from "./mail/emulator/helpers";

const EMAIL_LINK = "providers/cloud.auth/eventTypes/user.beforeCreate:emailLink";
const PASSWORD = "providers/cloud.auth/eventTypes/user.beforeCreate:password";

/** Runs the handler for a new account; resolves to the thrown error or null. */
async function create(email: string, eventType = EMAIL_LINK, emailVerified = true): Promise<unknown> {
  return checkNewUser({ eventType, data: { email, emailVerified } }).then(
    () => null,
    (error: unknown) => error,
  );
}

beforeEach(async () => {
  await clearFirestore();
});

describe("signupAllowed", () => {
  const list = { allowedEmails: [" Owner@Example.com "], allowedDomains: ["@team.example"] };
  it.each([
    ["owner@example.com", true],
    ["OWNER@EXAMPLE.COM", true],
    ["someone@team.example", true],
    ["someone@sub.team.example", false],
    ["owner+x@example.com", false],
    ["other@example.com", false],
    ["@team.example", false],
    ["team.example", false],
  ])("%s → %s", (email, allowed) => {
    expect(signupAllowed(email, list)).toBe(allowed);
  });
  it("allows nobody without an email", () => {
    expect(signupAllowed(undefined, list)).toBe(false);
  });
});

describe("checkNewUser (blockPasswordSignUp)", () => {
  it("refuses everyone while the allowlist is missing (fail closed)", async () => {
    const error = await create("owner@example.com");
    expect(error).toMatchObject({ code: "permission-denied" });
    expect(isSignupNotAllowed(error)).toBe(true);
  });

  it("lets allowed addresses and domains create an account, case-insensitively", async () => {
    await getFirestore()
      .doc(serverOnlyPaths.signupConfig())
      .set({ allowedEmails: ["owner@example.com"], allowedDomains: ["team.example"] });
    expect(await create("Owner@Example.com")).toBeNull();
    expect(await create("someone@TEAM.example")).toBeNull();
    const refused = await create("stranger@example.org");
    expect(isSignupNotAllowed(refused)).toBe(true);
    expect(String((refused as Error).message)).toContain("invite-only");
  });

  it("still refuses unverified password sign-ups, even for allowed addresses", async () => {
    await getFirestore()
      .doc(serverOnlyPaths.signupConfig())
      .set({ allowedEmails: ["owner@example.com"] });
    const error = await create("owner@example.com", PASSWORD, false);
    expect(error).toMatchObject({ code: "permission-denied" });
    expect(isSignupNotAllowed(error)).toBe(false);
  });
});
