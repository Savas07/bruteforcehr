/**
 * `MatchBandPill` and `MatchBandBar` (components.md, research/job-detail.md "Our rules"): band
 * first, number second, never "%". Lists show the pill; the score ("72 of 100") is in the
 * accessible name and, in dense mode, visible. The bar is decorative to assistive tech: the band
 * label next to it carries the meaning.
 */
import { MATCH_BAND_THRESHOLDS, type MatchBand } from "@bfhr/core";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../cx";
import { MATCH_BAND_MESSAGES } from "../model/vocabulary";
import type { MatchVM } from "../model/types";

const messages = defineMessages({
  score: {
    id: "shared.ui.matchBand.score",
    defaultMessage: ", {score} of 100",
    description: "Screen-reader suffix after the match band pill label, e.g. 'Good match, 72 of 100'",
  },
});

/** Accent for the bands worth acting on, neutral below; the label always carries the meaning. */
const pillTone: Record<MatchBand, string> = {
  strong: "bg-accent-subtle text-accent-text",
  good: "bg-phase-in-progress-subtle text-phase-in-progress-text",
  partial: "bg-surface-sunken text-fg-secondary",
  stretch: "bg-surface-sunken text-fg-secondary",
};

export interface MatchBandPillProps {
  /** Score, band and band label from `matchVM`. */
  match: MatchVM;
  /** Dense desktop mode: show the score ("72") after the label. It's always in the accessible name. */
  showScore?: boolean;
}

/** Band pill for rows and headers ("Good match"); screen readers hear "Good match, 72 of 100". */
export function MatchBandPill({ match, showScore = false }: MatchBandPillProps) {
  const intl = useIntl();
  const scoreText = intl.formatMessage(messages.score, { score: match.score });
  return (
    <span
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption1 font-medium whitespace-nowrap",
        pillTone[match.band],
      )}
    >
      <span>{match.pillLabel}</span>
      {showScore ? (
        <span className="tabular-nums">
          <span aria-hidden="true">{match.score}</span>
          <span className="sr-only">{scoreText}</span>
        </span>
      ) : (
        <span className="sr-only">{scoreText}</span>
      )}
    </span>
  );
}

/** Segments left to right with their share of the 0–100 scale (core's provisional thresholds). */
const segments: readonly { band: MatchBand; from: number; to: number }[] = [
  { band: "stretch", from: 0, to: MATCH_BAND_THRESHOLDS.partial },
  { band: "partial", from: MATCH_BAND_THRESHOLDS.partial, to: MATCH_BAND_THRESHOLDS.good },
  { band: "good", from: MATCH_BAND_THRESHOLDS.good, to: MATCH_BAND_THRESHOLDS.strong },
  { band: "strong", from: MATCH_BAND_THRESHOLDS.strong, to: 100 },
];

/**
 * Current-segment fill: accent only for the bands worth acting on; Partial and Stretch use the
 * neutral chart tone so a weak fit never reads as "good" (checkpoint-m0 decision Q3).
 */
const barFill: Record<MatchBand, string> = {
  strong: "bg-accent-solid",
  good: "bg-accent-solid",
  partial: "bg-chart-neutral",
  stretch: "bg-chart-neutral",
};

export interface MatchBandBarProps {
  /** Score and band from `matchVM`; the marker sits at the score inside its band. */
  match: MatchVM;
}

/**
 * Segmented band bar (Chime pattern): four labelled segments Stretch · Partial · Good · Strong with
 * a marker at the score. The current band's segment and label are emphasised (weight, not only
 * color); Partial and Stretch fill with the neutral chart tone. The whole bar is `aria-hidden`; pair it with `MatchBandPill` or the "72 of 100" caption.
 */
export function MatchBandBar({ match }: MatchBandBarProps) {
  const intl = useIntl();
  const position = Math.min(100, Math.max(0, match.score));
  return (
    <div aria-hidden="true" className="flex w-full min-w-48 flex-col gap-1">
      <div className="relative flex h-2 gap-0.5">
        {segments.map(({ band, from, to }) => (
          <span
            key={band}
            style={{ flexGrow: to - from }}
            className={cx(
              "h-full basis-0 first:rounded-l-full last:rounded-r-full",
              band === match.band ? barFill[band] : "bg-surface-sunken",
            )}
          />
        ))}
        <span
          style={{ left: `${position}%` }}
          className="bg-surface-base border-fg-primary absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
        />
      </div>
      <div className="flex gap-0.5">
        {segments.map(({ band, from, to }) => (
          <span
            key={band}
            style={{ flexGrow: to - from }}
            className={cx(
              "basis-0 text-center text-caption1 whitespace-nowrap",
              band === match.band ? "text-fg-primary font-semibold" : "text-fg-tertiary",
            )}
          >
            {intl.formatMessage(MATCH_BAND_MESSAGES[band])}
          </span>
        ))}
      </div>
    </div>
  );
}
