// @vitest-environment happy-dom
import { populatedDataset } from "@bfhr/fixtures";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { fixtureContext } from "../../shared/model/fixture-context";
import { buildTrackerBoardModel } from "./model";
import { RecordDetail } from "./RecordDetail";

declare global {
  // React's act() environment flag for a setup without a test library.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

describe("RecordDetail", () => {
  for (const language of ["en", "tr", "de"] as const) {
    it(`renders every populated application's detail (${language})`, () => {
      const intl = createAppIntl({
        language,
        locale: language === "en" ? "en-GB" : `${language}-${language.toUpperCase()}`,
      });
      const ctx = fixtureContext(populatedDataset, [], intl);
      for (const application of populatedDataset.applications) {
        const selected = buildTrackerBoardModel(populatedDataset, ctx, {
          applicationId: application.id,
        }).selected;
        if (!selected) throw new Error(`no selection for ${application.id}`);
        act(() =>
          root.render(
            <RawIntlProvider value={intl}>
              <Tooltip.Provider>
                <RecordDetail
                  selected={selected}
                  nudgeHidden={false}
                  menuOpen={false}
                  onMenuOpenChange={vi.fn()}
                  onMove={vi.fn()}
                  onUndoEvent={vi.fn()}
                  onViewSource={vi.fn()}
                  onNudgePrimary={vi.fn()}
                  onNudgeSecondary={vi.fn()}
                  onOpenCv={vi.fn()}
                />
              </Tooltip.Provider>
            </RawIntlProvider>,
          ),
        );
        expect(container.querySelector("h2")?.textContent).toBe(application.role);
        expect(container.querySelectorAll("ol > li").length).toBe(selected.timeline.length);
      }
    });
  }
});
