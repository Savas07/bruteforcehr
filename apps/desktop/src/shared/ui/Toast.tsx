/**
 * The app's one toast (system.md "Toast", states.md rule 7, decisions.md D11/D12), built on Radix
 * Toast. One toast at a time: a newer one replaces the older, whose Undo stays on an undo history
 * that `Mod+Z` / `Ctrl+Z` walks back even after the toast has gone. After an Undo the follow-up
 * reads "Restored" (+ "Open" when the caller offers it) and never offers another Undo.
 *
 * `ToastProvider` wraps the app; `ToastViewport` sits inside the content area (AppShell) and is
 * positioned bottom-left, 16 px in, of its nearest positioned ancestor. F6 moves focus to the
 * toast; hover or focus pauses its timer. Announcements are polite (Radix announces background
 * toasts through a `role="status"` / `aria-live="polite"` region).
 */
import { timing } from "@bfhr/ui-tokens";
import { Send, X, type LucideIcon } from "lucide-react";
import { Toast } from "radix-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { chrome } from "../../lib/desktop";
import { parseKeys, spokenKeys } from "../keyboard/keymap";
import { useKeyBindings } from "../keyboard/useKeyBindings";
import { cx } from "../cx";
import { Hint } from "./Hint";
import { Keycaps } from "./Keycaps";

/**
 * - `undo`: an action the user just took or an automatic change; the action is its Undo.
 * - `info`: a result with at most one non-undo action (View, Edit, Why?).
 * - `undoSend`: an email about to go out; counts down to the server's `sendAt`, ✕ means "Send now".
 */
export type ToastVariant = "undo" | "info" | "undoSend";

/** The toast's single action. */
export interface ToastAction {
  /** Short verb, sentence case: "Undo", "View", "Why?". */
  readonly label: string;
  /** Runs on click or, for undo variants, on `Mod+Z`. */
  readonly run: () => void;
  /** Keymap syntax shown as a keycap after the label. Undo variants default to `Mod+Z`. */
  readonly keys?: string;
}

/** What `useToast().show` takes. */
export interface ToastOptions {
  /** Default `undo`. */
  readonly variant?: ToastVariant;
  /** Object + past-tense result: "Acme · moved to Screening", "Removed "Python"". */
  readonly message: string;
  /** Undo for `undo` / `undoSend` (also pushed on the undo history), any single action for `info`. */
  readonly action?: ToastAction;
  /** Leading glyph by action type: clock = snoozed, arrow = moved. `undoSend` defaults to a paper plane. */
  readonly glyph?: LucideIcon;
  /** `undoSend` only: the server's dispatch time; the toast counts down to it and then closes. */
  readonly sendAt?: Date;
  /** `undoSend` only: ✕ ("Send now") dispatches immediately. */
  readonly sendNow?: () => void;
  /** After Undo, the "Restored" toast offers "Open" running this (jump to the restored item). */
  readonly openAfterUndo?: () => void;
  /** 10 s instead of 6 s: bulk actions (more than one item). Text over 60 characters is extended automatically. */
  readonly extended?: boolean;
}

/** Shows toasts; from `useToast()`. */
export interface ToastApi {
  /** Shows `options`, replacing the visible toast (its Undo stays reachable with Mod+Z). */
  readonly show: (options: ToastOptions) => void;
}

interface UndoEntry {
  readonly id: number;
  readonly run: () => void;
  readonly openAfterUndo: (() => void) | undefined;
}

interface ShownToast {
  readonly id: number;
  readonly options: ToastOptions;
  /** Set on undo variants with an action: the history entry its action undoes. */
  readonly undoId: number | null;
}

const RESTORED = "Restored";
const OPEN = "Open";
const UNDO_KEYS = "Mod+Z";
const LONG_MESSAGE = 60;

const ToastContext = createContext<ToastApi | null>(null);

/** The toast API. Must be called under `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast must be used inside ToastProvider");
  return api;
}

/**
 * Owns the single visible toast and the undo history, registers `Mod+Z` (never in text fields,
 * where the native text undo applies) and provides `useToast()`. Render `ToastViewport` once
 * inside it, in the content area.
 */
