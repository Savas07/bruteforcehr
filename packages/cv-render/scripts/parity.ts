// Print-engine parity (docs/adr/0009-cv-rendering.md, "Parity plan"). Prints the fixed CV set of
// scripts/parity-cases.ts with three engines:
//   chromium — Playwright's headless Chromium (the ATS test path; WebView2 on Windows is Chromium),
//   webkit   — WKWebView + NSPrintOperation (scripts/webkit-print.swift; the macOS desktop and iOS path),
//   server   — the Cloud Functions renderer (scripts/parity-server.ts): PDFs from
//              BFHR_PARITY_SERVER_DIR (CI prints them on Linux with @sparticuz/chromium), else printed
//              here with chrome-headless-shell of the same version,
// rasterises every PDF with one rasteriser (Quartz, scripts/pdf-raster.swift) at 150 dpi and compares
// each pair of engines: page counts must be equal, and on every page the share of pixels that still
// differ after an anti-aliasing blur and a small per-band alignment must stay within MAX_DIFF_RATIO.
// Failing pages get PNGs of both engines and a diff. macOS only. Output (gitignored):
// artifacts/cv-parity/ (report.md, report.json, <case>/{cv.html,<engine>.pdf,p<N>-*.png}).
// Usage: pnpm --filter @bfhr/cv-render parity
import { execFileSync } from "node:child_process";
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { constants, crc32, deflateSync } from "node:zlib";
import type { CvRenderResult } from "../src/index";
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
 * Each engine snaps text baselines and line boxes to its own grid (Chromium: whole CSS px = 0.75 pt;
 * WebKit print: whole px = 0.8 pt, font ascent/descent rounded), so the same layout lands up to
 * ~1.5 pt apart vertically. Every 1-inch band of the page may therefore shift by up to MAX_SHIFT_PT
 * vertically and one pixel horizontally before pixels are compared. A different line break, word,
 * font, size or page break moves far more than that and still fails.
 */
const BAND_PX = DPI;
const MAX_SHIFT_PT = 2;
const MAX_SHIFT_Y = Math.round((MAX_SHIFT_PT / 72) * DPI);
const MAX_SHIFT_X = 1;
/** Per page: at most this share of all pixels may differ (1.5 %). */
const MAX_DIFF_RATIO = 0.015;

const ENGINES = ["chromium", "webkit", "server"] as const;
type Engine = (typeof ENGINES)[number];
const PAIRS: readonly (readonly [Engine, Engine])[] = [
  ["chromium", "webkit"],
  ["chromium", "server"],
  ["webkit", "server"],
];

if (process.platform !== "darwin") {
  console.error("parity needs macOS (WebKit print and the Quartz rasteriser)");
  process.exit(2);
}

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
for (const item of cases)
  await writeFile(join(item.dir, "chromium.pdf"), await printPdf(browser, item.result));
await browser.close();

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

