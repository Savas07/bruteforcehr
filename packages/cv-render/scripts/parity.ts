// Print-engine parity (docs/adr/0009-cv-rendering.md, "Parity plan"). Prints the fixed CV set of
// scripts/parity-cases.ts with three engines:
//   chromium — Playwright's headless Chromium (the ATS test path; WebView2 on Windows is Chromium),
//   webkit   — WKWebView + NSPrintOperation (scripts/webkit-print.swift; the macOS desktop and iOS path),
//   server   — the Cloud Functions renderer (scripts/parity-server.ts): PDFs from
//              BFHR_PARITY_SERVER_DIR (CI prints them on Linux with @sparticuz/chromium), else printed
//              here with chrome-headless-shell of the same version.
// Cross-engine gate (what a reader or an ATS sees; engines measure text up to ~0.1 % apart, so a line
// ending within ~0.5 pt of the edge may wrap differently and pixels can't match exactly):
//   1. the same page count;
//   2. every section heading and entry of `outline` starts on the same page;
//   3. the same extracted text (pdf.js), ignoring whitespace;
//   4. per page at most MAX_CROSS_ENGINE_RATIO of pixels differ (sanity bound; ratios reported).
// Same-engine regression gate: Chromium's PDFs against the committed baseline
// (test/parity-baseline/<case>.pdf) within MAX_BASELINE_RATIO, so template changes are caught.
// Update the baseline after an intended visual change: `pnpm --filter @bfhr/cv-render parity --update-baseline`.
// Pixels: one rasteriser (Quartz, scripts/pdf-raster.swift) at 150 dpi, a 2 × 3×3 box blur, 1-inch
// bands aligned within ±2 pt; failing pages and every cross-engine page get PNGs and a diff.
// macOS only. Output (gitignored): artifacts/cv-parity/ (report.md, report.json, <case>/…).
import { execFileSync } from "node:child_process";
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, crc32, deflateSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { CvRenderResult } from "../src/index";
import { PT_PER_MM } from "../src/themes";
import { launchChromium, printPdf } from "../test/pdf";
import { PARITY_CASES } from "./parity-cases";
import { printServerPdfs } from "./parity-server";

/** Raster resolution: 1 px = 0.48 pt. */
const DPI = 150;
/** Box blur radius (px) and passes: two passes ≈ a Gaussian of σ 1.2 px, which absorbs anti-aliasing. */
const BLUR_RADIUS = 1;
const BLUR_PASSES = 2;
/** A pixel differs when its blurred grey levels (0–255) differ by more than this. */
const PIXEL_THRESHOLD = 48;
/**
 * Engines snap baselines and line boxes to their own grids (Chromium: whole CSS px = 0.75 pt; WebKit
 * print: whole px = 0.8 pt, font ascent/descent rounded), so every 1-inch band may shift by up to
 * MAX_SHIFT_PT vertically and one pixel horizontally before pixels are compared.
 */
const BAND_PX = DPI;
const MAX_SHIFT_PT = 2;
const MAX_SHIFT_Y = Math.round((MAX_SHIFT_PT / 72) * DPI);
const MAX_SHIFT_X = 1;
/** Cross-engine sanity bound per page (10 %): a re-wrapped line stays well below, a missing block doesn't. */
const MAX_CROSS_ENGINE_RATIO = 0.1;
/** Same engine against its committed baseline, per page (1.5 %). */
const MAX_BASELINE_RATIO = 0.015;

const ENGINES = ["chromium", "webkit", "server"] as const;
type Engine = (typeof ENGINES)[number];
type Source = Engine | "baseline";
const PAIRS: readonly (readonly [Engine, Engine])[] = [
  ["chromium", "webkit"],
  ["chromium", "server"],
  ["webkit", "server"],
];

if (process.platform !== "darwin") {
  console.error("parity needs macOS (WebKit print and the Quartz rasteriser)");
  process.exit(2);
}
const updateBaseline = process.argv.includes("--update-baseline");
const baselineDir = fileURLToPath(new URL("../test/parity-baseline", import.meta.url));

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const out = join(repoRoot, "artifacts/cv-parity");
await rm(out, { recursive: true, force: true });
await mkdir(join(out, "bin"), { recursive: true });

