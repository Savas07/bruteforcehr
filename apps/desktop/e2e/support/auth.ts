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
import { $, browser } from "@wdio/globals";
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

/**
 * Waits until the page's `h1` reads `text`. Each sign-in step mounts its own heading, so this
 * re-reads the DOM on every poll instead of holding an element that the next step replaces
 * (a held, replaced element reads as null in WebView2).
 */
export async function expectHeading(text: string, timeout = 10_000): Promise<void> {
  let last: string | null | undefined;
  await browser.waitUntil(
    async () => {
      last = await browser.execute(() => document.querySelector("h1")?.textContent ?? null);
      return last === text;
    },
    { timeout, timeoutMsg: `expected the heading "${text}", last saw ${JSON.stringify(last)}` },
  );
}

/** Whether the signed-in shell is showing (its sidebar exists only after sign-in). */
const inShell = () => $('nav[aria-label="Sections"]').isExisting();

/** Whether the first-run wizard is showing (its stepper exists only there). */
export const inOnboarding = () => $('nav[aria-label="Setup steps"]').isExisting();

/** Waits for the restored state: the shell, the wizard, or a sign-in step with its heading. */
async function settled(): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await inShell()) ||
      (await inOnboarding()) ||
      ((await heading().isExisting()) && (await heading().getText()) !== ""),
    { timeoutMsg: "neither the app, onboarding nor the sign-in screen appeared" },
  );
}

/** Clicks the first of `labels` that is on screen. */
async function clickFirst(labels: readonly string[]): Promise<void> {
  for (const label of labels) {
    const button = $(`button=${label}`);
    if (await button.isExisting()) {
      await button.click();
      return;
    }
  }
  throw new Error(`none of ${labels.join(", ")} is on screen`);
}

/** The page's `h1` text, read fresh (steps replace their heading). */
const headingText = () => browser.execute(() => document.querySelector("h1")?.textContent ?? null);

/** What skips each wizard step: an account that already has a CV continues instead. */
const SKIP_BY_STEP: Readonly<Record<string, readonly string[]>> = {
  "Add your CV": ["Skip for now", "Continue"],
  "What are you looking for?": ["Skip for now"],
  "Start your first search": ["Go to Today", "Finish without a search"],
};

/**
 * Leaves the first-run wizard without setting anything up, from whichever step it resumed on
 * (e2e/specs/onboarding.e2e.ts covers the wizard itself); ends on Today.
 */
export async function skipOnboarding(): Promise<void> {
  for (let step = 0; step < 3; step++) {
    const text = await headingText();
    const labels = text === null ? undefined : SKIP_BY_STEP[text];
    if (labels === undefined) break;
    await clickFirst(labels);
    await browser.waitUntil(async () => (await headingText()) !== text, {
      timeoutMsg: `"${text}" didn't move on`,
    });
  }
  await expectHeading("Today", 20_000);
}

/** After a sign-in link: a new account's wizard (skipped) or the shell; ends on Today. */
export async function expectSignedIn(): Promise<void> {
  await browser.waitUntil(async () => (await inShell()) || (await inOnboarding()), {
    timeout: 20_000,
    timeoutMsg: "neither the app nor onboarding appeared after sign-in",
  });
  if (await inOnboarding()) await skipOnboarding();
  await expectHeading("Today", 20_000);
}

/** Signs out from the command palette (the palette exists only in the signed-in shell). */
export async function signOutFromPalette(): Promise<void> {
  await browser.keys([process.platform === "darwin" ? Key.Command : Key.Ctrl, "k"]);
  await $('[role="dialog"] [role="combobox"]').waitForDisplayed();
  await browser.keys("Sign out");
  await browser.keys(Key.Enter);
  await expectHeading("Sign in to BruteForceHR");
}

/** Leaves the app on the email step, whatever state the launch restored. */
export async function ensureSignedOut(): Promise<void> {
  await settled();
  if (await inShell()) await signOutFromPalette();
  else if (await inOnboarding()) {
    await $("button=Sign out").click();
    await expectHeading("Sign in to BruteForceHR");
  } else if ((await heading().getText()) !== "Sign in to BruteForceHR") {
    // The step's way back: "Use a different email", the confirm step's "Request a new link
    // instead", or (a link error with no known address) "Send a new link".
    for (const label of ["Use a different email", "Request a new link instead", "Send a new link"]) {
      const button = $(`button*=${label}`);
      if (await button.isExisting()) {
        await button.click();
        break;
      }
    }
    await expectHeading("Sign in to BruteForceHR");
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
  await expectSignedIn();
}

/** Leaves the app signed in, whatever state the launch restored. */
export async function ensureSignedIn(email: string): Promise<void> {
  await settled();
  if (await inShell()) return;
  if (await inOnboarding()) {
    await skipOnboarding();
    return;
  }
  await ensureSignedOut();
  await signIn(email);
}

/**
 * The uid of whoever is signed in (a restored session may belong to another spec's account):
 * Firebase Auth persists the user in the webview's IndexedDB (`firebaseLocalStorageDb`).
 */
export async function signedInUid(): Promise<string> {
  const uid = await browser.executeAsync((done: (uid: string | null) => void) => {
    const open = indexedDB.open("firebaseLocalStorageDb");
    open.onerror = () => done(null);
    open.onsuccess = () => {
      const request = open.result
        .transaction("firebaseLocalStorage", "readonly")
        .objectStore("firebaseLocalStorage")
        .getAll();
      request.onerror = () => done(null);
      request.onsuccess = () => {
        const entries = request.result as { fbase_key?: string; value?: { uid?: string } }[];
        const user = entries.find((entry) => entry.fbase_key?.startsWith("firebase:authUser:"));
        done(user?.value?.uid ?? null);
      };
    };
  });
  if (!uid) throw new Error("no signed-in user in the app");
  return uid;
}
