import type { AccountExportResponse } from "@bfhr/core";
import { describe, expect, it, vi } from "vitest";
import { REAUTH_IDLE } from "../../auth/session";
import type { AccountDataBackend } from "./backend";
import { matchesConfirmWord } from "./confirmWord";
import { DELETE_START, deleteBlockerOf, DeleteFlow, reauthPanelOf } from "./deleteFlow";
import { deleteFailureOf, exportFailureOf } from "./errors";
import { ExportFlow, fileNameOf } from "./exportFlow";

const NOW = Date.parse("2026-10-24T08:00:00Z");
const created: AccountExportResponse = {
  exportId: "e1",
  storagePath: "users/u1/exports/e1.bfhr-export.zip",
  fileName: "BruteForceHR-export-2026-10-24.zip",
  sizeBytes: 1234,
  documentCount: 10,
  fileCount: 2,
  createdAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
};
const reasoned = (reason: string) => Object.assign(new Error(reason), { details: { reason } });

function backend(overrides: Partial<AccountDataBackend> = {}): AccountDataBackend {
  return {
    createExport: async () => created,
    downloadExport: async () => new Uint8Array([1, 2]),
    saveExport: async (_bytes, fileName) => `/Users/deniz/Downloads/${fileName}`,
    authTimeSeconds: async () => NOW / 1000 - 30,
    deleteAccount: async () => undefined,
    now: () => NOW,
    ...overrides,
  };
}

describe("matchesConfirmWord", () => {
  it("ignores case and surrounding spaces", () => {
    expect(matchesConfirmWord(" delete ", "DELETE", "en")).toBe(true);
    expect(matchesConfirmWord("DELET", "DELETE", "en")).toBe(false);
    expect(matchesConfirmWord("", "DELETE", "en")).toBe(false);
  });
  it("accepts every Turkish spelling of SİL", () => {
    for (const typed of ["SİL", "SIL", "sil", "sıl", "Sil"])
      expect(matchesConfirmWord(typed, "SİL", "tr"), typed).toBe(true);
  });
  it("keeps umlauts distinct", () => {
    expect(matchesConfirmWord("löschen", "LÖSCHEN", "de")).toBe(true);
    expect(matchesConfirmWord("LOSCHEN", "LÖSCHEN", "de")).toBe(false);
  });
});

describe("error reasons", () => {
  it("maps export refusals and treats everything else as generic", () => {
    expect(exportFailureOf(reasoned("export_too_soon"))).toBe("too-soon");
    expect(exportFailureOf(reasoned("export_daily_limit"))).toBe("daily-limit");
    expect(exportFailureOf(reasoned("export_too_large"))).toBe("too-large");
    expect(exportFailureOf(reasoned("email_unverified"))).toBe("generic");
    expect(exportFailureOf(new Error("network"))).toBe("generic");
  });
  it("asks for re-authentication only on recent_sign_in_required", () => {
    expect(deleteFailureOf(reasoned("recent_sign_in_required"))).toBe("reauth");
    expect(deleteFailureOf(new Error("x"))).toBe("generic");
  });
});

describe("ExportFlow", () => {
  it("creates, then saves under the chosen name", async () => {
    const flow = new ExportFlow(backend());
    await flow.create();
    expect(flow.getSnapshot()).toMatchObject({ status: "ready", export: created, save: { status: "idle" } });
    await flow.save();
    expect(flow.getSnapshot()).toMatchObject({ save: { status: "saved", fileName: created.fileName } });
  });
  it("shows the refusal and stays idle", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = new ExportFlow(backend({ createExport: () => Promise.reject(reasoned("export_too_soon")) }));
    await flow.create();
    expect(flow.getSnapshot()).toEqual({ status: "idle", failure: "too-soon" });
  });
  it("a cancelled Save dialog changes nothing; a failed download says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cancelled = new ExportFlow(backend({ saveExport: async () => null }));
    await cancelled.create();
    await cancelled.save();
    expect(cancelled.getSnapshot()).toMatchObject({ save: { status: "idle" } });
    const failing = new ExportFlow(backend({ downloadExport: () => Promise.reject(new Error("403")) }));
    await failing.create();
    await failing.save();
    expect(failing.getSnapshot()).toMatchObject({ save: { status: "failed" } });
  });
  it("drops the ready card once the export expired", async () => {
    let now = NOW;
    const flow = new ExportFlow(backend({ now: () => now }));
    await flow.create();
    flow.expire();
    expect(flow.getSnapshot().status).toBe("ready");
    now = Date.parse(created.expiresAt);
    flow.expire();
    expect(flow.getSnapshot()).toEqual({ status: "idle", failure: null });
  });
  it("reads the file name from macOS and Windows paths", () => {
    expect(fileNameOf("/Users/d/a.zip")).toBe("a.zip");
    expect(fileNameOf("C:\\Users\\d\\b.zip")).toBe("b.zip");
  });
});

describe("DeleteFlow", () => {
  it("deletes with a recent sign-in and hands over to sign-out", async () => {
    const onDeleted = vi.fn();
    const flow = new DeleteFlow(backend(), { onDeleted, onSignInTooOld: vi.fn() });
    flow.type("DELETE");
    await flow.submit();
    expect(onDeleted).toHaveBeenCalledOnce();
  });
  it("asks for a fresh sign-in when auth_time is old, without calling the server", async () => {
    const deleteAccount = vi.fn(async () => undefined);
    const onSignInTooOld = vi.fn();
    const flow = new DeleteFlow(backend({ authTimeSeconds: async () => NOW / 1000 - 600, deleteAccount }), {
      onDeleted: vi.fn(),
      onSignInTooOld,
    });
    await flow.submit();
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(onSignInTooOld).toHaveBeenCalledOnce();
    expect(flow.getSnapshot()).toMatchObject({ recentSignIn: false, phase: "confirm" });
    expect(reauthPanelOf(flow.getSnapshot(), REAUTH_IDLE)).toEqual({ step: "needed" });
  });
  it("turns the server's recent_sign_in_required into the re-authentication step", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = new DeleteFlow(
      backend({ deleteAccount: () => Promise.reject(reasoned("recent_sign_in_required")) }),
      { onDeleted: vi.fn(), onSignInTooOld: vi.fn() },
    );
    await flow.submit();
    expect(flow.getSnapshot()).toMatchObject({ recentSignIn: false, phase: "confirm" });
  });
  it("fails calmly on other errors so the user can retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const flow = new DeleteFlow(backend({ deleteAccount: () => Promise.reject(new Error("unavailable")) }), {
      onDeleted: vi.fn(),
      onSignInTooOld: vi.fn(),
    });
    await flow.submit();
    expect(flow.getSnapshot().phase).toBe("failed");
  });
  it("blocks Delete everything until online, typed and recently signed in", () => {
    const view = { ...DELETE_START, typed: "DELETE", recentSignIn: false };
    expect(deleteBlockerOf(view, REAUTH_IDLE, { online: false, wordMatches: true })).toBe("offline");
    expect(deleteBlockerOf(view, REAUTH_IDLE, { online: true, wordMatches: false })).toBe("type-word");
    expect(deleteBlockerOf(view, REAUTH_IDLE, { online: true, wordMatches: true })).toBe("reauth");
    expect(
      deleteBlockerOf(view, { step: "done", email: "d@x.io" }, { online: true, wordMatches: true }),
    ).toBeNull();
  });
});
