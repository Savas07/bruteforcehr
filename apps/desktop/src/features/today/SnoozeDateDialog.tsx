/**
 * "Pick a date…" from the snooze menu (D19): a small modal with the platform date field. The
 * webview's native `<input type="date">` gives the locale's date order and a calendar popup.
 */
import { Dialog } from "radix-ui";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";

const messages = defineMessages({
  title: { id: "today.snoozeDate.title", defaultMessage: "Snooze until…", description: "Dialog title" },
  body: {
    id: "today.snoozeDate.body",
    defaultMessage: "{company} comes back to Today on this date.",
    description: "Dialog description",
  },
  date: { id: "today.snoozeDate.date", defaultMessage: "Date", description: "Field label" },
  snooze: { id: "today.snoozeDate.snooze", defaultMessage: "Snooze", description: "Button" },
  cancel: { id: "today.snoozeDate.cancel", defaultMessage: "Cancel", description: "Button" },
  pickFirst: {
    id: "today.snoozeDate.pickFirst",
    defaultMessage: "Choose a date first.",
    description: "Why Snooze is disabled",
  },
});

export function SnoozeDateDialog({
  company,
  open,
  onOpenChange,
  onSnooze,
}: {
  /** Company of the item being snoozed. */
  company: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chosen local date at 09:00. */
  onSnooze: (date: Date) => void;
}) {
  const intl = useIntl();
  const fieldId = useId();
  const [value, setValue] = useState("");
  // Tomorrow at the earliest ("Later today" covers today), as the field's local YYYY-MM-DD.
  const [min] = useState(() => new Date(Date.now() + 86_400_000).toLocaleDateString("sv"));
  const submit = () => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return;
    onSnooze(new Date(year, month - 1, day, 9));
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
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">
              {intl.formatMessage(messages.body, { company })}
            </Dialog.Description>
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
              <Button
                type="submit"
                variant="primary"
                disabledReason={value ? null : intl.formatMessage(messages.pickFirst)}
              >
                {intl.formatMessage(messages.snooze)}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
