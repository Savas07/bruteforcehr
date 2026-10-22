import { z } from "zod";
import { destinationIds } from "./destinations";

/** Every IPC channel the app uses. Anything not listed here is never exposed to the renderer. */
export const IpcChannel = {
  /** renderer → main (invoke): app version and platform. */
  getAppInfo: "app:get-info",
  /** renderer → main (invoke): open an allowlisted https URL in the default browser. */
  openExternal: "shell:open-external",
  /** main → renderer: a native menu item (or its accelerator) was chosen. */
  menuCommand: "menu:command",
} as const;

const platformSchema = z.enum(["darwin", "win32", "linux"]);
export type Platform = z.infer<typeof platformSchema>;

/** Native window material behind the sidebar: macOS vibrancy, Windows 11 Mica, or none. */
const materialSchema = z.enum(["vibrancy", "mica", "none"]);
export type Material = z.infer<typeof materialSchema>;

export const appInfoSchema = z.object({
  version: z.string().min(1),
  platform: platformSchema,
});
export type AppInfo = z.infer<typeof appInfoSchema>;

/** Hosts `openExternal` may open. https only; everything else is rejected in main. */
const externalHosts = ["bruteforcehr.web.app", "github.com"];

export const externalUrlSchema = z.url({
  protocol: /^https$/,
  hostname: new RegExp(`^(${externalHosts.map((host) => host.replaceAll(".", "\\.")).join("|")})$`),
});

export const menuCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), destination: z.enum(destinationIds) }),
  z.object({ type: z.literal("open-palette") }),
  z.object({ type: z.literal("open-shortcuts") }),
]);
export type MenuCommand = z.infer<typeof menuCommandSchema>;

/** Passed to the preload through `webPreferences.additionalArguments` so layout is right on first paint. */
export const chromeArgumentPrefix = "--bfhr-chrome=";
export const chromeInfoSchema = z.object({
  platform: platformSchema,
  material: materialSchema,
});
export type ChromeInfo = z.infer<typeof chromeInfoSchema>;

/** The API the preload exposes on `window.bfhr`. */
export interface DesktopApi {
  readonly platform: Platform;
  readonly material: Material;
  getAppInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
}
