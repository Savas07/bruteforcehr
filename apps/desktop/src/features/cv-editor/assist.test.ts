import { FirebaseError } from "firebase/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { assistErrorMessage, assistKey, classifyAssistError, requestCvAssist } from "./assist";

// vi.mock is hoisted above the imports, so ./assist sees the mocks.
const { call, httpsCallable } = vi.hoisted(() => {
  const call = vi.fn();
  return { call, httpsCallable: vi.fn(() => call) };
});
vi.mock("firebase/functions", () => ({ httpsCallable }));
vi.mock("../../lib/firebaseServices", () => ({ functions: () => "functions-instance" }));

const intl = createAppIntl({ language: "en", locale: "en-GB" });

/** A callable failure as the Functions SDK throws it (`FunctionsError`: code + details). */
function callableError(code: string, reason?: string): FirebaseError {
  return Object.assign(new FirebaseError(`functions/${code}`, code), reason ? { details: { reason } } : {});
}

const request = {
  text: "Responsible for the checkout",
  action: "strongerVerb",
  context: { section: "work", role: "Mobile developer", company: "Pazarbox" },
} as const;

describe("requestCvAssist", () => {
  beforeEach(() => {
    call.mockReset();
    httpsCallable.mockClear();
  });

  it("calls cvAssist with the request and returns the validated answer", async () => {
    const data = {
      suggestions: [
        { text: "Led the checkout rebuild", placeholders: [] },
        { text: "Rebuilt the checkout, lifting conversion by [X%]", placeholders: ["[X%]"] },
      ],
      model: "gemini-2.5-flash",
      promptVersion: "cv-assist@3",
    };
    call.mockResolvedValue({ data });
    await expect(requestCvAssist(request)).resolves.toEqual(data);
    expect(httpsCallable).toHaveBeenCalledWith("functions-instance", "cvAssist");
    expect(call).toHaveBeenCalledWith(request);
  });

  it("passes the target language for translate", async () => {
    call.mockResolvedValue({ data: { suggestions: [], model: "m", promptVersion: "p" } });
    await requestCvAssist({ ...request, action: "translate", targetLanguage: "de" });
    expect(call).toHaveBeenCalledWith({ ...request, action: "translate", targetLanguage: "de" });
  });

  it.each([
    ["no suggestions list", { model: "m", promptVersion: "p" }],
    [
      "an empty suggestion",
      { suggestions: [{ text: "", placeholders: [] }], model: "m", promptVersion: "p" },
    ],
    [
      "placeholders that aren't strings",
      { suggestions: [{ text: "a", placeholders: [1] }], model: "m", promptVersion: "p" },
    ],
    ["no model", { suggestions: [], promptVersion: "p" }],
    ["no prompt version", { suggestions: [], model: "m" }],
    ["nothing", null],
  ])("rejects an answer with %s", async (_, data) => {
    call.mockResolvedValue({ data });
    await expect(requestCvAssist(request)).rejects.toThrow();
  });
});

describe("assist errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["failed-precondition", "ai_disabled", "aiDisabled"],
    ["failed-precondition", undefined, "failed"],
    ["resource-exhausted", "daily_cap", "dailyCap"],
    ["resource-exhausted", undefined, "dailyCap"],
    ["permission-denied", "email_unverified", "emailUnverified"],
    ["permission-denied", undefined, "signedOut"],
    ["unauthenticated", undefined, "signedOut"],
    ["unavailable", undefined, "offline"],
    ["internal", undefined, "failed"],
    ["deadline-exceeded", undefined, "failed"],
  ])("classifies %s / %s as %s", (code, reason, kind) => {
    expect(classifyAssistError(callableError(code, reason), { online: true })).toBe(kind);
  });

  it("treats any failure while offline as offline", () => {
    expect(classifyAssistError(callableError("internal"), { online: false })).toBe("offline");
  });

  it("treats non-callable failures (a malformed answer) as a plain failure", () => {
    expect(classifyAssistError(new Error("bad shape"), { online: true })).toBe("failed");
    expect(classifyAssistError(null, { online: true })).toBe("failed");
  });

  it("says what happened, calmly", () => {
    expect(assistErrorMessage(callableError("failed-precondition", "ai_disabled"), intl)).toMatch(
      /off in Settings/u,
    );
    expect(assistErrorMessage(callableError("resource-exhausted", "daily_cap"), intl)).toMatch(
      /today's AI limit.*resets tomorrow.*keep editing/u,
    );
    expect(assistErrorMessage(callableError("internal"), intl)).toMatch(/Try again in a moment/u);
  });

  it("reads the connection from the browser", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(assistErrorMessage(callableError("internal"), intl)).toMatch(/need an internet connection/u);
  });
});

describe("assistKey", () => {
  it("keys bullets and the summary apart", () => {
    expect(assistKey({ sectionKey: "work", itemId: "work-1", bulletIndex: 2 })).toBe("work:work-1:2");
    expect(assistKey({ sectionKey: "summary", itemId: null, bulletIndex: null })).toBe("summary::");
  });
});
