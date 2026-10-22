import type { MailMessage } from "@bfhr/core";
import { emptyDataset, type FixtureDataset, populatedDataset } from "@bfhr/fixtures";
import { describe, expect, it } from "vitest";
import { fixtureContext } from "../../shared/model/fixture-context";
import { buildMailReviewModel, type MailRowVM } from "./model";

function build(
  params: Record<string, string> = {},
  data: FixtureDataset = populatedDataset,
  pending: string[] = [],
) {
  return buildMailReviewModel(data, fixtureContext(data, pending), params);
}

function messageIds(rows: readonly MailRowVM[]): string[] {
  return rows.map((row) => (row.kind === "bundle" ? `bundle:${row.id}` : row.messageId));
}

/** Populated data where only the given pending emails are still waiting. */
function withPending(keep: readonly string[]): FixtureDataset {
  return {
    ...populatedDataset,
    mailMessages: populatedDataset.mailMessages.map((message): MailMessage =>
      message.reviewState === "pending" && !keep.includes(message.id)
        ? { ...message, reviewState: "confirmed", reviewedAt: message.receivedAt }
        : message,
    ),
  };
}

describe("buildMailReviewModel — folders and accounts", () => {
  const model = build();

  it("counts To review, Updates and All job mail from the fixtures", () => {
    expect(model.title).toBe("Mail");
    expect(model.folders.map(({ id, label, count, selected }) => ({ id, label, count, selected }))).toEqual([
      { id: "review", label: "To review", count: 3, selected: true },
      { id: "updates", label: "Updates", count: 6, selected: false },
      { id: "all", label: "All job mail", count: 12, selected: false },
    ]);
    expect(model.folders[0]?.accessibleLabel).toBe("To review, 3");
  });

  it("lists categories with counts; rejection reads Decision", () => {
    expect(model.categories.map(({ label, count }) => `${label} ${count}`)).toEqual([
      "Interview invite 2",
      "Assessment 1",
      "Offer 1",
      "Decision 2",
      "Recruiter 1",
      "Info request 1",
      "Job alert 1",
      "Application received 2",
      "Other 1",
    ]);
    expect(model.categories.some((category) => category.selected)).toBe(false);
  });

  it("shows account health with an amber dot for re-auth, and one reconnect callout", () => {
    expect(model.accounts).toEqual([
      {
        id: "acc-gmail",
        address: "deniz.aksoy@example.com",
        provider: "Gmail",
        health: "ok",
        healthLabel: "Connected",
        dot: "none",
        accessibleLabel: "deniz.aksoy@example.com, Connected",
      },
      {
        id: "acc-icloud",
        address: "deniz.aksoy@example.net",
        provider: "iCloud",
        health: "reauth",
        healthLabel: "Needs reconnecting",
        dot: "warning",
        accessibleLabel: "deniz.aksoy@example.net, Needs reconnecting",
      },
    ]);
    expect(model.reauth).toEqual([
      {
        accountId: "acc-icloud",
        address: "deniz.aksoy@example.net",
        message:
          "iCloud needs you to sign in again. We paused checking deniz.aksoy@example.net on 21 Oct. Reconnect to pick up where we left off.",
        actionLabel: "Reconnect",
      },
    ]);
  });

  it("stamps the latest check in the user's clock", () => {
    expect(model.lastChecked?.label).toBe("Last checked 10:24");
    expect(model.lastChecked?.at.label).toBe("10:24");
  });
});

