import { populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { reviewProposalVM } from "./build-blocks";
import { fixtureContext } from "./fixture-context";

const data = populatedDataset;
const ctx = fixtureContext(data);
const message = (id: string) => {
  const found = data.mailMessages.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`fixture ${id} missing`);
  return found;
};

describe("reviewProposalVM application", () => {
  it("names the linked application when the email proposes no status move", () => {
    const vm = reviewProposalVM(message("mail-sail-outreach"), data, ctx);
    expect(vm.move).toBeNull();
    expect(vm.application).toEqual({ id: "app-sail", label: expect.stringMatching(/^Sail Analytics · /) });
  });

  it("names the linked application alongside a proposed move", () => {
    const linked = data.mailMessages.find(
      (mail) => mail.applicationId !== null && mail.suggestedStatus !== null,
    );
    if (!linked?.applicationId) throw new Error("fixture: no linked email with a proposed move");
    const vm = reviewProposalVM(linked, data, ctx);
    expect(vm.application?.id).toBe(linked.applicationId);
    expect(vm.move?.applicationLabel).toBe(vm.application?.label);
  });

  it("is null when the email isn't linked to an application", () => {
    const unlinked = data.mailMessages.find((mail) => mail.applicationId === null);
    if (!unlinked) throw new Error("fixture: no unlinked email");
    expect(reviewProposalVM(unlinked, data, ctx).application).toBeNull();
  });
});
