// Builds dist/cv-render.iife.js: `globalThis.BFHRCvRender` for JavaScriptCore (iOS). Plain ES2020,
// no DOM or Node APIs; src/iife.test.ts runs the same build in a bare `node:vm` context.
//
// Also writes the bundle's inputs for the iOS Xcode build phase, which copies the bundle into the
// app and fails when it is stale:
// - dist/cv-render.iife.inputs.xcfilelist: `$(SRCROOT)/../../<repo path>` per input (SRCROOT = apps/ios)
// - dist/cv-render.iife.inputs.sha256: sha256 over `<repo path>\n<sha256 of the file>\n` per input,
//   in the same sorted order.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(root, "../..");

/** Builds the bundle; returns its inputs as sorted repo-relative paths. */
export async function buildIife(outfile: string): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["src/iife.ts"],
    outfile,
    bundle: true,
    format: "iife",
    platform: "neutral",
    mainFields: ["module", "main"],
    // iOS 17 JavaScriptCore (the app's floor) runs ES2022; ES2020 keeps a margin.
    target: "es2020",
    inject: ["scripts/jsc-shims.ts"],
    minify: true,
    legalComments: "eof",
    metafile: true,
    logLevel: "warning",
  });
  const inputs = Object.keys(result.metafile.inputs).map((input) => relative(repoRoot, resolve(root, input)));
  inputs.push(relative(repoRoot, resolve(root, "package.json")));
  return [...new Set(inputs)].sort();
}

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

if (import.meta.main) {
  const outfile = resolve(root, "dist/cv-render.iife.js");
  const inputs = await buildIife(outfile);
  let manifest = "";
  for (const input of inputs) manifest += `${input}\n${sha256(await readFile(resolve(repoRoot, input)))}\n`;
  await writeFile(
    resolve(root, "dist/cv-render.iife.inputs.xcfilelist"),
    inputs.map((input) => `$(SRCROOT)/../../${input}\n`).join(""),
  );
  await writeFile(resolve(root, "dist/cv-render.iife.inputs.sha256"), `${sha256(manifest)}\n`);
  const { size } = await stat(outfile);
  console.log(`cv-render: wrote dist/cv-render.iife.js (${Math.round(size / 1024)} KiB, ${inputs.length} inputs)`);
}
