import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { DEFAULT_LOCALE, LOCALES, SITE_URL } from "./src/site.ts";

// Static output only: Firebase Hosting serves `dist/`; `/api/**` and `/connect/**` are rewrites in the root firebase.json.
export default defineConfig({
  site: SITE_URL,
  output: "static",
  outDir: "./dist",
  trailingSlash: "ignore",
  build: { format: "directory" },
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
    // No inlined scripts or assets: the Hosting CSP (firebase.json) allows same-origin files only.
    build: { assetsInlineLimit: 0 },
    // The User guide reads its keyboard shortcuts from the desktop app's source (src/guide/shortcuts.ts).
    define: {
      __BFHR_DESKTOP_SRC__: JSON.stringify(fileURLToPath(new URL("../desktop/src", import.meta.url))),
    },
  },
});