const tool = (name: string): string => {
  const binary = join(out, "bin", name);
  execFileSync("swiftc", ["-O", fileURLToPath(new URL(`${name}.swift`, import.meta.url)), "-o", binary]);
  return binary;
};
const webkitPrint = tool("webkit-print");
const pdfRaster = tool("pdf-raster");

interface Case {
  readonly name: string;
  readonly dir: string;
  readonly result: CvRenderResult;
}

const cases: Case[] = [];
for (const { name, result } of PARITY_CASES) {
  const dir = join(out, name);
  await mkdir(dir);
  await writeFile(join(dir, "cv.html"), result.html);
  cases.push({ name, dir, result });
}

// 1. Print every case with each engine.
const browser = await launchChromium();
const versions: Record<Engine, string> = {
  chromium: `Playwright Chromium ${browser.version()}`,
  webkit: `WKWebView, macOS ${execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim()}`,
  server: "",
};
for (const item of cases) {
  await writeFile(join(item.dir, "chromium.pdf"), await printPdf(browser, item.result));
}
await browser.close();
if (updateBaseline) {
  await rm(baselineDir, { recursive: true, force: true });
  await mkdir(baselineDir, { recursive: true });
  for (const item of cases)
    await copyFile(join(item.dir, "chromium.pdf"), join(baselineDir, `${item.name}.pdf`));
  await writeFile(join(baselineDir, "VERSION"), `${versions.chromium}\n`);
}
for (const item of cases)
  await copyFile(join(baselineDir, `${item.name}.pdf`), join(item.dir, "baseline.pdf"));

for (const item of cases) {
  execFileSync(
    webkitPrint,
    [
      join(item.dir, "cv.html"),
      join(item.dir, "webkit.pdf"),
      String(item.result.page.widthPt),
      String(item.result.page.heightPt),
    ],
    { timeout: 60_000 },
  );
}

const serverDir = process.env["BFHR_PARITY_SERVER_DIR"]
  ? resolve(process.env["BFHR_PARITY_SERVER_DIR"])
  : join(out, "server");
versions.server = process.env["BFHR_PARITY_SERVER_DIR"]
  ? (await readFile(join(serverDir, "version.txt"), "utf8")).trim()
  : await printServerPdfs(serverDir);
for (const item of cases) {
  // The server HTML must be this HTML: a stale or foreign server set fails here, not as a pixel diff.
  if ((await readFile(join(serverDir, `${item.name}.html`), "utf8")) !== item.result.html) {
    throw new Error(`${serverDir}/${item.name}.html differs from this checkout's render`);
  }
  await copyFile(join(serverDir, `${item.name}.pdf`), join(item.dir, "server.pdf"));
}

// 2. Text: per-page text layer, where each outline item starts.
const squash = (text: string) => text.replace(/\s+/gu, "");

interface PageTexts {
  /** Per page: the text inside the page box (whitespace removed). */
  readonly pages: string[];
  /**
   * Text drawn below the page box's bottom margin. WebKit paints the top of the next page's first
   * block, clipped, into the foot of the page before (invisible, but in the text layer); reported,
   * not compared.
   */
  readonly outside: string[];
}

async function pageTexts(file: string, result: CvRenderResult): Promise<PageTexts> {
  const bottomPt = result.page.marginsMm.bottom * PT_PER_MM;
  const task = getDocument({
    data: new Uint8Array(await readFile(file)),
    useSystemFonts: false,
    verbosity: 0,
  });
  const document = await task.promise;
  const pages: string[] = [];
  const outside: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    let inside = "";
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      // transform[5]: baseline, from the bottom of the paper.
      if ((item.transform[5] as number) < bottomPt - 1) outside.push(`p${number}: ${item.str.trim()}`);
      else inside += item.str;
    }
    pages.push(squash(inside));
  }
  await task.destroy();
  return { pages, outside };
}

/** Page (1-based) on which each heading and entry of the outline starts, in outline order; 0 = not found. */
function outlinePages(result: CvRenderResult, pages: readonly string[]): number[] {
  const starts: number[] = [];
  let page = 0;
  let offset = 0;
  for (const section of result.outline) {
    for (const needle of [section.heading, ...section.entries].map(squash)) {
      let found = 0;
      for (let index = page; index < pages.length && found === 0; index += 1) {
        const at = (pages[index] ?? "").indexOf(needle, index === page ? offset : 0);
        if (at >= 0) {
          found = index + 1;
          page = index;
          offset = at + needle.length;
        }
      }
      starts.push(found);
    }
  }
  return starts;
}

