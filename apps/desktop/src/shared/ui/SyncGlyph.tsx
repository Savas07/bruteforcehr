import { History } from "lucide-react";
import { defineMessages, useIntl } from "react-intl";
import { Hint } from "./Hint";

const messages = defineMessages({
  waiting: {
    id: "shared.ui.syncGlyph.waiting",
    defaultMessage: "Waiting to sync",
    description: "Tooltip and accessible name of the glyph on a row changed offline",
  },
});

/**
 * Clock-with-arrow glyph on a row or card changed offline whose write hasn't reached the server
 * (`pendingSync` on the view-model, Firestore `hasPendingWrites`). Accessible name and tooltip
 * "Waiting to sync"; `fg-tertiary`, 14 px, placed next to the row's meta line.
 */
export function SyncGlyph() {
  const label = useIntl().formatMessage(messages.waiting);
  return (
    <Hint label={label}>
      <span role="img" aria-label={label} className="text-fg-tertiary inline-flex shrink-0">
        <History aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </span>
    </Hint>
  );
}
