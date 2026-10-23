// Regenerates `sample-cv.pdf` (ATS extraction tests) from `sampleCv.ts`: a one-column CV with
// standard headings printed to PDF by Chromium (embedded font subsets with ToUnicode maps, like the
// app's exports), two A4 pages. Run from apps/desktop:
//
//   node src/features/cv-editor/ats/__fixtures__/generate.ts
//
// Runs on Node 22 type stripping; needs the Playwright Chromium (`pnpm exec playwright install chromium`).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { sampleCv } from "./sampleCv.ts";

const escape = (value: string): string =>
  value.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char,
  );

const month = (iso: string | undefined): string => {
  if (!iso) return "Present";
  const [year = "", number] = iso.split("-");
  return number
    ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(number) - 1]} ${year}`
    : year;
};

const { basics = {}, work = [], education = [], skills = [], languages = [], certificates = [] } = sampleCv;
const talks = sampleCv.meta.customSections[0];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 18mm; }
  body { font: 10.5pt/1.45 Georgia, serif; color: #111; font-feature-settings: "liga" 1; }
  h1 { font-size: 22pt; margin: 0; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #1f4e79; margin: 16pt 0 6pt; }
  p, ul { margin: 2pt 0; }
  .meta { color: #444; }
  .entry { margin-bottom: 8pt; }
  .entry-head { display: flex; justify-content: space-between; }
  .break { break-before: page; }
  .narrow { width: 60mm; hyphens: auto; }
</style></head><body>
  <h1>${escape(basics.name ?? "")}</h1>
  <p>${escape(basics.label ?? "")}</p>
  <p class="meta">${escape(basics.email ?? "")} · ${escape(basics.phone ?? "")} · ${escape(basics.location?.city ?? "")}</p>
  <h2>Summary</h2>
  <p>${escape(basics.summary ?? "")}</p>
  <h2>Experience</h2>
  ${work
    .map(
      (
        item,
      ) => `<div class="entry"><div class="entry-head"><strong>${escape(item.position ?? "")}, ${escape(item.name ?? "")}</strong>
      <span>${month(item.startDate)} – ${month(item.endDate)}</span></div>
      <ul>${(item.highlights ?? []).map((line) => `<li>${escape(line)}</li>`).join("")}</ul></div>`,
    )
    .join("")}
  <p class="narrow">Responsibilities included internationalisation and accessibility.</p>
  <h2 class="break">Education</h2>
  ${education
    .map(
      (item) => `<div class="entry"><div class="entry-head"><strong>${escape(item.institution ?? "")}</strong>
      <span>${month(item.startDate)} – ${month(item.endDate)}</span></div>
      <p>${escape(item.studyType ?? "")}, ${escape(item.area ?? "")}</p></div>`,
    )
    .join("")}
  <h2>Skills</h2>
  ${skills.map((item) => `<p><strong>${escape(item.name ?? "")}:</strong> ${escape((item.keywords ?? []).join(", "))}</p>`).join("")}
  <h2>Languages</h2>
  <p>${languages.map((item) => `${escape(item.language ?? "")} (${escape(item.fluency ?? "")})`).join(", ")}</p>
  <h2>Certifications</h2>
  ${certificates.map((item) => `<p>${escape(item.name ?? "")}, ${escape(item.issuer ?? "")}, ${month(item.date)}</p>`).join("")}
  <h2>${escape(talks?.title ?? "")}</h2>
  ${(talks?.items ?? []).map((item) => `<p>${escape(item.title)}, ${escape(item.subtitle ?? "")}</p>`).join("")}
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, tagged: true });
  const out = path.join(import.meta.dirname, "sample-cv.pdf");
  writeFileSync(out, pdf);
  console.log(`wrote ${path.relative(process.cwd(), out)} (${pdf.length} bytes)`);
} finally {
  await browser.close();
}
