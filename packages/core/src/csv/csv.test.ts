import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ColumnMapping,
  csvSafeCell,
  decodeCsvBytes,
  detectDateOrder,
  detectDelimiter,
  detectTableDateOrder,
  guessColumnMapping,
  guessedStatusMap,
  guessStatus,
  type ImportSettings,
  importEvidenceReason,
  isImportedEvent,
  isoDay,
  normalizeWord,
  parseDelimited,
  parseImportEvidenceReason,
  parseSpreadsheetDate,
  planImport,
  readSpreadsheet,
  SpreadsheetReadError,
  type SpreadsheetTable,
  statusValues,
  writeCsv,
} from "./index";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(path.join(import.meta.dirname, "../../../fixtures/csv", name)));
const NOW = new Date("2026-10-23T09:00:00Z");
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

function settings(table: SpreadsheetTable, overrides: Partial<ImportSettings> = {}): ImportSettings {
  const mapping = overrides.mapping ?? guessColumnMapping(table);
  return {
    mapping,
    statusMap: guessedStatusMap(statusValues(table, mapping)),
    defaultStatus: "applied",
    dateOrder: detectTableDateOrder(table, mapping, "dmy"),
    keepUnmappedInNotes: true,
    now: NOW,
    existing: [],
    ...overrides,
  };
}

