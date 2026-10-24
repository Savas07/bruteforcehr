import { describe, expect, it } from "vitest";
import { decideMailAction, mailBodyPurgeAt } from "./decision";
import { imapPresetFor } from "./connect";
import { linkApplication } from "./linking";
import {
  classifyByRules,
  isJobCandidate,
  type MailInput,
  mailSignals,
  type TrackedApplication,
} from "./rules";
import { companiesMatch, rolesMatch } from "./text";

const app = (over: Partial<TrackedApplication> = {}): TrackedApplication => ({
  id: "a1",
  company: "Acme Robotics GmbH",
  companyDomain: "acme-robotics.example",
  role: "Backend Engineer (m/w/d)",
  status: "applied",
  threadRefs: [],
  ...over,
});
const mail = (over: Partial<MailInput> = {}): MailInput => ({
  accountId: "acc",
  from: { name: "Acme Robotics Recruiting", address: "no-reply@us.greenhouse-mail.io" },
  subject: "Your application for Backend Engineer at Acme Robotics",
  bodyText: "Thank you for applying to Acme Robotics. We have received your application and will review it.",
  folder: "inbox",
  providerThreadId: null,
  inReplyTo: null,
  references: [],
  listUnsubscribe: false,
  bulk: false,
  ...over,
});

describe("mail rules", () => {
  it("drops non-job mail before any model call", () => {
    const signals = mailSignals(
      mail({
        from: { name: "Shop", address: "deals@shop.example" },
        subject: "50% off",
        bodyText: "Weekend sale on shoes.",
      }),
      [],
    );
    expect(isJobCandidate(signals)).toBe(false);
  });

  it("reads 'thank you for applying … unfortunately' as a rejection", () => {
    const input = mail({
      bodyText:
        "Thank you for applying. Unfortunately, we have decided to move forward with other candidates.",
    });
    expect(classifyByRules(input, mailSignals(input, [app()])).category).toBe("rejection");
  });

  it("keeps rule confidence below auto-apply when two status categories compete", () => {
    const input = mail({
      bodyText:
        "Thank you for your application. We would like to invite you to an interview next week. You will also receive a coding challenge.",
    });
    const result = classifyByRules(input, mailSignals(input, [app()]));
    expect(result.confidence).toBeLessThan(0.9);
  });

  it("matches company and role names across legal forms and gender markers", () => {
    expect(companiesMatch("Acme Robotics GmbH", "acme robotics")).toBe(true);
    expect(companiesMatch("Acme", "Acmeco")).toBe(false);
    expect(rolesMatch("Backend Engineer (m/w/d)", "Senior Backend Engineer")).toBe(true);
    expect(rolesMatch("Frontend Engineer", "Backend Engineer")).toBe(false);
  });
});

describe("linking", () => {
  it("prefers the thread, then company + role from an ATS", () => {
    const tracked = [
      app(),
      app({
        id: "a2",
        role: "Data Engineer",
        threadRefs: [{ accountId: "acc", threadId: "t1", rfc822MessageId: null }],
      }),
    ];
    const threaded = mail({ providerThreadId: "t1" });
    expect(
      linkApplication({
        signals: mailSignals(threaded, tracked),
        applications: tracked,
        company: null,
        role: null,
        modelChoice: null,
      }),
    ).toEqual({ applicationId: "a2", linkStrength: "thread" });
    const ats = mail();
    expect(
      linkApplication({
        signals: mailSignals(ats, tracked),
        applications: tracked,
        company: "Acme Robotics",
        role: "Backend Engineer",
        modelChoice: null,
      }),
    ).toEqual({ applicationId: "a1", linkStrength: "ats_company_role" });
  });

  it("refuses to guess between two applications at one company without a role", () => {
    const tracked = [app(), app({ id: "a2", role: "Data Engineer" })];
    const input = mail({ subject: "Update from Acme Robotics" });
    expect(
      linkApplication({
        signals: mailSignals(input, tracked),
        applications: tracked,
        company: "Acme Robotics",
        role: null,
        modelChoice: "a2",
      }).applicationId,
    ).toBeNull();
  });
});

describe("decision", () => {
  const base = {
    confidence: 0.95,
    screening: false,
    linkStrength: "thread" as const,
    actor: "ai" as const,
    autoApplyConfidence: 0.9,
  };
  it("auto-applies a confident forward move with a strong link", () => {
    expect(decideMailAction({ ...base, category: "interview_invite", applicationStatus: "applied" })).toEqual(
      { suggestedStatus: "interviewing", reviewState: "auto_applied", autoApply: true },
    );
  });
  it("queues weak links and low confidence for review", () => {
    expect(
      decideMailAction({ ...base, category: "rejection", applicationStatus: "applied", linkStrength: "llm" })
        .reviewState,
    ).toBe("pending");
    expect(
      decideMailAction({ ...base, category: "rejection", applicationStatus: "applied", confidence: 0.85 })
        .reviewState,
    ).toBe("pending");
  });
  it("never moves backward or out of a closed status", () => {
    expect(
      decideMailAction({ ...base, category: "application_received", applicationStatus: "interviewing" })
        .suggestedStatus,
    ).toBeNull();
    expect(
      decideMailAction({ ...base, category: "offer", applicationStatus: "rejected" }).suggestedStatus,
    ).toBeNull();
  });
  it("sets bodyPurgeAt from the application's close or the receipt", () => {
    const receivedAt = new Date("2026-10-01T00:00:00Z");
    expect(
      mailBodyPurgeAt({
        receivedAt,
        retentionDays: 180,
        application: { status: "applied", statusChangedAt: receivedAt },
      }),
    ).toBeNull();
    expect(
      mailBodyPurgeAt({
        receivedAt,
        retentionDays: 10,
        application: { status: "rejected", statusChangedAt: receivedAt },
      })?.toISOString(),
    ).toBe("2026-10-11T00:00:00.000Z");
    expect(mailBodyPurgeAt({ receivedAt, retentionDays: 1, application: null })?.toISOString()).toBe(
      "2026-10-02T00:00:00.000Z",
    );
  });
});

describe("IMAP presets", () => {
  it("detects providers by domain and routes Outlook.com to OAuth", () => {
    expect(imapPresetFor("someone@ICLOUD.com")?.id).toBe("icloud");
    expect(imapPresetFor("someone@hotmail.com")?.oauthOnly).toBe("microsoft");
    expect(imapPresetFor("someone@custom.example")).toBeUndefined();
  });
});
