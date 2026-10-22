// @vitest-environment happy-dom
import { populatedDataset } from "@bfhr/fixtures";
import { Tooltip } from "radix-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import type { ReviewProposalVM } from "../model/blocks";
import { reviewProposalVM } from "../model/build-blocks";
import { fixtureContext } from "../model/fixture-context";
import { ReviewDetailPane } from "./ReviewDetailPane";

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

/** The "Application" field's value as rendered. */
function applicationField(proposal: ReviewProposalVM): string | undefined {
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <Tooltip.Provider>
          <ReviewDetailPane
            proposal={proposal}
            onConfirm={() => undefined}
            onChange={() => undefined}
            onNotJobMail={() => undefined}
          />
        </Tooltip.Provider>
      </RawIntlProvider>,
    ),
  );
  const term = [...container.querySelectorAll("dt")].find((dt) => dt.textContent === "Application");
  return term?.nextElementSibling?.textContent ?? undefined;
}

const proposalFor = (predicate: (mail: (typeof populatedDataset.mailMessages)[number]) => boolean) => {
  const mail = populatedDataset.mailMessages.find(predicate);
  if (!mail) throw new Error("fixture email missing");
  return reviewProposalVM(mail, populatedDataset, ctx);
};

describe("ReviewDetailPane application field", () => {
  it("shows the linked application when the email proposes no move", () => {
    const proposal = proposalFor((mail) => mail.id === "mail-sail-outreach");
    expect(proposal.move).toBeNull();
    expect(applicationField(proposal)).toBe(proposal.application?.label);
  });

  it("shows the move's application when a move is proposed", () => {
    const proposal = proposalFor((mail) => mail.applicationId !== null && mail.suggestedStatus !== null);
    expect(applicationField(proposal)).toBe(proposal.move?.applicationLabel);
  });

  it('says "No application found" for an unlinked email without a move', () => {
    const proposal = proposalFor((mail) => mail.applicationId === null);
    expect(applicationField({ ...proposal, move: null })).toBe("No application found");
  });
});
