// Fails the build when a page needs something the Hosting Content-Security-Policy (firebase.json:
// `script-src 'self'; style-src 'self'`, no inline code) would block: inline <script> or <style>
// content, `style="…"` attributes, `on…=` handlers, `javascript:` URLs, or scripts, styles and
// images from another origin.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const pages = readdirSync(dist, { recursive: true, encoding: "utf8" }).filter((path) =>
  path.endsWith(".html"),
);
const checks: [string, RegExp][] = [
  ["inline script", /<script\b[^>]*>(?!\s*<\/script>)[^<]*\S[^<]*<\/script>/iu],
  ["inline style element", /<style\b/iu],
  ["style attribute", /\sstyle\s*=/iu],
  ["event handler attribute", /\son[a-z]+\s*=/iu],
  ["javascript: URL", /=\s*["']?\s*javascript:/iu],
  ["cross-origin script", /<script\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//iu],
  ["cross-origin stylesheet", /<link\b[^>]*rel=["']?stylesheet[^>]*href\s*=\s*["']?(?:https?:)?\/\//iu],
  ["cross-origin image", /<img\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//iu],
];
const problems = pages.flatMap((page) => {
  const html = readFileSync(join(dist, page), "utf8");
  return checks.filter(([, pattern]) => pattern.test(html)).map(([name]) => `${page}: ${name}`);
});
if (pages.length === 0) throw new Error(`no pages in ${dist}`);
if (problems.length > 0) {
  console.error(`The Hosting CSP would block:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`CSP check: ${pages.length} pages without inline or cross-origin code`);
