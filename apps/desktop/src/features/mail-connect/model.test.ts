import { IMAP_PRESETS } from "@bfhr/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyMailError } from "../../data/mail/errors";
import { choiceForAddress, draftProblems, imapRequest, initialDraft } from "./model";

describe("choiceForAddress", () => {
  it("picks the tile from the address domain", () => {
    expect(choiceForAddress("deniz@gmail.com")).toBe("gmail");
    expect(choiceForAddress("deniz@icloud.com")).toBe("icloud");
    expect(choiceForAddress("deniz@hotmail.com")).toBe("outlook");
    expect(choiceForAddress("deniz@web.de")).toBe("webde");
    expect(choiceForAddress("deniz@firma.example")).toBeNull();
    expect(choiceForAddress("not an address")).toBeNull();
  });
});

describe("the app-password form", () => {
  it("starts from the preset's servers and leaves them out of the request", () => {
    const draft = { ...initialDraft("icloud", "deniz@icloud.com", null), password: "abcd-efgh-ijkl-mnop" };
    expect(draft).toMatchObject({ imapHost: "imap.mail.me.com", imapPort: "993", smtpHost: "smtp.mail.me.com" });
    expect(draftProblems(draft, "icloud")).toEqual({});
    expect(imapRequest(draft, "icloud", 90, null)).toEqual({
      address: "deniz@icloud.com",
      password: "abcd-efgh-ijkl-mnop",
      preset: "icloud",
      username: null,
      imap: null,
      smtp: null,
      lookbackDays: 90,
      accountId: null,
    });
  });

  it("sends Other's servers, and no SMTP for reading only", () => {
    const draft = {
      ...initialDraft("other", "me@firma.example", null),
      password: "secret",
      imapHost: "Mail.Firma.Example",
      smtpHost: "",
    };
    expect(draftProblems(draft, "other")).toEqual({});
    expect(imapRequest(draft, "other", 30, null)).toMatchObject({
      imap: { host: "mail.firma.example", port: 993, security: "tls" },
      smtp: null,
      lookbackDays: 30,
    });
  });

  it("names every field to fix before anything is sent", () => {
    const draft = { ...initialDraft("other", "", null), imapPort: "99999", smtpHost: "smtp example", smtpPort: "x" };
    expect(draftProblems(draft, "other")).toEqual({
      address: "missing",
      password: "missing",
      imapHost: "missing",
      imapPort: "invalid",
      smtpHost: "invalid",
      smtpPort: "invalid",
    });
  });
});

describe("classifyMailError", () => {
  it("reads the reason and the field to mark", () => {
    const error = { code: "functions/permission-denied", details: { reason: "auth_failed", field: "password" } };
    expect(classifyMailError(error, { online: true })).toEqual({ kind: "auth_failed", field: "password" });
    expect(
      classifyMailError({ code: "functions/failed-precondition", details: { reason: "provider_not_configured" } }, { online: true }),
    ).toEqual({ kind: "provider_not_configured", field: null });
  });

  it("treats lost connections as offline and anything else as failed", () => {
    expect(classifyMailError({ code: "functions/unavailable" }, { online: true }).kind).toBe("offline");
    expect(classifyMailError(new Error("boom"), { online: true }).kind).toBe("failed");
    expect(classifyMailError({ code: "functions/internal" }, { online: false }).kind).toBe("offline");
  });
});

describe("help links", () => {
  it("open only hosts the desktop shell allows (src-tauri/src/external_url.rs)", () => {
    const rust = readFileSync(new URL("../../../src-tauri/src/external_url.rs", import.meta.url), "utf8");
    for (const preset of IMAP_PRESETS) {
      if (preset.appPasswordUrl === null) continue;
      expect(rust, preset.id).toContain(`"${new URL(preset.appPasswordUrl).host}"`);
    }
  });
});
