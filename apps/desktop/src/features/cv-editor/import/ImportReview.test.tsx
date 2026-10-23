// @vitest-environment happy-dom
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../../i18n/intl";
import { ImportReview, type ImportReviewResult } from "./ImportReview";
import { buildReviewModel } from "./model";
import type { JsonResume } from "./schema";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
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

const resume: JsonResume = {
  basics: { name: "Deniz Aksoy", email: "deniz@example.com" },
  work: [
    { name: "Acme", position: "Engineer", startDate: "2021-03", highlights: ["Shipped the design system"] },
  ],
};

function render(onCreate: (result: ImportReviewResult) => Promise<void>) {
  const review = buildReviewModel(resume, { "/work/0/startDate": 0.3, "/basics/name": 0.5 });
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <ImportReview
            review={review}
            warnings={["Page 2 was an image, so it was skipped."]}
            fileName="Deniz_Aksoy_CV.pdf"
            kind="pdf"
            aiAssisted
            defaultTitle="Deniz Aksoy CV"
            defaultLanguage="en"
            onCreate={onCreate}
            onTryAnotherFile={() => {}}
          />
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
}

function byLabel(label: string): HTMLInputElement | HTMLTextAreaElement {
  const field = [
    ...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
  ].find((input) => container.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent === label);
  if (!field) throw new Error(`No field labelled "${label}"`);
  return field;
}
const button = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(name),
  );

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ImportReview", () => {
  it("summarizes, marks and counts down the fields to check", () => {
    render(async () => {});
    expect(container.textContent).toContain("We read 6 fields. 2 need a quick look.");
    expect(container.textContent).toContain("2 fields left to check");
    expect(container.textContent).toContain("Page 2 was an image, so it was skipped.");
    expect(container.textContent).toContain("Kept attached to this CV");
    expect(container.querySelectorAll("[id$='-tag']")).toHaveLength(2);

    const start = byLabel("Start");
    expect(start.getAttribute("aria-describedby")).toContain(`${start.id}-tag`);
    type(start, "2021-04");
    expect(container.textContent).toContain("Edited");
    expect(container.textContent).toContain("1 field left to check");

    act(() => button("Looks right")?.click());
    expect(container.textContent).toContain("You've checked every flagged field.");
  });

  it("blocks Create CV on an invalid date and passes edits on create", async () => {
    const onCreate = vi.fn(async (_result: ImportReviewResult) => {});
    render(onCreate);
    const start = byLabel("Start");
    type(start, "March 2021");
    expect(start.getAttribute("aria-invalid")).toBe("true");
    act(() => button("Create CV")?.click());
    expect(onCreate).not.toHaveBeenCalled();

    type(start, "04/2021");
    await act(async () => button("Create CV")?.click());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      title: "Deniz Aksoy CV",
      language: "en",
      values: { "/work/0/startDate": "04/2021", "/basics/name": "Deniz Aksoy" },
    });
  });

  it("keeps the review open with a calm error when creating fails", async () => {
    render(async () => {
      throw new Error("offline");
    });
    await act(async () => button("Create CV")?.click());
    expect(container.querySelector("[role='alert']")?.textContent).toContain("Couldn't create the CV");
    expect(button("Create CV")).toBeDefined();
  });
});
