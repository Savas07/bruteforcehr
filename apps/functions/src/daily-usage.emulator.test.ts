// Daily limits (docs/runbooks/limits.md) against the Firestore emulator: per-user counters, the
// project-wide ceiling and the AI ledger that uses both.
import { DAILY_COST_CAP_MICRO_USD, DailyCapError } from "@bfhr/ai";
import { serverOnlyPaths } from "@bfhr/api";
import { getFirestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { firestoreUsageLedger } from "./ai/usage-ledger";
import { PROJECT_DAILY_LIMITS, projectCounter, takeDaily, utcDayKey } from "./daily-usage";
import { clearFirestore } from "./mail/emulator/helpers";

const NOW = new Date("2026-10-24T10:00:00Z");
const DAY = utcDayKey(NOW);

const count = async (path: string, field: string) =>
  (await getFirestore().doc(path).get()).get(field) as number | undefined;

beforeEach(async () => {
  await clearFirestore();
});

describe("takeDaily", () => {
  const counters = (uid: string) =>
    [
      {
        name: "user" as const,
        path: serverOnlyPaths.renderDay(uid, DAY),
        field: "count",
        amount: 1,
        limit: 2,
      },
      projectCounter("project" as const, "renders", DAY),
    ] as const;

  it("counts per user and refuses past the user's limit without touching the project count", async () => {
    expect(await takeDaily(counters("u1"), DAY)).toBeNull();
    expect(await takeDaily(counters("u1"), DAY)).toBeNull();
    expect(await takeDaily(counters("u1"), DAY)).toBe("user");
    expect(await count(serverOnlyPaths.renderDay("u1", DAY), "count")).toBe(2);
    expect(await count(serverOnlyPaths.projectUsageDay(DAY), "renders")).toBe(2);
    // Other users keep their own allowance.
    expect(await takeDaily(counters("u2"), DAY)).toBeNull();
    const day = await getFirestore().doc(serverOnlyPaths.renderDay("u1", DAY)).get();
    expect(day.get("expireAt").toMillis()).toBe(Date.parse("2026-11-28T00:00:00Z"));
  });

  it("refuses everyone once the project-wide ceiling is reached", async () => {
    await getFirestore()
      .doc(serverOnlyPaths.projectUsageDay(DAY))
      .set({ renders: PROJECT_DAILY_LIMITS.renders });
    expect(await takeDaily(counters("u3"), DAY)).toBe("project");
    expect(await count(serverOnlyPaths.renderDay("u3", DAY), "count")).toBeUndefined();
  });
});

describe("firestoreUsageLedger", () => {
  it("reserves and settles against the user's cap and the project ceiling", async () => {
    const ledger = firestoreUsageLedger("u1", NOW);
    await ledger.reserve(100_000);
    await ledger.settle(100_000, 40_000);
    expect(await count(serverOnlyPaths.aiUsageDay("u1", DAY), "microUsd")).toBe(40_000);
    expect(await count(serverOnlyPaths.aiUsageDay("u1", DAY), "requests")).toBe(1);
    expect(await count(serverOnlyPaths.projectUsageDay(DAY), "aiMicroUsd")).toBe(40_000);

    await expect(ledger.reserve(DAILY_COST_CAP_MICRO_USD)).rejects.toMatchObject({ scope: "user" });
  });

  it("refuses with scope project when all users together reached the ceiling", async () => {
    await getFirestore()
      .doc(serverOnlyPaths.projectUsageDay(DAY))
      .set({ aiMicroUsd: PROJECT_DAILY_LIMITS.aiMicroUsd - 1_000 });
    const refusal = await firestoreUsageLedger("u2", NOW)
      .reserve(5_000)
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(DailyCapError);
    expect(refusal).toMatchObject({ scope: "project" });
    expect(await count(serverOnlyPaths.aiUsageDay("u2", DAY), "microUsd")).toBeUndefined();
  });
});
