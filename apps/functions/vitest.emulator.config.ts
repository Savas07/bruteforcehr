import { defineConfig } from "vitest/config";

/** Mail engine and account data (export, delete) against the Auth, Firestore and Storage emulators (`pnpm test:emulator`, CI job `rules`). */
export default defineConfig({
  define: { __BFHR_VERSION__: JSON.stringify("test") },
  test: {
    include: ["src/**/*.emulator.test.ts"],
    setupFiles: ["src/mail/emulator/setup.ts"],
    // The files share the emulators of one `firebase emulators:exec` run and clear them between tests.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
