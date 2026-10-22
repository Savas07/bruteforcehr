import { $, $$, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";

const isMac = process.platform === "darwin";

/** ⌘+key on macOS, Ctrl+key on Windows. */
async function pressShortcut(key: string): Promise<void> {
  await browser.keys([isMac ? Key.Command : Key.Ctrl, key]);
}

/** The current section's title. */
function heading() {
  return $("h1");
}

describe("BruteForceHR desktop", () => {
  it("opens one window on Today", async () => {
    expect(await browser.getWindowHandles()).toHaveLength(1);
    await expect(await heading()).toHaveText("Today");
    await expect(browser).toHaveTitle("Today · BruteForceHR");
  });

  it("lists the five M0 destinations in the sidebar", async () => {
    const links = $$('nav[aria-label="Sections"] a');
    expect(await links.map((link) => link.getText())).toEqual(["Today", "Jobs", "Tracker", "CVs", "Mail"]);
    await expect(links[0]).toHaveAttribute("aria-current", "page");

    const tracker = $('nav[aria-label="Sections"] a[href$="/tracker"]');
    await tracker.click();
    await expect(await heading()).toHaveText("Tracker");
    await expect(tracker).toHaveAttribute("aria-current", "page");
  });

  it("opens the command palette with Mod+K and navigates from it", async () => {
    await pressShortcut("k");
    const palette = await $('[role="dialog"]');
    await expect(palette).toBeDisplayed();
    // The title is visually hidden (sr-only), so read its text content rather than rendered text.
    await expect(await palette.$("h2")).toHaveElementProperty("textContent", "Command palette");
    const input = await palette.$('[role="combobox"]');
    await expect(input).toBeFocused();

    await browser.keys("mail");
    expect(await palette.$$('[role="option"]').map((option) => option.getText())).toEqual([
      expect.stringContaining("Mail"),
    ]);
    await browser.keys(Key.Enter);

    await expect(palette).not.toBeExisting();
    await expect(await heading()).toHaveText("Mail");
    await expect(await heading()).toBeFocused();
    expect(await browser.execute(() => window.location.hash)).toBe("#/mail");
  });

  it("switches sections with Mod+1 to Mod+5", async () => {
    for (const [key, title] of [
      ["2", "Jobs"],
      ["3", "Tracker"],
      ["4", "CVs"],
      ["5", "Mail"],
      ["1", "Today"],
    ] as const) {
      await pressShortcut(key);
      await expect(await heading()).toHaveText(title);
    }
  });

  it("shows every shortcut in the sheet opened with Mod+/", async () => {
    await pressShortcut("/");
    const sheet = await $('[role="dialog"]');
    await expect(await sheet.$("h2")).toHaveText("Keyboard shortcuts");
    expect(await sheet.$$("dt").map((label) => label.getText())).toEqual([
      "Go to Today",
      "Go to Jobs",
      "Go to Tracker",
      "Go to CVs",
      "Go to Mail",
      "Open command palette",
      "Show keyboard shortcuts",
    ]);
    const modifier = isMac ? "⌘" : "Ctrl";
    expect(await sheet.$$("dd").map((keycap) => keycap.getText())).toEqual(
      ["1", "2", "3", "4", "5", "K", "/"].map((key) => expect.stringMatching(`${modifier}\\s*${key}`)),
    );

    await browser.keys(Key.Escape);
    await expect(sheet).not.toBeExisting();
  });

  it("enforces the Content-Security-Policy", async () => {
    const result = await browser.execute(async () => {
      const script = document.createElement("script");
      script.textContent = "document.body.dataset.injected = 'yes'";
      document.head.append(script);
      const style = document.createElement("style");
      style.textContent = "body { --injected: yes; }";
      document.head.append(style);
      // Probe eval from a timer, i.e. as page code: on Windows, a script injected through
      // WebView2's ExecuteScript (the embedded WebDriver's execute) may call eval itself despite
      // the CSP (seen on windows-latest), while a callback that runs later is checked like any
      // page script.
      const evalBlocked = await new Promise<boolean>((resolve) =>
        setTimeout(() => {
          try {
            eval("1");
            resolve(false);
          } catch {
            resolve(true);
          }
        }, 0),
      );
      return {
        script: document.body.dataset["injected"] ?? "blocked",
        style: getComputedStyle(document.body).getPropertyValue("--injected") || "blocked",
        evalBlocked,
      };
    });
    expect(result).toEqual({
      script: "blocked",
      style: "blocked",
      evalBlocked: true,
    });
  });

  it("admits the app's own nonce-tagged styles (Radix scroll lock)", async () => {
    await pressShortcut("k");
    await expect(await $('[role="dialog"]')).toBeDisplayed();
    const scrollLock = await browser.execute(() => ({
      nonceStyles: [...document.querySelectorAll("style")].filter((style) => style.nonce).length,
      bodyOverflow: getComputedStyle(document.body).overflow,
    }));
    expect(scrollLock.nonceStyles).toBeGreaterThan(0);
    expect(scrollLock.bodyOverflow).toBe("hidden");
    await browser.keys(Key.Escape);
    await expect(await $('[role="dialog"]')).not.toBeExisting();
  });

  it("refuses to open URLs outside the allowlist", async () => {
    const attempts = [
      "http://github.com/",
      "https://example.com/",
      "https://github.com.evil.example/",
      "https://user:pass@github.com/",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ];
    const results = await browser.tauri.execute(async ({ core }, urls: string[]) => {
      const settled = await Promise.allSettled(urls.map((url) => core.invoke("open_external", { url })));
      return settled.map((result) => {
        const reason: unknown = result.status === "rejected" ? result.reason : undefined;
        return typeof reason === "object" && reason !== null && "kind" in reason ? reason.kind : "opened";
      });
    }, attempts);
    expect(results).toEqual(attempts.map(() => "url-not-allowed"));
  });

  it("grants the UI no plugin commands beyond its capability", async () => {
    const result = await browser.tauri.execute(async ({ core }) => {
      try {
        await core.invoke("plugin:opener|open_url", { url: "https://github.com/" });
        return "allowed";
      } catch (error) {
        return String(error);
      }
    });
    expect(result).toMatch(/not allowed/i);
  });

  it("blocks navigation to other origins and new windows", async () => {
    const before = await browser.execute(() => window.location.origin);
    const opened = await browser.execute(() => window.open("https://example.com/") === null);
    expect(opened).toBe(true);
    await browser.execute(() => {
      window.location.href = "https://example.com/";
    });
    await browser.pause(500);
    expect(await browser.execute(() => window.location.origin)).toBe(before);
    expect(await browser.getWindowHandles()).toHaveLength(1);
    await expect(await heading()).toHaveText("Today");
  });
});
