// @vitest-environment happy-dom
import { Tooltip } from "radix-ui";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { type ToastOptions, ToastProvider, ToastViewport, useToast } from "./Toast";

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

function Show({ options }: { options: ToastOptions }) {
  const toast = useToast();
  useEffect(() => toast.show(options), [toast, options]);
  return null;
}

function render(options: ToastOptions) {
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <ToastProvider>
            <Show options={options} />
            <ToastViewport />
          </ToastProvider>
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("li button")];

describe("Toast secondaryAction", () => {
  it('renders "Undo · Why?" (D19) as two keyboard-reachable buttons, each announced', () => {
    const undo = vi.fn();
    const why = vi.fn();
    render({
      message: "Hidden from your feed",
      action: { label: "Undo", run: undo },
      secondaryAction: { label: "Why?", run: why },
    });
    const labels = buttons().map((button) => button.textContent);
    expect(labels[0]).toContain("Undo");
    expect(labels[1]).toBe("Why?");
    // Real <button>s (tab order, F6 into the viewport); Radix announces actions via altText.
    const announced = [...document.querySelectorAll("[data-radix-toast-announce-alt]")].map((node) =>
      node.getAttribute("data-radix-toast-announce-alt"),
    );
    expect(announced).toEqual([expect.stringMatching(/^Undo, /), "Why?"]);

    act(() => buttons()[1]?.click());
    expect(why).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
  });

  it("keeps a single action when no secondary action is given", () => {
    render({
      variant: "info",
      message: "Notice period copied",
      action: { label: "View", run: () => undefined },
    });
    expect(buttons().map((button) => button.textContent)).toEqual(["View", ""]);
  });
});
