// @vitest-environment happy-dom
import { populatedDataset } from "@bfhr/fixtures";
import { Tooltip } from "radix-ui";
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import type { ListNavigation } from "../../shared/ui/focus";
import { EmptyResults, JobList } from "./JobList";
import { buildJobDetailModel } from "./model";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
const ctx = fixtureContext(populatedDataset);
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

const render = (node: ReactNode) =>
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>{node}</Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );

const nav: ListNavigation = {
  itemProps: (id) => ({
    tabIndex: -1,
    "data-nav-id": id,
    "aria-current": undefined,
    onFocus: () => undefined,
  }),
  focusItem: () => undefined,
};

describe("EmptyResults", () => {
  const model = buildJobDetailModel(populatedDataset, ctx, { posted: "1", match: "strong", level: "intern" });
  const empty = model.list.empty;
  if (!empty) throw new Error("expected zero results");

  it("renders one removable chip per filter that removes only its facet", () => {
    const onRemoveFacet = vi.fn();
    const onAction = vi.fn();
    render(
      <EmptyResults
        empty={empty}
        searchDisabledReason={null}
        onRemoveFacet={onRemoveFacet}
        onAction={onAction}
        onSearchSites={() => undefined}
      />,
    );
    const chips = [...container.querySelectorAll<HTMLButtonElement>("[data-remove-facet]")];
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual(
      empty.chips.map((chip) => chip.removeLabel),
    );
    for (const chip of empty.chips.filter((candidate) => candidate.count)) {
      const button = container.querySelector(`[data-remove-facet="${chip.facet}"]`);
      const description = document.getElementById(button?.getAttribute("aria-describedby") ?? "");
      expect(description?.textContent).toBe(chip.count?.hint);
    }
    act(() => chips[1]?.click());
    expect(onRemoveFacet).toHaveBeenCalledExactlyOnceWith(empty.chips[1]?.facet);
    const removeAll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Remove all filters",
    );
    act(() => removeAll?.click());
    expect(onAction).toHaveBeenCalledOnce();
  });
});

describe("JobList sort menu", () => {
  it("offers Best match and Newest, explains the ranking and reports the choice", () => {
    const model = buildJobDetailModel(populatedDataset, ctx, {});
    const onSortChange = vi.fn();
    render(
      <JobList
        model={model}
        rows={model.list.rows.slice(0, 2)}
        savedOf={(row) => row.saved}
        selectedId={null}
        placeholder={null}
        listRef={createRef()}
        nav={nav}
        reasonsOpen={false}
        onReasonsOpenChange={() => undefined}
        onSaveReasons={() => undefined}
        onSelect={() => undefined}
        onToggleSave={() => undefined}
        onNotForMe={() => undefined}
        onOpenOriginal={() => undefined}
        onSortChange={onSortChange}
        stamp={null}
      />,
    );
    const trigger = container.querySelector<HTMLButtonElement>("[data-sort-trigger]");
    if (!trigger) throw new Error("no sort trigger");
    expect(trigger.textContent).toBe("Sorted by Best match");
    expect(document.getElementById(trigger.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      model.list.rankingInfo,
    );
    act(() => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(items.map((item) => [item.textContent, item.getAttribute("aria-checked")])).toEqual([
      ["Best match", "true"],
      ["Newest", "false"],
    ]);
    act(() => items[1]?.click());
    expect(onSortChange).toHaveBeenCalledExactlyOnceWith("newest");
  });
});
