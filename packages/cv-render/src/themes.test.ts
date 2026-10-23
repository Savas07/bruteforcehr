import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { renderFontsModule } from "../scripts/fonts";
import { EMBEDDED_FONTS } from "./fonts.generated";
import { CV_RENDER_VERSION, listAccents, listFontPairs, listTemplates } from "./index";
import { contrastOnWhite, FONT_PAIRS, MARGINS_PT, pageGeometry, printableAccent, PT_PER_MM } from "./themes";

describe("themes", () => {
  it("offers only accents with AA text contrast on white (≥ 4.5:1)", () => {
    const accents = listAccents();
    expect(accents.length).toBeGreaterThanOrEqual(6);
    for (const accent of accents) expect(contrastOnWhite(accent.hex)).toBeGreaterThanOrEqual(4.5);
    expect(accents.map((accent) => accent.hex)).toContain("#2F5D8A");
    expect(listAccents("tr").find((accent) => accent.id === "navy")?.name).toBe("Lacivert");
  });

  it("darkens a too-light custom accent to AA and keeps valid ones", () => {
    expect(printableAccent("#2F5D8A")).toBe("#2F5D8A");
    for (const light of ["#FFFF00", "#7FD1C8", "#FFFFFF"]) {
      expect(contrastOnWhite(printableAccent(light))).toBeGreaterThanOrEqual(4.5);
    }
    expect(printableAccent("teal")).toBe("#2F5D8A");
  });

  it("names 2–3 font pairs whose faces are embedded with Latin Extended (Turkish, German)", () => {
    expect(listFontPairs().map((pair) => pair.id)).toEqual([
      "inter-source-serif",
      "inter",
      "source-sans-serif",
    ]);
    for (const pair of FONT_PAIRS) {
      for (const id of [pair.heading, pair.body]) {
        expect(EMBEDDED_FONTS[id].faces.map((face) => face.subset)).toEqual(["latin", "latin-ext"]);
      }
    }
    // ğ ş İ live in latin-ext, ı in latin.
    const ext = EMBEDDED_FONTS.inter.faces[1]?.unicodeRange ?? "";
    expect(ext).toContain("U+0100-02BA");
  });

  it("keeps src/fonts.generated.ts and the OFL texts in sync with the pinned @fontsource packages", async () => {
    const { module, licences } = await renderFontsModule();
    expect(module === (await readFile(new URL("./fonts.generated.ts", import.meta.url), "utf8"))).toBe(true);
    for (const [id, text] of licences) {
      expect(await readFile(new URL(`../fonts/${id}/OFL.txt`, import.meta.url), "utf8")).toBe(text);
      expect(text).toContain("SIL Open Font License, Version 1.1");
    }
  });

  it("exposes page geometry per paper and density", () => {
    const mm = (pt: number) => pt / PT_PER_MM;
    expect(pageGeometry("a4", "compact").marginsMm).toEqual({
      top: mm(33),
      right: mm(36),
      bottom: mm(33),
      left: mm(39),
    });
    expect(pageGeometry("letter", "spacious")).toMatchObject({ widthMm: 215.9, heightMm: 279.4 });
    expect(pageGeometry("bogus", "bogus")).toMatchObject({ paper: "a4", marginsMm: { top: mm(45) } });
  });

  it("uses margins that Chromium and WebKit print identically", () => {
    // WebKit prints on whole-point paper and lays out floor(1.25 × printable size) CSS px.
    const webkitPaper = { a4: { width: 595, height: 842 }, letter: { width: 612, height: 792 } } as const;
    for (const byPaper of Object.values(MARGINS_PT)) {
      for (const [paper, { top, right, bottom, left }] of Object.entries(byPaper)) {
        for (const margin of [top, right, bottom, left]) expect(margin % 3).toBe(0);
        const { width, height } = webkitPaper[paper as keyof typeof webkitPaper];
        expect((width - left - right) % 4, `${paper} width`).toBe(0);
        expect((height - top - bottom) % 4, `${paper} height`).toBe(0);
      }
    }
  });

  it("lists localized templates", () => {
    expect(listTemplates().map((item) => item.id)).toEqual(["classic", "modern", "compact"]);
    expect(listTemplates("de-DE")[0]?.name).toBe("Klassisch");
    expect(listTemplates("tr")[2]?.description).toContain("Tek sütun");
  });

  it("keeps CV_RENDER_VERSION equal to package.json", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(CV_RENDER_VERSION).toBe(pkg.version);
  });
});
