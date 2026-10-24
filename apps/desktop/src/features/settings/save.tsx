/**
 * Autosave feedback for a Settings row or section: a quiet "Saved" for a few seconds after the
 * server accepted a change, "Saved on this computer · syncs when you're online" while offline
 * (Firestore queues the write), or "Couldn't save · Try again" when the server refused it.
 */
import { Check, CircleAlert, CloudOff } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useConnectivity } from "../../shared/connectivity";
import { Button } from "../../shared/ui/Button";

const messages = defineMessages({
  saved: { id: "settings.save.saved", defaultMessage: "Saved" },
  queued: { id: "settings.save.queued", defaultMessage: "Saved on this computer. It syncs when you're back online." },
  failed: { id: "settings.save.failed", defaultMessage: "Couldn't save." },
  retry: { id: "settings.save.retry", defaultMessage: "Try again" },
});

type State = "idle" | "saved" | "queued" | "failed";

const SAVED_VISIBLE_MS = 2_500;

export interface Saver {
  /** Runs a write and tracks its outcome. */
  readonly save: (write: () => Promise<void>) => void;
  readonly status: ReactNode;
}

export function useSaver(): Saver {
  const intl = useIntl();
  const { status: connection } = useConnectivity();
  const [state, setState] = useState<State>("idle");
  const last = useRef<(() => Promise<void>) | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const save = (write: () => Promise<void>) => {
    last.current = write;
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (connection === "offline") setState("queued");
    write().then(
      () => {
        if (last.current !== write) return;
        setState("saved");
        timer.current = window.setTimeout(() => setState("idle"), SAVED_VISIBLE_MS);
      },
      (error: unknown) => {
        console.error("Settings write failed", error);
        if (last.current === write) setState("failed");
      },
    );
  };

  const status = (
    <span aria-live="polite" className="text-footnote text-fg-secondary inline-flex min-h-6 items-center gap-1.5">
      {state === "saved" && (
        <>
          <Check aria-hidden="true" className="text-success-text size-3.5" strokeWidth={2} />
          {intl.formatMessage(messages.saved)}
        </>
      )}
      {state === "queued" && (
        <>
          <CloudOff aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          {intl.formatMessage(messages.queued)}
        </>
      )}
      {state === "failed" && (
        <>
          <CircleAlert aria-hidden="true" className="text-danger-text size-3.5" strokeWidth={1.75} />
          {intl.formatMessage(messages.failed)}
          <Button
            size="sm"
            variant="plain"
            onClick={() => {
              const write = last.current;
              if (write) save(write);
            }}
          >
            {intl.formatMessage(messages.retry)}
          </Button>
        </>
      )}
    </span>
  );

  return { save, status };
}
