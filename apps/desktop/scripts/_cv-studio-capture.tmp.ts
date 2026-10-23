// Scratch (not committed): captures CV Studio surfaces the matrix harness doesn't reach.
// node scripts/_cv-studio-capture.tmp.ts [--surfaces a,b] [--engines webkit,chromium] [--themes light,dark]
//   [--sizes 1280x800,1920x1080] [--locale en|tr|de] [--axe]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page, webkit } from "playwright";
import { createServer } from "vite";

const appDir = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appDir, "../..");
const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
const surfaces = opt("surfaces", "gallery,history,conflict,export,ats,import").split(",");
const engineNames = opt("engines", "webkit,chromium").split(",") as ("webkit" | "chromium")[];
const themes = opt("themes", "light,dark").split(",") as ("light" | "dark")[];
const sizes = opt("sizes", "1280x800,1920x1080")
  .split(",")
  .map((size) => size.split("x").map(Number) as [number, number]);
const language = opt("locale", "en");
const locale = { en: "en-GB", tr: "tr-TR", de: "de-DE" }[language] ?? "en-GB";
const runAxe = args.includes("--axe");
const outRoot = path.join(repoRoot, "artifacts/screens/desktop/cv-studio-harness");
const axeRoot = path.join(repoRoot, "artifacts/a11y/desktop/cv-studio");

const engines = {
  webkit: { type: webkit, platform: "macos", launch: {} },
  chromium: { type: chromium, platform: "windows", launch: { ignoreDefaultArgs: ["--hide-scrollbars"] } },
} as const;

const server = await createServer({
  root: appDir,
  configFile: path.join(appDir, "vite.config.ts"),
  mode: "design",
  logLevel: "warn",
  server: { port: 5188, strictPort: false },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0] ?? "";

const importResponse = {
  resume: {
    basics: {
      name: "Deniz Aksoy",
      label: "Frontend Engineer",
      email: "deniz.aksoy@example.com",
      phone: "+90 532 555 01 47",
      url: "https://deniz.example.com",
      summary:
        "Frontend engineer with five years of experience building fast, accessible product UIs in React and TypeScript.",
      location: { city: "Istanbul", countryCode: "TR" },
    },
    work: [
      {
        name: "Pazarbox",
        position: "Frontend Engineer",
        startDate: "2022-03",
        highlights: [
          "Led the rebuild of the design system (62 components) used by 4 product teams.",
          "Introduced Playwright visual tests that caught 40+ regressions before release.",
        ],
      },
      {
        name: "Kuzey Labs",
        position: "Frontend Developer",
        startDate: "2020-02",
        endDate: "2022",
        highlights: ["Built a React Native driver app used by 3,500 drivers daily."],
      },
      { name: "Mavi Yazılım", position: "Junior Web Developer", startDate: "2019-07", endDate: "2020-01" },
    ],
    education: [{ institution: "Boğaziçi University", area: "Computer Engineering", studyType: "BSc", startDate: "2015", endDate: "2019" }],
    skills: [{ name: "Frontend", keywords: ["React", "TypeScript", "Next.js", "CSS"] }],
    languages: [
      { language: "Turkish", fluency: "Native" },
      { language: "English", fluency: "C1" },
    ],
  },
  confidence: {
    "/basics/name": 0.98,
    "/basics/phone": 0.62,
    "/work/0/startDate": 0.55,
    "/work/1/highlights": 0.6,
    "/work/2/endDate": 0.5,
    "/education/0/studyType": 0.58,
    "/skills/0/keywords": 0.92,
  },
  warnings: ["date_month_dropped:/work/1/endDate", "unmapped_section:Hobbies"],
  model: "claude-sonnet-4-5",
  promptVersion: "cv-import@1",
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-expose-headers": "*",
};

async function mockFirebase(page: Page, mode: "ok" | "slow" | "fail") {
  await page.route(/firebasestorage\.googleapis\.com/u, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify({
        name: "users/u/cv-imports/x",
        bucket: "bruteforcehr.firebasestorage.app",
        generation: "1",
        metageneration: "1",
        contentType: "application/pdf",
        size: "2048",
        timeCreated: "2026-10-23T10:00:00Z",
        updated: "2026-10-23T10:00:00Z",
        md5Hash: "x",
        downloadTokens: "t",
      }),
    });
  });
  await page.route(/cloudfunctions\.net\/cvImport/u, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 60_000));
    if (mode === "fail")
      return route.fulfill({
        status: 500,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ error: { status: "INTERNAL", message: "INTERNAL" } }),
      });
    return route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify({ result: importResponse }),
    });
  });
}

const written: string[] = [];
const summaries: string[] = [];
const failures: string[] = [];

