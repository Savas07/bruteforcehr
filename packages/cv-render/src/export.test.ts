import { CvContentSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { fullCv } from "../test/samples";
import { exportFileName, exportJsonResume, JSON_RESUME_SCHEMA_URL, splitName } from "./index";

describe("exportFileName", () => {
  it("builds First-Last-CV-<Company>.<ext>, or First-Last-CV.<ext> without a company", () => {
    expect(
      exportFileName({ firstName: "Deniz", lastName: "Aksoy", company: "Tannenbaum GmbH", ext: "pdf" }),
    ).toBe("Deniz-Aksoy-CV-Tannenbaum-GmbH.pdf");
    expect(exportFileName({ firstName: "Deniz", lastName: "Aksoy", ext: "docx" })).toBe(
      "Deniz-Aksoy-CV.docx",
    );
    expect(exportFileName({ ext: "json" })).toBe("CV.json");
  });

  it("keeps names ASCII-safe for upload forms (Turkish dotless i, German umlauts)", () => {
    expect(exportFileName({ firstName: "Şükrü", lastName: "Öztürk", company: "Işık A.Ş.", ext: "pdf" })).toBe(
      "Sukru-Ozturk-CV-Isik-A-S.pdf",
    );
    expect(exportFileName({ firstName: "İpek", lastName: "Çağlar", ext: "pdf" })).toBe("Ipek-Caglar-CV.pdf");
    expect(
      exportFileName({
        firstName: "Jürgen",
        lastName: "Weiß",
        company: "Müller & Söhne",
        ext: "pdf",
        locale: "de",
      }),
    ).toBe("Juergen-Weiss-CV-Mueller-Soehne.pdf");
    expect(
      exportFileName({ firstName: "Anna Maria", lastName: "O'Neil", company: "../../etc", ext: "pdf" }),
    ).toBe("Anna-Maria-O-Neil-CV-etc.pdf");
  });

  it("splits basics.name on the last word", () => {
    expect(splitName("Deniz Aksoy")).toEqual({ firstName: "Deniz", lastName: "Aksoy" });
    expect(splitName("Anna Maria von Berg")).toEqual({ firstName: "Anna Maria von", lastName: "Berg" });
    expect(splitName(" Cher ")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitName(undefined)).toEqual({ firstName: "", lastName: "" });
  });
});

describe("exportJsonResume", () => {
  it("writes a JSON Resume document that imports back losslessly", () => {
    const json = exportJsonResume(fullCv, { lastModified: new Date("2026-10-23T09:00:00Z") });
    const parsed = JSON.parse(json) as Record<string, unknown> & { meta: Record<string, unknown> };
    expect(parsed.$schema).toBe(JSON_RESUME_SCHEMA_URL);
    expect(parsed.meta.lastModified).toBe("2026-10-23T09:00:00.000Z");
    expect(parsed.meta.version).toBe("v1.0.0");
    const { $schema: _schema, ...content } = parsed;
    const back = CvContentSchema.parse(content);
    expect(back.work).toEqual(fullCv.work);
    expect(back.meta.sectionOrder).toEqual(fullCv.meta.sectionOrder);
    expect(back.meta.customSections).toEqual(fullCv.meta.customSections);
    expect(back.meta.personal).toEqual(fullCv.meta.personal);
  });
});
