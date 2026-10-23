import JSZip from "jszip";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIife } from "../scripts/build";
import { deCv, fullCv, inputFor, PHOTO_DATA_URL, trCv } from "../test/samples";
import { renderCvHtml } from "./index";

let dir: string;
let code: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "cv-render-iife-"));
  await buildIife(join(dir, "cv-render.iife.js"));
  code = await readFile(join(dir, "cv-render.iife.js"), "utf8");
}, 60_000);
afterAll(() => rm(dir, { recursive: true, force: true }));

/**
 * A context with only ECMAScript built-ins, like a bare iOS `JSContext`: no window/document, no
 * console, no timers, no TextEncoder/atob/btoa/URL/Buffer. Inputs cross as JSON, as from Swift.
 */
function bareEngine() {
  const context = createContext({});
  runInContext(code, context);
  return {
    globals: () => runInContext("Object.getOwnPropertyNames(globalThis)", context) as string[],
    call: (expression: string, input?: unknown) =>
      runInContext(`(function (input) { return ${expression}; })(${JSON.stringify(input ?? null)})`, context),
  };
}

describe("dist/cv-render.iife.js in a JS engine without DOM or host APIs", () => {
  it("has no DOM / Node / host references a bare JSContext lacks", () => {
    const engine = bareEngine();
    // (V8 contexts always carry a no-op `console`; the bundle never relies on it.)
    const missing = [
      "window",
      "document",
      "setTimeout",
      "TextEncoder",
      "atob",
      "btoa",
      "URL",
      "Buffer",
      "process",
    ];
    for (const name of missing) expect(engine.globals()).not.toContain(name);
    expect(engine.call("typeof BFHRCvRender.renderCvHtml")).toBe("function");
  });

  it("renders byte-identical HTML to the ESM build (one renderer)", () => {
    const engine = bareEngine();
    for (const [content, locale, templateId] of [
      [deCv, "de", "classic"],
      [trCv, "tr", "compact"],
      [fullCv, "en", "modern"],
    ] as const) {
      const input = {
        ...inputFor(content, locale, templateId, "letter"),
        photo: { dataUrl: PHOTO_DATA_URL },
      };
      const result = engine.call("BFHRCvRender.renderCvHtml(input)", input) as {
        html: string;
        page: unknown;
      };
      const expected = renderCvHtml(input);
      expect(result.html === expected.html).toBe(true);
      expect(JSON.parse(JSON.stringify(result.page))).toEqual(expected.page);
    }
  });

  it("exposes the listing helpers and file names", () => {
    const engine = bareEngine();
    expect(engine.call("BFHRCvRender.listTemplates('de').map(t => t.name).join()")).toBe(
      "Klassisch,Modern,Kompakt",
    );
    expect(engine.call("BFHRCvRender.listFontPairs().length")).toBe(3);
    expect(engine.call("BFHRCvRender.listAccents()[0].hex")).toBe("#2F5D8A");
    expect(
      engine.call("BFHRCvRender.exportFileName(input)", {
        firstName: "Deniz",
        lastName: "Aksoy",
        ext: "pdf",
      }),
    ).toBe("Deniz-Aksoy-CV.pdf");
  });

  it("builds DOCX (base64) without timers or TextEncoder", async () => {
    const engine = bareEngine();
    const base64 = (await engine.call(
      "BFHRCvRender.buildCvDocxBase64(input)",
      inputFor(trCv, "tr"),
    )) as string;
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
    expect(await zip.file("word/document.xml")?.async("string")).toContain("DENEYİM");
  });
});
