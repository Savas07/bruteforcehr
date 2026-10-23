/**
 * Renders the synthetic CV fixtures (eval/fixtures/cvs*.ts) to the PDF/DOCX files the eval and
 * the extractor tests read (eval/fixtures/files/, committed). Re-run after editing a fixture:
 *
 *   pnpm --filter @bfhr/ai eval:fixtures
 *
 * PDFs embed macOS's Geneva font (it covers ₺, ğ, ş, ı, ß); the script is a one-off authoring
 * step, so it runs on the owner's Mac, not in CI.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import { type PDFFont, type PDFPage, PDFDocument, rgb } from "pdf-lib";
import { CV_FIXTURES } from "./fixtures/cvs";
import type { Block, CvFixture } from "./fixtures/types";

const FONT_PATH = "/System/Library/Fonts/Geneva.ttf";
const OUT_DIR = new URL("./fixtures/files/", import.meta.url);

/* ------------------------------------------------------------------------------------------------
 * PDF
 * ---------------------------------------------------------------------------------------------- */

const PAGE = { width: 595.28, height: 841.89, margin: 48 };

interface Column {
  x: number;
  width: number;
}

class PdfWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly scale: number,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  /** Starts a column at the top of the first page (sidebar layouts draw the sidebar first). */
  restartAtFirstPage(): void {
    this.page = this.doc.getPage(0);
    this.y = PAGE.height - PAGE.margin;
  }

  private wrap(text: string, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (this.font.widthOfTextAtSize(candidate, size) > width && line !== "") {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      lines.push(line);
    }
    return lines;
  }

  private ensure(height: number): void {
    if (this.y - height >= PAGE.margin) return;
    const next = this.doc.getPages().indexOf(this.page) + 1;
    this.page =
      next < this.doc.getPageCount() ? this.doc.getPage(next) : this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  text(value: string, x: number, size: number, gray = 0): void {
    this.page.drawText(value, { x, y: this.y, size, font: this.font, color: rgb(gray, gray, gray) });
  }

  lines(value: string, column: Column, size: number, indent = 0, gray = 0): void {
    for (const line of this.wrap(value, size, column.width - indent)) {
      this.ensure(size * 1.35);
      this.text(line, column.x + indent, size, gray);
      this.y -= size * 1.35;
    }
  }

  space(points: number): void {
    this.y -= points * this.scale;
  }

  block(block: Block, column: Column): void {
    const s = this.scale;
    switch (block.kind) {
      case "name":
        this.ensure(26 * s);
        this.lines(block.text, column, 20 * s);
        this.space(2);
        break;
      case "line":
        this.lines(block.text, column, 9.5 * s, 0, 0.25);
        break;
      case "heading":
        this.space(8);
        this.lines(block.text, column, 12.5 * s, 0, 0.1);
        this.page.drawLine({
          start: { x: column.x, y: this.y + 9 * s },
          end: { x: column.x + column.width, y: this.y + 9 * s },
          thickness: 0.5,
          color: rgb(0.6, 0.6, 0.6),
        });
        this.space(2);
        break;
      case "entry": {
        this.space(3);
        const size = 10.5 * s;
        this.ensure(size * 1.4);
        const rightWidth = block.right === undefined ? 0 : this.font.widthOfTextAtSize(block.right, 9.5 * s);
        const leftLines = this.wrap(block.left, size, column.width - rightWidth - 12);
        leftLines.forEach((line, i) => {
          this.ensure(size * 1.35);
          this.text(line, column.x, size);
          if (i === 0 && block.right !== undefined)
            this.text(block.right, column.x + column.width - rightWidth, 9.5 * s, 0.3);
          this.y -= size * 1.35;
        });
        if (block.sub !== undefined) this.lines(block.sub, column, 9.5 * s, 0, 0.3);
        break;
      }
      case "paragraph":
        this.lines(block.text, column, 10 * s);
        this.space(2);
        break;
      case "bullets":
        for (const item of block.items) {
          const size = 10 * s;
          const wrapped = this.wrap(item, size, column.width - 12);
          wrapped.forEach((line, i) => {
            this.ensure(size * 1.35);
            if (i === 0) this.text("•", column.x + 2, size);
            this.text(line, column.x + 12, size);
            this.y -= size * 1.35;
          });
        }
        break;
      case "table": {
        const left = { x: column.x, width: 120 };
        const right = { x: column.x + 130, width: column.width - 130 };
        for (const row of block.rows) {
          this.space(4);
          const top = this.y;
          const topPage = this.page;
          const cells = row.length === 1 ? [row[0] ?? ""] : row;
          if (cells.length === 1) {
            this.lines(cells[0] ?? "", column, 10 * s);
            continue;
          }
          this.lines(cells[0] ?? "", left, 9.5 * s, 0, 0.3);
          const leftBottom = this.y;
          const leftPage = this.page;
          this.page = topPage;
          this.y = top;
          this.lines(cells.slice(1).join("\n"), right, 10 * s);
          if (this.page === leftPage) this.y = Math.min(this.y, leftBottom);
        }
        break;
      }
    }
  }
}

