import { upperCase } from "./i18n";
import { buildDocument, type ContactItem, type DocEntry, type DocSection, splitPlaceholders, type TextField } from "./model";
import { stylesheet, template } from "./templates";
import { densityScale, fontPair, pageGeometry, printableAccent } from "./themes";
import type { CvRenderInput, CvRenderResult, TemplateId } from "./types";
import { CV_RENDER_VERSION } from "./version";

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => ESCAPES[char] ?? char);
}

/** Escaped text with `[X%]` placeholders wrapped in a visible mark. Newlines become spaces. */
function inline(text: string): string {
  return splitPlaceholders(text.replace(/\s*\n\s*/gu, " "))
    .map((part) =>
      part.placeholder
        ? `<mark class="cv-ph" data-placeholder="">${escapeHtml(part.text)}</mark>`
        : escapeHtml(part.text),
    )
    .join("");
}

const at = (path: string) => ` data-cv-path="${escapeHtml(path)}"`;

function span(value: TextField | undefined, className: string): string {
  return value ? `<span class="${className}"${at(value.path)}>${inline(value.text)}</span>` : "";
}

function contactItem(item: ContactItem): string {
  const text = inline(item.text);
  return item.href
    ? `<a href="${escapeHtml(item.href)}"${at(item.path)}>${text}</a>`
    : `<span${at(item.path)}>${text}</span>`;
}

const SEPARATOR = '<span class="cv-sep"> · </span>';

/** Summary text: blank lines separate paragraphs, single newlines break lines. */
function paragraphs(value: TextField): string {
  return value.text
    .split(/\n\s*\n/u)
    .map((block) => `<p>${block.split("\n").map(inline).join("<br>")}</p>`)
    .join("");
}

function entryHtml(entry: DocEntry, templateId: TemplateId): string {
  const short = entry.bullets.length <= 4 && (entry.summary?.text.length ?? 0) < 400;
  const dates = entry.dates ? `<span class="cv-dates">${escapeHtml(entry.dates)}</span>` : "";
  let head: string;
  let sub: string[];
  if (templateId === "classic") {
    head = entry.title
      ? `<h3 class="cv-entry-title"${at(entry.title.path)}>${inline(entry.title.text)}</h3>`
      : `<h3 class="cv-entry-title"${at(entry.subtitle?.path ?? entry.path)}>${inline(entry.subtitle?.text ?? "")}</h3>`;
    sub = [entry.title ? span(entry.subtitle, "cv-entry-org") : "", span(entry.location, "cv-entry-location")];
  } else {
    const joiner = templateId === "modern" ? " · " : ", ";
    const title = entry.title ? span(entry.title, "cv-entry-role") : "";
    const org = entry.subtitle
      ? `${entry.title ? `<span class="cv-entry-org">${escapeHtml(joiner)}</span>` : ""}${span(entry.subtitle, "cv-entry-org")}`
      : "";
    head = `<h3 class="cv-entry-title">${title}${org}</h3>`;
    sub = [span(entry.location, "cv-entry-location")];
  }
  if (entry.link) sub.push(`<span class="cv-link">${contactItem(entry.link)}</span>`);
  const subLine = sub.filter(Boolean).join(SEPARATOR);
  const parts = [
    `<div class="cv-entry-head">${head}${dates}</div>`,
    subLine ? `<p class="cv-entry-sub">${subLine}</p>` : "",
    entry.summary ? `<p class="cv-entry-summary"${at(entry.summary.path)}>${inline(entry.summary.text)}</p>` : "",
    entry.bullets.length > 0
      ? `<ul class="cv-bullets">${entry.bullets.map((bullet) => `<li${at(bullet.path)}>${inline(bullet.text)}</li>`).join("")}</ul>`
      : "",
    ...entry.notes.map((note) => `<p class="cv-note"${at(note.path)}>${inline(note.text)}</p>`),
  ];
  return `<article class="cv-entry${short ? " is-short" : ""}"${at(entry.path)}>${parts.join("")}</article>`;
}

function sectionHtml(section: DocSection, templateId: TemplateId, heading: string): string {
  let body: string;
  if (section.kind === "text") {
    body = `<div class="cv-text"${at(section.text.path)}>${paragraphs(section.text)}</div>`;
  } else if (section.kind === "lines") {
    body = `<div class="cv-lines">${section.lines
      .map((line) => {
        const label = line.label
          ? `<span class="cv-line-label"${at(line.label.path)}>${inline(line.label.text)}${line.text ? ":" : ""}</span>`
          : "";
        const text = line.text ? `${label ? " " : ""}<span${at(line.text.path)}>${inline(line.text.text)}</span>` : "";
        return `<p${at(line.path)}>${label}${text}</p>`;
      })
      .join("")}</div>`;
  } else {
    body = section.entries.map((entry) => entryHtml(entry, templateId)).join("");
  }
  const key = escapeHtml(section.key);
  return `<section class="cv-section" data-cv-section="${key}"${at(section.path)}><h2 class="cv-heading">${escapeHtml(heading)}</h2>${body}</section>`;
}

/**
 * Renders a CV as one self-contained HTML document: fonts embedded, no scripts, no network
 * requests (a CSP forbids them). Every surface shows and prints exactly this HTML (ADR 0009).
 */
export function renderCvHtml(input: CvRenderInput): CvRenderResult {
  const document = buildDocument(input);
  const definition = template(input.templateId);
  const templateId = definition.id;
  const page = pageGeometry(input.paper, input.theme.density);
  const css = stylesheet({
    templateId,
    accent: printableAccent(input.theme.accent),
    pair: fontPair(input.theme.fontPair),
    density: densityScale(input.theme.density),
    page,
  });

  const head = document.header;
  let headerHtml = "";
  if (head) {
    const contact = head.contact.map(contactItem).join(SEPARATOR);
    const label = head.label ? `<p class="cv-label"${at(head.label.path)}>${inline(head.label.text)}</p>` : "";
    const photo = head.photo ? `<img class="cv-photo" src="${escapeHtml(head.photo)}" alt=""${at("/basics/image")}>` : "";
    headerHtml =
      `<header class="cv-header${photo ? " has-photo" : ""}"${at("/basics")}><div class="cv-id">` +
      (head.name ? `<h1 class="cv-name"${at(head.name.path)}>${inline(head.name.text)}</h1>` : "") +
      label +
      (contact ? `<p class="cv-contact">${contact}</p>` : "") +
      (head.dateOfBirth
        ? `<p class="cv-personal"${at(head.dateOfBirth.path)}>${escapeHtml(head.dateOfBirth.text)}</p>`
        : "") +
      `</div>${photo}</header>`;
  }

  const outline = document.outline.map((section) => ({
    ...section,
    heading: definition.upperCaseHeadings ? upperCase(section.heading, document.language) : section.heading,
  }));
  const sections = document.sections
    .map((section, index) => sectionHtml(section, templateId, outline[index]?.heading ?? section.heading))
    .join("");

  const html =
    `<!doctype html><html lang="${escapeHtml(document.lang)}"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="generator" content="BruteForceHR cv-render ${CV_RENDER_VERSION}">` +
    `<title>${escapeHtml(document.title)}</title><style>${css}</style></head>` +
    `<body><main class="cv cv--${templateId}" data-template="${templateId}">${headerHtml}${sections}</main></body></html>`;

  return { html, title: document.title, lang: document.lang, page, placeholders: document.placeholders, outline };
}
