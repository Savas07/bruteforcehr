import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useId, useRef, useState } from "react";
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
  "CV editor": { id: "shell.shortcutGroup.cvEditor", defaultMessage: "CV editor" },
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
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close: the sheet has no Radix trigger to return to. */
  onCloseAutoFocus: (event: Event) => void;
}) {
  const intl = useIntl();
  const groups = useRowGroups();
  const idPrefix = useId();
  const titleId = `${idPrefix}title`;
  const contentRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // The list is a tab stop only while it scrolls (a short window, a long list of view keys), so
  // the keyboard can scroll it (WCAG 2.1.1) without an idle stop when everything fits. Measured
  // from a callback ref: the portal mounts the content a render after `open` turns true.
  const [overflowing, setOverflowing] = useState(false);
  const observeList = useCallback((list: HTMLDivElement | null) => {
    listRef.current = list;
    if (!list) return;
    const observer = new ResizeObserver(() => setOverflowing(list.scrollHeight > list.clientHeight));
    observer.observe(list);
    return () => {
      observer.disconnect();
      listRef.current = null;
    };
  }, []);
  const groupHeading = (group: string): string => {
    const message = groupMessages[group];
    return message ? intl.formatMessage(message) : group;
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        {/* One column up to 800 px wide, then two, so a laptop window shows every group without
            scrolling (Obvious, Relume). */}
        <Dialog.Content
          ref={contentRef}
          aria-labelledby={titleId}
          // Focus starts on the list when it scrolls (arrow keys and Page Down work at once), else
          // on the dialog itself, which reads its title and description; not on Close.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const list = listRef.current;
            if (list && list.scrollHeight > list.clientHeight) list.focus();
            else contentRef.current?.focus();
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg focus:outline-none min-[800px]:w-[min(760px,calc(100vw-48px))]"
        >
          <div className="flex items-start gap-4 px-6 pt-5 pb-3">
            <div className="flex-1">
              <Dialog.Title id={titleId} className="font-display text-title2">
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
          <div
            ref={observeList}
            // -1 until measured: the open handler may focus it before `overflowing` is set.
            tabIndex={overflowing ? 0 : -1}
            {...(overflowing && { role: "region", "aria-labelledby": titleId })}
            className="overflow-y-auto rounded-md px-6 pt-1 pb-6 -outline-offset-2 min-[800px]:columns-2 min-[800px]:gap-8"
          >
            {groups.map(([group, rows], index) => (
              <section
                key={group}
                aria-labelledby={`${idPrefix}group-${index}`}
                className="mb-3 break-inside-avoid last:mb-0"
              >
                <h3
                  id={`${idPrefix}group-${index}`}
                  className="text-fg-secondary mb-1 text-footnote font-semibold"
                >
                  {groupHeading(group)}
                </h3>
                <dl className="divide-line-subtle divide-y">
                  {rows.map((row) => (
                    <div key={row.id} className="flex min-h-9 items-center justify-between gap-4 py-1">
                      <dt className="text-callout">{row.label}</dt>
                      <dd className="shrink-0">
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
