import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Modes:
 * - default / `production`: the app (`pnpm build`, `tauri build`).
 * - `e2e`: adds the WebdriverIO bridge (`pnpm build:e2e`, src/main.tsx).
 * - `design`: the M0 design prototypes driven by @bfhr/fixtures (`pnpm dev:design`, src/design/).
 *   Opens in a plain browser for the capture harness (`pnpm capture:design`).
 * - `design-e2e`: design + the WebdriverIO bridge, for real-app captures (`pnpm build:e2e:design`).
 *
 * `__BFHR_DESIGN__` / `__BFHR_E2E__` are compile-time constants, so production bundles drop the
 * design code and fixtures entirely (`pnpm check:bundle` proves it).
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: {
    __BFHR_DESIGN__: JSON.stringify(mode === "design" || mode === "design-e2e"),
    __BFHR_E2E__: JSON.stringify(mode === "e2e" || mode === "design-e2e"),
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // WKWebView on macOS 13 (Safari 16) and WebView2 (evergreen Chromium).
    target: ["safari16", "chrome120"],
    sourcemap: false,
  },
}));