// 3. Pixels.
interface Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

function blur({ width, height, pixels }: Raster): Raster {
  let current = pixels;
  const scratch = new Uint8Array(width * height);
  const span = 2 * BLUR_RADIUS + 1;
  for (let pass = 0; pass < BLUR_PASSES; pass += 1) {
    // Horizontal then vertical box filter; edges clamp.
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k += 1) {
          sum += current[row + Math.min(width - 1, Math.max(0, x + k))] ?? 255;
        }
        scratch[row + x] = Math.round(sum / span);
      }
    }
    const next = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k += 1) {
          sum += scratch[Math.min(height - 1, Math.max(0, y + k)) * width + x] ?? 255;
        }
        next[y * width + x] = Math.round(sum / span);
      }
    }
    current = next;
  }
  return { width, height, pixels: current };
}

/** The top-left `width` × `height` of a raster. */
function crop(raster: Raster, width: number, height: number): Raster {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    pixels.set(raster.pixels.subarray(y * raster.width, y * raster.width + width), y * width);
  }
  return { width, height, pixels };
}

interface PageComparison {
  readonly ratio: number;
  /** Largest vertical alignment any band needed, in pt. */
  readonly offsetPt: number;
  /** Per pixel: 1 = ink only in the left page, -1 = only in the right one (after alignment). */
  readonly mask: Int8Array;
}

/** Both rasters blurred and of the same size. */
function comparePage(left: Raster, right: Raster): PageComparison {
  const { width, height } = left;
  const mask = new Int8Array(width * height);
  const rightAt = (x: number, y: number) =>
    x < 0 || x >= width || y < 0 || y >= height ? 255 : (right.pixels[y * width + x] ?? 255);
  let differing = 0;
  let offset = 0;
  for (let y0 = 0; y0 < height; y0 += BAND_PX) {
    const y1 = Math.min(height, y0 + BAND_PX);
    // Search on every other pixel, then count every pixel at the best shift (smallest shift wins ties).
    let best = { dx: 0, dy: 0, count: Number.POSITIVE_INFINITY };
    for (let dy = -MAX_SHIFT_Y; dy <= MAX_SHIFT_Y; dy += 1) {
      for (let dx = -MAX_SHIFT_X; dx <= MAX_SHIFT_X; dx += 1) {
        let count = 0;
        for (let y = y0; y < y1; y += 2) {
          for (let x = 0; x < width; x += 2) {
            if (Math.abs((left.pixels[y * width + x] ?? 255) - rightAt(x + dx, y + dy)) > PIXEL_THRESHOLD) {
              count += 1;
            }
          }
        }
        const closer = Math.abs(dy) + Math.abs(dx) < Math.abs(best.dy) + Math.abs(best.dx);
        if (count < best.count || (count === best.count && closer)) best = { dx, dy, count };
      }
    }
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const delta = (left.pixels[y * width + x] ?? 255) - rightAt(x + best.dx, y + best.dy);
        if (Math.abs(delta) > PIXEL_THRESHOLD) {
          differing += 1;
          mask[y * width + x] = delta < 0 ? 1 : -1;
        }
      }
    }
    offset = Math.max(offset, Math.abs(best.dy));
  }
  return { ratio: differing / (width * height), offsetPt: (offset * 72) / DPI, mask };
}

/** Minimal PNG encoder (greyscale or RGB, 8 bit, no filtering). */
function png(width: number, height: number, channels: 1 | 3, pixels: Uint8Array): Buffer {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const framed = Buffer.alloc(typed.length + 8);
    framed.writeUInt32BE(data.length, 0);
    typed.copy(framed, 4);
    framed.writeUInt32BE(crc32(typed), typed.length + 4);
    return framed;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, channels === 1 ? 0 : 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: constants.Z_BEST_SPEED })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Both pages as printed, and the diff: a pale left page, red = ink only left, blue = ink only right. */
