// @vitest-environment happy-dom
import type { MatchBand } from "@bfhr/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { MatchBandBar } from "./MatchBand";

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

const scores: Record<MatchBand, number> = { stretch: 20, partial: 50, good: 72, strong: 90 };
const order: readonly MatchBand[] = ["stretch", "partial", "good", "strong"];

describe("MatchBandBar", () => {
  for (const band of order) {
    it(`fills only the ${band} segment, ${band === "good" || band === "strong" ? "accent" : "neutral"}`, () => {
      const intl = createAppIntl({ language: "en", locale: "en-GB" });
      act(() =>
        root.render(
          <RawIntlProvider value={intl}>
            <MatchBandBar match={{ score: scores[band], band, bandLabel: band, pillLabel: band }} />
          </RawIntlProvider>,
        ),
      );
      const track = container.querySelector("[aria-hidden] > div");
      if (!track) throw new Error("no track");
      const fills = [...track.children].slice(0, 4).map((segment) => segment.className);
      const expected = band === "good" || band === "strong" ? "bg-accent-solid" : "bg-chart-neutral";
      order.forEach((segmentBand, index) => {
        if (segmentBand === band) expect(fills[index]).toContain(expected);
        else expect(fills[index]).toContain("bg-surface-sunken");
      });
      expect(fills.join(" ").match(/bg-(accent-solid|chart-neutral)/gu)).toHaveLength(1);
    });
  }
});
