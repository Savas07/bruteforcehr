/**
 * Reading spreadsheet exports: byte decoding (UTF-8, UTF-16, and the Windows code pages Excel
 * uses for "CSV" in Turkish and German/English installs), delimiter detection and RFC 4180
 * parsing, plus the writer used by exports. Pure: no I/O.
 */

export type CsvEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1254" | "windows-1252";
export const CSV_ENCODINGS = [
  "utf-8",
  "utf-16le",
  "utf-16be",
  "windows-1254",
  "windows-1252",
] as const satisfies readonly CsvEncoding[];

export type CsvDelimiter = "," | ";" | "\t" | "|";
export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const satisfies readonly CsvDelimiter[];

export interface DecodedText {
  readonly text: string;
  readonly encoding: CsvEncoding;
}

/**
 * Bytes where Windows-1254 (Turkish) and Windows-1252 (Western) differ in letters: Ğ İ Ş ğ ı ş in
 * 1254 are Ð Ý Þ ð ý þ in 1252, which hardly occur in English or German text.
 */
const TURKISH_ONLY_BYTES = new Set([0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe]);

function decode(bytes: Uint8Array, encoding: CsvEncoding, fatal = false): string {
  return new TextDecoder(encoding, { fatal, ignoreBOM: false }).decode(bytes);
}

/** UTF-16 without a BOM: ASCII text has a zero in every other byte. */
function sniffUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.length < 4) return null;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  const half = sample.length / 2;
  if (oddZeros > half * 0.4 && evenZeros < half * 0.05) return "utf-16le";
  if (evenZeros > half * 0.4 && oddZeros < half * 0.05) return "utf-16be";
  return null;
}

/**
 * Decodes a CSV file's bytes. A BOM wins; then BOM-less UTF-16, valid UTF-8, and finally the
 * single-byte code page: Windows-1254 when Turkish-only letters occur, else Windows-1252. Pass
 * `encoding` to override detection (the user's "Characters look wrong?" choice).
 */
export function decodeCsvBytes(bytes: Uint8Array, encoding?: CsvEncoding): DecodedText {
  const strip = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (encoding !== undefined) return { text: strip(decode(bytes, encoding)), encoding };

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: strip(decode(bytes, "utf-8")), encoding: "utf-8" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: strip(decode(bytes, "utf-16le")), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: strip(decode(bytes, "utf-16be")), encoding: "utf-16be" };

  const utf16 = sniffUtf16(bytes);
  if (utf16) return { text: strip(decode(bytes, utf16)), encoding: utf16 };

  try {
    return { text: strip(decode(bytes, "utf-8", true)), encoding: "utf-8" };
  } catch {
    const turkish = bytes.some((byte) => TURKISH_ONLY_BYTES.has(byte));
    const codePage = turkish ? "windows-1254" : "windows-1252";
    return { text: decode(bytes, codePage), encoding: codePage };
  }
}

/** RFC 4180 records: quoted fields, doubled quotes, CRLF/LF/CR, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };
  while (index < text.length) {
    const char = text[index] as string;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"' && field.trim() === "") {
      // A quote opens a quoted field only at its start (leading spaces are dropped with it).
      field = "";
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRow();
    } else field += char;
    index += 1;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Excel's "sep=;" first line, which names the delimiter and is not data. */
const SEP_LINE = /^sep=(.)\r?\n/i;

/**
 * Picks the delimiter whose split gives the most consistent column count (≥ 2) over the first
 * records; commas inside quoted or free text ("İstanbul, Türkiye") make "," inconsistent there.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const sep = SEP_LINE.exec(text)?.[1];
  if (sep && (CSV_DELIMITERS as readonly string[]).includes(sep)) return sep as CsvDelimiter;
  const sample = text.slice(0, 64 * 1024);
  let best: { delimiter: CsvDelimiter; score: number } = { delimiter: ",", score: 0 };
  // Ties go to the earlier candidate: ";" before "," (TR/DE Excel), then tab and pipe.
  for (const delimiter of [";", ",", "\t", "|"] as const) {
    const rows = parseDelimited(sample, delimiter)
      .slice(0, 50)
      .filter((cells) => cells.some((cell) => cell.trim() !== ""));
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const cells of rows) counts.set(cells.length, (counts.get(cells.length) ?? 0) + 1);
    let modeWidth = 0;
    let modeRows = 0;
    for (const [width, count] of counts)
      if (count > modeRows || (count === modeRows && width > modeWidth))
        [modeWidth, modeRows] = [width, count];
    if (modeWidth < 2) continue;
    const score = (modeRows / rows.length) * 1000 + Math.min(modeWidth, 50);
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

/** Strips the "sep=" line Excel may write first. */
export function stripSepLine(text: string): string {
  return text.replace(SEP_LINE, "");
}

/** Spreadsheet apps run cells starting with these as formulas (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** A cell value safe to open in Excel: formula-like text gets a leading apostrophe. */
export function csvSafeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Undoes `csvSafeCell` on import. */
export function unguardCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

export interface WriteCsvOptions {
  readonly delimiter?: CsvDelimiter;
  /** Leading UTF-8 BOM so Excel reads the file as UTF-8 (default true). */
  readonly bom?: boolean;
}

/** RFC 4180 text (CRLF), cells guarded against formula injection and quoted when needed. */
export function writeCsv(rows: readonly (readonly string[])[], options: WriteCsvOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  const quote = (value: string) => {
    const safe = csvSafeCell(value);
    return /["\r\n]/.test(safe) || safe.includes(delimiter) || safe !== safe.trim()
      ? `"${safe.replace(/"/g, '""')}"`
      : safe;
  };
  const body = rows.map((cells) => cells.map(quote).join(delimiter)).join("\r\n");
  return `${options.bom === false ? "" : "\uFEFF"}${body}\r\n`;
}
