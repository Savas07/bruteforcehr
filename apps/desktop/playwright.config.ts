import { defineConfig } from "@playwright/test";

/** Electron smoke tests against the electron-vite build in out/ (no browser downloads needed). */
export default defineConfig({
  testDir: "tests",
  // Run output (traces, failure screenshots) goes to the gitignored artifacts/ folder.
  outputDir: "../../artifacts/playwright/desktop",
  timeout: 30_000,
  workers: 1,
  reporter: process.env["CI"] ? "github" : "list",
});
