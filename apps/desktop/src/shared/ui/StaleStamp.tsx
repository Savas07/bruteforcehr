import type { TimeVM } from "../model/types";

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
  /** "Updated" for cached data, "Last checked" for mail polling. */
  prefix: "Updated" | "Last checked";
  /** The moment; `iso` feeds `dateTime`, `absolute` the tooltip. */
  time: TimeVM;
  /** Locale clock time from `clockTime` ("09:12", 24 h in en-GB / tr / de). */
  clock: string;
}) {
  return (
    <span className="text-footnote text-fg-tertiary tabular-nums">
      {prefix}{" "}
      <time dateTime={time.iso} title={time.absolute}>
        {clock}
      </time>
    </span>
  );
}