export function ToastProvider({
  children,
}: {
  /** The app; `ToastViewport` goes somewhere inside. */
  children: ReactNode;
}) {
  const [current, setCurrent] = useState<ShownToast | null>(null);
  const [historySize, setHistorySize] = useState(0);
  const history = useRef<UndoEntry[]>([]);
  const sendTimers = useRef(new Map<number, () => void>());
  const nextId = useRef(1);

  const removeEntry = useCallback((id: number) => {
    history.current = history.current.filter((entry) => entry.id !== id);
    sendTimers.current.get(id)?.();
    sendTimers.current.delete(id);
    setHistorySize(history.current.length);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      const variant = options.variant ?? "undo";
      let undoId: number | null = null;
      if (variant !== "info" && options.action) {
        undoId = id;
        history.current = [
          ...history.current,
          { id, run: options.action.run, openAfterUndo: options.openAfterUndo },
        ];
        setHistorySize(history.current.length);
        if (variant === "undoSend" && options.sendAt) {
          // After the server's send time the email can't be recalled: drop its Undo.
          const timer = setTimeout(() => removeEntry(id), Math.max(0, options.sendAt.getTime() - Date.now()));
          sendTimers.current.set(id, () => clearTimeout(timer));
        }
      }
      setCurrent({ id, options, undoId });
    },
    [removeEntry],
  );

  const undo = useCallback(
    (entryId: number) => {
      const entry = history.current.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      removeEntry(entryId);
      entry.run();
      const open = entry.openAfterUndo;
      show({ variant: "info", message: RESTORED, ...(open ? { action: { label: OPEN, run: open } } : {}) });
    },
    [removeEntry, show],
  );

  const close = useCallback((id: number) => {
    setCurrent((shown) => (shown?.id === id ? null : shown));
  }, []);

  const sendNow = useCallback(
    (shown: ShownToast) => {
      if (shown.undoId !== null) removeEntry(shown.undoId);
      shown.options.sendNow?.();
      close(shown.id);
    },
    [close, removeEntry],
  );

  useEffect(() => {
    const timers = sendTimers.current;
    return () => {
      for (const stop of timers.values()) stop();
    };
  }, []);

  useKeyBindings([
    {
      id: "toast.undo",
      keys: UNDO_KEYS,
      label: "Undo the last change",
      group: "General",
      enabled: historySize > 0,
      inTextFields: false,
      run: (event) => {
        const latest = history.current.at(-1);
        if (!latest) return;
        event.preventDefault();
        undo(latest.id);
      },
    },
  ]);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      <Toast.Provider swipeDirection="left">
        {children}
        {current && (
          <ToastItem
            key={current.id}
            shown={current}
            onClose={() => close(current.id)}
            onUndo={undo}
            onSendNow={() => sendNow(current)}
          />
        )}
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

/**
 * Where the toast appears: bottom-left of the nearest positioned ancestor (the content area), 16 px
 * from its edges, at most 480 px wide, above content (`--bfhr-layer-toast`). F6 focuses it.
 */
export function ToastViewport() {
  return (
    <Toast.Viewport
      hotkey={["F6"]}
      label="Notifications ({hotkey})"
      className="absolute bottom-4 left-4 z-(--bfhr-layer-toast) m-0 flex max-w-[min(30rem,calc(100%-2rem))] list-none flex-col gap-2 p-0 outline-none"
    />
  );
}

function secondsUntil(sendAt: Date | undefined): number {
  return sendAt ? Math.max(0, Math.ceil((sendAt.getTime() - Date.now()) / 1000)) : 0;
}

/** `undoSend` countdown: whole seconds left until `sendAt`; calls `onDone` at zero. */
function useCountdown(sendAt: Date | undefined, onDone: () => void): number {
  const [seconds, setSeconds] = useState(() => secondsUntil(sendAt));
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!sendAt) return;
    const tick = () => {
      const left = secondsUntil(sendAt);
      setSeconds(left);
      if (left === 0) done.current();
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [sendAt]);
  return seconds;
}

const toastButton =
  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md font-medium transition-colors duration-(--bfhr-duration-fast) ease-standard hover:bg-toast-text/10 active:bg-toast-text/15";

function ToastItem({
  shown,
  onClose,
  onUndo,
  onSendNow,
}: {
  shown: ShownToast;
  onClose: () => void;
  /** Runs the history entry `shown.undoId` and shows "Restored". */
  onUndo: (entryId: number) => void;
  onSendNow: () => void;
}) {
  const { options, undoId } = shown;
  const variant = options.variant ?? "undo";
  const sending = variant === "undoSend";
  const Glyph = options.glyph ?? (sending ? Send : undefined);
  const action = options.action;
  const keys = action?.keys ?? (undoId !== null ? UNDO_KEYS : undefined);
  const seconds = useCountdown(sending ? options.sendAt : undefined, onClose);
  const spoken =
    keys === undefined
      ? null
      : parseKeys(keys)
          .map((steps) => spokenKeys(steps, chrome.platform))
          .join(" or ");

  return (
    <Toast.Root
      type="background"
      // The send countdown follows the server's clock, so it never pauses; it closes itself at zero.
      duration={
        sending
          ? Infinity
          : options.extended === true || options.message.length > LONG_MESSAGE
            ? timing.toastExtended
            : timing.toast
      }
      defaultOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className={cx(
        "bg-toast-bg text-toast-text border-toast-border shadow-overlay flex items-start gap-3 rounded-lg border py-2 pr-2 pl-4 text-callout",
        "transition-[opacity,translate] duration-(--bfhr-duration-base) ease-enter starting:opacity-0 motion-safe:starting:translate-y-2",
        "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x)",
      )}
    >
      {Glyph && <Glyph aria-hidden="true" className="mt-2 size-4 shrink-0" strokeWidth={1.75} />}
      <Toast.Description className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-x-2">
        <span>{options.message}</span>
        {sending && (
          <span role="timer" className="tabular-nums" data-radix-toast-announce-exclude="">
            Sends in {seconds} s
          </span>
        )}
      </Toast.Description>
      {action && (
        <Toast.Action altText={spoken ? `${action.label}, ${spoken}` : action.label} asChild>
          <button
            type="button"
            className={cx(toastButton, "text-toast-action px-2")}
            onClick={() => (undoId !== null ? onUndo(undoId) : action.run())}
          >
            {action.label}
            {keys !== undefined && <Keycaps keys={keys} tone="onDark" />}
          </button>
        </Toast.Action>
      )}
      <Hint label={sending ? "Send now" : "Close"}>
        {sending ? (
          <button
            type="button"
            aria-label="Send now"
            className={cx(toastButton, "justify-center px-0 size-8")}
            onClick={onSendNow}
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </button>
        ) : (
          <Toast.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className={cx(toastButton, "justify-center px-0 size-8")}
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </button>
          </Toast.Close>
        )}
      </Hint>
    </Toast.Root>
  );
}
