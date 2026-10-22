// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { chordKeycaps, Keymap, matchesChord, parseChord, spokenAlternatives, spokenKeys } from "./keymap";

function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("chords", () => {
  it("parses modifiers and keys", () => {
    expect(parseChord("Mod+Shift+D")).toEqual({ key: "D", mod: true, shift: true, alt: false });
    expect(parseChord("?")).toEqual({ key: "?", mod: false, shift: false, alt: false });
    expect(() => parseChord("Hyper+K")).toThrow(/Unknown modifier/);
  });

  it("maps Mod to ⌘ on macOS and Ctrl on Windows", () => {
    const chord = parseChord("Mod+K");
    expect(matchesChord(press("k", { metaKey: true }), chord, "macos")).toBe(true);
    expect(matchesChord(press("k", { ctrlKey: true }), chord, "macos")).toBe(false);
    expect(matchesChord(press("k", { ctrlKey: true }), chord, "windows")).toBe(true);
  });

  it("matches the produced character for ? and /, ignoring Shift", () => {
    expect(matchesChord(press("?", { shiftKey: true }), parseChord("?"), "windows")).toBe(true);
  });

  it("requires Shift to match exactly for letters", () => {
    expect(matchesChord(press("D", { shiftKey: true }), parseChord("D"), "macos")).toBe(false);
    expect(matchesChord(press("D", { shiftKey: true }), parseChord("Shift+D"), "macos")).toBe(true);
  });

  it("matches Mod+digit by physical key", () => {
    expect(matchesChord(press("&", { metaKey: true, code: "Digit1" }), parseChord("Mod+1"), "macos")).toBe(
      true,
    );
  });

  it("renders keycaps and spoken names per platform", () => {
    expect(chordKeycaps(parseChord("Mod+Shift+D"), "macos")).toEqual(["⌘", "⇧", "D"]);
    expect(chordKeycaps(parseChord("Mod+Enter"), "windows")).toEqual(["Ctrl", "Enter"]);
    const intl = createAppIntl({ language: "en", locale: "en-US" });
    expect(spokenKeys([parseChord("G"), parseChord("T")], "macos", intl)).toBe("G then T");
    expect(spokenKeys([parseChord("Mod+/")], "windows", intl)).toBe("Control Slash");
    expect(spokenAlternatives(["G T", "Mod+1"], "macos", intl)).toBe("G then T or Command 1");
  });
});

describe("Keymap", () => {
  it("runs the latest registration for a key and lists bindings", () => {
    const keymap = new Keymap();
    const screen = vi.fn();
    const pane = vi.fn();
    keymap.register({ id: "screen.confirm", keys: "C", label: "Confirm", group: "Today", run: screen });
    const stop = keymap.register({
      id: "pane.confirm",
      keys: "C",
      label: "Confirm",
      group: "Mail",
      run: pane,
    });
    expect(keymap.dispatch(press("c"), "macos")).toBe(true);
    expect(pane).toHaveBeenCalledOnce();
    expect(screen).not.toHaveBeenCalled();
    stop();
    keymap.dispatch(press("c"), "macos");
    expect(screen).toHaveBeenCalledOnce();
    expect(keymap.bindings().map((binding) => binding.id)).toEqual(["screen.confirm"]);
  });

  it("ignores single keys in text fields but not Mod chords", () => {
    const keymap = new Keymap();
    const single = vi.fn();
    const chord = vi.fn();
    keymap.register({ id: "j", keys: "J", label: "Next", group: "Lists", run: single });
    keymap.register({ id: "undo", keys: "Mod+Enter", label: "Primary", group: "General", run: chord });
    const input = document.createElement("input");
    keymap.dispatch(press("j", {}, input), "windows");
    keymap.dispatch(press("Enter", { ctrlKey: true }, input), "windows");
    expect(single).not.toHaveBeenCalled();
    expect(chord).toHaveBeenCalledOnce();
  });

  it("leaves Enter on buttons to the button, unless `when` claims it", () => {
    const keymap = new Keymap();
    const open = vi.fn();
    keymap.register({ id: "open", keys: "Enter", label: "Open", group: "Lists", run: open });
    const button = document.createElement("button");
    expect(keymap.dispatch(press("Enter", {}, button), "macos")).toBe(false);
    keymap.register({
      id: "open",
      keys: "Enter",
      label: "Open",
      group: "Lists",
      run: open,
      when: () => true,
    });
    expect(keymap.dispatch(press("Enter", {}, button), "macos")).toBe(true);
    expect(open).toHaveBeenCalledOnce();
  });

  it("skips bindings inside menus and modal dialogs unless allowed", () => {
    const keymap = new Keymap();
    const run = vi.fn();
    keymap.register({ id: "c", keys: "C", label: "Confirm", group: "Mail", run });
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    const item = document.createElement("div");
    menu.append(item);
    expect(keymap.dispatch(press("c", {}, item), "macos")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("handles G-then-T sequences within the timeout", () => {
    const keymap = new Keymap();
    const today = vi.fn();
    const next = vi.fn();
    keymap.register({ id: "go-today", keys: "G T", label: "Go to Today", group: "Navigation", run: today });
    keymap.register({ id: "next", keys: "T", label: "Something on T", group: "Lists", run: next });
    expect(keymap.dispatch(press("g"), "macos", 1000)).toBe(true);
    expect(keymap.dispatch(press("t"), "macos", 1500)).toBe(true);
    expect(today).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
    // Too slow: the second key is a key of its own.
    keymap.dispatch(press("g"), "macos", 5000);
    keymap.dispatch(press("t"), "macos", 9000);
    expect(next).toHaveBeenCalledOnce();
  });
});
