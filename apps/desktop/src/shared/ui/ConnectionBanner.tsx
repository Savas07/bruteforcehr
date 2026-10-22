import { Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { useConnectivity } from "../connectivity";

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
                <span className="text-fg-primary font-semibold">You're offline.</span> Your changes are saved
                on this device and will sync when you're back online.
              </p>
            </>
          ) : (
            <>
              <Wifi aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
              <p>
                <span className="text-fg-primary font-semibold">Back online.</span>
                {synced && " All changes synced."}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
