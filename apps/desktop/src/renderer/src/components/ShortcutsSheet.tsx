import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { shortcutGroups, shortcuts } from "../../../shared/shortcuts";
import { Keycaps } from "./Keycaps";

export function ShortcutsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMac = window.bfhr.platform === "darwin";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-scrim fixed inset-0 z-40" />
        <Dialog.Content className="bg-elevated shadow-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl">
          <div className="flex items-start gap-4 px-6 pt-5 pb-3">
            <div className="flex-1">
              <Dialog.Title className="font-display text-[17px] font-semibold">
                Keyboard shortcuts
              </Dialog.Title>
              <Dialog.Description className="text-muted mt-1 text-[13px]">
                {isMac
                  ? "Move around without the mouse. You'll also find these in the menu bar."
                  : "Move around without the mouse."}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="text-muted hover:bg-fill-hover -mt-1 -mr-2 flex size-8 items-center justify-center rounded-md"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-6 pb-6">
            {shortcutGroups.map((group) => (
              <section key={group} aria-labelledby={`shortcuts-${group}`} className="mt-3 first:mt-0">
                <h3
                  id={`shortcuts-${group}`}
                  className="text-muted mb-1 text-[11px] font-medium tracking-wide uppercase"
                >
                  {group}
                </h3>
                <dl className="divide-border divide-y">
                  {shortcuts
                    .filter((shortcut) => shortcut.group === group)
                    .map((shortcut) => (
                      <div key={shortcut.id} className="flex h-9 items-center justify-between gap-4">
                        <dt className="text-[13px]">{shortcut.label}</dt>
                        <dd>
                          <Keycaps shortcut={shortcut} />
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
