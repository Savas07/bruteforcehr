import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { contentSecurityPolicy, CSP_NONCE_PLACEHOLDER } from "./src/shared/csp";

/** Dev only: production CSP is a response header set by the app:// handler (src/main/origin.ts). */
function devContentSecurityPolicy(): Plugin {
  return {
    name: "bfhr:dev-csp",
    apply: "serve",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy({ dev: true }) },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ command }) => ({
  main: {
    // Bundle every runtime dependency so the packaged app ships no node_modules.
    build: { externalizeDeps: false },
  },
  preload: {
    // Sandboxed preloads must be a single CommonJS file that only requires "electron".
    build: {
      externalizeDeps: false,
      rolldownOptions: { output: { format: "cjs" } },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), devContentSecurityPolicy()],
    ...(command === "build" ? { html: { cspNonce: CSP_NONCE_PLACEHOLDER } } : {}),
  },
}));
