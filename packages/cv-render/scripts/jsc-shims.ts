// Injected into the IIFE bundle only (esbuild `inject`): bundled code that refers to these free
// identifiers gets the native one when the engine has it, else this fallback. Bare JavaScriptCore
// (JSContext on iOS) has neither; docx needs TextEncoder and JSZip schedules work with setTimeout.
// Nothing is installed on globalThis.

class Utf8Encoder {
  readonly encoding = "utf-8";

  encode(input = ""): Uint8Array {
    const out: number[] = [];
    for (const char of input) {
      const code = char.codePointAt(0) ?? 0;
      if (code < 0x80) out.push(code);
      else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 63),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63),
        );
      }
    }
    return new Uint8Array(out);
  }
}

type Timer = (callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => unknown;

// Either may be missing at runtime (bare JavaScriptCore), which the global types can't express.
const native = globalThis as unknown as { TextEncoder?: typeof TextEncoder; setTimeout?: Timer };

/** Microtask "timer": JSZip only uses it to yield between chunks, never for real delays. */
const microtaskTimeout: Timer = (callback, _delay, ...args) => {
  void Promise.resolve().then(() => callback(...args));
  return 0;
};

const encoder = native.TextEncoder ?? Utf8Encoder;
const timeout = native.setTimeout ?? microtaskTimeout;

export { encoder as TextEncoder, timeout as setTimeout };
