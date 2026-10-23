/**
 * Entry of `dist/cv-render.iife.js`: the renderer for JavaScriptCore on iOS (offline preview and
 * DOCX), with no DOM, timers or encoders required (see scripts/jsc-shims.ts).
 */
import * as api from "./index";

declare global {
  var BFHRCvRender: typeof api;
}

globalThis.BFHRCvRender = api;
