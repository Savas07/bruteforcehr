/**
 * DOCX from the same document model as the HTML: Word's built-in Title/Heading styles, real
 * bulleted lists, a right tab stop for dates. No tables, text boxes or columns, so ATS parsers and
 * screen readers read it top to bottom.
 */
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import { upperCase } from "./i18n";
import { buildDocument, type ContactItem, type DocEntry, type DocSection, splitPlaceholders } from "./model";
import { template } from "./templates";
import { densityScale, fontPair, pageGeometry, printableAccent } from "./themes";
import type { CvRenderInput } from "./types";
import { CV_RENDER_VERSION } from "./version";

/** Millimetres → twips, rounded (docx's own helper floors, giving 11905 for A4's 11906). */
const twip = (mm: number) => Math.round((mm * 1440) / 25.4);

const INK = "1B1F24";
const MUTED = "4B5261";
const BULLETS = "cv-bullets";

/** Decodes standard base64 without `atob` (absent in bare JavaScriptCore). */
function base64Bytes(base64: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/gu, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return out.subarray(0, index);
}

/** Pixel size of a JPEG (SOF marker) or PNG (IHDR), for the photo's aspect ratio. */
function imageSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return bytes.length >= 24 ? { width: view.getUint32(16), height: view.getUint32(20) } : undefined;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1] ?? 0;
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
        width: ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0),
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

interface RunStyle {
  readonly bold?: boolean;
  readonly color?: string;
  readonly size?: number;
}

function runs(text: string, style: RunStyle = {}): TextRun[] {
  return splitPlaceholders(text.replace(/\s*\n\s*/gu, " ")).map(
    (part) =>
      new TextRun({
        text: part.text,
        ...style,
        // A placeholder stays impossible to miss in Word too.
        ...(part.placeholder ? { highlight: "yellow", bold: true } : {}),
      }),
  );
}

function linkRun(item: ContactItem, style: RunStyle = {}): ParagraphChild[] {
  return item.href
    ? [new ExternalHyperlink({ link: item.href, children: runs(item.text, style) })]
    : runs(item.text, style);
}

function separated(groups: ParagraphChild[][], color: string): ParagraphChild[] {
  return groups.flatMap((group, index) => (index === 0 ? group : [new TextRun({ text: " · ", color }), ...group]));
}

/** Builds the CV as DOCX bytes. Same content and order as `renderCvHtml` (one model). */
export async function buildCvDocx(input: CvRenderInput): Promise<Uint8Array> {
  return Packer.pack(cvDocument(input), "uint8array");
}

/** Same as `buildCvDocx`, as base64 (for JavaScriptCore → Swift without typed-array copies). */
export async function buildCvDocxBase64(input: CvRenderInput): Promise<string> {
  return Packer.pack(cvDocument(input), "base64");
}

