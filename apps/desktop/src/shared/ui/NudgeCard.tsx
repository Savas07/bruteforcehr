/**
 * `NudgeCard` (components.md "Today", decisions.md D15 + D19): a follow-up or no-response
 * suggestion. It never applies itself; the user picks the action, "Not needed" / "Keep waiting",
 * or snoozes it. Shared by Today (Follow-ups) and Tracker detail.
 */
import { AlarmClock } from "lucide-react";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { NudgeVM } from "../model/blocks";
import { cx } from "../cx";
import { Button, IconButton } from "./Button";
import { Monogram } from "./Company";
import { SnoozeMenu, type SnoozePreset } from "./SnoozeMenu";
import { SyncGlyph } from "./SyncGlyph";

const messages = defineMessages({
  snooze: { id: "shared.ui.nudgeCard.snooze", defaultMessage: "Snooze" },
});

export interface NudgeCardProps {
  /** The suggestion (`nudgeVMs`): labels and message are display-ready. */
  nudge: NudgeVM;
  /** Runs `nudge.primaryLabel` ("Draft follow-up" / "Mark as no response"). */
  onPrimary: () => void;
  /** Runs `nudge.secondaryLabel` ("Not needed" / "Keep waiting"). */
  onSecondary: () => void;
  /** Shows the Snooze menu (Later today · Tomorrow · Next week · Pick a date…) when given. */
  onSnooze?: (preset: SnoozePreset) => void;
  className?: string;
}

/**
 * Monogram, "Acme · Frontend Engineer", the message ("Applied 8 days ago · no reply yet"), then
 * the suggested action, the decline verb and Snooze. The suggested action is a secondary button:
 * Today and Tracker keep their single primary action elsewhere (system.md).
 */
export function NudgeCard({ nudge, onPrimary, onSecondary, onSnooze, className }: NudgeCardProps) {
  const titleId = useId();
  const messageId = useId();
  const intl = useIntl();
  return (
    <article
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className={cx("bg-surface-base border-line-subtle flex gap-3 rounded-lg border p-3", className)}
    >
      <Monogram company={nudge.company} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 id={titleId} className="text-callout text-fg-primary font-medium">
            {nudge.company.name} · {nudge.role}
          </h3>
          {nudge.pendingSync && <SyncGlyph />}
        </div>
        <p id={messageId} className="text-callout text-fg-secondary text-pretty">
          {nudge.message}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onPrimary}>
            {nudge.primaryLabel}
          </Button>
          <Button size="sm" variant="plain" shortcut="D" onClick={onSecondary}>
            {nudge.secondaryLabel}
          </Button>
          {onSnooze && (
            <SnoozeMenu
              align="end"
              onSnooze={onSnooze}
              trigger={
                <IconButton
                  icon={AlarmClock}
                  label={intl.formatMessage(messages.snooze)}
                  size="sm"
                  shortcut="H"
                  className="ms-auto"
                />
              }
            />
          )}
        </div>
      </div>
    </article>
  );
}
