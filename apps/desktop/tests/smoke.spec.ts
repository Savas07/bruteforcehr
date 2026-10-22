import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { launchBuiltApp } from "./launch";

let app: ElectronApplication;
let page: Page;
const cspViolations: string[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  ({ app, page } = await launchBuiltApp());
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) cspViolations.push(message.text());
  });
});

test.afterAll(async () => {
  await app.close();
});

/**
 * Presses ⌘+key (macOS) or Ctrl+key through webContents.sendInputEvent, which enters Chromium's
 * native input pipeline like a real key press (Playwright's CDP keyboard bypasses
 * `before-input-event`, where the app routes its shortcuts).
 */
async function pressShortcut(key: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, keyCode) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("No window");
    const modifiers: Array<"meta" | "control"> = [process.platform === "darwin" ? "meta" : "control"];
    window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  }, key);
}

test("the main window opens on Today", async () => {
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await expect(page).toHaveTitle("Today · BruteForceHR");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
});

test("the sidebar lists the five M0 destinations", async () => {
  const links = page.getByRole("navigation", { name: "Sections" }).getByRole("link");
  await expect(links).toHaveText(["Today", "Jobs", "Tracker", "CVs", "Mail"]);
  await expect(links.first()).toHaveAttribute("aria-current", "page");
});

test("⌘K / Ctrl+K opens the command palette, which navigates", async () => {
  await pressShortcut("K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();

  await page.keyboard.type("track");
  await expect(palette.getByRole("option")).toHaveText([/Tracker/]);
  await page.keyboard.press("Enter");

  await expect(palette).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tracker");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#/tracker");
});

test("⌘1–5 / Ctrl+1–5 switch sections and ⌘/ opens the shortcuts sheet", async () => {
  await pressShortcut("5");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mail");
  await pressShortcut("1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");

  await pressShortcut("/");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("term")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("the native menu lists every shortcut", async () => {
  const accelerators = await app.evaluate(({ Menu }) =>
    ["go-today", "go-jobs", "go-tracker", "go-cvs", "go-mail", "command-palette", "keyboard-shortcuts"].map(
      (id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator,
    ),
  );
  expect(accelerators).toEqual([
    "CmdOrCtrl+1",
    "CmdOrCtrl+2",
    "CmdOrCtrl+3",
    "CmdOrCtrl+4",
    "CmdOrCtrl+5",
    "CmdOrCtrl+K",
    "CmdOrCtrl+/",
  ]);
});

test("webPreferences and the renderer are locked down", async () => {
  const { preferences, rendererSandboxed } = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    if (!contents) throw new Error("No window");
    // The effective preferences: Electron's internal getter (not in the public typings).
    const getter: unknown = Reflect.get(contents, "getLastWebPreferences");
    if (typeof getter !== "function") throw new Error("getLastWebPreferences is unavailable");
    const webPreferences: unknown = getter.call(contents);
    if (typeof webPreferences !== "object" || webPreferences === null) throw new Error("No preferences");
    const keys = [
      "contextIsolation",
      "sandbox",
      "nodeIntegration",
      "nodeIntegrationInWorker",
      "nodeIntegrationInSubFrames",
      "webSecurity",
      "allowRunningInsecureContent",
      "webviewTag",
    ];
    const pid = contents.getOSProcessId();
    return {
      preferences: Object.fromEntries(keys.map((key) => [key, Reflect.get(webPreferences, key)])),
      // OS-level confirmation that the renderer process runs in the Chromium sandbox.
      rendererSandboxed: electronApp.getAppMetrics().find((metric) => metric.pid === pid)?.sandboxed,
    };
  });
  expect(preferences).toEqual({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
  });
  if (process.platform !== "linux") expect(rendererSandboxed).toBe(true);

  const renderer = await page.evaluate(() => ({
    require: "require" in window,
    process: "process" in window,
    api: Object.keys(window.bfhr).sort(),
  }));
  expect(renderer).toEqual({
    require: false,
    process: false,
    api: ["getAppInfo", "material", "onMenuCommand", "openExternal", "platform"],
  });
  expect(page.url()).toMatch(/^app:\/\/bfhr\//);
});

test("IPC answers allowlisted calls and rejects everything else", async () => {
  const info = await page.evaluate(() => window.bfhr.getAppInfo());
  expect(info).toEqual({ version: expect.any(String), platform: process.platform });

  const rejected = await page.evaluate(async () => {
    const attempts = [
      "http://github.com",
      "https://example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ];
    const results = await Promise.allSettled(attempts.map((url) => window.bfhr.openExternal(url)));
    return results.map((result) => result.status);
  });
  expect(rejected).toEqual(["rejected", "rejected", "rejected", "rejected"]);
});

test("window.open and off-app navigation are blocked", async () => {
  expect(await page.evaluate(() => window.open("https://example.com"))).toBeNull();
  await page.evaluate(() => {
    window.location.href = "https://example.com";
  });
  await page.waitForTimeout(300);
  expect(page.url()).toMatch(/^app:\/\/bfhr\//);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test("the app itself causes no Content-Security-Policy violations", () => {
  expect(cspViolations).toEqual([]);
});

test("the Content-Security-Policy blocks inline scripts and styles", async () => {
  const injected = await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "document.body.dataset.injected = 'yes'";
    document.head.append(script);
    const style = document.createElement("style");
    style.textContent = "body { --injected: yes; }";
    document.head.append(style);
    return {
      script: document.body.dataset["injected"] ?? "blocked",
      style: getComputedStyle(document.body).getPropertyValue("--injected") || "blocked",
    };
  });
  expect(injected).toEqual({ script: "blocked", style: "blocked" });
});