function cvDocument(input: CvRenderInput): Document {
  const model = buildDocument(input);
  const definition = template(input.templateId);
  const pair = fontPair(input.theme.fontPair);
  const density = densityScale(input.theme.density);
  const accent = printableAccent(input.theme.accent).slice(1);
  const page = pageGeometry(input.paper, input.theme.density);
  const compact = definition.id === "compact";
  const bodyHalfPoints = Math.round(density.fontPt * (compact ? 0.93 : 1) * 2);
  const space = (pt: number) => Math.round(pt * 20 * density.space * (compact ? 0.8 : 1));
  const textWidth = twip(page.widthMm - page.marginsMm.left - page.marginsMm.right);
  const centred = definition.id === "classic";

  const children: Paragraph[] = [];
  const head = model.header;
  if (head) {
    if (head.photo) {
      const bytes = base64Bytes(head.photo.slice(head.photo.indexOf(",") + 1));
      const size = imageSize(bytes);
      const width = 113; // 30 mm at 96 dpi
      const height = size && size.width > 0 ? Math.round((width * size.height) / size.width) : 151;
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new ImageRun({
              type: head.photo.startsWith("data:image/png") ? "png" : "jpg",
              data: bytes,
              transformation: { width, height },
              altText: { name: "Photo", title: "Photo", description: head.name?.text ?? "Photo" },
            }),
          ],
        }),
      );
    }
    const alignment = centred && !head.photo ? AlignmentType.CENTER : AlignmentType.LEFT;
    if (head.name) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment,
          children: runs(head.name.text, definition.id === "modern" ? { color: accent } : {}),
        }),
      );
    }
    if (head.label) {
      children.push(new Paragraph({ alignment, spacing: { after: space(2) }, children: runs(head.label.text) }));
    }
    if (head.contact.length > 0) {
      children.push(
        new Paragraph({
          alignment,
          children: separated(
            head.contact.map((item) => linkRun(item, { color: MUTED })),
            MUTED,
          ),
        }),
      );
    }
    if (head.dateOfBirth) {
      children.push(new Paragraph({ alignment, children: runs(head.dateOfBirth.text, { color: MUTED }) }));
    }
  }

  const entryParagraphs = (entry: DocEntry): Paragraph[] => {
    const joiner = definition.id === "modern" ? " · " : ", ";
    const title: ParagraphChild[] =
      definition.id === "classic" || !entry.title
        ? runs((entry.title ?? entry.subtitle)?.text ?? "", { bold: true })
        : [
            ...runs(entry.title.text, { bold: true }),
            ...(entry.subtitle ? runs(`${joiner}${entry.subtitle.text}`) : []),
          ];
    const out = [
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        keepNext: true,
        keepLines: true,
        spacing: { before: space(8) },
        tabStops: [{ type: TabStopType.RIGHT, position: textWidth }],
        children: [
          ...title,
          ...(entry.dates ? [new TextRun({ children: [new Tab(), entry.dates], color: MUTED, bold: false })] : []),
        ],
      }),
    ];
    const sub: ParagraphChild[][] = [];
    if (definition.id === "classic" && entry.title && entry.subtitle) sub.push(runs(entry.subtitle.text, { color: MUTED }));
    if (entry.location) sub.push(runs(entry.location.text, { color: MUTED }));
    if (entry.link) sub.push(linkRun(entry.link, { color: MUTED }));
    if (sub.length > 0) {
      out.push(new Paragraph({ keepNext: entry.bullets.length > 0, children: separated(sub, MUTED) }));
    }
    if (entry.summary) out.push(new Paragraph({ spacing: { before: space(2) }, children: runs(entry.summary.text) }));
    for (const bullet of entry.bullets) {
      out.push(
        new Paragraph({
          numbering: { reference: BULLETS, level: 0 },
          spacing: { before: space(1.5) },
          children: runs(bullet.text),
        }),
      );
    }
    for (const note of entry.notes) {
      out.push(new Paragraph({ spacing: { before: space(2) }, children: runs(note.text, { color: MUTED }) }));
    }
    return out;
  };

  const sectionParagraphs = (section: DocSection, heading: string): Paragraph[] => {
    const out = [
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        spacing: { before: space(13), after: space(4) },
        ...(definition.id === "modern"
          ? {}
          : { border: { bottom: { style: "single", size: definition.id === "classic" ? 6 : 4, color: accent, space: 2 } } }),
        children: runs(heading),
      }),
    ];
    if (section.kind === "text") {
      for (const block of section.text.text.split(/\n\s*\n/u)) out.push(new Paragraph({ children: runs(block) }));
    } else if (section.kind === "lines") {
      for (const line of section.lines) {
        out.push(
          new Paragraph({
            spacing: { before: space(2) },
            children: [
              ...(line.label ? runs(`${line.label.text}${line.text ? ": " : ""}`, { bold: true }) : []),
              ...(line.text ? runs(line.text.text) : []),
            ],
          }),
        );
      }
    } else {
      for (const entry of section.entries) out.push(...entryParagraphs(entry));
    }
    return out;
  };

  model.sections.forEach((section, index) => {
    const heading = model.outline[index]?.heading ?? section.heading;
    children.push(
      ...sectionParagraphs(section, definition.upperCaseHeadings ? upperCase(heading, model.language) : heading),
    );
  });

  const language = { value: model.lang };
  const headingFont = pair.docxHeading;
  return new Document({
    creator: "BruteForceHR",
    title: model.title,
    description: `BruteForceHR cv-render ${CV_RENDER_VERSION}`,
    styles: {
      default: {
        document: {
          run: { font: pair.docxBody, size: bodyHalfPoints, color: INK, language },
          paragraph: { spacing: { line: Math.round(density.lineHeight * 240) } },
        },
        title: {
          run: {
            font: headingFont,
            size: Math.round(bodyHalfPoints * (compact ? 1.75 : definition.id === "modern" ? 2.4 : 2.2)),
            bold: true,
            color: INK,
            language,
          },
          paragraph: { spacing: { after: space(2) } },
        },
        heading2: {
          run: {
            font: headingFont,
            size: Math.round(bodyHalfPoints * (definition.id === "modern" ? 1.3 : compact ? 0.9 : 0.98)),
            bold: true,
            color: accent,
            language,
            ...(definition.upperCaseHeadings ? { characterSpacing: 10 } : {}),
          },
          paragraph: { keepNext: true },
        },
        heading3: {
          run: { font: pair.docxBody, size: bodyHalfPoints, bold: true, color: INK, language },
          paragraph: { keepNext: true },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: definition.id === "modern" ? "–" : "•",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 340, hanging: 240 } },
                run: definition.id === "modern" ? { color: accent } : {},
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: twip(page.widthMm),
              height: twip(page.heightMm),
            },
            margin: {
              top: twip(page.marginsMm.top),
              right: twip(page.marginsMm.right),
              bottom: twip(page.marginsMm.bottom),
              left: twip(page.marginsMm.left),
            },
          },
        },
        children,
      },
    ],
  });
}
