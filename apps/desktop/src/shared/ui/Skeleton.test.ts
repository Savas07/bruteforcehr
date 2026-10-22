import { timing } from "@bfhr/ui-tokens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKELETON_GATE_IDLE, createSkeletonGate, stepSkeletonGate } from "./Skeleton";

describe("stepSkeletonGate", () => {
  it("stays idle and returns the same object when nothing loads", () => {
    const step = stepSkeletonGate(SKELETON_GATE_IDLE, false, 1000);
    expect(step.state).toBe(SKELETON_GATE_IDLE);
    expect(step.wakeAt).toBeNull();
  });

  it("waits skeletonDelay before showing", () => {
    const waiting = stepSkeletonGate(SKELETON_GATE_IDLE, true, 1000);
    expect(waiting.state).toEqual({ visible: false, since: 1000 });
    expect(waiting.wakeAt).toBe(1000 + timing.skeletonDelay);

    const early = stepSkeletonGate(waiting.state, true, 1299);
    expect(early.state).toBe(waiting.state);
    expect(early.wakeAt).toBe(1300);

    expect(stepSkeletonGate(waiting.state, true, 1300)).toEqual({
      state: { visible: true, since: 1300 },
      wakeAt: null,
    });
  });

  it("never shows a skeleton for a load shorter than the delay", () => {
    const waiting = stepSkeletonGate(SKELETON_GATE_IDLE, true, 0).state;
    expect(stepSkeletonGate(waiting, false, 200)).toEqual({ state: SKELETON_GATE_IDLE, wakeAt: null });
  });

  it("keeps a shown skeleton for skeletonMin after loading ends", () => {
    const shown = { visible: true, since: 300 };
    expect(stepSkeletonGate(shown, true, 5000)).toEqual({ state: shown, wakeAt: null });
    expect(stepSkeletonGate(shown, false, 400)).toEqual({ state: shown, wakeAt: 300 + timing.skeletonMin });
    expect(stepSkeletonGate(shown, false, 800)).toEqual({ state: SKELETON_GATE_IDLE, wakeAt: null });
  });
});

describe("createSkeletonGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows after 300 ms and hides no sooner than 500 ms after appearing", () => {
    const changes: boolean[] = [];
    const gate = createSkeletonGate((visible) => changes.push(visible));

    gate.update(true);
    vi.advanceTimersByTime(299);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);

    vi.advanceTimersByTime(100);
    gate.update(false);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(399);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true, false]);
  });

  it("hides at once when loading ends after the minimum time", () => {
    const changes: boolean[] = [];
    const gate = createSkeletonGate((visible) => changes.push(visible));
    gate.update(true);
    vi.advanceTimersByTime(2000);
    gate.update(false);
    expect(changes).toEqual([true, false]);
  });

  it("never flashes for a fast load", () => {
    const changes: boolean[] = [];
    const gate = createSkeletonGate((visible) => changes.push(visible));
    gate.update(true);
    vi.advanceTimersByTime(250);
    gate.update(false);
    vi.advanceTimersByTime(5000);
    expect(changes).toEqual([]);
  });

  it("resumes after dispose (React StrictMode remount)", () => {
    const changes: boolean[] = [];
    const gate = createSkeletonGate((visible) => changes.push(visible));
    gate.update(true);
    vi.advanceTimersByTime(100);
    gate.dispose();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
    gate.update(true);
    expect(changes).toEqual([true]);
  });
});