// 2. Rasterise and compare.
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
            if (Math.abs((left.pixels[y * width + x] ?? 255) - rightAt(x + dx, y + dy)) > PIXEL_THRESHOLD)
              count += 1;
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
  for (let y = 0; y < height; y += 1)
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
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
async function writeDiff(base: string, a: Engine, b: Engine, left: Raster, right: Raster, mask: Int8Array) {
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

interface PageResult {
  readonly page: number;
  readonly ratio: number;
  readonly offsetPt: number;
  readonly ok: boolean;
}
interface PairResult {
  readonly pair: `${Engine}/${Engine}`;
  readonly pages: readonly [number, number];
  readonly results: readonly PageResult[];
  readonly ok: boolean;
}
interface CaseResult {
  readonly name: string;
  readonly pages: Readonly<Record<Engine, number>>;
  readonly pairs: readonly PairResult[];
  readonly ok: boolean;
}

async function rasterise(item: Case): Promise<Record<Engine, Raster[]>> {
  const lines = execFileSync(
    pdfRaster,
    [String(DPI), item.dir, ...ENGINES.map((engine) => `${engine}=${join(item.dir, `${engine}.pdf`)}`)],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const rasters: Record<Engine, Raster[]> = { chromium: [], webkit: [], server: [] };
  for (const line of lines) {
    const parsed = JSON.parse(line) as {
      name: Engine;
      pages: { file: string; width: number; height: number }[];
    };
    for (const { file, width, height } of parsed.pages) {
      rasters[parsed.name].push({ width, height, pixels: new Uint8Array(await readFile(file)) });
      await rm(file);
    }
  }
  return rasters;
}

const results: CaseResult[] = [];
for (const item of cases) {
  const rasters = await rasterise(item);
  const pairs: PairResult[] = [];
  for (const [a, b] of PAIRS) {
    const pageResults: PageResult[] = [];
    const count = Math.min(rasters[a].length, rasters[b].length);
    for (let index = 0; index < count; index += 1) {
      const left = rasters[a][index] as Raster;
      const right = rasters[b][index] as Raster;
      // Chromium writes A4 as 594.96 × 841.92 pt (whole CSS px), WebKit as 595 × 842 pt: sizes may
      // differ by one raster px. More than that is a different paper size.
      if (Math.abs(left.width - right.width) > 1 || Math.abs(left.height - right.height) > 1) {
        pageResults.push({ page: index + 1, ratio: 1, offsetPt: 0, ok: false });
        continue;
      }
      const width = Math.min(left.width, right.width);
      const height = Math.min(left.height, right.height);
      const leftPage = crop(left, width, height);
      const rightPage = crop(right, width, height);
      const { ratio, offsetPt, mask } = comparePage(blur(leftPage), blur(rightPage));
      const ok = ratio <= MAX_DIFF_RATIO;
      if (!ok) await writeDiff(join(item.dir, `p${index + 1}`), a, b, leftPage, rightPage, mask);
      pageResults.push({ page: index + 1, ratio, offsetPt, ok });
    }
    const pages = [rasters[a].length, rasters[b].length] as const;
    pairs.push({
      pair: `${a}/${b}`,
      pages,
      results: pageResults,
      ok: pages[0] > 0 && pages[0] === pages[1] && pageResults.every((result) => result.ok),
    });
  }
  const pages = {
    chromium: rasters.chromium.length,
    webkit: rasters.webkit.length,
    server: rasters.server.length,
  };
  results.push({ name: item.name, pages, pairs, ok: pairs.every((pair) => pair.ok) });
}

// 3. Report.
const percent = (ratio: number) => `${(ratio * 100).toFixed(2)} %`;
const worst = (pair: PairResult) => {
  const ratio = Math.max(0, ...pair.results.map((result) => result.ratio));
  const offset = Math.max(0, ...pair.results.map((result) => result.offsetPt));
  return `${percent(ratio)} (${offset.toFixed(1)} pt)`;
};
const passed = results.filter((result) => result.ok).length;
const report = [
  `# CV print parity`,
  "",
  `Engines: chromium = ${versions.chromium}; webkit = ${versions.webkit}; server = ${versions.server}.`,
  "",
  `${DPI} dpi (Quartz), box blur r=${BLUR_RADIUS} ×${BLUR_PASSES}, pixel threshold ${PIXEL_THRESHOLD}/255, ` +
    `1-inch bands aligned within ±${MAX_SHIFT_PT} pt vertically and ±${MAX_SHIFT_X} px horizontally; ` +
    `tolerance ≤ ${percent(MAX_DIFF_RATIO)} of a page's pixels. Page counts must match exactly.`,
  "",
  `| Case | Pages (chromium/webkit/server) | ${PAIRS.map(([a, b]) => `${a}↔${b}: worst page (alignment)`).join(" | ")} | Result |`,
  `|---|---|${PAIRS.map(() => "---|").join("")}---|`,
  ...results.map(
    (result) =>
      `| ${result.name} | ${ENGINES.map((engine) => result.pages[engine]).join(" / ")} | ` +
      `${result.pairs.map(worst).join(" | ")} | ${result.ok ? "pass" : "**FAIL**"} |`,
  ),
  "",
  `${passed}/${results.length} cases within tolerance.`,
  "",
].join("\n");
await writeFile(join(out, "report.md"), report);
await writeFile(join(out, "report.json"), `${JSON.stringify({ versions, results }, null, 2)}\n`);
if (process.env["GITHUB_STEP_SUMMARY"]) await appendFile(process.env["GITHUB_STEP_SUMMARY"], report);
console.log(report);
if (passed !== results.length) process.exit(1);
