import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { shortcutGroups, shortcutKeys, shortcutMessage, shortcuts } from "../lib/shortcuts";
import type { KeyBinding } from "../shared/keyboard/keymap";
import { useRegisteredBindings } from "../shared/keyboard/useKeyBindings";
import { Keycaps } from "../shared/ui/Keycaps";

const messages = defineMessages({
  title: { id: "shell.shortcutsSheet.title", defaultMessage: "Keyboard shortcuts" },
  description: {
    id: "shell.shortcutsSheet.description",
    defaultMessage: "Move around without the mouse. You’ll also find these in the menu bar.",
  },
  close: { id: "shell.shortcutsSheet.close", defaultMessage: "Close" },
});

/**
 * Headings for the group keys (`KeyBinding.group` stays a stable English key); unknown groups
 * show their key.
 */
const groupMessages: Readonly<Record<string, MessageDescriptor>> = defineMessages({
  Navigation: { id: "shell.shortcutGroup.navigation", defaultMessage: "Navigation" },
  General: { id: "shell.shortcutGroup.general", defaultMessage: "General" },
  Lists: { id: "shell.shortcutGroup.lists", defaultMessage: "Lists" },
  Today: { id: "shell.shortcutGroup.today", defaultMessage: "Today" },
  Jobs: { id: "shell.shortcutGroup.jobs", defaultMessage: "Jobs" },
  Tracker: { id: "shell.shortcutGroup.tracker", defaultMessage: "Tracker" },
  CVs: { id: "shell.shortcutGroup.cvs", defaultMessage: "CVs" },
  Mail: { id: "shell.shortcutGroup.mail", defaultMessage: "Mail" },
});

interface Row {
  readonly id: string;
  readonly label: string;
  readonly keys: KeyBinding["keys"];
}

/** The static shortcuts first, then each group of keys the mounted views registered. */
function useRowGroups(): readonly (readonly [string, readonly Row[]])[] {
  const intl = useIntl();
  const registered = useRegisteredBindings();
  const groups = new Map<string, Row[]>(
    shortcutGroups.map((group) => [
      group,
      shortcuts
        .filter((shortcut) => shortcut.group === group)
        .map((shortcut) => ({
          id: shortcut.id,
          label: intl.formatMessage(shortcutMessage(shortcut)),
          keys: shortcutKeys(shortcut),
        })),
    ]),
  );
  for (const binding of registered) {
    if (binding.hidden) continue;
    const rows = groups.get(binding.group) ?? [];
    rows.push({ id: binding.id, label: binding.label, keys: binding.keys });
    groups.set(binding.group, rows);
  }
  return [...groups];
}

export function ShortcutsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();
  const groups = useRowGroups();
  const groupHeading = (group: string): string => {
    const message = groupMessages[group];
    return message ? intl.formatMessage(message) : group;
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg">
          <div className="flex items-start gap-4 px-6 pt-5 pb-3">
            <div className="flex-1">
              <Dialog.Title className="font-display text-title2">
                {intl.formatMessage(messages.title)}
              </Dialog.Title>
              <Dialog.Description className="text-fg-secondary mt-1 text-callout">
                {intl.formatMessage(messages.description)}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={intl.formatMessage(messages.close)}
              className="text-fg-secondary hover:bg-surface-hover -mt-1 -mr-2 flex size-8 items-center justify-center rounded-md"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 pb-6">
            {groups.map(([group, rows]) => (
              <section key={group} aria-labelledby={`shortcuts-${group}`} className="mt-3 first:mt-0">
                <h3
                  id={`shortcuts-${group}`}
                  className="text-fg-secondary mb-1 text-footnote font-semibold"
                >
                  {groupHeading(group)}
                </h3>
                <dl className="divide-line-subtle divide-y">
                  {rows.map((row) => (
                    <div key={row.id} className="flex min-h-9 items-center justify-between gap-4 py-1">
                      <dt className="text-callout">{row.label}</dt>
                      <dd>
                        <Keycaps keys={row.keys} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
