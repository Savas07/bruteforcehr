/**
 * Email-link sign-in end to end in the built app: deep links opened through the OS (macOS
 * LaunchServices, Windows second instance → single-instance hand-off), checked in Rust
 * (src-tauri/src/auth_link.rs), completed against the Firebase Auth emulator.
 */
import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";
import {
  deepLinkFor,
  ensureSignedIn,
  ensureSignedOut,
  finishPageLink,
  heading,
  latestSignInCode,
  openThroughOs,
  requestLink,
  signIn,
  signOutFromPalette,
  testEmail,
} from "../support/auth";

describe("Sign-in", () => {
  before(async () => {
    await ensureSignedOut();
  });

  it("gates the app behind the email step", async () => {
    await expect(heading()).toHaveText("Sign in to BruteForceHR");
    await expect(browser).toHaveTitle("Sign in · BruteForceHR");
    await expect($('nav[aria-label="Sections"]')).not.toBeExisting();
    await expect($('input[type="email"]')).toBeFocused();
  });

  it("rejects a deep link whose embedded link isn't a sign-in link on our domains", async () => {
    // Crafted: right deep-link shape, but the embedded link points elsewhere.
    openThroughOs(deepLinkFor("https://evil.example/auth/finish?apiKey=x&oobCode=stolen&mode=signIn"));
    await expect(heading()).toHaveText("This sign-in link doesn’t work", { wait: 20_000 });
    // No address is known on this device yet, so the way on is a new link from the email step.
    await $("button=Send a new link").click();
    await expect(heading()).toHaveText("Sign in to BruteForceHR");
  });

  it("rejects a malformed deep link", async () => {
    openThroughOs("bruteforcehr://auth/finish?link=not-a-url&extra=1");
    await expect(heading()).toHaveText("This sign-in link doesn’t work", { wait: 20_000 });
    await $("button=Send a new link").click();
  });

  it("reports a well-formed link Firebase doesn't accept", async () => {
    const email = testEmail("unknown-code");
    await ensureSignedOut();
    await requestLink(email);
    openThroughOs(deepLinkFor(finishPageLink("not-a-real-code")));
    await expect(heading()).toHaveText("This sign-in link doesn’t work", { wait: 20_000 });
    await expect($(`strong=${email}`)).toBeDisplayed();
  });

  it("asks for the address when the link was requested elsewhere", async () => {
    const email = testEmail("other-device");
    await ensureSignedOut();
    await requestLink(email);
    const code = await latestSignInCode(email);
    // This device forgets the request, as if it had been made on another one.
    await browser.execute((key) => localStorage.removeItem(key), "bfhr.emailForSignIn");
    openThroughOs(deepLinkFor(finishPageLink(code)));
    await expect(heading()).toHaveText("Confirm your email", { wait: 20_000 });

    const field = $('input[type="email"]');
    await field.setValue("someone-else@example.com");
    await browser.keys(Key.Enter);
    await expect($("p*=This link was sent to a different address")).toBeDisplayed();

    await field.setValue(email);
    await browser.keys(Key.Enter);
    await expect(heading()).toHaveText("Today", { wait: 20_000 });
  });

  it("signs out from the command palette and back in with a link", async () => {
    // Its own session, so the test doesn't depend on the one before.
    await ensureSignedOut();
    await signIn(testEmail("palette"));
    await signOutFromPalette();
    // The address of the session that ended is filled in.
    await expect($('input[type="email"]')).toHaveValue(testEmail("palette"));

    const email = testEmail("returning");
    await $('input[type="email"]').setValue("");
    await signIn(email);
    expect(await browser.execute(() => localStorage.getItem("bfhr.emailForSignIn"))).toBeNull();
  });

  it("ignores sign-in links while signed in", async () => {
    await ensureSignedIn(testEmail("returning"));
    openThroughOs(deepLinkFor(finishPageLink("whatever")));
    await browser.pause(2000);
    await expect(heading()).toHaveText("Today");
  });

  it("grants the UI none of the deep-link plugin's commands", async () => {
    const result = await browser.tauri.execute(async ({ core }) => {
      try {
        await core.invoke("plugin:deep-link|get_current");
        return "allowed";
      } catch (error) {
        return String(error);
      }
    });
    expect(result).toMatch(/not allowed/i);
  });
});
