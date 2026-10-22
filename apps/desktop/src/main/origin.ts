import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { contentSecurityPolicy, CSP_NONCE_PLACEHOLDER } from "../shared/csp";

/** Production renderer origin: a privileged custom scheme instead of file:// (Electron security checklist #18). */
const APP_SCHEME = "app";
const APP_HOST = "bfhr";
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Set by electron-vite in dev only. */
const devServerUrl = process.env["ELECTRON_RENDERER_URL"];

const rendererRoot = path.join(import.meta.dirname, "../renderer");

/** URL of the renderer entry, optionally opening at a hash route such as `/jobs`. */
export function rendererUrl(route: string): string {
  const base = devServerUrl ?? `${APP_ORIGIN}/index.html`;
  return `${base}#${route}`;
}

/** True when `rawUrl` belongs to the app itself (custom scheme, or the Vite dev server in dev). */
export function isAppUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol === `${APP_SCHEME}:` && url.host === APP_HOST) return true;
  return devServerUrl !== undefined && url.origin === new URL(devServerUrl).origin;
}

/** Must run before `app` is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/**
 * Serves files from the bundled renderer directory and refuses anything outside it. The document
 * gets the Content-Security-Policy header with a fresh style nonce on every load.
 */
export function handleAppScheme(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response(null, { status: 404 });
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const filePath = path.resolve(rendererRoot, relativePath);
    if (!filePath.startsWith(rendererRoot + path.sep)) return new Response(null, { status: 403 });
    if (relativePath !== "index.html") return net.fetch(pathToFileURL(filePath).toString());

    const nonce = randomBytes(16).toString("base64");
    const html = (await readFile(filePath, "utf8")).replaceAll(CSP_NONCE_PLACEHOLDER, nonce);
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": contentSecurityPolicy({ dev: false, nonce }),
      },
    });
  });
}
