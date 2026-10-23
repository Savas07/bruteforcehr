/**
 * "Pick a date…" from the snooze menu (D19): a small modal with the platform date field. The
 * webview's native `<input type="date">` gives the locale's date order and a calendar popup. The
 * picked day comes back as 09:00 that day in the user's zone (`snoozeDateInstant`).
 */
import { Dialog } from "radix-ui";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { snoozeDateInstant } from "../../data/tracker/snooze";
import { Button } from "./Button";

const messages = defineMessages({
  title: {
    id: "shared.ui.snoozeDateDialog.title",
    defaultMessage: "Snooze until…",
    description: "Dialog title",
  },
  date: { id: "shared.ui.snoozeDateDialog.date", defaultMessage: "Date", description: "Field label" },
  snooze: { id: "shared.ui.snoozeDateDialog.snooze", defaultMessage: "Snooze", description: "Button" },
  cancel: { id: "shared.ui.snoozeDateDialog.cancel", defaultMessage: "Cancel", description: "Button" },
  pickFirst: {
    id: "shared.ui.snoozeDateDialog.pickFirst",
    defaultMessage: "Choose a date first.",
    description: "Why Snooze is disabled",
  },
  tooEarly: {
    id: "shared.ui.snoozeDateDialog.tooEarly",
    defaultMessage: "Pick tomorrow or a later day. For today, use Later today.",
    description: "Why Snooze is disabled when the chosen date is today or in the past",
  },
});

export function SnoozeDateDialog({
  description,
  min,
  timeZone,
  open,
  onOpenChange,
  onSnooze,
}: {
  /** What comes back, and where ("Acme comes back to Today on this date."). */
  description: string;
  /** Earliest day the field allows: tomorrow as `YYYY-MM-DD` in the user's zone (`zonedIsoDay`). */
  min: string;
  /** The user's zone, in which the picked day is read. */
  timeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 09:00 on the chosen day in `timeZone`. */
  onSnooze: (date: Date) => void;
}) {
  const intl = useIntl();
  const fieldId = useId();
  const [value, setValue] = useState("");
  const at = snoozeDateInstant(value, timeZone);
  // Typed dates can bypass `min` in some engines; ISO day strings compare in calendar order.
  const disabledReason =
    at === null
      ? intl.formatMessage(messages.pickFirst)
      : value < min
        ? intl.formatMessage(messages.tooEarly)
        : null;
  const submit = () => {
    if (at === null || disabledReason !== null) return;
    onSnooze(at);
    setValue("");
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg p-5">
          <div>
            <Dialog.Title className="font-display text-title3">
              {intl.formatMessage(messages.title)}
            </Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">{description}</Dialog.Description>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-col gap-1">
              <label htmlFor={fieldId} className="text-footnote text-fg-secondary">
                {intl.formatMessage(messages.date)}
              </label>
              <input
                id={fieldId}
                type="date"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                min={min}
                className="bg-surface-base border-line-control text-callout text-fg-primary h-8 rounded-md border px-2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button>{intl.formatMessage(messages.cancel)}</Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabledReason={disabledReason}>
                {intl.formatMessage(messages.snooze)}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
