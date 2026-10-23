/**
 * Vitest setup: DOM tests (happy-dom) run outside the Tauri shell, so provide the chrome info the
 * shell's init script would define (src-tauri/src/window.rs).
 */
if (typeof window !== "undefined")
  Object.defineProperty(window, "__BFHR_CHROME__", {
    value: Object.freeze({ platform: "macos", material: "none", locale: "en-GB", version: "0.1.0" }),
  });
