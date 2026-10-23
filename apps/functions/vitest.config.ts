import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  define: { __BFHR_VERSION__: JSON.stringify("test") },
  test: {
    // Emulator integration tests need Java: `pnpm test:emulator` runs them (CI job `rules`).
    exclude: [...configDefaults.exclude, "**/*.emulator.test.ts"],
  },
});
