import path from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

export const appDir = path.resolve(import.meta.dirname, "..");

/** Launches the electron-vite build (`out/`) with the dev Electron binary and waits for the first window. */
export async function launchBuiltApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [appDir], cwd: appDir });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("navigation", { name: "Sections" }).waitFor();
  return { app, page };
}
