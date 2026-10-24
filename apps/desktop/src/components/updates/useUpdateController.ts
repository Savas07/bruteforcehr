/**
 * The update UI's own state, shared by the sidebar card, the dialogs and the "Update required"
 * screen: which dialog is open, whether "Later" collapsed the card, and the restart flow that
 * saves unsaved edits first.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { saveUnsavedChanges, unsavedChanges, useUnsavedChangesList } from "../../shared/unsavedChanges";
import { useUpdates, type UpdatesValue } from "./context";

export type UpdateDialog = "check" | "notes" | "save-first";

export interface UpdateController {
  readonly updates: UpdatesValue;
  readonly dialog: UpdateDialog | null;
  readonly openDialog: (dialog: UpdateDialog) => void;
  readonly closeDialog: () => void;
  /**
   * For the dialogs' `onCloseAutoFocus`: they have no Radix trigger (they open from the menu, the
   * palette, the card), so focus goes back to whatever had it when the first one opened.
   */
  readonly restoreFocus: (event: Event) => void;
  readonly cardCollapsed: boolean;
  readonly setCardCollapsed: (collapsed: boolean) => void;
  /** "Check for Updates…": opens the dialog and starts a check. */
  readonly checkNow: () => void;
  /** "Restart to update": asks to save unsaved edits first, otherwise restarts. */
  readonly requestRestart: () => void;
  /** From the "Save your changes first?" prompt. */
  readonly saveAndRestart: () => void;
  readonly restarting: boolean;
  /** Saving before the restart failed; the prompt says so and stays open. */
  readonly saveFailed: boolean;
  /**
   * The "Update required" screen covers the app. A recheck that raises the minimum mid-session
   * waits until open edits are saved; the shell ignores its shortcuts while it blocks.
   */
  readonly blocking: boolean;
}

export function useUpdateController(): UpdateController {
  const updates = useUpdates();
  const { preset, check, restart } = updates;
  const [dialog, setDialog] = useState<UpdateDialog | null>(preset.dialog ?? null);
  const [cardCollapsed, setCardCollapsed] = useState(preset.cardCollapsed ?? false);
  const [restarting, setRestarting] = useState(preset.restarting ?? false);
  const [saveFailed, setSaveFailed] = useState(false);
  const unsaved = useUnsavedChangesList();

  // Design routes switch presets without remounting the shell: reset during render
  // (react.dev "Adjusting some state when a prop changes").
  const [appliedPreset, setAppliedPreset] = useState(preset);
  if (appliedPreset !== preset) {
    setAppliedPreset(preset);
    setDialog(preset.dialog ?? null);
    setCardCollapsed(preset.cardCollapsed ?? false);
    setRestarting(preset.restarting ?? false);
    setSaveFailed(false);
  }

  const opener = useRef<HTMLElement | null>(null);
  const openDialog = useCallback(
    (next: UpdateDialog) => {
      if (dialog === null && document.activeElement instanceof HTMLElement)
        opener.current = document.activeElement;
      setDialog(next);
    },
    [dialog],
  );
  const restoreFocus = useCallback((event: Event) => {
    event.preventDefault();
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
  }, []);

  const restartNow = useCallback(() => {
    setRestarting(true);
    // Success never returns (the app relaunches); a failure shows as `failed: install`.
    restart().catch((error: unknown) => {
      console.error("Restart to update failed", error);
      setRestarting(false);
    });
  }, [restart]);

  const requestRestart = useCallback(() => {
    if (unsavedChanges().length > 0) {
      setSaveFailed(false);
      openDialog("save-first");
    } else restartNow();
  }, [restartNow, openDialog]);

  const saveAndRestart = useCallback(() => {
    setRestarting(true);
    setSaveFailed(false);
    saveUnsavedChanges().then(restartNow, (error: unknown) => {
      console.error("Couldn't save before restarting", error);
      setRestarting(false);
      setSaveFailed(true);
    });
  }, [restartNow]);

  const checkNow = useCallback(() => {
    openDialog("check");
    check();
  }, [check, openDialog]);

  return {
    updates,
    dialog,
    openDialog,
    restoreFocus,
    closeDialog: useCallback(() => setDialog(null), []),
    cardCollapsed,
    setCardCollapsed,
    checkNow,
    requestRestart,
    saveAndRestart,
    restarting,
    saveFailed,
    blocking: updates.requirement !== null && (unsaved.length === 0 || dialog === "save-first"),
  };
}

/** The shell's controller (AppShell), for screens that show update state (Settings › General). */
export const UpdateControllerContext = createContext<UpdateController | null>(null);

export function useShellUpdateController(): UpdateController | null {
  return useContext(UpdateControllerContext);
}
