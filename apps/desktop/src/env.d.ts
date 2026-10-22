/** Compile-time build flags (vite.config.ts `define`). */
/** Design build (`--mode design` / `design-e2e`): fixture-driven M0 prototypes. */
declare const __BFHR_DESIGN__: boolean;
/** Test build (`--mode e2e` / `design-e2e`): loads the WebdriverIO bridge. */
declare const __BFHR_E2E__: boolean;
