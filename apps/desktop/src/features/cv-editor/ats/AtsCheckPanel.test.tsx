// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../../i18n/intl";
import { sampleCv } from "./__fixtures__/sampleCv";
import { AtsCheckPanel, type AtsCheckPanelProps } from "./AtsCheckPanel";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pdf = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, "__fixtures__/sample-cv-classic.pdf")),
);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<AtsCheckPanelProps> = {}, language: "en" | "de" = "en") {
  const intl = createAppIntl({ language, locale: language === "en" ? "en-GB" : "de-DE" });
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <AtsCheckPanel makePdf={async () => pdf} content={sampleCv} language="en" {...props} />
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
}

const button = (name: string | RegExp): HTMLButtonElement => {
  const match = [...container.querySelectorAll("button")].find((element) =>
    typeof name === "string"
      ? element.textContent === name || element.getAttribute("aria-label") === name
      : name.test(element.getAttribute("aria-label") ?? element.textContent ?? ""),
  );
  if (!match) throw new Error(`no button ${String(name)}`);
  return match;
};

async function runCheck(): Promise<void> {
  await act(async () => button(/Run check|Check again|Try again/).click());
  await vi.waitFor(() => {
    if (container.querySelector("[aria-busy], [role=status] svg.animate-spin"))
      throw new Error("still checking");
    if (!container.textContent?.match(/read back from the PDF|Couldn't/)) throw new Error("no result yet");
  });
}

function typeJob(text: string): void {
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("no textarea");
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("AtsCheckPanel", () => {
  it("exports, reads back and lists every section with icon and text", async () => {
    const makePdf = vi.fn(async () => pdf);
    render({ makePdf });
    expect(container.textContent).toContain("Run check");
    await runCheck();
    expect(makePdf).toHaveBeenCalledOnce();
    expect(container.querySelector(".sr-only[role=status]")?.textContent).toBe(
      "8 of 8 sections read back from the PDF.",
    );
    const rows = [...container.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows).toEqual(
      expect.arrayContaining([
        "Name · Read back",
        "Email · Read back",
        "Phone · Read back",
        "Name and contact details · Read back",
        "Summary · Read back",
        "Experience · Read back",
        "Talks · Read back",
      ]),
    );
    // Status is never colour alone: each row has its icon and the status in words.
    expect(container.querySelectorAll("li svg[aria-hidden=true]").length).toBeGreaterThanOrEqual(10);
    expect(container.textContent).toContain("Check again");
  });

  it("shows what a parser sees on request", async () => {
    render();
    await runCheck();
    expect(container.querySelector("pre")).toBeNull();
    act(() => button("What a parser sees").click());
    const text = container.querySelector("pre");
    expect(text?.getAttribute("aria-label")).toMatch(/^Text read from the PDF, (1 page|\d+ pages)$/);
    expect(text?.textContent).toContain("Orta Doğu Teknik Üniversitesi");
  });

  it("names a section whose heading didn't read back", async () => {
    render({ content: { ...sampleCv, meta: { ...sampleCv.meta, sectionOrder: ["work"] } }, language: "de" });
    await runCheck();
    expect(container.textContent).toContain("Berufserfahrung · Partly read back");
    expect(container.textContent).toContain("The heading “Berufserfahrung” wasn't found.");
  });

  it("follows the outline of the render behind the PDF", async () => {
    const outline = [
      { key: "work", heading: "Experience", entries: ["Senior Backend Engineer", "Chief Dreamer"] },
    ];
    render({ outline });
    await runCheck();
    expect(container.textContent).toContain("Experience · Partly read back");
    expect(container.textContent).toContain("Not in the PDF text: Chief Dreamer");
    expect(container.textContent).not.toContain("Summary · ");
  });

  it("covers job keywords and offers missing ones for Skills", async () => {
    const onAddKeyword = vi.fn();
    render({ onAddKeyword });
    typeJob("We need Kubernetes, Terraform and C#. Terraform runs our infrastructure.");
    expect(container.textContent).toContain("Run the check to compare these keywords with your PDF.");
    await runCheck();
    expect(container.textContent).toContain("Covers 2 of 3 keywords from this job");
    expect(container.textContent).toContain("Missing (1)");
    act(() => button("Add “Terraform” to Skills").click());
    expect(onAddKeyword).toHaveBeenCalledWith("Terraform");
    expect(container.textContent).toContain("Added to Skills. Check again to see them in your PDF.");
    expect(() => button("Add “Terraform” to Skills")).toThrow();
  });

  it("says when the CV changed since the check", async () => {
    render();
    await runCheck();
    render({ content: { ...sampleCv, basics: { ...sampleCv.basics, label: "Staff Engineer" } } });
    expect(container.textContent).toContain("You've edited your CV since this check.");
  });

  it("explains a failed export and lets the user try again", async () => {
    const makePdf = vi.fn().mockRejectedValueOnce(new Error("render failed")).mockResolvedValue(pdf);
    render({ makePdf });
    await runCheck();
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Couldn't create the PDF.");
    await runCheck();
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(container.textContent).toContain("8 of 8 sections read back from the PDF.");
  });
});
