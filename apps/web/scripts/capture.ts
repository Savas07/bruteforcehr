/**
 * Captures website routes for design critique (docs/BRIEF.md §5.5): every route at 375, 768 and 1440 px
 * wide, in light and dark, as full-page PNGs → `artifacts/screens/web/<route>-<theme>-<width>.png`
 * (repo root; gitignored).
 *
 * Serves the built site from `dist/` with Astro's preview server, so run the build first:
 *   pnpm --filter @bfhr/web build
 *   pnpm --filter @bfhr/web capture [route ...] [--channel chrome|msedge|chromium]
 *
 * Routes default to `/`. `--channel` defaults to `chrome` (the installed Google Chrome, no browser
 * download); `chromium` needs `pnpm --filter @bfhr/web exec playwright install chromium` once.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { preview } from "astro";
import { chromium } from "playwright";

const VIEWPORTS = [
  { width: 375, height: 812, isMobile: true },
  { width: 768, height: 1024, isMobile: true },
  { width: 1440, height: 900, isMobile: false },
] as const;
const THEMES = ["light", "dark"] as const;

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(appRoot, "../..");
const outDir = path.join(repoRoot, "artifacts", "screens", "web");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { channel: { type: "string", default: "chrome" } },
});
const routes = positionals.length > 0 ? positionals : ["/"];

/** `/` → `index`, `/legal/privacy/` → `legal-privacy`. */
function routeSlug(route: string): string {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "index" : trimmed.replaceAll("/", "-");
}

function freePort(): Promise<number> {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    if (address === null || typeof address === "string") {
      reject(new Error("Could not determine a free port"));
      return;
    }
    probe.close(() => resolve(address.port));
  });
  return promise;
}

if (!existsSync(path.join(appRoot, "dist", "index.html"))) {
  throw new Error("apps/web/dist is missing: run `pnpm --filter @bfhr/web build` first.");
}

await mkdir(outDir, { recursive: true });
const port = await freePort();
const server = await preview({ root: appRoot, logLevel: "warn", server: { host: "127.0.0.1", port } });
const browser = await chromium.launch({ channel: values.channel });

try {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        colorScheme: theme,
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      for (const route of routes) {
        const url = new URL(route, `http://127.0.0.1:${port}`).href;
        const response = await page.goto(url, { waitUntil: "networkidle" });
        if (response === null || !response.ok()) {
          throw new Error(`${url} responded ${response?.status() ?? "without a response"}`);
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          // Lazy images load only near the viewport: step through the page so the full-page capture has them.
          for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
            window.scrollTo(0, y);
            const { promise, resolve } = Promise.withResolvers<undefined>();
            setTimeout(resolve, 50);
            await promise;
          }
          window.scrollTo(0, 0);
          // Hidden lazy images (e.g. a breakpoint's extra screenshot) never load, so their decode() never settles.
          const shown = [...document.images].filter((image) => image.checkVisibility());
          await Promise.all(shown.map((image) => image.decode().catch(() => undefined)));
        });
        const file = path.join(outDir, `${routeSlug(route)}-${theme}-${viewport.width}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
        console.log(path.relative(repoRoot, file));
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
