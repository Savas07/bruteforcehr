/**
 * `#/design/data-privacy?privacy=<state>`: Settings › Data & privacy on a scripted backend, in a
 * stand-in settings column with the page heading the Settings shell will render. Each state of
 * `privacyDesignStates` (matrix.ts) forces the export view, the delete dialog and the
 * re-authentication (`privacyDesignReauth`, applied by DesignRoot). The scripted backend answers
 * like the real one after a moment, so the harness can click through: Create export → ready,
 * Save… → saved, Delete everything → signed out with the notice.
 */
import { FIXTURE_NOW } from "@bfhr/fixtures";
import type { AccountExportResponse } from "@bfhr/core";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIntl } from "react-intl";
import { REAUTH_IDLE, type ReauthView } from "../features/auth/session";
import { DataPrivacyPane, dataPrivacyPaneLabel } from "../features/settings/data-privacy";
import type { AccountDataBackend } from "../features/settings/data-privacy/backend";
import { AccountDataContext, type AccountDataEnvironment } from "../features/settings/data-privacy/context";
import { DELETE_START, type DeleteView } from "../features/settings/data-privacy/deleteFlow";
import { deleteMessages } from "../features/settings/data-privacy/messages";
import { EXPORT_IDLE, ExportFlow, type ExportView } from "../features/settings/data-privacy/exportFlow";
import { ScreenTitle } from "../shared/ui/ScreenTitle";
import { useDesignReady } from "./DesignScreen";
import { type PrivacyDesignState, privacyDesignStates } from "./matrix";
import { readDesignParams } from "./search";

const DAY_MS = 86_400_000;
const NOW = FIXTURE_NOW.getTime();

const fixtureExport: AccountExportResponse = {
  exportId: "20261024T081500-5f2a9c1e",
  storagePath: "users/design/exports/20261024T081500-5f2a9c1e.bfhr-export.zip",
  fileName: "BruteForceHR-export-2026-10-24.zip",
  sizeBytes: 14_236_118,
  documentCount: 412,
  fileCount: 9,
  createdAt: new Date(NOW).toISOString(),
  expiresAt: new Date(NOW + 7 * DAY_MS).toISOString(),
};

// The app's lib target (ES2023) has no Promise.withResolvers.
const delay = <T,>(value: T, ms = 900): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));
/** A request that never answers (forced "working" states). */
const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

/** Fails like the callable does (`details.reason`). */
const refused = (reason: string) =>
  Object.assign(new Error(reason), { code: "functions/resource-exhausted", details: { reason } });

function isPrivacyState(value: string | undefined): value is PrivacyDesignState {
  return (privacyDesignStates as readonly string[]).includes(value ?? "");
}

const exportViews: Partial<Record<PrivacyDesignState, ExportView>> = {
  preparing: { status: "preparing", startedAt: NOW },
  ready: { status: "ready", export: fixtureExport, save: { status: "idle" } },
  saving: { status: "ready", export: fixtureExport, save: { status: "saving" } },
  saved: {
    status: "ready",
    export: fixtureExport,
    save: { status: "saved", fileName: fixtureExport.fileName },
  },
  "download-failed": { status: "ready", export: fixtureExport, save: { status: "failed" } },
  "too-soon": { status: "idle", failure: "too-soon" },
  "daily-limit": { status: "idle", failure: "daily-limit" },
  "too-large": { status: "idle", failure: "too-large" },
  "export-failed": { status: "idle", failure: "generic" },
};

const typed = (
  word: string,
  recentSignIn: boolean | null,
  phase: DeleteView["phase"] = "confirm",
): DeleteView => ({
  typed: word,
  recentSignIn,
  phase,
});

function deleteViewOf(state: PrivacyDesignState, word: string): DeleteView | undefined {
  switch (state) {
    case "delete-empty":
      return { ...DELETE_START, recentSignIn: true };
    case "delete-typed":
    case "delete-offline":
      return typed(word, true);
    case "delete-reauth":
    case "delete-reauth-sent":
    case "delete-reauth-failed":
    case "delete-reauth-done":
      return typed(word, false);
    case "delete-deleting":
      return typed(word, true, "deleting");
    case "delete-failed":
      return typed(word, true, "failed");
    default:
      return undefined;
  }
}

/** The re-authentication a state starts in (DesignRoot passes it to DesignAuth). */
export function privacyDesignReauth(state: string | undefined, email: string): ReauthView {
  switch (state) {
    case "delete-reauth-sent":
      return { step: "sent", email, sentAt: NOW };
    case "delete-reauth-failed":
      return { step: "link-error", email, error: "expired" };
    case "delete-reauth-done":
      return { step: "done", email };
    default:
      return REAUTH_IDLE;
  }
}

function scriptedBackend(state: PrivacyDesignState): AccountDataBackend {
  return {
    createExport: () =>
      state === "too-soon"
        ? Promise.reject(refused("export_too_soon"))
        : state === "export-failed"
          ? Promise.reject(new Error("unavailable"))
          : delay(fixtureExport, 1500),
    downloadExport: () => (state === "saving" ? never() : delay(new Uint8Array(8))),
    saveExport: (_bytes, fileName) => delay(`/Users/deniz/Downloads/${fileName}`, 200),
    authTimeSeconds: () =>
      Promise.resolve(state.startsWith("delete-reauth") ? NOW / 1000 - 3600 : NOW / 1000 - 60),
    deleteAccount: () =>
      state === "delete-failed" ? Promise.reject(new Error("unavailable")) : delay(undefined, 1500),
    now: () => NOW,
  };
}

export function DesignDataPrivacy() {
  const intl = useIntl();
  const search = readDesignParams(useSearch({ strict: false }));
  const requested = search.rest["privacy"];
  const state: PrivacyDesignState = isPrivacyState(requested) ? requested : "idle";
  const word = intl.formatMessage(deleteMessages.confirmWord);

  const environment = useMemo((): AccountDataEnvironment => {
    const backend = scriptedBackend(state);
    const flow = new ExportFlow(backend, exportViews[state] ?? EXPORT_IDLE);
    const initialDelete = deleteViewOf(state, word);
    return {
      backend,
      exportFlow: () => flow,
      ...(initialDelete === undefined ? {} : { initialDelete }),
    };
  }, [state, word]);

  useDesignReady(`data-privacy:${state}:${search.state}`, false);

  return (
    <AccountDataContext.Provider value={environment}>
      <section className="min-h-0 flex-1 overflow-y-auto px-8 pt-5 pb-8">
        <div className="max-w-160">
          <ScreenTitle title={intl.formatMessage(dataPrivacyPaneLabel)} />
          {/* A new state starts a fresh pane (export flow, dialog). */}
          <DataPrivacyPane key={state} />
        </div>
      </section>
    </AccountDataContext.Provider>
  );
}
