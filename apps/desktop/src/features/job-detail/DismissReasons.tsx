/**
 * The optional "What didn't fit?" popover after Not for me (job-feed-search.md "Row actions",
 * D19): opened by the toast's "Why?" or Shift+D, anchored where the hidden row was. Multi-select
 * reasons, number keys 1–9 toggle, Enter saves, Esc skips. Skip and Save reason carry equal
 * weight; the job is already hidden either way.
 */
import { Popover } from "radix-ui";
import { useState, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { Chip } from "../../shared/ui/Chip";
import { Keycaps } from "../../shared/ui/Keycaps";
import type { DismissReasonVM } from "./model";

const messages = defineMessages({
  title: { id: "job-detail.reasons.title", defaultMessage: "What didn't fit?" },
  subtitle: {
    id: "job-detail.reasons.subtitle",
    defaultMessage: "Optional. We'll use it to tune your matches.",
  },
  skip: { id: "job-detail.reasons.skip", defaultMessage: "Skip" },
  save: { id: "job-detail.reasons.save", defaultMessage: "Save reason" },
  keysHint: {
    id: "job-detail.reasons.keysHint",
    defaultMessage: "Number keys pick reasons · Enter saves · Esc skips",
  },
});

export function DismissReasonPopover({
  reasons,
  open,
  onOpenChange,
  onSave,
  children,
}: {
  reasons: readonly DismissReasonVM[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The picked reasons (at least one). */
  onSave: (keys: readonly DismissReasonVM["key"][]) => void;
  /** The anchor: where the hidden row was (the toast's "Why?" and Shift+D open it). */
  children: ReactNode;
}) {
  const intl = useIntl();
  const [picked, setPicked] = useState<readonly DismissReasonVM["key"][]>([]);
  const toggle = (key: DismissReasonVM["key"]) =>
    setPicked((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  const save = () => {
    if (picked.length > 0) onSave(picked);
    onOpenChange(false);
  };
  const titleId = "job-detail-reasons-title";
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked([]);
        onOpenChange(next);
      }}
    >
      <Popover.Anchor asChild>{children}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          // Back to the list (the row that took the hidden one's place), not the zero-height anchor.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLElement>('[data-nav-id][tabindex="0"]')?.focus();
          }}
          side="bottom"
          align="start"
          sideOffset={8}
          aria-labelledby={titleId}
          className="bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) flex w-88 max-w-[calc(100vw-32px)] flex-col gap-3 rounded-lg border p-4"
          onKeyDown={(event) => {
            const index = Number(event.key) - 1;
            const reason = Number.isInteger(index) ? reasons[index] : undefined;
            if (reason && !event.metaKey && !event.ctrlKey && !event.altKey) {
              event.preventDefault();
              toggle(reason.key);
            } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
              event.preventDefault();
              save();
            }
          }}
        >
          <div>
            <h2 id={titleId} className="text-title3">
              {intl.formatMessage(messages.title)}
            </h2>
            <p className="text-fg-secondary text-footnote mt-0.5">{intl.formatMessage(messages.subtitle)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {reasons.map((reason, index) => (
              <Chip
                key={reason.key}
                selected={picked.includes(reason.key)}
                onSelectedChange={() => toggle(reason.key)}
              >
                {reason.label}
                <span className="ml-1" aria-hidden="true">
                  <Keycaps keys={String(index + 1)} />
                </span>
              </Chip>
            ))}
          </div>
          <p className="text-fg-tertiary text-caption1">{intl.formatMessage(messages.keysHint)}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => onOpenChange(false)}>
              {intl.formatMessage(messages.skip)}
            </Button>
            <Button size="sm" onClick={save} disabledReason={null}>
              {intl.formatMessage(messages.save)}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