describe("buildMailReviewModel — To review", () => {
  it("lists pending emails newest first and selects the first by default", () => {
    const model = build();
    expect(model.folder).toBe("review");
    expect(messageIds(model.rows)).toEqual([
      "mail-sail-outreach",
      "mail-tannenbaum-info",
      "mail-nordlicht-invite",
    ]);
    expect(model.selectedMessageId).toBe("mail-sail-outreach");
    expect(model.selected?.mode).toBe("review");
    expect(model.noSelection).toBeNull();
    expect(model.empty).toBeNull();
  });

  it("falls back to the default selection for an unknown message id", () => {
    expect(build({ messageId: "mail-nope" }).selectedMessageId).toBe("mail-sail-outreach");
  });

  it("shows review rows with sender, hedged headline, confirm hint and an account dot", () => {
    const row = build().rows[2];
    if (row?.kind !== "review") throw new Error("expected a review row");
    expect(row.sender).toBe("Lena Vogel");
    expect(row.company.name).toBe("Nordlicht Mobility");
    expect(row.category.label).toBe("Interview invite");
    expect(row.subject).toBe("Einladung zum Kennenlernen – Frontend Engineer");
    expect(row.receivedAt.label).toBe("yesterday");
    expect(row.account).toEqual({ address: "deniz.aksoy@example.com", provider: "Gmail" });
    expect(row.proposal.headline).toBe("Looks like an interview invite from Nordlicht Mobility");
    expect(row.proposal.hedged).toBe(true);
    expect(row.confirmHint).toBe("Confirm: move to Screening");
    expect(row.canConfirm).toBe(true);
    expect(row.unclassified).toBeNull();
    expect(row.pendingSync).toBe(false);
  });

  it("keeps the factual headline for an auto-applied email", () => {
    const model = build({ messageId: "mail-brightwave-invite" });
    expect(model.selected?.mode).toBe("update");
    expect(model.selected?.proposal.headline).toBe("Interview invite from Brightwave");
    expect(model.selected?.proposal.hedged).toBe(false);
    expect(model.selected?.change?.to.label).toBe("Interviewing");
    expect(model.selected?.details.meetingUrl).toBe("https://meet.google.com/bwq-ztkx-rmh");
  });

  it("flags rows and the selection waiting to sync", () => {
    const model = build({ messageId: "mail-nordlicht-invite" }, populatedDataset, ["mail-nordlicht-invite"]);
    expect(model.rows.map((row) => row.pendingSync)).toEqual([false, false, true]);
    expect(model.selected?.proposal.pendingSync).toBe(true);
  });

  it("marks other_job emails in the queue as unclassified", () => {
    const data: FixtureDataset = {
      ...populatedDataset,
      mailMessages: populatedDataset.mailMessages.map((message) =>
        message.id === "mail-kumsal-update"
          ? { ...message, reviewState: "pending", reviewedAt: null }
          : message,
      ),
    };
    const row = build({}, data).rows.find(
      (candidate) => candidate.kind === "review" && candidate.messageId === "mail-kumsal-update",
    );
    if (row?.kind !== "review") throw new Error("expected a review row");
    expect(row.unclassified).toBe("We couldn't tell what this email means. Open it to sort it yourself.");
    expect(row.canConfirm).toBe(false);
  });

  it("bundles inbox-scan proposals into one row that counts once per application (D17)", () => {
    const base = populatedDataset.mailMessages.find((message) => message.id === "mail-nordlicht-invite");
    const gmail = populatedDataset.mailAccounts.find((account) => account.id === "acc-gmail");
    if (!base || !gmail) throw new Error("fixture missing");
    const scanned = (id: string, days: number): MailMessage => ({
      ...base,
      id,
      applicationId: "app-quill",
      receivedAt: new Date(gmail.connectedAt.getTime() - days * 86_400_000),
    });
    const data: FixtureDataset = {
      ...populatedDataset,
      mailMessages: [...populatedDataset.mailMessages, scanned("mail-scan-1", 3), scanned("mail-scan-2", 5)],
    };
    const model = build({}, data);
    expect(model.folders[0]?.count).toBe(4);
    const bundle = model.rows[0];
    expect(bundle).toMatchObject({
      kind: "bundle",
      id: "backfill",
      label: "Inbox scan · 1 application to review",
      target: "backfillReview",
      messageIds: ["mail-scan-1", "mail-scan-2"],
    });
    expect(model.selectedMessageId).toBe("mail-sail-outreach");
  });
});

describe("buildMailReviewModel — reading pane", () => {
  it("shows the body, recent activity and details of the linked application", () => {
    const selected = build({ messageId: "mail-tannenbaum-info" }).selected;
    expect(selected?.body).toContain("Könnten Sie uns Ihre Gehaltsvorstellung");
    expect(selected?.bodyNote).toBeNull();
    expect(selected?.openOriginalLabel).toBe("Open in Gmail");
    expect(selected?.confirmHint).toBe("Confirm: move to Acknowledged");
    expect(selected?.activity.map((event) => event.title)).toEqual([
      "Moved to Applied",
      "Moved to Preparing",
      "Added as Saved",
    ]);
    expect(selected?.details).toMatchObject({
      company: { name: "Tannenbaum Software" },
      role: "Frontend-Entwickler:in (React)",
      application: {
        id: "app-tannenbaum",
        label: "Tannenbaum Software · Frontend-Entwickler:in (React)",
        summary: { status: { label: "Applied" } },
      },
      contact: { name: "Sophie Krüger", email: "s.krueger@tannenbaum-software.de", role: "Personal" },
      meetingUrl: null,
    });
    expect(selected?.details.dates.map((date) => date.label)).toEqual(["Reply by"]);
  });

  it("falls back to the contact named in the email", () => {
    expect(build().selected?.details.contact).toEqual({
      name: "Hannah Brooks",
      email: "hannah@sailanalytics.com",
      role: null,
    });
  });

  it("says how long a closed application's email text is kept", () => {
    const selected = build({ messageId: "mail-fjordline-rejection" }).selected;
    expect(selected?.proposal.category.label).toBe("Decision");
    expect(selected?.proposal.headline).toBe("Fjordline Health has decided not to move forward");
    expect(selected?.bodyNote).toBe("Email text kept until 4 Apr 2027");
  });
});