describe("decodeCsvBytes", () => {
  it("honours BOMs", () => {
    expect(decodeCsvBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toEqual({
      text: "a",
      encoding: "utf-8",
    });
    expect(decodeCsvBytes(new Uint8Array([0xff, 0xfe, 0x61, 0]))).toEqual({
      text: "a",
      encoding: "utf-16le",
    });
    expect(decodeCsvBytes(new Uint8Array([0xfe, 0xff, 0, 0x61]))).toEqual({
      text: "a",
      encoding: "utf-16be",
    });
  });

  it("sniffs BOM-less UTF-16", () => {
    const le = new Uint8Array([..."a;b\r\n1;2".split("").flatMap((char) => [char.charCodeAt(0), 0])]);
    expect(decodeCsvBytes(le)).toEqual({ text: "a;b\r\n1;2", encoding: "utf-16le" });
    const be = new Uint8Array([..."a;b".split("").flatMap((char) => [0, char.charCodeAt(0)])]);
    expect(decodeCsvBytes(be).encoding).toBe("utf-16be");
  });

  it("tells Turkish from Western code pages", () => {
    expect(decodeCsvBytes(fixture("tr-excel-windows-1254.csv")).encoding).toBe("windows-1254");
    expect(decodeCsvBytes(fixture("tr-excel-windows-1254.csv")).text).toContain("Şirket;Pozisyon;Durum");
    const de = decodeCsvBytes(fixture("de-excel-windows-1252.csv"));
    expect(de.encoding).toBe("windows-1252");
    expect(de.text).toContain("Vorstellungsgespräch");
    expect(de.text).toContain("Süd Möbel");
  });

  it("prefers valid UTF-8 and accepts an override", () => {
    const bytes = new TextEncoder().encode("Şirket;Durum");
    expect(decodeCsvBytes(bytes)).toEqual({ text: "Şirket;Durum", encoding: "utf-8" });
    expect(decodeCsvBytes(new Uint8Array([0xde]), "windows-1252").text).toBe("Þ");
  });
});

describe("parseDelimited / detectDelimiter", () => {
  it("parses RFC 4180 records", () => {
    expect(parseDelimited('a,"b ""c""",d\r\n"x\ny",,z\n', ",")).toEqual([
      ["a", 'b "c"', "d"],
      ["x\ny", "", "z"],
    ]);
    expect(parseDelimited("a;b", ";")).toEqual([["a", "b"]]);
  });

  it("picks the consistent delimiter", () => {
    expect(detectDelimiter("Firma;Ort\nKiez;Berlin, Deutschland\nHafen;Hamburg\n")).toBe(";");
    expect(detectDelimiter("Company,Role\nAcme,Engineer\n")).toBe(",");
    expect(detectDelimiter("Company\tRole\nAcme\tEngineer, Senior\n")).toBe("\t");
    expect(detectDelimiter("sep=|\nA|B\n")).toBe("|");
  });

  it("writes CSV that reads back, with formula guards", () => {
    const rows = [
      ["Company", "Notes"],
      ["Acme; GmbH", 'Said "hi"\nthen left'],
      ["=HYPERLINK()", "+1 555"],
    ];
    const text = writeCsv(rows);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("'=HYPERLINK()");
    expect(csvSafeCell("-5")).toBe("'-5");
    const table = readSpreadsheet(new TextEncoder().encode(text), "export.csv");
    expect(table.headers).toEqual(["Company", "Notes"]);
    expect(table.rows.map(({ cells }) => cells)).toEqual(rows.slice(1));
  });
});

describe("dates", () => {
  it("reads the usual spreadsheet forms", () => {
    expect(parseSpreadsheetDate("2026-10-12", "mdy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("12.10.2026", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("10/12/2026", "mdy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("12/10/26", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("46307", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("12 Oct 2026", "mdy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("Oct 12, 2026", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("12 Ekim 2026", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("12. Oktober 2026", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("12. März 2026 14:30", "dmy")).toEqual(day("2026-03-12"));
    expect(parseSpreadsheetDate("12.10.2026 14:30", "dmy")).toEqual(day("2026-10-12"));
    expect(parseSpreadsheetDate("2026-10-12T08:30:00Z", "dmy")).toEqual(new Date("2026-10-12T08:30:00Z"));
  });

  it("rejects what isn't a date", () => {
    for (const value of ["31.13.2026", "30.02.2026", "soon", "12", "2026", "1.2.3.4", "next week"])
      expect(parseSpreadsheetDate(value, "dmy"), value).toBeNull();
  });

  it("detects the numeric order of a column", () => {
    expect(detectDateOrder(["01/02/2026", "13/02/2026"], "mdy")).toBe("dmy");
    expect(detectDateOrder(["01/02/2026", "02/13/2026"], "dmy")).toBe("mdy");
    expect(detectDateOrder(["01/02/2026", "2026-02-13"], "mdy")).toBe("mdy");
  });

  it("formats export days in the user's zone", () => {
    expect(isoDay(new Date("2026-10-12T22:30:00Z"), "Europe/Istanbul")).toBe("2026-10-13");
    expect(isoDay(new Date("2026-10-12T22:30:00Z"), "America/New_York")).toBe("2026-10-12");
  });
});

describe("guessStatus", () => {
  it("understands EN, TR and DE trackers", () => {
    const cases: [string, string][] = [
      ["Applied", "applied"],
      ["Başvuruldu", "applied"],
      ["BAŞVURULDU", "applied"],
      ["beworben", "applied"],
      ["Mülakat", "interviewing"],
      ["Vorstellungsgespräch", "interviewing"],
      ["Interview round 2", "interviewing"],
      ["Phone screen", "screening"],
      ["Ön görüşme", "screening"],
      ["Olumsuz", "rejected"],
      ["Absage", "rejected"],
      ["Not selected", "rejected"],
      ["Rejected after interview", "rejected"],
      ["Yanıt yok", "ghosted"],
      ["Keine Rückmeldung", "ghosted"],
      ["No response yet", "ghosted"],
      ["Teklif", "offer"],
      ["Kabul edildi", "accepted"],
      ["Zurückgezogen", "withdrawn"],
      ["Wishlist", "saved"],
      ["In Vorbereitung", "preparing"],
    ];
    for (const [value, status] of cases) expect(guessStatus(value), value).toBe(status);
    expect(guessStatus("Belki")).toBeNull();
    expect(guessStatus("")).toBeNull();
  });

  it("matches the UI language's labels first", () => {
    const de = {
      saved: "Gespeichert",
      preparing: "In Vorbereitung",
      applied: "Beworben",
      acknowledged: "Eingang bestätigt",
      screening: "Vorauswahl",
      interviewing: "Vorstellungsgespräch",
      offer: "Angebot",
      accepted: "Angenommen",
      declined: "Abgelehnt",
      rejected: "Nicht ausgewählt",
      withdrawn: "Zurückgezogen",
      ghosted: "Keine Rückmeldung",
    } as const;
    expect(guessStatus("Abgelehnt", de)).toBe("declined");
    expect(guessStatus("Nicht ausgewählt", de)).toBe("rejected");
  });
});

describe("normalizeWord", () => {
  it("folds case, diacritics and Turkish i", () => {
    expect(normalizeWord("  İLAN Linki ")).toBe("ilan linki");
    expect(normalizeWord("Başvuru Tarihi")).toBe("basvuru tarihi");
    expect(normalizeWord("Größe")).toBe("grosse");
    expect(normalizeWord("Next-step (date)")).toBe("next step date");
  });
});

describe("readSpreadsheet", () => {
  it("reads a messy Turkish Excel export", () => {
    const table = readSpreadsheet(fixture("tr-excel-windows-1254.csv"), "takip.csv");
    expect(table.encoding).toBe("windows-1254");
    expect(table.delimiter).toBe(";");
    expect(table.headers).toEqual([
      "Şirket",
      "Pozisyon",
      "Durum",
      "Başvuru Tarihi",
      "Şehir",
      "İlan Linki",
      "Notlar",
      "Maaş Beklentisi",
    ]);
    // Title row skipped, blank row dropped, quoted newline kept; Excel row numbers.
    expect(table.rows).toHaveLength(9);
    expect(table.rows[0]?.rowNumber).toBe(3);
    expect(table.rows[2]?.cells[6]).toBe("Teşekkür maili geldi.\r\nTekrar başvurulabilir.");
    expect(table.rows[3]?.rowNumber).toBe(7);
  });

  it("reads UTF-16 tab-separated exports", () => {
    const table = readSpreadsheet(fixture("en-tsv-utf-16le.csv"), "jobs.tsv");
    expect([table.encoding, table.delimiter]).toEqual(["utf-16le", "\t"]);
    expect(table.headers).toEqual(["Company", "Role", "Stage", "Date Applied", "Link"]);
  });

  it("explains files it can't read", () => {
    const code = (bytes: Uint8Array) => {
      try {
        readSpreadsheet(bytes, "x.csv");
        return null;
      } catch (error) {
        return error instanceof SpreadsheetReadError ? error.code : String(error);
      }
    };
    expect(code(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]))).toBe("workbook");
    expect(code(new TextEncoder().encode(""))).toBe("empty");
    expect(code(new TextEncoder().encode("Company,Role\n"))).toBe("empty");
    expect(code(new TextEncoder().encode("just one column\nvalue\n"))).toBe("no_header");
    expect(code(new Uint8Array([0x61, 0x00, 0x00, 0x00, 0x62, 0x63, 0x64, 0x00]))).toBe("binary");
  });
});

describe("guessColumnMapping", () => {
  it("maps TR, DE and EN headers", () => {
    const tr = readSpreadsheet(fixture("tr-excel-windows-1254.csv"), "takip.csv");
    expect(guessColumnMapping(tr)).toEqual([
      "company",
      "role",
      "status",
      "appliedAt",
      "location",
      "link",
      "notes",
      null,
    ]);
    const de = readSpreadsheet(fixture("de-excel-windows-1252.csv"), "bewerbungen.csv");
    expect(guessColumnMapping(de)).toEqual(["company", "role", "status", "appliedAt", "location", "notes"]);
    const en = readSpreadsheet(fixture("en-tsv-utf-16le.csv"), "jobs.tsv");
    expect(guessColumnMapping(en)).toEqual(["company", "role", "status", "appliedAt", "link"]);
  });

  it("falls back to the values of unnamed columns", () => {
    const table = readSpreadsheet(
      new TextEncoder().encode(
        "Company,Role,,\nAcme,Engineer,Applied,https://acme.example\nBeta,Designer,Rejected,https://beta.example\n",
      ),
      "x.csv",
    );
    expect(guessColumnMapping(table)).toEqual(["company", "role", "status", "link"]);
  });
});

describe("planImport", () => {
  const table = readSpreadsheet(fixture("tr-excel-windows-1254.csv"), "takip.csv");

  it("plans each row with its issues", () => {
    const values = statusValues(table, guessColumnMapping(table));
    expect(values.map(({ value, guess }) => [value, guess])).toEqual([
      ["Başvuruldu", "applied"],
      ["Mülakat", "interviewing"],
      ["Belki", null],
      ["Kaydedildi", "saved"],
      ["Olumsuz", "rejected"],
      ["Teklif", "offer"],
      ["Yanıt yok", "ghosted"],
    ]);

    const plan = planImport(
      table,
      settings(table, { existing: [{ company: "KUZEY OYUN", role: "frontend engineer" }] }),
    );
    const byRow = new Map(plan.rows.map((row) => [row.rowNumber, row]));
    const codes = (rowNumber: number) => byRow.get(rowNumber)?.issues.map(({ code }) => code);

    const kervan = byRow.get(3)?.draft;
    expect(kervan).toMatchObject({
      company: "Kervan Teknoloji",
      role: "Frontend Geliştirici",
      status: "interviewing",
      appliedAt: day("2026-09-12"),
      statusChangedAt: day("2026-09-12"),
      occurredAt: day("2026-09-12"),
      location: "İstanbul",
      link: "https://kervan.example.com/jobs/12",
      notes: "İK ile görüştüm; teknik mülakat perşembe\nMaaş Beklentisi: 85.000 TL",
      priority: "normal",
      channel: null,
    });
    expect(byRow.get(4)?.draft?.link).toBe("https://www.anadolu.example.com/kariyer");
    // Saved rows have no applied date; the status date falls back to now.
    expect(byRow.get(7)?.draft).toMatchObject({
      status: "saved",
      appliedAt: null,
      statusChangedAt: NOW,
      notes: "Başvurulacak",
    });
    expect(codes(8)).toEqual(["duplicate_existing"]);
    expect(byRow.get(8)?.includeByDefault).toBe(false);
    expect(codes(9)).toEqual(["missing_company"]);
    expect(byRow.get(9)?.draft).toBeNull();
    expect(codes(10)).toEqual(["unmapped_status"]);
    expect(codes(11)).toEqual(["bad_date"]);
    expect(byRow.get(11)?.draft).toMatchObject({ status: "ghosted", appliedAt: null });
    expect(codes(12)).toEqual(["duplicate_in_file"]);
    expect([plan.ready, plan.blocked, plan.duplicates]).toEqual([7, 2, 2]);
  });

  it("imports once the user maps the unknown status", () => {
    const base = settings(table);
    const plan = planImport(table, { ...base, statusMap: { ...base.statusMap, belki: "saved" } });
    const marmara = plan.rows.find(({ rowNumber }) => rowNumber === 10);
    expect(marmara?.draft?.status).toBe("saved");
    expect(marmara?.issues.map(({ code }) => code)).toEqual(["applied_date_ignored"]);
  });

  it("uses the default status without a status column, and leaves out future dates", () => {
    const csv = "Company,Role,Applied,Next step,Due\nAcme,Engineer,01.12.2026,Call Ada,03.11.2026\n";
    const small = readSpreadsheet(new TextEncoder().encode(csv), "x.csv");
    const mapping: ColumnMapping = ["company", "role", "appliedAt", "nextAction", "nextActionAt"];
    const [row] = planImport(small, settings(small, { mapping, defaultStatus: "applied" })).rows;
    expect(row?.issues.map(({ code }) => code)).toEqual(["future_date"]);
    expect(row?.draft).toMatchObject({
      status: "applied",
      appliedAt: null,
      nextAction: "Call Ada",
      nextActionAt: day("2026-11-03"),
    });
  });

  it("truncates long values and reads channels and priorities", () => {
    const long = "x".repeat(250);
    const csv = `Company,Role,Channel,Priority\n${long},Engineer,LinkedIn Easy Apply,Yüksek\nBeta,Dev,Referans,\n`;
    const small = readSpreadsheet(new TextEncoder().encode(csv), "x.csv");
    const [first, second] = planImport(small, settings(small)).rows;
    expect(first?.draft?.company).toHaveLength(200);
    expect(first?.issues.map(({ code }) => code)).toEqual(["truncated"]);
    expect(first?.draft).toMatchObject({ channel: "external_link", priority: "high" });
    expect(second?.draft).toMatchObject({ channel: "referral", priority: "normal" });
  });
});

describe("import evidence", () => {
  it("round-trips the reason and recognises import events", () => {
    const reason = importEvidenceReason("takip.csv", 12);
    expect(reason).toBe("Imported from takip.csv · row 12");
    expect(parseImportEvidenceReason(reason)).toEqual({ fileName: "takip.csv", rowNumber: 12 });
    expect(importEvidenceReason("a".repeat(600), 1).length).toBeLessThanOrEqual(500);
    expect(isImportedEvent({ type: "created", evidence: { mailMessageId: null, reason } })).toBe(true);
    expect(isImportedEvent({ type: "created", evidence: null })).toBe(false);
    expect(isImportedEvent({ type: "note", evidence: { mailMessageId: null, reason } })).toBe(false);
  });
});
