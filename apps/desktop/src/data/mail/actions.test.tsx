// @vitest-environment happy-dom
import type { MailMessage } from "@bfhr/core";
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RawIntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { ToastProvider } from "../../shared/ui/Toast";
import { TrackerSourceContext } from "../tracker/live";
import { createMemoryTrackerStore, type MemoryTrackerStore } from "../tracker/memory";
import { TrackerRepositoryContext } from "../tracker/repository";
import { flushHeldDecisions, type MailActions, REVIEW_HOLD_MS, useMailActions } from "./actions";
import { MailProviders } from "./live";
import { createMemoryMailStore, type MemoryMailStore } from "./memory";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const intl = createAppIntl({ language: "en", locale: "en-GB" });
let container: HTMLDivElement;
let root: Root;
let tracker: MemoryTrackerStore;
let mail: MemoryMailStore;
const probe: { actions: MailActions | null } = { actions: null };

function Probe() {
  const actions = useMailActions();
  useEffect(() => {
    probe.actions = actions;
  });
  return null;
}

function actionsOf(): MailActions {
  if (!probe.actions) throw new Error("not rendered");
  return probe.actions;
}

function stored(id: string): MailMessage {
  const state = mail.source.getState();
  const found = state.status === "ready" ? state.data.mailMessages.find((message) => message.id === id) : undefined;
  if (!found) throw new Error(`no message ${id}`);
  return found;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  tracker = createMemoryTrackerStore(populatedDataset, () => FIXTURE_NOW);
  mail = createMemoryMailStore({
    accounts: populatedDataset.mailAccounts,
    messages: populatedDataset.mailMessages,
    now: () => FIXTURE_NOW,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <RawIntlProvider value={intl}>
        <ToastProvider>
          <TrackerRepositoryContext.Provider value={tracker.repository}>
            <TrackerSourceContext.Provider value={tracker.source}>
              <MailProviders source={mail.source} repository={mail.repository}>
                <Probe />
              </MailProviders>
            </TrackerSourceContext.Provider>
          </TrackerRepositoryContext.Provider>
        </ToastProvider>
      </RawIntlProvider>,
    ),
  );
});

afterEach(() => {
  flushHeldDecisions();
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const reviews = () => mail.log.filter((entry) => entry.kind === "review");

describe("useMailActions", () => {
  it("holds a decision for the Undo window, then writes the four review fields", () => {
    const message = stored("mail-nordlicht-invite");
    act(() => void actionsOf().review(message, "confirmed"));
    expect(reviews()).toEqual([]);
    act(() => vi.advanceTimersByTime(REVIEW_HOLD_MS));
    expect(reviews()).toEqual([
      {
        kind: "review",
        decision: {
          messageId: "mail-nordlicht-invite",
          reviewState: "confirmed",
          category: message.category,
          applicationId: message.applicationId,
        },
      },
    ]);
  });

  it("writes nothing when Undo comes inside the window", () => {
    let undo: () => void = () => undefined;
    act(() => {
      undo = actionsOf().review(stored("mail-sail-outreach"), "notJobMail");
    });
    act(() => undo());
    act(() => vi.advanceTimersByTime(REVIEW_HOLD_MS * 2));
    expect(reviews()).toEqual([]);
    expect(stored("mail-sail-outreach").reviewState).toBe("pending");
  });

  it("sends Not job mail as a correction to not_job", () => {
    act(() => void actionsOf().review(stored("mail-sail-outreach"), "notJobMail"));
    act(() => flushHeldDecisions());
    expect(reviews()[0]).toMatchObject({
      decision: { reviewState: "corrected", category: "not_job", applicationId: null },
    });
  });

  it("creates the application a correction names, and Undo inside the window deletes it", () => {
    const template = populatedDataset.applications[0];
    if (!template) throw new Error("fixture application missing");
    const before = tracker.source.getState();
    const count = before.status === "ready" ? before.data.applications.length : 0;
    let undo: () => void = () => undefined;
    act(() => {
      undo = actionsOf().review(stored("mail-nordlicht-invite"), "corrected", {
        category: "interview_invite",
        applicationId: null,
        newApplication: {
          application: { ...template, company: "Nordlicht Mobility", role: "Frontend Engineer" },
        },
      });
    });
    const during = tracker.source.getState();
    expect(during.status === "ready" ? during.data.applications.length : 0).toBe(count + 1);
    act(() => undo());
    const after = tracker.source.getState();
    expect(after.status === "ready" ? after.data.applications.length : 0).toBe(count);
  });

  it("undoes an automatic change with a reverting event and records the correction", () => {
    const message = stored("mail-lumenpay-offer");
    expect(message.reviewState).toBe("auto_applied");
    act(() => actionsOf().undoAutoChange(message));
    const state = tracker.source.getState();
    const reverted =
      state.status === "ready" &&
      state.data.applicationEvents.some((event) => event.revertsEventId === message.appliedEventId);
    expect(reverted).toBe(true);
    expect(reviews()).toEqual([
      {
        kind: "review",
        decision: {
          messageId: message.id,
          reviewState: "corrected",
          category: message.category,
          applicationId: message.applicationId,
        },
      },
    ]);
  });
});
