import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri loads the dev server from build.devUrl (src-tauri/tauri.conf.json) and the built files
// from build.frontendDist. Mode `e2e` (pnpm build:e2e) adds the WebdriverIO bridge (src/main.tsx).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
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
});
