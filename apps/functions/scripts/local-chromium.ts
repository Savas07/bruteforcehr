// The server's Chromium build for local runs: @sparticuz/chromium only ships Linux x64, so tests on
// macOS and the cv-render parity script print with Chrome for Testing's chrome-headless-shell of the
// same version (SERVER_CHROMIUM_VERSION), downloaded once into node_modules/.cache.
//
//   pnpm --filter @bfhr/functions chromium:local   # prints the executable path
import { fileURLToPath } from "node:url";
import { Browser, detectBrowserPlatform, install } from "@puppeteer/browsers";
import { SERVER_CHROMIUM_VERSION } from "../src/render/print";

const CACHE_DIR = fileURLToPath(new URL("../node_modules/.cache/chromium", import.meta.url));

/** Installs (once) and returns the path of chrome-headless-shell `SERVER_CHROMIUM_VERSION`. */
export async function installLocalChromium(): Promise<string> {
  const platform = detectBrowserPlatform();
  if (platform === undefined)
    throw new Error(`No Chrome for Testing build for ${process.platform}/${process.arch}`);
  const installed = await install({
    browser: Browser.CHROMEHEADLESSSHELL,
    buildId: SERVER_CHROMIUM_VERSION,
    cacheDir: CACHE_DIR,
    platform,
  });
  return installed.executablePath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await installLocalChromium());
}
