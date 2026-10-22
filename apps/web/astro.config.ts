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
  },
});
