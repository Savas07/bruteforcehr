/**
 * The application kit's files through the Tauri backend (src-tauri/src/kit_file.rs): a PDF saved
 * to `Downloads/BruteForceHR` (no dialog), then opened in the default PDF app or shown in Finder /
 * Explorer. The backend opens and reveals only PDFs in that folder. Rejections are
 * `{ kind, message }` (`CommandError` in src-tauri/src/commands.rs).
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

/** Header `save_kit_file` reads the file name from (src-tauri/src/export_file.rs). */
const FILE_NAME_HEADER = "bfhr-file-name";

/**
 * Design builds in a plain browser (the capture harness) have no backend: a path stands in, and
 * open/reveal do nothing.
 */
const designBrowser = () => __BFHR_DESIGN__ && !isTauri();

/** Saves (or replaces) `fileName` in the kit folder and returns its full path. */
export function saveKitFile(bytes: Uint8Array, fileName: string): Promise<string> {
  if (designBrowser()) return Promise.resolve(`/Users/deniz/Downloads/BruteForceHR/${fileName}`);
  // The bytes travel as the raw request body; headers are ASCII, so the name is percent-encoded.
  return invoke<string>("save_kit_file", bytes, { headers: { [FILE_NAME_HEADER]: encodeURIComponent(fileName) } });
}

export function openKitFile(path: string): Promise<void> {
  if (designBrowser()) return Promise.resolve();
  return invoke("open_kit_file", { path });
}

export function revealKitFile(path: string): Promise<void> {
  if (designBrowser()) return Promise.resolve();
  return invoke("reveal_kit_file", { path });
}
