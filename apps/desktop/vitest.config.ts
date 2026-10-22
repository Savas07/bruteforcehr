import { defineConfig } from "vitest/config";

/** Unit tests: view-model builders and keyboard logic (no Tauri, no browser). */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
