/**
 * Runtime keyboard map (docs/design/IA.md § Keyboard map, decisions.md D27/D28).
 *
 * The static ⌘/Ctrl shortcuts that the native menu mirrors live in `src/lib/shortcuts.ts`. Every
 * other key (single letters, sequences like `G T`, per-screen chords) registers here while the
 * view that owns it is mounted, so the shortcuts sheet lists exactly what works right now.
 *
 * Chord syntax: `+`-joined modifiers and one key, e.g. `J`, `?`, `Enter`, `Mod+Enter`,
 * `Mod+Shift+D`, `Alt+ArrowUp`, `Shift+F8`. `Mod` is ⌘ on macOS and Ctrl on Windows. A space
 * separates the steps of a sequence: `G T`.
 */
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import type { Platform } from "../../lib/desktop";

export interface Chord {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

/** One registered shortcut. `keys` lists alternatives; each is a chord or a sequence. */
export interface KeyBinding {
  /** Unique while mounted; a later registration with the same id replaces the earlier one. */
  readonly id: string;
  readonly keys: string | readonly string[];
  /** Sheet label, sentence case: "Confirm review item". */
  readonly label: string;
  /** Shortcuts-sheet group, usually the section name ("Today", "Lists"). */
  readonly group: string;
  readonly run: (event: KeyboardEvent) => void;
  /** Disabled bindings stay listed but don't fire. Default true. */
  readonly enabled?: boolean;
  /**
   * Single keys never fire while typing (D28). Chords with Mod or Alt do, unless this is false.
   * Set true to let a single key fire in text fields too (Esc in an inline editor).
   */
  readonly inTextFields?: boolean;
  /** Fire while focus is inside a menu, listbox or modal dialog. Default false. */
  readonly inOverlays?: boolean;
  /** Not listed in the sheet (an alternate already shown on another row). */
  readonly hidden?: boolean;
  /**
   * Checked at key time; return false to let the key through (e.g. only while focus is inside a
   * list). Without it, unmodified Enter / Space on a button, link or form control keep their
   * native activation.
   */
  readonly when?: (event: KeyboardEvent) => boolean;
}

const MODIFIERS: Readonly<Record<string, true>> = { mod: true, shift: true, alt: true };

export function parseChord(spec: string): Chord {
  const parts = spec === "+" ? ["+"] : spec.split("+");
  const key = parts.at(-1);
  if (!key) throw new Error(`Empty chord: "${spec}"`);
  const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
  for (const modifier of modifiers)
    if (!MODIFIERS[modifier]) throw new Error(`Unknown modifier "${modifier}" in "${spec}"`);
  return {
    key,
    mod: modifiers.includes("mod"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
  };
}

/** A binding's alternatives, each split into its sequence steps. */
export function parseKeys(keys: KeyBinding["keys"]): readonly (readonly Chord[])[] {
  return (typeof keys === "string" ? [keys] : keys).map((spec) => spec.split(" ").map(parseChord));
}

const isLetter = (key: string) => /^[a-z]$/i.test(key);

export function matchesChord(event: KeyboardEvent, chord: Chord, platform: Platform): boolean {
  const mod = platform === "macos" ? event.metaKey : event.ctrlKey;
  const otherMod = platform === "macos" ? event.ctrlKey : event.metaKey;
  if (mod !== chord.mod || otherMod || event.altKey !== chord.alt) return false;
  // Mod+digit matches the physical key so it works on AZERTY (desktop-chrome.md).
  if (chord.mod && /^[0-9]$/.test(chord.key)) return event.code === `Digit${chord.key}`;
  if (isLetter(chord.key))
    return event.shiftKey === chord.shift && event.key.toLowerCase() === chord.key.toLowerCase();
  // `?`, `/`, digits: match the produced character; Shift is part of the layout, not the chord.
  if (chord.key.length === 1) return event.key === chord.key;
  return event.shiftKey === chord.shift && event.key === chord.key;
}

const TEXT_INPUT_TYPES: Readonly<Record<string, true>> = {
  text: true,
  search: true,
  email: true,
  url: true,
  tel: true,
  password: true,
  number: true,
  date: true,
  month: true,
  time: true,
};

/** Focus is in a text field, an editable cell or a combobox: single keys must not fire (D28). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES[target.type] === true;
  return (
    target.closest('[role="combobox"], [role="textbox"], [role="searchbox"], [data-keymap-typing]') !== null
  );
}

const OVERLAY_SELECTOR = '[role="menu"], [role="menubar"], [role="listbox"], [aria-modal="true"]';

const ACTIVATABLE_SELECTOR =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="tab"], [role="radio"]';

/** Unmodified Enter / Space on a control that activates natively: the control wins. */
function nativeActivation(event: KeyboardEvent, chord: Chord): boolean {
  if (chord.mod || chord.alt || (chord.key !== "Enter" && chord.key !== " ")) return false;
  return event.target instanceof Element && event.target.closest(ACTIVATABLE_SELECTOR) !== null;
}

/** Keycap labels: `["⌘", "⇧", "D"]` on macOS, `["Ctrl", "Shift", "D"]` on Windows. */
export function chordKeycaps(chord: Chord, platform: Platform): string[] {
  const mac = platform === "macos";
  const caps: string[] = [];
  if (chord.mod) caps.push(mac ? "⌘" : "Ctrl");
  if (chord.alt) caps.push(mac ? "⌥" : "Alt");
  if (chord.shift) caps.push(mac ? "⇧" : "Shift");
  caps.push(
    KEY_GLYPHS[chord.key]?.[mac ? 0 : 1] ?? (isLetter(chord.key) ? chord.key.toUpperCase() : chord.key),
  );
  return caps;
}

/** Keys with a glyph: [macOS, Windows]. */
const KEY_GLYPHS: Readonly<Record<string, readonly [string, string]>> = {
  Enter: ["↩", "Enter"],
  Escape: ["esc", "Esc"],
  Backspace: ["⌫", "Backspace"],
  ArrowUp: ["↑", "↑"],
  ArrowDown: ["↓", "↓"],
  ArrowLeft: ["←", "←"],
  ArrowRight: ["→", "→"],
  " ": ["Space", "Space"],
};

const messages = defineMessages({
  command: {
    id: "shared.keyboard.command",
    defaultMessage: "Command",
    description: "Spoken name of the ⌘ key",
  },
  control: {
    id: "shared.keyboard.control",
    defaultMessage: "Control",
    description: "Spoken name of the Ctrl key",
  },
  option: { id: "shared.keyboard.option", defaultMessage: "Option", description: "Spoken name of the ⌥ key" },
  alt: { id: "shared.keyboard.alt", defaultMessage: "Alt", description: "Spoken name of the Alt key" },
  shift: {
    id: "shared.keyboard.shift",
    defaultMessage: "Shift",
    description: "Spoken name of the Shift key",
  },
  sequence: {
    id: "shared.keyboard.sequence",
    defaultMessage: "{first} then {next}",
    description: "Key sequence for screen readers: first chord, then the following one(s)",
  },
  alternatives: {
    id: "shared.keyboard.alternatives",
    defaultMessage: "{first} or {next}",
    description: "Alternative shortcuts for screen readers",
  },
});

const SPOKEN_KEYS: Readonly<Record<string, MessageDescriptor>> = defineMessages({
  "/": { id: "shared.keyboard.slash", defaultMessage: "Slash" },
  "?": { id: "shared.keyboard.questionMark", defaultMessage: "Question mark" },
  ",": { id: "shared.keyboard.comma", defaultMessage: "Comma" },
  " ": { id: "shared.keyboard.space", defaultMessage: "Space" },
  ArrowUp: { id: "shared.keyboard.arrowUp", defaultMessage: "Up arrow" },
  ArrowDown: { id: "shared.keyboard.arrowDown", defaultMessage: "Down arrow" },
  ArrowLeft: { id: "shared.keyboard.arrowLeft", defaultMessage: "Left arrow" },
  ArrowRight: { id: "shared.keyboard.arrowRight", defaultMessage: "Right arrow" },
});

/** Spoken form for assistive tech: "Command Shift D", "G then T". */
export function spokenKeys(steps: readonly Chord[], platform: Platform, intl: IntlShape): string {
  const mac = platform === "macos";
  return steps
    .map((chord) => {
      const spoken = SPOKEN_KEYS[chord.key];
      return [
        chord.mod && intl.formatMessage(mac ? messages.command : messages.control),
        chord.alt && intl.formatMessage(mac ? messages.option : messages.alt),
        chord.shift && intl.formatMessage(messages.shift),
        spoken !== undefined
          ? intl.formatMessage(spoken)
          : isLetter(chord.key)
            ? chord.key.toUpperCase()
            : chord.key,
      ]
        .filter(Boolean)
        .join(" ");
    })
    .reduce((first, next) => intl.formatMessage(messages.sequence, { first, next }));
}

/** Spoken form of every alternative of a binding: "G then T or Command 1". */
export function spokenAlternatives(keys: KeyBinding["keys"], platform: Platform, intl: IntlShape): string {
  return parseKeys(keys)
    .map((steps) => spokenKeys(steps, platform, intl))
    .reduce((first, next) => intl.formatMessage(messages.alternatives, { first, next }));
}

/** How long the second key of a sequence (`G` then `T`) may follow the first. */
const SEQUENCE_TIMEOUT_MS = 1200;

interface Entry {
  readonly binding: KeyBinding;
  readonly alternatives: readonly (readonly Chord[])[];
}

/**
 * The registry. Later registrations take precedence, so a pane or dialog that mounts after its
 * screen can claim a key the screen also uses. One instance per window (`keymap`).
 */
export class Keymap {
  #entries: Entry[] = [];
  #listeners = new Set<() => void>();
  #snapshot: readonly KeyBinding[] = [];
  #pending: { readonly prefix: Chord; readonly at: number } | null = null;

  register(binding: KeyBinding): () => void {
    const entry: Entry = { binding, alternatives: parseKeys(binding.keys) };
    this.#entries = [...this.#entries.filter((existing) => existing.binding.id !== binding.id), entry];
    this.#changed();
    return () => {
      if (!this.#entries.includes(entry)) return;
      this.#entries = this.#entries.filter((existing) => existing !== entry);
      this.#changed();
    };
  }

  /** Bindings in registration order, for the shortcuts sheet (`useSyncExternalStore`). */
  readonly bindings = (): readonly KeyBinding[] => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Runs the matching binding, if any; returns whether the event was handled. */
  dispatch(event: KeyboardEvent, platform: Platform, now = Date.now()): boolean {
    if (event.defaultPrevented || event.isComposing || event.repeat) return false;
    if (["Shift", "Meta", "Control", "Alt"].includes(event.key)) return false;
    const typing = isTypingTarget(event.target);
    const inOverlay = event.target instanceof Element && event.target.closest(OVERLAY_SELECTOR) !== null;
    const prefix =
      this.#pending && now - this.#pending.at <= SEQUENCE_TIMEOUT_MS ? this.#pending.prefix : null;
    this.#pending = null;

    const eligible = (binding: KeyBinding, single: boolean) =>
      binding.enabled !== false &&
      (!typing || (binding.inTextFields ?? !single)) &&
      (!inOverlay || binding.inOverlays === true);

    for (const { binding, alternatives } of this.#entries.toReversed()) {
      for (const steps of alternatives) {
        const [first, second] = steps;
        if (!first) continue;
        const single = !first.mod && !first.alt;
        if (!eligible(binding, single)) continue;
        const matched =
          second === undefined
            ? prefix === null && matchesChord(event, first, platform)
            : prefix !== null &&
              prefix.key.toLowerCase() === first.key.toLowerCase() &&
              prefix.mod === first.mod &&
              prefix.shift === first.shift &&
              prefix.alt === first.alt &&
              matchesChord(event, second, platform);
        if (!matched) continue;
        if (binding.when ? !binding.when(event) : nativeActivation(event, first)) continue;
        event.preventDefault();
        binding.run(event);
        return true;
      }
    }

    // First key of a sequence: remember it and swallow it.
    for (const { binding, alternatives } of this.#entries.toReversed()) {
      for (const [first, second] of alternatives) {
        if (!first || !second || !eligible(binding, true) || !matchesChord(event, first, platform)) continue;
        this.#pending = { prefix: first, at: now };
        event.preventDefault();
        return true;
      }
    }
    return false;
  }

  #changed(): void {
    this.#snapshot = this.#entries.map((entry) => entry.binding);
    for (const listener of this.#listeners) listener();
  }
}

/** The window's keymap; AppShell dispatches to it. */
export const keymap = new Keymap();