async function renderPdf(fixture: CvFixture, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Deterministic output: fixed metadata, no creation timestamps.
  doc.setCreationDate(new Date("2026-10-01T00:00:00Z"));
  doc.setModificationDate(new Date("2026-10-01T00:00:00Z"));
  doc.setProducer("BruteForceHR eval fixtures");
  doc.setTitle(fixture.id);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const writer = new PdfWriter(doc, font, fixture.layout === "compact" ? 0.9 : 1);
  const full = { x: PAGE.margin, width: PAGE.width - 2 * PAGE.margin };
  if (fixture.layout === "sidebar" && fixture.sidebar !== undefined) {
    const sidebar = { x: PAGE.margin - 10, width: 150 };
    const main = { x: PAGE.margin + 160, width: PAGE.width - PAGE.margin * 2 - 150 };
    for (const block of fixture.sidebar) writer.block(block, sidebar);
    writer.restartAtFirstPage();
    for (const block of fixture.main) writer.block(block, main);
  } else {
    for (const block of fixture.main) writer.block(block, full);
  }
  return doc.save({ useObjectStreams: false });
}

/* ------------------------------------------------------------------------------------------------
 * DOCX
 * ---------------------------------------------------------------------------------------------- */

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function docxBlocks(blocks: readonly Block[], compact: boolean): (Paragraph | Table)[] {
  const size = compact ? 18 : 20; // half-points
  const out: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "name":
        out.push(
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: block.text })] }),
        );
        break;
      case "line":
        out.push(new Paragraph({ children: [new TextRun({ text: block.text, size })] }));
        break;
      case "heading":
        out.push(
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: block.text })] }),
        );
        break;
      case "entry":
        out.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
            children: [
              new TextRun({ text: block.left, bold: true, size }),
              ...(block.right === undefined ? [] : [new TextRun({ text: `\t${block.right}`, size })]),
            ],
          }),
        );
        if (block.sub !== undefined) {
          out.push(new Paragraph({ children: [new TextRun({ text: block.sub, italics: true, size })] }));
        }
        break;
      case "paragraph":
        out.push(new Paragraph({ children: [new TextRun({ text: block.text, size })] }));
        break;
      case "bullets":
        for (const item of block.items) {
          out.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: item, size })] }));
        }
        break;
      case "table":
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            rows: block.rows.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (cellText, i) =>
                      new TableCell({
                        width: { size: i === 0 && row.length > 1 ? 25 : 75, type: WidthType.PERCENTAGE },
                        children: cellText
                          .split("\n")
                          .map((line) => new Paragraph({ children: [new TextRun({ text: line, size })] })),
                      }),
                  ),
                }),
            ),
          }),
        );
        break;
    }
  }
  return out;
}

async function renderDocx(fixture: CvFixture): Promise<Uint8Array> {
  const compact = fixture.layout === "compact";
  const children =
    fixture.layout === "sidebar" && fixture.sidebar !== undefined
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    children: docxBlocks(fixture.sidebar, compact),
                  }),
                  new TableCell({
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    children: docxBlocks(fixture.main, compact),
                  }),
                ],
              }),
            ],
          }),
        ]
      : docxBlocks(fixture.main, compact);
  const doc = new Document({
    creator: "BruteForceHR eval fixtures",
    title: fixture.id,
    styles: {
      default: { document: { run: { font: "Arial" }, paragraph: { alignment: AlignmentType.LEFT } } },
    },
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

await mkdir(OUT_DIR, { recursive: true });
const fontBytes = new Uint8Array(await readFile(FONT_PATH));
for (const fixture of CV_FIXTURES) {
  const bytes = fixture.format === "pdf" ? await renderPdf(fixture, fontBytes) : await renderDocx(fixture);
  await writeFile(new URL(`${fixture.id}.${fixture.format}`, OUT_DIR), bytes);
  console.log(`${fixture.id}.${fixture.format}  ${bytes.length} bytes`);
}
