/**
 * "Review later" (`H`) for a review item: the shared `SnoozeMenu` presets (D19); "Pick a date…"
 * opens a small date popover on the same button.
 */
import { CalendarClock, ChevronDown } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useState, type FormEvent } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { SnoozeMenu, type SnoozePreset } from "../../shared/ui/SnoozeMenu";

const messages = defineMessages({
  reviewLater: { id: "mail-review.reviewLater.button", defaultMessage: "Review later" },
  dateLabel: { id: "mail-review.reviewLater.dateLabel", defaultMessage: "Bring it back on" },
  save: { id: "mail-review.reviewLater.save", defaultMessage: "Review then" },
  cancel: { id: "mail-review.reviewLater.cancel", defaultMessage: "Cancel" },
});

export type ReviewLaterChoice =
  { readonly preset: Exclude<SnoozePreset, "pickDate"> } | { readonly date: string };

export function ReviewLater({
  open,
  onOpenChange,
  minDate,
  onChoose,
}: {
  /** The preset menu, controlled so `H` opens it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Earliest date the picker allows (`yyyy-mm-dd`, tomorrow). */
  minDate: string;
  onChoose: (choice: ReviewLaterChoice) => void;
}) {
  const intl = useIntl();
  const inputId = useId();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(minDate);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPicking(false);
    onChoose({ date });
  };
  return (
    <Popover.Root open={picking} onOpenChange={setPicking}>
      <Popover.Anchor asChild>
        <span className="inline-flex">
          <SnoozeMenu
            align="end"
            open={open}
            onOpenChange={onOpenChange}
            onSnooze={(preset) => {
              if (preset === "pickDate") setPicking(true);
              else onChoose({ preset });
            }}
            trigger={
              <Button size="sm" variant="plain" icon={CalendarClock} shortcut="H">
                <span className="inline-flex items-center gap-1">
                  {intl.formatMessage(messages.reviewLater)}
                  <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                </span>
              </Button>
            }
          />
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="bg-surface-elevated border-line-subtle shadow-overlay z-(--bfhr-layer-popover) rounded-lg border p-3"
        >
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <label htmlFor={inputId} className="text-callout text-fg-secondary">
              {intl.formatMessage(messages.dateLabel)}
            </label>
            <input
              id={inputId}
              type="date"
              required
              min={minDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="border-line-control bg-surface-base text-callout h-8 rounded-md border px-2"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="plain" type="button" onClick={() => setPicking(false)}>
                {intl.formatMessage(messages.cancel)}
              </Button>
              <Button size="sm" variant="primary" type="submit">
                {intl.formatMessage(messages.save)}
              </Button>
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
