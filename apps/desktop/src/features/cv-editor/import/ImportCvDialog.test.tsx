// @vitest-environment happy-dom
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../../i18n/intl";
import { ImportCvDialog } from "./ImportCvDialog";
import type { ImportedCv } from "./model";
import { requestCvImport, startImportUpload } from "./service";

vi.mock("./service", () => ({ startImportUpload: vi.fn(), requestCvImport: vi.fn() }));

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-US" });
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(startImportUpload).mockImplementation((uid, _file, contentType, onProgress) => {
    onProgress(5, 10);
    return {
      storagePath: `users/${uid}/cv-imports/f1-${contentType.length}`,
      done: Promise.resolve(),
      cancel: vi.fn(),
    };
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render(onCreate: (cv: ImportedCv) => Promise<void> = async () => {}) {
  const onOpenChange = vi.fn();
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <ImportCvDialog open onOpenChange={onOpenChange} uid="u1" onCreate={onCreate} />
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
  return onOpenChange;
}

const dialog = () => document.querySelector<HTMLElement>("[role='dialog']");
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")].find((candidate) =>
    candidate.textContent?.includes(name),
  );

async function choose(file: File) {
  const input = document.querySelector<HTMLInputElement>("[role='dialog'] input[type='file']");
  if (!input) throw new Error("no file input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const pdf = () => new File(["%PDF-1.7"], "Deniz_Aksoy_CV.pdf", { type: "application/pdf" });

describe("ImportCvDialog", () => {
  it("states formats and limits, and rejects unsupported files without uploading", async () => {
    render();
    expect(dialog()?.textContent).toContain("up to 20 MB");
    expect(document.activeElement?.textContent).toContain("Choose file…");
    await choose(new File(["x"], "cv.pages", { type: "" }));
    expect(dialog()?.textContent).toContain("We can't import this type of file");
    expect(startImportUpload).not.toHaveBeenCalled();
  });

  it("uploads, reads and reviews, then hands the new CV to onCreate", async () => {
    vi.mocked(requestCvImport).mockResolvedValue({
      resume: {
        basics: { name: "Deniz Aksoy" },
        work: [{ name: "Acme", position: "Engineer", startDate: "2021-03" }],
      },
      confidence: { "/work/0/startDate": 0.4 },
      warnings: [],
      model: "claude",
      promptVersion: "1",
    });
    const onCreate = vi.fn(async (_cv: ImportedCv) => {});
    const onOpenChange = render(onCreate);
    await choose(pdf());
    expect(startImportUpload).toHaveBeenCalledWith(
      "u1",
      expect.any(File),
      "application/pdf",
      expect.any(Function),
    );
    expect(requestCvImport).toHaveBeenCalledWith("users/u1/cv-imports/f1-15", "pdf");
    expect(dialog()?.textContent).toContain("Did we read your CV correctly?");
    expect(dialog()?.textContent).toContain("1 needs a quick look");

    await act(async () => button("Create CV")?.click());
    const cv = onCreate.mock.calls[0]?.[0];
    expect(cv).toMatchObject({
      title: "Deniz Aksoy CV",
      language: "en",
      importedFrom: { kind: "pdf", storagePath: "users/u1/cv-imports/f1-15", fileName: "Deniz_Aksoy_CV.pdf" },
    });
    expect(cv?.content.meta).toMatchObject({ template: "classic", sectionOrder: ["basics", "work"] });
    expect(cv?.content.meta.theme.paperSize).toBe("letter");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("explains the daily AI cap calmly and offers another file", async () => {
    vi.mocked(requestCvImport).mockRejectedValue({
      code: "functions/resource-exhausted",
      details: { reason: "daily_cap" },
    });
    render();
    await choose(pdf());
    expect(dialog()?.querySelector("[role='alert']")?.textContent).toContain(
      "You've reached today's limit for reading CVs",
    );
    expect(button("Try again")).toBeUndefined();
    await act(async () => button("Try another file")?.click());
    expect(dialog()?.textContent).toContain("Drop your CV here");
  });

  it("retries reading the same stored file after a server error", async () => {
    vi.mocked(requestCvImport).mockRejectedValueOnce({ code: "functions/internal" });
    vi.mocked(requestCvImport).mockRejectedValueOnce({ code: "functions/internal" });
    render();
    await choose(pdf());
    expect(dialog()?.textContent).toContain("Something went wrong while reading your CV");
    await act(async () => button("Try again")?.click());
    expect(startImportUpload).toHaveBeenCalledTimes(1);
    expect(requestCvImport).toHaveBeenCalledTimes(2);
  });
});
