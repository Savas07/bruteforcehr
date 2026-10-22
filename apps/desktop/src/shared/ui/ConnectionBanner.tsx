import { Wifi, WifiOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { defineMessages, FormattedMessage } from "react-intl";
import { useConnectivity } from "../connectivity";

const messages = defineMessages({
  offline: {
    id: "shared.ui.connectionBanner.offline",
    defaultMessage:
      "<b>You're offline.</b> Your changes are saved on this device and will sync when you're back online.",
    description: "Desktop connection strip while offline; <b> marks the bold status",
  },
  backOnline: {
    id: "shared.ui.connectionBanner.backOnline",
    defaultMessage: "<b>Back online.</b>{synced, select, yes { All changes synced.} other {}}",
    description: "Strip after reconnecting; the second sentence only when something was queued",
  },
});

const bold = (chunks: ReactNode[]) => <span className="text-fg-primary font-semibold">{chunks}</span>;

/**
 * The desktop connection strip (states.md "Decision — Desktop"): a 28 px neutral strip across the
 * top of the main content while offline, then "Back online" for `timing.backOnline` (the
 * connectivity provider owns both timings and the 2 s offline debounce). Not dismissible, not
 * red, announced politely. Online it renders only an empty live region, so nothing shows.
 */
export function ConnectionBanner() {
  const { status, pendingWrites } = useConnectivity();
  // Changes queued while offline; "All changes synced" is only true if there was something to sync.
  const [queuedOffline, setQueuedOffline] = useState(0);
  if (status === "offline" && pendingWrites !== queuedOffline) setQueuedOffline(pendingWrites);
  const synced = queuedOffline > 0 || pendingWrites > 0;

  return (
    <div role="status">
      {status !== "online" && (
        <div className="bg-surface-sunken border-line-subtle text-fg-secondary flex min-h-7 items-center gap-2 border-b px-4 py-1 text-footnote">
          {status === "offline" ? (
            <>
              <WifiOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
              <p>
                <FormattedMessage {...messages.offline} values={{ b: bold }} />
              </p>
            </>
          ) : (
            <>
              <Wifi aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
              <p>
                <FormattedMessage
                  {...messages.backOnline}
                  values={{ b: bold, synced: synced ? "yes" : "no" }}
                />
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
