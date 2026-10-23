/**
 * Records a public job page (or ATS API response) as a parser fixture in `job-pages/`:
 *
 *   pnpm --filter @bfhr/fixtures exec tsx scripts/record-job-page.ts <name> <url> [--json|--raw]
 *
 * Fetched once with the honest User-Agent of ADR 0005. HTML is trimmed to what the parsers read:
 * scripts other than JSON-LD, styles, SVG and comments are removed so fixtures stay small; the
 * first line records the source URL, date, HTTP status and final URL. `--raw` keeps the page as
 * served (block and challenge pages, whose markers live in scripts).
 */
import { writeFile } from "node:fs/promises";

const [name, url, flag] = process.argv.slice(2);
if (name === undefined || url === undefined || !/^[a-z0-9-]+$/.test(name)) {
  console.error("usage: record-job-page.ts <name> <url> [--json|--raw]");
  process.exit(1);
}
const response = await fetch(url, {
  headers: {
    "user-agent": "BruteForceHR/0.3.0 (+https://bruteforcehr.web.app/support)",
    accept: flag === "--json" ? "application/json" : "text/html,application/xhtml+xml",
    "accept-language": "en,de;q=0.8,tr;q=0.6",
  },
  redirect: "follow",
});
const body = await response.text();
const day = new Date().toISOString().slice(0, 10);
if (flag === "--json") {
  await writeFile(new URL(`../job-pages/${name}.json`, import.meta.url), `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
} else {
  const trimmed = flag === "--raw" ? body : body
    .replace(/<script\b(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "<svg></svg>")
    .replace(/<!--(?!\s*recorded)[\s\S]*?-->/g, "")
    .replace(/<link\b[^>]*rel="(?:stylesheet|preload|modulepreload|prefetch|dns-prefetch|preconnect|icon)"[^>]*>/gi, "")
    .replace(/\n\s*\n+/g, "\n");
  const header = `<!-- recorded ${day} from ${url} (HTTP ${response.status}, final ${response.url}) -->\n`;
  await writeFile(new URL(`../job-pages/${name}.html`, import.meta.url), header + trimmed);
}
console.log(`${name}: HTTP ${response.status}, ${body.length} bytes → job-pages/${name}.${flag === "--json" ? "json" : "html"}`);