async function writeDiff(base: string, a: Source, b: Source, left: Raster, right: Raster, mask: Int8Array) {
  const { width, height } = left;
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const pale = 255 - Math.round((255 - (left.pixels[index] ?? 255)) * 0.25);
    const mark = mask[index];
    rgb.set(mark === 1 ? [220, 30, 30] : mark === -1 ? [30, 60, 220] : [pale, pale, pale], index * 3);
  }
  await writeFile(`${base}-${a}.png`, png(width, height, 1, left.pixels));
  await writeFile(`${base}-${b}.png`, png(width, height, 1, right.pixels));
  await writeFile(`${base}-diff-${a}-${b}.png`, png(width, height, 3, rgb));
}

async function rasterise(item: Case): Promise<Record<Source, Raster[]>> {
  const sources: readonly Source[] = [...ENGINES, "baseline"];
  const lines = execFileSync(
    pdfRaster,
    [String(DPI), item.dir, ...sources.map((source) => `${source}=${join(item.dir, `${source}.pdf`)}`)],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const rasters: Record<Source, Raster[]> = { chromium: [], webkit: [], server: [], baseline: [] };
  for (const line of lines) {
    const parsed = JSON.parse(line) as {
      name: Source;
      pages: { file: string; width: number; height: number }[];
    };
    for (const { file, width, height } of parsed.pages) {
      rasters[parsed.name].push({ width, height, pixels: new Uint8Array(await readFile(file)) });
      await rm(file);
    }
  }
  return rasters;
}

interface PixelResult {
  readonly pages: readonly [number, number];
  /** Per page: share of differing pixels and the largest band alignment (pt). */
  readonly ratios: readonly number[];
  readonly offsetsPt: readonly number[];
  readonly ok: boolean;
}

/** Pixel comparison of two page sequences; writes PNGs for failing pages (or every page with `always`). */
async function comparePixels(
  item: Case,
  rasters: Record<Source, Raster[]>,
  a: Source,
  b: Source,
  limit: number,
  always: boolean,
): Promise<PixelResult> {
  const ratios: number[] = [];
  const offsetsPt: number[] = [];
  const count = Math.min(rasters[a].length, rasters[b].length);
  for (let index = 0; index < count; index += 1) {
    const left = rasters[a][index] as Raster;
    const right = rasters[b][index] as Raster;
    // Chromium writes A4 as 594.96 × 841.92 pt (whole CSS px), WebKit as 595 × 842 pt: sizes may
    // differ by one raster px. More than that is a different paper size.
    if (Math.abs(left.width - right.width) > 1 || Math.abs(left.height - right.height) > 1) {
      ratios.push(1);
      offsetsPt.push(0);
      continue;
    }
    const width = Math.min(left.width, right.width);
    const height = Math.min(left.height, right.height);
    const leftPage = crop(left, width, height);
    const rightPage = crop(right, width, height);
    const { ratio, offsetPt, mask } = comparePage(blur(leftPage), blur(rightPage));
    if (always || ratio > limit)
      await writeDiff(join(item.dir, `p${index + 1}`), a, b, leftPage, rightPage, mask);
    ratios.push(ratio);
    offsetsPt.push(offsetPt);
  }
  const pages = [rasters[a].length, rasters[b].length] as const;
  return {
    pages,
    ratios,
    offsetsPt,
    ok: pages[0] > 0 && pages[0] === pages[1] && ratios.every((r) => r <= limit),
  };
}

interface PairResult {
  readonly pair: `${Engine}/${Engine}`;
  readonly samePageCount: boolean;
  /** Outline items (heading or entry) that start on different pages, or aren't found. */
  readonly outlineMismatches: readonly string[];
  readonly sameText: boolean;
  readonly pixels: PixelResult;
  readonly ok: boolean;
}
interface CaseResult {
  readonly name: string;
  readonly pages: Readonly<Record<Engine, number>>;
  readonly pairs: readonly PairResult[];
  readonly baseline: PixelResult;
  /** Text each engine drew outside the page box (see PageTexts.outside). */
  readonly outside: Readonly<Record<Engine, readonly string[]>>;
  readonly ok: boolean;
}

const results: CaseResult[] = [];
for (const item of cases) {
  const rasters = await rasterise(item);
  const extracted = {} as Record<Engine, PageTexts>;
  for (const engine of ENGINES)
    extracted[engine] = await pageTexts(join(item.dir, `${engine}.pdf`), item.result);
  const texts = {
    chromium: extracted.chromium.pages,
    webkit: extracted.webkit.pages,
    server: extracted.server.pages,
  };
  const labels = item.result.outline.flatMap((section) => [section.heading, ...section.entries]);
  const pairs: PairResult[] = [];
  for (const [a, b] of PAIRS) {
    const startsA = outlinePages(item.result, texts[a]);
    const startsB = outlinePages(item.result, texts[b]);
    const outlineMismatches = labels.filter(
      (_, index) => startsA[index] === 0 || startsA[index] !== startsB[index],
    );
    const samePageCount = texts[a].length === texts[b].length;
    const sameText = texts[a].join("") === texts[b].join("");
    const pixels = await comparePixels(item, rasters, a, b, MAX_CROSS_ENGINE_RATIO, true);
    pairs.push({
      pair: `${a}/${b}`,
      samePageCount,
      outlineMismatches,
      sameText,
      pixels,
      ok: samePageCount && outlineMismatches.length === 0 && sameText && pixels.ok,
    });
  }
  const baseline = await comparePixels(item, rasters, "chromium", "baseline", MAX_BASELINE_RATIO, false);
  const pages = { chromium: texts.chromium.length, webkit: texts.webkit.length, server: texts.server.length };
  results.push({
    name: item.name,
    pages,
    pairs,
    baseline,
    outside: {
      chromium: extracted.chromium.outside,
      webkit: extracted.webkit.outside,
      server: extracted.server.outside,
    },
    ok: baseline.ok && pairs.every((pair) => pair.ok),
  });
}

// 4. Report.
const percent = (ratio: number) => `${(ratio * 100).toFixed(2)} %`;
const worst = ({ ratios, offsetsPt }: PixelResult) =>
  `${percent(Math.max(0, ...ratios))} (${Math.max(0, ...offsetsPt).toFixed(1)} pt)`;
const pairCell = (pair: PairResult) =>
  [
    pair.samePageCount ? "" : "pages ≠",
    pair.outlineMismatches.length === 0 ? "" : `starts ≠: ${pair.outlineMismatches.join("; ")}`,
    pair.sameText ? "" : "text ≠",
    worst(pair.pixels),
  ]
    .filter(Boolean)
    .join(", ");
const passed = results.filter((result) => result.ok).length;
const report = [
  `# CV print parity`,
  "",
  `Engines: chromium = ${versions.chromium}; webkit = ${versions.webkit}; server = ${versions.server}.`,
  "",
  `Cross-engine gate: same page count, every outline heading/entry starts on the same page, same ` +
    `text (whitespace ignored), every page ≤ ${percent(MAX_CROSS_ENGINE_RATIO)} differing pixels. ` +
    `Regression gate: Chromium vs committed baseline ≤ ${percent(MAX_BASELINE_RATIO)} per page. ` +
    `Pixels: ${DPI} dpi (Quartz), box blur r=${BLUR_RADIUS} ×${BLUR_PASSES}, threshold ${PIXEL_THRESHOLD}/255, ` +
    `1-inch bands aligned within ±${MAX_SHIFT_PT} pt; cells show the worst page (largest alignment).`,
  "",
  `| Case | Pages (chromium/webkit/server) | ${PAIRS.map(([a, b]) => `${a}↔${b}`).join(" | ")} | chromium↔baseline | Result |`,
  `|---|---|${PAIRS.map(() => "---|").join("")}---|---|`,
  ...results.map(
    (result) =>
      `| ${result.name} | ${ENGINES.map((engine) => result.pages[engine]).join(" / ")} | ` +
      `${result.pairs.map(pairCell).join(" | ")} | ${worst(result.baseline)} | ${result.ok ? "pass" : "**FAIL**"} |`,
  ),
  "",
  `${passed}/${results.length} cases pass.`,
  "",
  "Text drawn outside the page box (clipped, invisible, but in the PDF text layer; not compared):",
  "",
  ...results.flatMap((result) =>
    ENGINES.filter((engine) => result.outside[engine].length > 0).map(
      (engine) => `- ${result.name} ${engine}: ${result.outside[engine].join(" | ")}`,
    ),
  ),
  "",
].join("\n");
await writeFile(join(out, "report.md"), report);
await writeFile(join(out, "report.json"), `${JSON.stringify({ versions, results }, null, 2)}\n`);
if (process.env["GITHUB_STEP_SUMMARY"]) await appendFile(process.env["GITHUB_STEP_SUMMARY"], report);
console.log(report);
if (passed !== results.length) process.exit(1);
