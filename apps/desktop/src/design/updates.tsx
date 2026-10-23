/**
 * Design build: forces the update UI into one state (`?update=<state>`, `updateDesignStates` in
 * matrix.ts) instead of asking the Rust updater and Firestore. The persona runs 0.1.0 and is
 * offered 0.1.1; the gate requires 0.2.0. Without `?update=` the UI shows nothing, as in a
 * session with no update.
 */
import { FIXTURE_NOW, populatedDataset } from "@bfhr/fixtures";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { UpdatesContext, type UpdatesUiPreset, type UpdatesValue } from "../components/updates/context";
import type { UpdateSnapshot, UpdateStatus } from "../lib/desktop";
import { unsavedLabelMessage } from "../features/cv-editor/Screen";
import { registerUnsavedChanges } from "../shared/unsavedChanges";
import { type UpdateDesignState, updateDesignStates } from "./matrix";

/** The persona's installed version, also inside the real app (whose own build says 0.0.0). */
const CURRENT = "0.1.0";
const OFFERED = "0.1.1";
const REQUIRED = "0.2.0";
const DAY_MS = 86_400_000;

/** Changesets notes as the release pipeline publishes them (English, like every release). */
const NOTES = `### Patch Changes

- 3f9c2ab: The app checks for updates at launch and every six hours, and installs them when you restart or quit.
- 8d41e07: Tracker: a card dragged to another column on Windows now lands where you drop it.
- c02e5d9: The sidebar sync line shows the right time after your computer wakes from sleep.`;

const ready: UpdateStatus = {
  state: "ready",
  version: OFFERED,
  notes: NOTES,
  publishedAt: new Date(FIXTURE_NOW.getTime() - DAY_MS).toISOString(),
};
const downloading = (version: string): UpdateStatus => ({
  state: "downloading",
  version,
  downloaded: 26_843_545,
  total: 59_652_324,
});

interface Forced {
  readonly status: UpdateStatus;
  readonly preset?: UpdatesUiPreset;
  readonly required?: true;
  readonly unsaved?: true;
}

const forced: Readonly<Record<UpdateDesignState, Forced>> = {
  ready: { status: ready },
  "ready-later": { status: ready, preset: { cardCollapsed: true } },
  "ready-rail": { status: ready },
  notes: { status: ready, preset: { dialog: "notes" } },
  "save-first": { status: ready, preset: { dialog: "save-first" }, unsaved: true },
  restarting: { status: ready, preset: { restarting: true } },
  "install-failed": { status: { state: "failed", step: "install" } },
  checking: { status: { state: "checking" }, preset: { dialog: "check" } },
  "up-to-date": { status: { state: "up-to-date" }, preset: { dialog: "check" } },
  downloading: { status: downloading(OFFERED), preset: { dialog: "check" } },
  "check-ready": { status: ready, preset: { dialog: "check" } },
  "check-failed": { status: { state: "failed", step: "check" }, preset: { dialog: "check" } },
  "download-failed": { status: { state: "failed", step: "download" }, preset: { dialog: "check" } },
  "required-downloading": { status: downloading(REQUIRED), required: true },
  "required-ready": { status: { ...ready, version: REQUIRED }, required: true },
  "required-failed": { status: { state: "failed", step: "download" }, required: true },
  "required-unavailable": { status: { state: "up-to-date" }, required: true },
};

const none: Forced = { status: { state: "idle" } };

function isUpdateState(value: string | undefined): value is UpdateDesignState {
  return (updateDesignStates as readonly (string | undefined)[]).includes(value);
}

export function DesignUpdates({ state, children }: { state: string | undefined; children: ReactNode }) {
  const intl = useIntl();
  const scenario = isUpdateState(state) ? forced[state] : none;
  // The persona's base CV, open with an edit that is still saving.
  const cvLabel = intl.formatMessage(unsavedLabelMessage, { title: populatedDataset.cvs[0]?.title ?? "" });
  // "Try again" and "Check for updates" walk through checking → up to date, so the harness is clickable.
  const [status, setStatus] = useState(scenario.status);
  const [appliedScenario, setAppliedScenario] = useState(scenario);
  if (appliedScenario !== scenario) {
    setAppliedScenario(scenario);
    setStatus(scenario.status);
  }

  useEffect(
    () =>
      scenario.unsaved
        ? registerUnsavedChanges({
            label: cvLabel,
            // Executor form: the safari16 build target has no Promise.withResolvers.
            save: () => new Promise((resolve) => setTimeout(resolve, 600)),
          })
        : undefined,
    [scenario, cvLabel],
  );

  const value = useMemo((): UpdatesValue => {
    const snapshot: UpdateSnapshot = { status, channel: "stable" };
    return {
      snapshot,
      currentVersion: CURRENT,
      requirement: scenario.required
        ? { minSupportedVersion: REQUIRED, downloadUrl: "https://bruteforcehr.web.app/download" }
        : null,
      check: () => {
        setStatus({ state: "checking" });
        setTimeout(() => setStatus({ state: "up-to-date" }), 1200);
      },
      // The design build never relaunches: "Restarting…" stays.
      restart: () => new Promise<void>(() => undefined),
      preset: scenario.preset ?? {},
    };
  }, [status, scenario]);

  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}
