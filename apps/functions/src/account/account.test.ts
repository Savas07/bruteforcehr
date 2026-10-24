import { readFileSync } from "node:fs";
import { ACCOUNT_EXPORT_SUFFIX, storagePaths } from "@bfhr/api";
import { ACCOUNT_EXPORT_LIMITS, isRecentSignIn } from "@bfhr/core";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { deleteAccount, uidHash } from "./delete";
import { toJson } from "./export";

function recorder() {
  const steps: string[] = [];
  const deps = {
    db: {
      doc: ((path: string) => ({ path })) as never,
      recursiveDelete: (async (ref: { path: string }) => {
        steps.push(`firestore:${ref.path}`);
      }) as never,
    },
    bucket: {
      deleteFiles: async (options: { prefix: string }) => {
        steps.push(`storage:${options.prefix}`);
      },
    },
    revokeMail: async (uid: string) => {
      steps.push(`revokeMail:${uid}`);
    },
  };
  return { steps, deps };
}

describe("deleteAccount", () => {
  it("revokes mail, deletes data, deletes the Auth user, then sweeps once more", async () => {
    const { steps, deps } = recorder();
    await deleteAccount(
      {
        ...deps,
        auth: {
          deleteUser: async (uid) => {
            steps.push(`auth:${uid}`);
          },
        },
      },
      "u1",
    );
    const authStep = steps.indexOf("auth:u1");
    expect(steps[0]).toBe("revokeMail:u1");
    expect(steps.slice(1, authStep)).toContain("firestore:users/u1");
    expect(steps.slice(1, authStep)).toContain("storage:users/u1/");
    expect(steps.slice(authStep + 1)).toContain("firestore:users/u1");
    expect(steps.at(-1)).toBe("storage:users/u1/");
  });

  it("treats an already deleted Auth user as done (idempotent)", async () => {
    const { deps } = recorder();
    await expect(
      deleteAccount(
        {
          ...deps,
          auth: {
            deleteUser: () =>
              Promise.reject(Object.assign(new Error("gone"), { code: "auth/user-not-found" })),
          },
        },
        "u1",
      ),
    ).resolves.toBeUndefined();
  });

  it("fails on other Auth errors, so the client can retry", async () => {
    const { deps } = recorder();
    await expect(
      deleteAccount({ ...deps, auth: { deleteUser: () => Promise.reject(new Error("unavailable")) } }, "u1"),
    ).rejects.toThrow("unavailable");
  });
});

describe("uidHash", () => {
  it("is stable, short and not the uid", () => {
    expect(uidHash("u1")).toBe(uidHash("u1"));
    expect(uidHash("u1")).toMatch(/^[a-f0-9]{16}$/);
    expect(uidHash("u1")).not.toContain("u1");
  });
});

describe("toJson", () => {
  it("writes timestamps as ISO, bytes as base64 and keeps nested values", () => {
    expect(
      toJson({
        at: Timestamp.fromDate(new Date("2026-10-24T08:00:00Z")),
        bytes: new Uint8Array([1, 2, 3]),
        nested: { list: [Timestamp.fromMillis(0), "x", null] },
      }),
    ).toEqual({
      at: "2026-10-24T08:00:00.000Z",
      bytes: "AQID",
      nested: { list: ["1970-01-01T00:00:00.000Z", "x", null] },
    });
  });
});

describe("isRecentSignIn", () => {
  const now = Date.parse("2026-10-24T08:00:00Z");
  it("accepts sign-ins up to 5 minutes old", () => {
    expect(isRecentSignIn(now / 1000 - 299, now)).toBe(true);
    expect(isRecentSignIn(now / 1000 - 300, now)).toBe(true);
    expect(isRecentSignIn(now / 1000 - 301, now)).toBe(false);
    // Small clock skew between Auth and the function is tolerated, a far-future claim is not.
    expect(isRecentSignIn(now / 1000 + 30, now)).toBe(true);
    expect(isRecentSignIn(now / 1000 + 3600, now)).toBe(false);
  });
});

describe("storage lifecycle rule", () => {
  it("deletes exports (and only exports) when they stop being available", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../../../firebase/storage.lifecycle.json", import.meta.url), "utf8"),
    ) as { rule: { action: { type: string }; condition: Record<string, unknown> }[] };
    expect(config.rule).toEqual([
      {
        action: { type: "Delete" },
        condition: {
          age: ACCOUNT_EXPORT_LIMITS.availableDays,
          matchesPrefix: ["users/"],
          matchesSuffix: [ACCOUNT_EXPORT_SUFFIX],
        },
      },
    ]);
    expect(storagePaths.accountExport("u1", "e1").endsWith(ACCOUNT_EXPORT_SUFFIX)).toBe(true);
    for (const path of [
      storagePaths.cvImport("u1", "f1"),
      storagePaths.renderedFile("u1", "f1"),
      storagePaths.cvPhoto("u1", "f1"),
      storagePaths.mailAttachment("u1", "f1"),
    ])
      expect(path.endsWith(ACCOUNT_EXPORT_SUFFIX)).toBe(false);
    expect(config.rule[0]?.condition["age"]).toBe(ACCOUNT_EXPORT_LIMITS.availableDays);
  });
});
