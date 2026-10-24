/**
 * First-run onboarding end to end in the built app against the emulators: a new account signs in
 * through the OS deep link and gets the wizard instead of the app; preferences typed there are
 * saved to `users/{uid}`, Finish creates the first saved search (due now) and sets
 * `onboardingCompletedAt`, and the app opens on Today with the preferences in Settings › Job
 * preferences. A second new account skips every step and still lands on Today, with no search.
 */
import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";
import {
  deepLinkFor,
  ensureSignedOut,
  expectHeading,
  finishPageLink,
  inOnboarding,
  latestSignInCode,
  openThroughOs,
  requestLink,
  signedInUid,
  testEmail,
} from "../support/auth";
import { type FirestoreDoc, getDoc, plain } from "../support/firestore";
import { firebaseConfig } from "../../src/lib/firebase.ts";

const BASE = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

/** A new account, signed in through the OS deep link; ends on the wizard's first step. */
async function signInNew(label: string): Promise<string> {
  await ensureSignedOut();
  const email = testEmail(label);
  await requestLink(email);
  openThroughOs(deepLinkFor(finishPageLink(await latestSignInCode(email))));
  await expectHeading("Add your CV", 20_000);
  return email;
}

async function savedSearches(uid: string): Promise<FirestoreDoc[]> {
  const response = await fetch(`${BASE}/users/${uid}/savedSearches`, {
    headers: { Authorization: "Bearer owner" },
  });
  const { documents } = (await response.json()) as { documents?: FirestoreDoc[] };
  return documents ?? [];
}

/** `users/{uid}` once the app's writes reached the emulator and `field` is set. */
async function profileWith(uid: string, field: string): Promise<FirestoreDoc> {
  let profile: FirestoreDoc | null = null;
  await browser.waitUntil(
    async () => {
      profile = await getDoc(`users/${uid}`).catch(() => null);
      const value = profile?.fields[field];
      return value !== undefined && !("nullValue" in value);
    },
    { timeout: 15_000, timeoutMsg: `users/${uid}.${field} was never set` },
  );
  return profile as unknown as FirestoreDoc;
}

describe("Onboarding", () => {
  it("shows the wizard to a new account instead of the app", async () => {
    await signInNew("onboarding-flow");
    expect(await inOnboarding()).toBe(true);
    await expect($('nav[aria-label="Sections"]')).not.toBeExisting();
    await expect($("p=Step 1 of 3")).toBeDisplayed();
    await expect(browser).toHaveTitle("Set up · BruteForceHR");
  });

  it("saves preferences, creates the first saved search and lands on Today", async () => {
    const uid = await signedInUid();
    // The wizard created the profile before anything else.
    const created = await getDoc(`users/${uid}`);
    expect(plain(created.fields["onboardingCompletedAt"])).toBeNull();

    await $("button=Skip for now").click();
    await expectHeading("What are you looking for?");
    const role = $('input[placeholder="Type a role and press Enter"]');
    await role.setValue("Backend Engineer");
    await browser.keys(Key.Enter);
    await expect($("li*=Backend Engineer")).toBeDisplayed();
    await $("button=Germany").click();
    await $("button=Remote").click();
    await $("button=Senior").click();
    // Germany is in the EU: one question for the EU / EEA.
    await $('input[type="radio"][value="yes"]').click();
    await $("button=Continue").click();

    await expectHeading("Start your first search");
    await expect($("dd=Backend Engineer")).toBeDisplayed();
    await $("button=Start searching").click();
    await expectHeading("Today", 20_000);
    await expect($('nav[aria-label="Sections"]')).toBeExisting();
    await browser.waitUntil(
      () =>
        browser.execute(() =>
          document.body.textContent.includes("You're set up. Your preferences are saved in Settings."),
        ),
      { timeoutMsg: "no set-up toast" },
    );

    const profile = await profileWith(uid, "onboardingCompletedAt");
    expect(plain(profile.fields["targetRoles"])).toEqual(["Backend Engineer"]);
    expect(plain(profile.fields["seniority"])).toBe("senior");
    expect(plain(profile.fields["remotePreferences"])).toEqual(["remote"]);
    expect(plain(profile.fields["locations"])).toEqual([
      { label: "Germany", city: null, countryCode: "DE", relocation: false },
    ]);
    expect(plain(profile.fields["workAuthorization"])).toEqual([{ region: "EU", status: "work_permit" }]);

    let searches: FirestoreDoc[] = [];
    await browser.waitUntil(async () => (searches = await savedSearches(uid)).length > 0, {
      timeout: 15_000,
      timeoutMsg: "no saved search was created",
    });
    expect(searches).toHaveLength(1);
    const search = searches[0]?.fields ?? {};
    expect(plain(search["query"])).toBe("Backend Engineer");
    expect(plain(search["schedule"])).toBe("daily");
    expect(plain(search["enabled"])).toBe(true);
    expect(plain(search["nextRunAt"])).toEqual(expect.any(String));
    expect(plain(search["filters"])).toMatchObject({ countryCodes: ["DE"], remoteTypes: ["remote"] });
  });

  it("shows the same preferences in Settings › Job preferences", async () => {
    await browser.execute(() => {
      location.hash = "#/settings/job-preferences";
    });
    await expectHeading("Job preferences");
    await expect($("li*=Backend Engineer")).toBeDisplayed();
    await expect($("li*=Germany")).toBeDisplayed();
    await expect($("button=Senior")).toHaveAttribute("aria-pressed", "true");
  });

  it("lets a new account skip every step and still land on Today, without a search", async () => {
    await signInNew("onboarding-skip");
    const uid = await signedInUid();
    await $("button=Skip for now").click();
    await expectHeading("What are you looking for?");
    await $("button=Skip for now").click();
    await expectHeading("Start your first search");
    await $("button=Go to Today").click();
    await expectHeading("Today", 20_000);

    const profile = await profileWith(uid, "onboardingCompletedAt");
    expect(plain(profile.fields["targetRoles"])).toEqual([]);
    expect(await savedSearches(uid)).toHaveLength(0);
  });
});
