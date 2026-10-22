import { defineMessages, useIntl } from "react-intl";
import type { TimeVM } from "../model/types";

export interface RelativeTimeChipProps {
  /** Formatted time from the view-model: `label` is shown, `absolute` is the tooltip. */
  time: TimeVM;
  /** Word before the label, in sentence case: "Applied" → "Applied 8 days ago", "Due" → "Due in 2 days". */
  prefix?: string | undefined;
}

const messages = defineMessages({
  prefixed: {
    id: "shared.ui.relativeTimeChip.prefixed",
    defaultMessage: "{prefix} {time}",
    description: "A caller-supplied word ('Applied', 'Due') followed by a relative time ('8 days ago')",
  },
});

/**
 * Relative time as caption text (components.md `RelativeTimeChip`): "In 2 days", "Tomorrow, 17:00",
 * "Applied 8 days ago". A `<time>` with the ISO `dateTime` and the absolute date as its tooltip.
 * Neutral color only: time never turns red or amber, urgency comes from the words.
 */
export function RelativeTimeChip({ time, prefix }: RelativeTimeChipProps) {
  const intl = useIntl();
  return (
    <time
      dateTime={time.iso}
      title={time.absolute}
      className="text-fg-secondary inline-flex shrink-0 text-caption1 whitespace-nowrap tabular-nums"
    >
      {prefix === undefined
        ? time.label
        : intl.formatMessage(messages.prefixed, { prefix, time: time.label })}
    </time>
  );
}
