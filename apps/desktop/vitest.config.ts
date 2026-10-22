import { defineConfig } from "vitest/config";

/**
 * Unit tests: view-model builders, keyboard logic and DOM-level component checks (happy-dom per
 * file via `// @vitest-environment happy-dom`; no Tauri, no browser).
 */
export default defineConfig({
  // Production values of the build flags (vite.config.ts `define`).
  define: { __BFHR_DESIGN__: "false", __BFHR_E2E__: "false" },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
  },
});
