import { Command } from "cmdk";
import { Keyboard, Search } from "lucide-react";
import { Dialog } from "radix-ui";
import { useRef, type ReactNode } from "react";
import { destinations, type DestinationId } from "../lib/destinations";
import { shortcutById } from "../lib/shortcuts";
import { destinationIcons } from "./icons";
import { Keycaps } from "./Keycaps";

const itemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-callout text-fg-primary data-[selected=true]:bg-surface-selected";
const groupClass =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-caption2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-secondary";

function FooterHint({ keys, children }: { keys: readonly string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {keys.map((key) => (
          <kbd
            key={key}
            className="bg-surface-sunken inline-flex h-5 min-w-5 items-center justify-center rounded-xs px-1 font-sans text-caption2 leading-none"
          >
            {key}
          </kbd>
        ))}
      </span>
      {children}
    </span>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onOpenShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (destination: DestinationId) => void;
  onOpenShortcuts: () => void;
}) {
  // After choosing a command, focus moves to its target instead of back to the opener.
  const handledCommand = useRef(false);
  const run = (command: () => void): void => {
    handledCommand.current = true;
    onOpenChange(false);
    command();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-palette)" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            handledCommand.current = false;
          }}
          onCloseAutoFocus={(event) => {
            if (handledCommand.current) event.preventDefault();
          }}
          className="bg-surface-elevated shadow-modal fixed top-[14vh] left-1/2 z-(--bfhr-layer-palette) w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" loop>
            <div className="border-line-subtle flex items-center gap-2.5 border-b px-4">
              <Search aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
              <Command.Input
                placeholder="Jump to a section or command…"
                className="placeholder:text-fg-secondary h-12 flex-1 bg-transparent text-body outline-none"
              />
            </div>
            <Command.List className="max-h-[min(360px,50vh)] overflow-y-auto p-2">
              <Command.Empty className="text-fg-secondary px-2.5 py-6 text-center text-callout">
                Nothing matches that yet. Try a section name, like “Jobs”.
              </Command.Empty>
              <Command.Group heading="Go to" className={groupClass}>
                {destinations.map((destination) => {
                  const Icon = destinationIcons[destination.id];
                  return (
                    <Command.Item
                      key={destination.id}
                      value={destination.label}
                      onSelect={() => run(() => onNavigate(destination.id))}
                      className={itemClass}
                    >
                      <Icon
                        aria-hidden="true"
                        className="text-fg-secondary size-4 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="flex-1 truncate">{destination.label}</span>
                      <Keycaps shortcut={shortcutById(`go-${destination.id}`)} />
                    </Command.Item>
                  );
                })}
              </Command.Group>
              <Command.Group heading="Help" className={groupClass}>
                <Command.Item
                  value="Keyboard shortcuts"
                  onSelect={() => run(onOpenShortcuts)}
                  className={itemClass}
                >
                  <Keyboard
                    aria-hidden="true"
                    className="text-fg-secondary size-4 shrink-0"
                    strokeWidth={1.75}
                  />
                  <span className="flex-1 truncate">Keyboard shortcuts</span>
                  <Keycaps shortcut={shortcutById("keyboard-shortcuts")} />
                </Command.Item>
              </Command.Group>
            </Command.List>
            {/* Visual hint only: the combobox keys are announced by the listbox semantics. */}
            <div
              aria-hidden="true"
              className="border-line-subtle text-fg-secondary flex gap-4 border-t px-4 py-2 text-caption2"
            >
              <FooterHint keys={["↑", "↓"]}>to move</FooterHint>
              <FooterHint keys={["↵"]}>to open</FooterHint>
              <FooterHint keys={["esc"]}>to close</FooterHint>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
