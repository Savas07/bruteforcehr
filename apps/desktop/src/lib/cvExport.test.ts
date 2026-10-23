import { beforeEach, describe, expect, it, vi } from "vitest";
import { printCvPdf, saveExportFile } from "./cvExport";

// vi.mock is hoisted above the imports, so ./cvExport sees the mock.
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  invoke.mockReset();
});

describe("printCvPdf", () => {
  it("sends the HTML and paper and returns the PDF's bytes", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7");
    invoke.mockResolvedValue(pdf.buffer);

    const bytes = await printCvPdf("<!doctype html><p>CV</p>", "letter");

    expect(invoke).toHaveBeenCalledWith("print_cv_pdf", { html: "<!doctype html><p>CV</p>", paper: "letter" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-1.7");
  });

  it("passes the backend's error through", async () => {
    const error = { kind: "print-failed", message: "printing the CV failed: no webview" };
    invoke.mockRejectedValue(error);
    await expect(printCvPdf("<p>CV</p>", "a4")).rejects.toBe(error);
  });
});

describe("saveExportFile", () => {
  it("sends the bytes as the raw body and the name and kind as headers", async () => {
    invoke.mockResolvedValue("/Users/ada/Documents/Şule-Yılmaz-CV-Acme GmbH.pdf");
    const bytes = new Uint8Array([37, 80, 68, 70]);

    const path = await saveExportFile(bytes, "Şule-Yılmaz-CV-Acme GmbH.pdf", "pdf");

    expect(path).toBe("/Users/ada/Documents/Şule-Yılmaz-CV-Acme GmbH.pdf");
    expect(invoke).toHaveBeenCalledWith("save_export", bytes, {
      headers: {
        "bfhr-file-name": "%C5%9Eule-Y%C4%B1lmaz-CV-Acme%20GmbH.pdf",
        "bfhr-export-kind": "pdf",
      },
    });
  });

  it("returns null when the dialog is cancelled", async () => {
    invoke.mockResolvedValue(null);
    await expect(saveExportFile(new Uint8Array([123, 125]), "Ada-Lovelace-CV.json", "json")).resolves.toBeNull();
  });
});
