import { History } from "lucide-react";
import { Hint } from "./Hint";

const WAITING_TO_SYNC = "Waiting to sync";

/**
 * Clock-with-arrow glyph on a row or card changed offline whose write hasn't reached the server
 * (`pendingSync` on the view-model, Firestore `hasPendingWrites`). Accessible name and tooltip
 * "Waiting to sync"; `fg-tertiary`, 14 px, placed next to the row's meta line.
 */
export function SyncGlyph() {
  return (
    <Hint label={WAITING_TO_SYNC}>
      <span role="img" aria-label={WAITING_TO_SYNC} className="text-fg-tertiary inline-flex shrink-0">
        <History aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </span>
    </Hint>
  );
}