async function snap(page: Page, dir: string, name: string, engine: string, theme: string, audit: boolean) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
  written.push(path.relative(repoRoot, file));
  if (runAxe && audit) {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const target = path.join(axeRoot, language);
    await mkdir(target, { recursive: true });
    const base = `${name.replace(/-\d+x\d+$/u, "")}-${engine}`;
    await writeFile(path.join(target, `${base}.json`), JSON.stringify(results, null, 2));
    const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const violation of results.violations) counts[violation.impact ?? "minor"] = (counts[violation.impact ?? "minor"] ?? 0) + violation.nodes.length;
    summaries.push(
      `a11y ${base}: ${counts.critical} critical · ${counts.serious} serious · ${counts.moderate} moderate · ${counts.minor} minor · ${results.incomplete.reduce((s, r) => s + r.nodes.length, 0)} needs review ${results.violations.map((v) => `${v.id}×${v.nodes.length}`).join(", ")}`,
    );
  }
}

function hash(fixture: string, platform: string, extra = "") {
  return `#/cvs?fixture=${fixture}&state=ready&platform=${platform}&locale=${locale}&tz=Europe%2FIstanbul${extra}`;
}

try {
  for (const engineName of engineNames) {
    const engine = engines[engineName];
    const browser = await engine.type.launch(engine.launch);
    const mod = engine.platform === "macos" ? "Meta" : "Control";
    try {
      for (const theme of themes) {
        for (const [width, height] of sizes) {
          const firstSize = width === sizes[0]?.[0];
          const suffix = `${theme}-${width}x${height}`;
          const dir = path.join(outRoot, engineName, language);
          await mkdir(dir, { recursive: true });
          const open = async (fixture = "populated", mock: "ok" | "slow" | "fail" | null = null) => {
            const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, locale, timezoneId: "Europe/Istanbul" });
            const page = await context.newPage();
            page.on("pageerror", (error) => failures.push(`${engineName}: ${error.message}`));
            if (mock) await mockFirebase(page, mock);
            await page.goto(`${baseUrl}${hash(fixture, engine.platform)}`);
            await page.waitForSelector('html[data-design-ready="true"]', { state: "attached" });
            await page.waitForTimeout(400);
            return page;
          };
          const openInspectorTab = async (page: Page, index: number) => {
            if ((await page.locator("aside[aria-label] [role=tab]").count()) === 0) await page.keyboard.press(`${mod}+Shift+D`);
            await page.locator("aside[aria-label] [role=tab]").nth(index).click();
            await page.waitForTimeout(300);
          };
          const expandSummary = async (page: Page) => {
            const textarea = page.locator('[data-section-key="summary"] textarea');
            if ((await textarea.count()) === 0) await page.locator('[data-section-key="summary"] h2 button').first().click();
            return textarea;
          };

          if (surfaces.includes("gallery")) {
            const page = await open();
            await openInspectorTab(page, 0);
            await snap(page, dir, `template-gallery-${suffix}`, engineName, theme, firstSize);
            await page.locator('aside input[type="radio"]').first().focus();
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(400);
            await snap(page, dir, `template-gallery-keyboard-${suffix}`, engineName, theme, false);
            await page.context().close();
          }
          if (surfaces.includes("history")) {
            const page = await open();
            await page.keyboard.press(`${mod}+Shift+H`);
            await page.waitForTimeout(400);
            await snap(page, dir, `history-${suffix}`, engineName, theme, firstSize);
            const restore = page.locator("aside li button:has(svg.lucide-rotate-ccw)").first();
            if ((await restore.count()) > 0) {
              await restore.click();
              await page.waitForSelector('[role="alertdialog"]');
              await snap(page, dir, `history-restore-confirm-${suffix}`, engineName, theme, firstSize);
              await page.keyboard.press("Escape");
              await page.waitForTimeout(200);
              const compare = page.locator("aside li").nth(1).locator("button").first();
              await compare.click();
              await page.waitForSelector('[role="dialog"]');
              await snap(page, dir, `history-compare-${suffix}`, engineName, theme, firstSize);
            }
            await page.context().close();
          }
          if (surfaces.includes("conflict")) {
            const page = await open();
            const textarea = await expandSummary(page);
            await textarea.click();
            await textarea.press(mod === "Meta" ? "Meta+ArrowDown" : "Control+End");
            await textarea.type(" Local change.");
            await page.evaluate(() => {
              const store = window.__bfhrCvStore;
              if (!store) throw new Error("no __bfhrCvStore");
              const data = store.data();
              const title = document.querySelector("h1")?.textContent ?? "";
              const cv = data.cvs.find((candidate) => candidate.title === title) ?? data.cvs[0];
              if (!cv) throw new Error("no cv");
              const revision = data.cvRevisions.find((candidate) => candidate.id === cv.currentRevisionId);
              if (!revision) throw new Error("no revision");
              const content = revision.content;
              store.simulateRemoteEdit(cv.id, {
                ...content,
                basics: { ...content.basics, summary: "Remote change from the laptop: frontend engineer focused on design systems." },
              });
            });
            await page.waitForTimeout(800);
            await snap(page, dir, `conflict-banner-${suffix}`, engineName, theme, firstSize);
            const compareButton = page.locator('header [role="alert"] button, header [role="status"] button, header button').filter({ hasText: /Compare|Karşılaştır|Vergleichen/u }).first();
            if ((await compareButton.count()) > 0) {
              await compareButton.click();
              await page.waitForSelector('[role="dialog"]');
              await snap(page, dir, `conflict-compare-${suffix}`, engineName, theme, firstSize);
            } else failures.push(`${engineName} ${suffix}: no conflict Compare button`);
            await page.context().close();
          }
          if (surfaces.includes("export")) {
            const page = await open();
            await page.keyboard.press(`${mod}+E`);
            await page.waitForSelector('[role="dialog"]');
            await page.locator('[role="dialog"] input:not([type])').fill("Acme");
            await snap(page, dir, `export-dialog-${suffix}`, engineName, theme, firstSize);
            await page.locator('[role="dialog"] button[type="submit"]').click();
            await page.waitForTimeout(800);
            await snap(page, dir, `export-failed-${suffix}`, engineName, theme, firstSize);
            await page.keyboard.press("Escape");
            const textarea = await expandSummary(page);
            await textarea.click();
            await textarea.press(mod === "Meta" ? "Meta+ArrowDown" : "Control+End");
            await textarea.type(" Cut load time by [X%].");
            await page.keyboard.press(`${mod}+E`);
            await page.waitForSelector('[role="dialog"]');
            await snap(page, dir, `export-placeholders-${suffix}`, engineName, theme, firstSize);
            await page.locator('[role="dialog"] [role="status"] button').first().click();
            await page.waitForTimeout(500);
            await snap(page, dir, `export-placeholder-located-${suffix}`, engineName, theme, false);
            await page.context().close();
          }
          if (surfaces.includes("ats")) {
            const page = await open();
            await openInspectorTab(page, 1);
            await snap(page, dir, `ats-check-idle-${suffix}`, engineName, theme, firstSize);
            await page.locator("aside textarea").fill(
              "Senior Frontend Engineer. You know React, TypeScript and GraphQL, write Playwright tests, care about accessibility (WCAG) and have led a design system. Experience with Storybook and CI/CD is a plus.",
            );
            await page.locator("aside section button").first().click();
            await page.waitForTimeout(1200);
            await snap(page, dir, `ats-check-run-${suffix}`, engineName, theme, firstSize);
            await page.context().close();
          }
          if (surfaces.includes("import")) {
            const pdf = { name: "Deniz_Aksoy_CV_2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%mock\n") };
            for (const mode of ["ok", "slow", "fail"] as const) {
              const page = await open("empty", mode);
              await page.locator("main li > button, li > button").first().click();
              await page.waitForSelector('[role="dialog"]');
              if (mode === "ok") await snap(page, dir, `import-pick-${suffix}`, engineName, theme, firstSize);
              await page.locator('[role="dialog"] input[type="file"]').setInputFiles(pdf);
              if (mode === "slow") {
                await page.waitForTimeout(1500);
                await snap(page, dir, `import-reading-${suffix}`, engineName, theme, firstSize);
              } else if (mode === "fail") {
                await page.waitForTimeout(2000);
                await snap(page, dir, `import-error-${suffix}`, engineName, theme, firstSize);
              } else {
                await page.waitForSelector('[role="dialog"] nav', { timeout: 15_000 }).catch(() => failures.push(`${engineName}: no review`));
                await page.waitForTimeout(400);
                await snap(page, dir, `import-review-${suffix}`, engineName, theme, firstSize);
                const next = page.locator('[role="dialog"] button:has(svg.lucide-arrow-down)');
                if ((await next.count()) > 0) {
                  await next.click();
                  await page.waitForTimeout(300);
                  await snap(page, dir, `import-review-next-${suffix}`, engineName, theme, false);
                }
                await page.locator('[role="dialog"] [aria-pressed]').first().click().catch(() => {});
                await page.waitForTimeout(300);
                await snap(page, dir, `import-review-flagged-${suffix}`, engineName, theme, false);
              }
              await page.context().close();
            }
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
console.log(written.join("\n"));
console.log(summaries.join("\n"));
if (failures.length > 0) console.error(`Failures:\n${[...new Set(failures)].join("\n")}`);
