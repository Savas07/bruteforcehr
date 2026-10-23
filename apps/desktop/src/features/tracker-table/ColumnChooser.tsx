/**
 * `ColumnChooserSheet` (components.md; Deel "Customize columns"): a side sheet listing every
 * column with a checkbox, in display order, each movable up or down, plus Reset. Company stays
 * first and visible (it is the sticky column that opens the row).
 */
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button, IconButton } from "../../shared/ui/Button";
import { COLUMN_MESSAGES, FIXED_COLUMN, TABLE_COLUMNS, type TableColumnId } from "./model";
import { DEFAULT_COLUMNS } from "./prefs";

const messages = defineMessages({
  title: { id: "tracker-table.columns.title", defaultMessage: "Columns" },
  body: {
    id: "tracker-table.columns.body",
    defaultMessage: "Choose what the table shows. Export uses the same columns.",
  },
  count: {
    id: "tracker-table.columns.count",
    defaultMessage: "{shown} of {total} shown",
  },
  fixed: {
    id: "tracker-table.columns.fixed",
    defaultMessage: "Always shown",
    description: "Hint next to the Company column, which can't be hidden",
  },
  moveUp: { id: "tracker-table.columns.moveUp", defaultMessage: "Move {column} up" },
  moveDown: { id: "tracker-table.columns.moveDown", defaultMessage: "Move {column} down" },
  reset: { id: "tracker-table.columns.reset", defaultMessage: "Reset to default" },
  done: { id: "tracker-table.columns.done", defaultMessage: "Done" },
  close: { id: "tracker-table.columns.close", defaultMessage: "Close" },
});

export function ColumnChooser({
  open,
  onOpenChange,
  columns,
  onColumnsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visible columns in order. */
  columns: readonly TableColumnId[];
  onColumnsChange: (columns: readonly TableColumnId[]) => void;
}) {
  const intl = useIntl();
  const descriptionId = useId();
  // Visible columns in their order, then the hidden ones in default order.
  const ordered = [...columns, ...TABLE_COLUMNS.filter((column) => !columns.includes(column))];
  const toggle = (column: TableColumnId) =>
    onColumnsChange(columns.includes(column) ? columns.filter((id) => id !== column) : [...columns, column]);
  const move = (column: TableColumnId, delta: -1 | 1) => {
    const index = columns.indexOf(column);
    const target = index + delta;
    if (index < 1 || target < 1 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target] as TableColumnId, column];
    onColumnsChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          aria-describedby={descriptionId}
          className="bg-surface-elevated border-line-subtle shadow-modal fixed inset-y-0 right-0 z-(--bfhr-layer-modal) flex w-96 max-w-full flex-col border-s"
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-title3 font-semibold">
                {intl.formatMessage(messages.title)}
              </Dialog.Title>
              <Dialog.Description id={descriptionId} className="text-fg-secondary mt-1 text-callout">
                {intl.formatMessage(messages.body)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton icon={X} label={intl.formatMessage(messages.close)} />
            </Dialog.Close>
          </div>
          <p className="text-fg-secondary px-5 pb-2 text-footnote tabular-nums" aria-live="polite">
            {intl.formatMessage(messages.count, { shown: columns.length, total: TABLE_COLUMNS.length })}
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {ordered.map((column) => {
              const label = intl.formatMessage(COLUMN_MESSAGES[column]);
              const shown = columns.includes(column);
              const fixed = column === FIXED_COLUMN;
              const index = columns.indexOf(column);
              return (
                <li
                  key={column}
                  className="hover:bg-surface-hover flex min-h-10 items-center gap-2 rounded-md px-2"
                >
                  <label className="flex min-w-0 flex-1 cursor-default items-center gap-3 py-2 text-callout">
                    <input
                      type="checkbox"
                      checked={shown}
                      disabled={fixed}
                      onChange={() => toggle(column)}
                      className="accent-accent-solid size-4"
                    />
                    <span className="min-w-0 truncate">{label}</span>
                    {fixed && (
                      <span className="text-fg-secondary text-footnote">
                        {intl.formatMessage(messages.fixed)}
                      </span>
                    )}
                  </label>
                  {shown && !fixed && (
                    <span className="flex shrink-0 gap-0.5">
                      <IconButton
                        size="sm"
                        icon={ArrowUp}
                        label={intl.formatMessage(messages.moveUp, { column: label })}
                        disabledReason={
                          index <= 1 ? intl.formatMessage(messages.moveUp, { column: label }) : null
                        }
                        onClick={() => move(column, -1)}
                      />
                      <IconButton
                        size="sm"
                        icon={ArrowDown}
                        label={intl.formatMessage(messages.moveDown, { column: label })}
                        disabledReason={
                          index >= columns.length - 1
                            ? intl.formatMessage(messages.moveDown, { column: label })
                            : null
                        }
                        onClick={() => move(column, 1)}
                      />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-line-subtle flex items-center justify-between gap-2 border-t px-5 py-3">
            <Button variant="plain" onClick={() => onColumnsChange(DEFAULT_COLUMNS)}>
              {intl.formatMessage(messages.reset)}
            </Button>
            <Dialog.Close asChild>
              <Button variant="primary">{intl.formatMessage(messages.done)}</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
