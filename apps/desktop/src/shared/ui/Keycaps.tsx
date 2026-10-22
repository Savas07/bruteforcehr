import { Fragment } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome } from "../../lib/desktop";
import { chordKeycaps, parseKeys, spokenAlternatives } from "../keyboard/keymap";

const messages = defineMessages({
  or: {
    id: "shared.ui.keycaps.or",
    defaultMessage: "or",
    description: "Between alternative shortcuts: ⌘ / or ?",
  },
});

/**
 * Shortcut glyphs in platform convention (`⌘ ⇧ D` / `Ctrl Shift D`) with a spoken label for
 * screen readers (components.md `Keycaps`). `keys` uses the keymap syntax (`Mod+K`, `G T`, `?`);
 * alternatives render as "⌘ / or ?".
 */
export function Keycaps({
  keys,
  tone = "default",
}: {
  keys: string | readonly string[];
  tone?: "default" | "onDark";
}) {
  const { platform } = chrome;
  const intl = useIntl();
  const alternatives = parseKeys(keys);
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span className="sr-only">{spokenAlternatives(keys, platform, intl)}</span>
      {alternatives.map((steps, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span aria-hidden="true" className="text-fg-tertiary text-caption1">
              {intl.formatMessage(messages.or)}
            </span>
          )}
          <span aria-hidden="true" className="inline-flex items-center gap-0.5">
            {steps.flatMap((chord, step) =>
              chordKeycaps(chord, platform).map((cap, capIndex) => (
                <kbd
                  key={`${step}-${capIndex}`}
                  className={
                    tone === "onDark"
                      ? "text-toast-text inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-current/40 px-1 font-sans text-caption2 leading-none font-medium"
                      : "bg-surface-sunken text-fg-secondary inline-flex h-5 min-w-5 items-center justify-center rounded-xs px-1 font-sans text-caption2 leading-none font-medium"
                  }
                >
                  {cap}
                </kbd>
              )),
            )}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
