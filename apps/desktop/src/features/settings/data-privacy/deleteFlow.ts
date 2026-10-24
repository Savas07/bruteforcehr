/**
 * The delete dialog's state machine. "Delete everything" needs the typed word, a connection and a
 * sign-in less than `ACCOUNT_RECENT_SIGN_IN_SECONDS` old: the session's `auth_time` is read when
 * the dialog opens and again right before calling `accountDelete`; a stale one (or the server's
 * `recent_sign_in_required`) shows the re-authentication step, which the auth machine runs
 * (session.ts `reauth`). Success hands over to `onDeleted` (sign out with the one-time notice).
 */
import { isRecentSignIn } from "@bfhr/core";
import type { ReauthView } from "../../auth/session";
import type { AccountDataBackend } from "./backend";
import { deleteFailureOf } from "./errors";
import { ViewStore } from "./exportFlow";

export interface DeleteView {
  readonly typed: string;
  /** The sign-in is recent enough; null while it's being read or when it couldn't be read. */
  readonly recentSignIn: boolean | null;
  readonly phase: "confirm" | "deleting" | "failed";
}

export const DELETE_START: DeleteView = { typed: "", recentSignIn: null, phase: "confirm" };

export interface DeleteFlowHooks {
  /** `accountDelete` succeeded: the account no longer exists. */
  readonly onDeleted: () => void;
  /** The sign-in (or a finished re-authentication) is too old now: start the step again. */
  readonly onSignInTooOld: () => void;
}

export class DeleteFlow extends ViewStore<DeleteView> {
  constructor(
    private readonly backend: Pick<AccountDataBackend, "authTimeSeconds" | "deleteAccount" | "now">,
    private readonly hooks: DeleteFlowHooks,
    initial: DeleteView = DELETE_START,
  ) {
    super(initial);
  }

  type(typed: string): void {
    this.set({ ...this.getSnapshot(), typed });
  }

  /** Reads the session's `auth_time` (on open, and after a re-authentication finished). */
  async checkSignIn(): Promise<boolean | null> {
    let recentSignIn: boolean | null;
    try {
      recentSignIn = isRecentSignIn(await this.backend.authTimeSeconds(), this.backend.now());
    } catch (error) {
      // Let the server decide (it checks `auth_time` itself).
      console.error("Couldn't read the sign-in time", error);
      recentSignIn = null;
    }
    this.set({ ...this.getSnapshot(), recentSignIn });
    return recentSignIn;
  }

  /** "Delete everything" (and its retry); the dialog only calls it once `deleteBlocker` is null. */
  async submit(): Promise<void> {
    if (this.getSnapshot().phase === "deleting") return;
    this.set({ ...this.getSnapshot(), phase: "deleting" });
    if ((await this.checkSignIn()) === false) {
      this.set({ ...this.getSnapshot(), phase: "confirm" });
      this.hooks.onSignInTooOld();
      return;
    }
    try {
      await this.backend.deleteAccount();
    } catch (error) {
      console.error("Couldn't delete the account", error);
      if (deleteFailureOf(error) === "reauth") {
        this.set({ ...this.getSnapshot(), recentSignIn: false, phase: "confirm" });
        this.hooks.onSignInTooOld();
      } else this.set({ ...this.getSnapshot(), phase: "failed" });
      return;
    }
    this.hooks.onDeleted();
  }
}

/** What the re-authentication area of the dialog shows: nothing, "Confirm it's you", or a step. */
export type ReauthPanel = { readonly step: "needed" } | Exclude<ReauthView, { readonly step: "idle" }>;

export function reauthPanelOf(view: DeleteView, reauth: ReauthView): ReauthPanel | null {
  if (reauth.step !== "idle") return reauth;
  return view.recentSignIn === false ? { step: "needed" } : null;
}

/** Why "Delete everything" is disabled (its tooltip), or null when it may run. */
export type DeleteBlocker = "offline" | "type-word" | "reauth";

export function deleteBlockerOf(
  view: DeleteView,
  reauth: ReauthView,
  { online, wordMatches }: { readonly online: boolean; readonly wordMatches: boolean },
): DeleteBlocker | null {
  if (!online) return "offline";
  if (!wordMatches) return "type-word";
  if (view.recentSignIn === false && reauth.step !== "done") return "reauth";
  return null;
}
