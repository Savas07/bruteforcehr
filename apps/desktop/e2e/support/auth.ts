/**
 * Sign-in for the E2E specs and captures. Test builds (`pnpm build:e2e`) talk to the Firebase
 * Auth emulator (src/features/auth/firebaseAuth.ts), which CI starts before the specs
 * (`firebase emulators:start --only auth`). The emulator doesn't mail anything; it lists the
 * links it would have sent, so a spec can finish sign-in the way a person would: the email
 * link's landing page (`https://bruteforcehr.web.app/auth/finish?…`) handed to the app as
 * `bruteforcehr://auth/finish?link=…`, opened through the OS so it travels the real path
 * (LaunchServices on macOS; a second instance and the single-instance hand-off on Windows).
 */
import { execFileSync } from "node:child_process";
import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";
import { firebaseConfig } from "../../src/lib/firebase.ts";

const EMULATOR = "http://127.0.0.1:9099";

/** An address only the emulator knows; each spec run uses its own. */
export const testEmail = (label: string) => `e2e-${label}-${process.pid}@example.com`;

/** Opens `url` the way a click in the browser would: through the OS URL handler. */
export function openThroughOs(url: string): void {
  if (process.platform === "darwin") execFileSync("open", [url]);
  else if (process.platform === "win32")
    execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${url}'`]);
  else throw new Error("Deep links are tested on macOS and Windows only");
}

/** `bruteforcehr://auth/finish?link=<link>`, encoded like the website's finish page does. */
export const deepLinkFor = (link: string) => `bruteforcehr://auth/finish?link=${encodeURIComponent(link)}`;

/** The finish page's URL for an emulator sign-in code (what the browser lands on in production). */
export const finishPageLink = (oobCode: string) =>
  `https://bruteforcehr.web.app/auth/finish?apiKey=${firebaseConfig.apiKey}&oobCode=${oobCode}&mode=signIn&lang=en`;

/** The newest sign-in code the emulator issued for `email`. */
export async function latestSignInCode(email: string): Promise<string> {
  let code: string | undefined;
  await browser.waitUntil(
    async () => {
      const response = await fetch(`${EMULATOR}/emulator/v1/projects/${firebaseConfig.projectId}/oobCodes`);
      const { oobCodes } = (await response.json()) as {
        oobCodes: { email: string; requestType: string; oobCode: string }[];
      };
      code = oobCodes
        .filter((entry) => entry.email === email && entry.requestType === "EMAIL_SIGNIN")
        .at(-1)?.oobCode;
      return code !== undefined;
    },
    { timeoutMsg: `the Auth emulator issued no sign-in link for ${email}` },
  );
  return code ?? "";
}

export const heading = () => $("h1");

/** Whether the signed-in shell is showing (its sidebar exists only after sign-in). */
const inShell = () => $('nav[aria-label="Sections"]').isExisting();

/** Waits for the restored state: the shell, or a sign-in step with its heading. */
async function settled(): Promise<void> {
  await browser.waitUntil(
    async () => (await inShell()) || ((await heading().isExisting()) && (await heading().getText()) !== ""),
    { timeoutMsg: "neither the app nor the sign-in screen appeared" },
  );
}

/** Signs out from the command palette (the palette exists only in the signed-in shell). */
export async function signOutFromPalette(): Promise<void> {
  await browser.keys([process.platform === "darwin" ? Key.Command : Key.Ctrl, "k"]);
  await $('[role="dialog"] [role="combobox"]').waitForDisplayed();
  await browser.keys("Sign out");
  await browser.keys(Key.Enter);
  await expect(heading()).toHaveText("Sign in to BruteForceHR");
}

/** Leaves the app on the email step, whatever state the launch restored. */
export async function ensureSignedOut(): Promise<void> {
  await settled();
  if (await inShell()) await signOutFromPalette();
  else if ((await heading().getText()) !== "Sign in to BruteForceHR") {
    // The step's way back: "Use a different email", the confirm step's "Request a new link
    // instead", or (a link error with no known address) "Send a new link".
    for (const label of ["Use a different email", "Request a new link instead", "Send a new link"]) {
      const button = $(`button*=${label}`);
      if (await button.isExisting()) {
        await button.click();
        break;
      }
    }
    await expect(heading()).toHaveText("Sign in to BruteForceHR");
  }
}

/**
 * Requests a link on the email step; returns once "Check your email" shows. When it doesn't, the
 * failure says why: the screen's message and whether the page can reach the emulator at all.
 */
export async function requestLink(email: string): Promise<void> {
  const field = $('input[type="email"]');
  await field.waitForDisplayed();
  await field.setValue(email);
  // The embedded WebDriver sends keys as script events, and a script Enter doesn't submit a form
  // (only trusted key presses do), so press the button.
  await $('button[type="submit"]').click();
  const sent = await browser
    .waitUntil(async () => (await heading().getText()) === "Check your email", { timeout: 15_000 })
    .catch(() => false);
  if (sent) return;
  const page = await browser.execute(async (emulator) => {
    const reach = await fetch(`${emulator}/`).then(
      (response) => `HTTP ${response.status}`,
      (error: unknown) => `failed: ${String(error)}`,
    );
    return {
      heading: document.querySelector("h1")?.textContent,
      alerts: [...document.querySelectorAll('[role="alert"], [role="status"]')].map(
        (node) => node.textContent,
      ),
      origin: location.origin,
      secureContext: isSecureContext,
      emulator: reach,
    };
  }, EMULATOR);
  throw new Error(`Sending the sign-in link failed: ${JSON.stringify(page)}`);
}

/** Signs in as `email` through the emulator and the OS deep link; ends on Today. */
export async function signIn(email: string): Promise<void> {
  await requestLink(email);
  openThroughOs(deepLinkFor(finishPageLink(await latestSignInCode(email))));
  await expect(heading()).toHaveText("Today", { wait: 20_000 });
}

/** Leaves the app signed in, whatever state the launch restored. */
export async function ensureSignedIn(email: string): Promise<void> {
  await settled();
  if (await inShell()) return;
  await ensureSignedOut();
  await signIn(email);
}
