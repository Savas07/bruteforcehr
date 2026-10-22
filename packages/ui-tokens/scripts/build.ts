// Writes dist/tokens.css and dist/tailwind.css from src/. Runs on Node 22 type stripping (no build deps).
import { mkdir, writeFile } from "node:fs/promises";
import { renderTailwindCss, renderTokensCss } from "../src/css.ts";

const dist = new URL("../dist/", import.meta.url);
await mkdir(dist, { recursive: true });
await Promise.all([
  writeFile(new URL("tokens.css", dist), renderTokensCss()),
  writeFile(new URL("tailwind.css", dist), renderTailwindCss()),
]);
console.log("ui-tokens: wrote dist/tokens.css and dist/tailwind.css");
