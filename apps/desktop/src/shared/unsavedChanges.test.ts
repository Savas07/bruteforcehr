import { describe, expect, it, vi } from "vitest";
import { registerUnsavedChanges, saveUnsavedChanges, unsavedChanges } from "./unsavedChanges";

describe("unsaved changes registry", () => {
  it("lists registered entries until they unregister", () => {
    const stop = registerUnsavedChanges({ label: "CV", save: () => Promise.resolve() });
    expect(unsavedChanges().map((entry) => entry.label)).toEqual(["CV"]);
    stop();
    stop();
    expect(unsavedChanges()).toEqual([]);
  });

  it("saves every entry and reports a failure", async () => {
    const first = vi.fn(() => Promise.resolve());
    const failing = vi.fn(() => Promise.reject(new Error("offline")));
    const stops = [
      registerUnsavedChanges({ label: "A", save: first }),
      registerUnsavedChanges({ label: "B", save: failing }),
    ];
    await expect(saveUnsavedChanges()).rejects.toThrow("offline");
    expect(first).toHaveBeenCalledOnce();
    expect(failing).toHaveBeenCalledOnce();
    for (const stop of stops) stop();
    await expect(saveUnsavedChanges()).resolves.toBeUndefined();
  });
});
