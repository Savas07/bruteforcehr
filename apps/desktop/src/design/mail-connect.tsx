/**
 * The connect dialog's states in the design build (`?connect=<state>` on any route, usually
 * Settings › Mail accounts), opened through `openMailConnectAt` once the route renders, and the
 * inbox scan's states (`?scan=running|done|failed`: the fixture gains a GMX inbox in that scan,
 * shown in Settings, Today and the dialog's scanning step). OAuth answers like production
 * (`provider_not_configured`) unless `?oauth=configured`.
 */
import type { MailAccount, MailBackfill } from "@bfhr/core";
import { FIXTURE_NOW } from "@bfhr/fixtures";
import { useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import type { MailConnectInitial } from "../features/mail-connect/request";
import { openMailConnectAt } from "../features/mail-connect/request";
import { readDesignParams } from "./search";

export const mailConnectDesignStates = [
  "picker",
  "oauth-intro",
  "oauth-unavailable",
  "outlook-unavailable",
  "oauth-waiting",
  "oauth-error",
  "imap",
  "imap-other",
  "imap-error",
  "imap-testing",
  "reconnect",
  "scanning",
] as const;
export type MailConnectDesignState = (typeof mailConnectDesignStates)[number];

/** The scanned inbox's id (`?scan=`). */
export const DESIGN_SCAN_ACCOUNT_ID = "acc-design-gmx";

const MINUTE_MS = 60_000;

function backfill(state: string): MailBackfill {
  const started = new Date(FIXTURE_NOW.getTime() - 4 * MINUTE_MS);
  const base: MailBackfill = {
    state: "running",
    stage: "classifying",
    lookbackDays: 90,
    since: new Date(FIXTURE_NOW.getTime() - 90 * 86_400_000),
    scanned: 1_240,
    total: 3_100,
    jobMessages: 38,
    applications: 9,
    interviewInvites: 2,
    jobAlerts: 6,
    pendingReview: 0,
    startedAt: started,
    finishedAt: null,
    error: null,
  };
  if (state === "done")
    return {
      ...base,
      state: "done",
      stage: "preparing",
      scanned: 3_100,
      pendingReview: 5,
      finishedAt: FIXTURE_NOW,
    };
  if (state === "failed")
    return {
      ...base,
      state: "failed",
      stage: "scanning",
      scanned: 820,
      error: { code: "unavailable", message: "The mail server stopped answering." },
    };
  return base;
}

/** The GMX inbox of `?scan=` (null without it). */
export function designScanAccount(scan: string | undefined): MailAccount | null {
  if (scan !== "running" && scan !== "done" && scan !== "failed") return null;
  return {
    id: DESIGN_SCAN_ACCOUNT_ID,
    provider: "imap",
    address: "deniz.aksoy@gmx.de",
    displayName: null,
    status: "connected",
    syncCursor: null,
    secretRef: `mail/users/design/mailTokens/${DESIGN_SCAN_ACCOUNT_ID}`,
    scopes: [],
    canSend: true,
    lastSyncedAt: new Date(FIXTURE_NOW.getTime() - 2 * MINUTE_MS),
    lastError: null,
    server: {
      preset: "gmx",
      username: "deniz.aksoy@gmx.de",
      imap: { host: "imap.gmx.net", port: 993, security: "tls" },
      smtp: { host: "mail.gmx.net", port: 587, security: "starttls" },
    },
    backfill: backfill(scan),
    connectedAt: new Date(FIXTURE_NOW.getTime() - 5 * MINUTE_MS),
    createdAt: new Date(FIXTURE_NOW.getTime() - 5 * MINUTE_MS),
    updatedAt: FIXTURE_NOW,
  };
}

const INITIAL: Readonly<
  Record<MailConnectDesignState, { readonly initial: MailConnectInitial; readonly accountId?: string }>
> = {
  picker: { initial: { view: { kind: "picker" } } },
  "oauth-intro": { initial: { view: { kind: "oauth", provider: "google", phase: { step: "intro" } } } },
  "oauth-unavailable": {
    initial: { view: { kind: "oauth", provider: "google", phase: { step: "unavailable" } } },
  },
  "outlook-unavailable": {
    initial: { view: { kind: "oauth", provider: "microsoft", phase: { step: "unavailable" } } },
  },
  "oauth-waiting": {
    initial: {
      view: {
        kind: "oauth",
        provider: "google",
        phase: {
          step: "waiting",
          url: "https://bruteforcehr.web.app/connect/google?nonce=design-nonce-0000000000",
          nonce: "design-nonce-0000000000",
          expiresAt: FIXTURE_NOW.getTime() + 10 * MINUTE_MS,
          startedAt: Date.now(),
          known: ["acc-gmail"],
        },
      },
    },
  },
  "oauth-error": {
    initial: {
      view: { kind: "oauth", provider: "google", phase: { step: "error", reason: "scope_missing" } },
    },
  },
  imap: {
    initial: { view: { kind: "imap", choice: "icloud" }, draft: { address: "deniz.aksoy@icloud.com" } },
  },
  "imap-other": {
    initial: { view: { kind: "imap", choice: "other" }, draft: { address: "deniz@aksoy.dev" } },
  },
  "imap-error": {
    initial: {
      view: { kind: "imap", choice: "yahoo" },
      draft: { address: "deniz.aksoy@yahoo.com", password: "wrong" },
      failure: { kind: "auth_failed", field: "password" },
    },
  },
  "imap-testing": {
    initial: {
      view: { kind: "imap", choice: "gmx" },
      draft: { address: "deniz.aksoy@gmx.de", password: "app-password" },
      submit: true,
    },
  },
  reconnect: { initial: { view: { kind: "imap", choice: "icloud" } }, accountId: "acc-icloud" },
  scanning: {
    initial: { view: { kind: "scanning", accountId: DESIGN_SCAN_ACCOUNT_ID, smtpWarning: false } },
  },
};

function isState(value: string | undefined): value is MailConnectDesignState {
  return mailConnectDesignStates.some((state) => state === value);
}

/** Opens the dialog in `?connect=<state>` (mounted in the design shell's hosts). */
export function DesignMailConnectState() {
  const search = readDesignParams(useSearch({ strict: false }));
  const state = search.rest["connect"];
  useEffect(() => {
    if (!isState(state)) return;
    const { initial, accountId } = INITIAL[state];
    // After the host subscribed (same commit): next frame.
    const frame = requestAnimationFrame(() =>
      openMailConnectAt({ initial, ...(accountId !== undefined && { accountId }) }),
    );
    return () => cancelAnimationFrame(frame);
  }, [state]);
  return null;
}