describe("buildMailReviewModel — Updates and All job mail", () => {
  it("lists automatic changes of the last 14 days, newest change first", () => {
    const model = build({ folder: "updates" });
    expect(model.folder).toBe("updates");
    expect(messageIds(model.rows)).toEqual([
      "mail-lumenpay-offer",
      "mail-kumsal-update",
      "mail-brightwave-invite",
      "mail-grachten-assessment",
      "mail-cadence-rejection",
      "mail-brisk-received",
    ]);
    const kumsal = model.rows[1];
    if (kumsal?.kind !== "update") throw new Error("expected an update row");
    expect(kumsal.reviewedChip).toBe("Corrected");
    expect(kumsal.change.undo.available).toBe(false);
    expect(model.selectedMessageId).toBe("mail-lumenpay-offer");
  });

  it("collapses job alerts into one bundle row and marks confirmed email", () => {
    const model = build({ folder: "all" });
    expect(model.rows).toHaveLength(12);
    const bundle = model.rows.find((row) => row.kind === "bundle");
    expect(bundle).toMatchObject({
      id: "jobAlerts",
      label: "Job alerts · 3 postings sent to Jobs",
      target: "jobs",
      messageIds: ["mail-job-alert"],
    });
    const ada = model.rows.find((row) => row.kind !== "bundle" && row.messageId === "mail-ada-received");
    expect(ada).toMatchObject({ kind: "plain", reviewedChip: "Confirmed", sender: "Ada Sigorta İK" });
  });

  it("filters All job mail by category", () => {
    const model = build({ category: "rejection" });
    expect(model.folder).toBe("all");
    expect(model.category).toBe("rejection");
    expect(messageIds(model.rows)).toEqual(["mail-cadence-rejection", "mail-fjordline-rejection"]);
    expect(model.categories.find((category) => category.selected)?.label).toBe("Decision");
    expect(model.folders.some((folder) => folder.selected)).toBe(false);
  });
});

describe("buildMailReviewModel — empty and no selection", () => {
  it("asks to connect email when no account exists", () => {
    const model = build({}, emptyDataset);
    expect(model.empty).toEqual({
      kind: "noAccount",
      title: "Connect your email",
      body: "Connect your email and we'll find replies about your applications. When we're not sure what an email means, we'll ask you first.",
      action: { label: "Connect email", target: "connectEmail" },
    });
    expect(model.folders.map((folder) => folder.count)).toEqual([0, 0, 0]);
    expect(model.rows).toEqual([]);
    expect(model.accounts).toEqual([]);
    expect(model.selected).toBeNull();
    expect(model.selectedMessageId).toBeNull();
    expect(model.noSelection).toBeNull();
    expect(model.reauth).toEqual([]);
    expect(model.lastChecked).toBeNull();
  });

  it("is caught up when accounts exist but nothing is pending", () => {
    const model = build({}, withPending([]));
    expect(model.empty).toEqual({
      kind: "caughtUp",
      title: "Nothing to review",
      body: "When we're not sure what an email means, we'll ask you here.",
      action: { label: "See recent updates", target: "showUpdates" },
    });
    expect(model.selected).toBeNull();
    expect(model.noSelection?.title).toBe("Nothing to review");
  });

  it("counts what is waiting when nothing is selected, with plural rules", () => {
    const empty = { ...withPending(["mail-nordlicht-invite", "mail-sail-outreach"]), applicationEvents: [] };
    expect(build({ folder: "updates" }, empty).noSelection?.title).toBe(
      "2 emails to review. Select one to see what we found.",
    );
    expect(
      build({ folder: "updates" }, { ...withPending(["mail-nordlicht-invite"]), applicationEvents: [] })
        .noSelection?.title,
    ).toBe("1 email to review. Select one to see what we found.");
    expect(build({ folder: "updates" }, empty).empty?.kind).toBe("noUpdates");
  });
});
