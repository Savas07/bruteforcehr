import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** The file cannot be read as the declared kind (corrupt, encrypted, wrong type). */
export class UnreadableFileError extends Error {
  constructor(
    readonly reason: "unreadable_file" | "no_text",
    message: string,
  ) {
    super(message);
    this.name = "UnreadableFileError";
  }
}

const PDF_MAGIC = "%PDF-";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Fewer letters than this across the document means a scan without a text layer. */
const MIN_LETTERS = 40;

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

/**
 * Text of a PDF in content-stream order (the order the producer wrote, which is the reading order
 * for Word/Docs/LaTeX exports and per-column for sidebar layouts). A new line starts when the
 * baseline moves; a wide horizontal gap on the same line (right-aligned dates, table cells)
 * becomes two spaces so the model still sees two fields.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
    throw new UnreadableFileError("unreadable_file", "not a PDF");
  }
  // pdf.js transfers the buffer to its worker; pass a copy so the caller's bytes stay usable.
  const loading = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  let document;
  try {
    document = await loading.promise;
  } catch {
    await loading.destroy();
    throw new UnreadableFileError("unreadable_file", "PDF could not be opened");
  }
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        items.push({
          str: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: item.width,
          height: Math.abs(item.height) || Math.abs(item.transform[3] ?? 10),
          hasEOL: item.hasEOL,
        });
      }
      let text = "";
      let previous: PositionedItem | undefined;
      for (const item of items) {
        if (previous !== undefined && !previous.hasEOL) {
          const sameLine = Math.abs(item.y - previous.y) < Math.max(2, previous.height * 0.5);
          if (!sameLine) text += "\n";
          else {
            const gap = item.x - (previous.x + previous.width);
            if (gap > previous.height * 1.5) text += "  ";
            else if (gap > previous.height * 0.15 && !text.endsWith(" ") && !item.str.startsWith(" "))
              text += " ";
          }
        }
        text += item.str;
        if (item.hasEOL) text += "\n";
        previous = item;
      }
      pages.push(text);
      page.cleanup();
    }
    const text = pages
      .join("\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if ((text.match(/\p{L}/gu)?.length ?? 0) < MIN_LETTERS) {
      throw new UnreadableFileError("no_text", "PDF has no text layer");
    }
    return text;
  } finally {
    await loading.destroy();
  }
}

/** Raw text of a DOCX (paragraphs and table cells, one per line). */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  if (!ZIP_MAGIC.every((byte, i) => bytes[i] === byte))
    throw new UnreadableFileError("unreadable_file", "not a DOCX");
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }));
  } catch {
    throw new UnreadableFileError("unreadable_file", "DOCX could not be read");
  }
  const text = value.replace(/\n{3,}/g, "\n\n").trim();
  if ((text.match(/\p{L}/gu)?.length ?? 0) < MIN_LETTERS) {
    throw new UnreadableFileError("no_text", "DOCX has no text");
  }
  return text;
}
