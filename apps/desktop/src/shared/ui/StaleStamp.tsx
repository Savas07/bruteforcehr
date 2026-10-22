import { defineMessages, FormattedMessage } from "react-intl";
import type { TimeVM } from "../model/types";

/** Which stamp: `updated` for cached data, `lastChecked` for mail polling. */
export type StaleStampKind = "updated" | "lastChecked";

const messages = defineMessages({
  updated: {
    id: "shared.ui.staleStamp.updated",
    defaultMessage: "Updated {time}",
    description: "When cached data was last fresh; {time} is a clock time like 09:12",
  },
  lastChecked: {
    id: "shared.ui.staleStamp.lastChecked",
    defaultMessage: "Last checked {time}",
    description: "Mail review header: last mail poll; {time} is a clock time like 09:40",
  },
});

/**
 * When cached content was last fresh (states.md rule 6): "Updated 09:12" on cached panes, "Last
 * checked 09:40" in the Mail review header. Locale clock time visible, the full date and time in
 * the tooltip; neutral and muted.
 */
export function StaleStamp({
  prefix,
  time,
  clock,
}: {
  /** Which sentence: `updated` ("Updated 09:12") for cached data, `lastChecked` ("Last checked 09:40") for mail polling. */
  prefix: StaleStampKind;
  /** The moment; `iso` feeds `dateTime`, `absolute` the tooltip. */
  time: TimeVM;
  /** Locale clock time from `clockTime` ("09:12", 24 h in en-GB / tr / de). */
  clock: string;
}) {
  return (
    <span className="text-footnote text-fg-tertiary tabular-nums">
      <FormattedMessage
        {...messages[prefix]}
        values={{
          time: (
            <time dateTime={time.iso} title={time.absolute}>
              {clock}
            </time>
          ),
        }}
      />
    </span>
  );
}
