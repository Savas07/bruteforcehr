import { Download } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { useKeyBindings } from "../keyboard/useKeyBindings";
import { Button } from "./Button";
import { MenuContent, MenuItem } from "./Menu";

export interface ExportFormat {
  /** Reported to `onExport` ("pdf", "csv"). */
  readonly id: string;
  /** Menu label naming the format and what it holds ("PDF", "CSV · current view", "Calendar (.ics)"). */
  readonly label: string;
}

export interface ExportButtonProps {
  /** Formats offered for the current view, in menu order. */
  formats: readonly ExportFormat[];
  /** Called with the chosen format's `id`; the screen runs the export. */
  onExport: (id: string) => void;
  /** An export is running: the button shows a spinner and "Exporting…" and ignores presses. */
  exporting?: boolean;
  /** Why exporting isn't possible right now ("Exporting a PDF needs a connection."). */
  disabledReason?: string | null | undefined;
}

/**
 * "Export…" for the current view (components.md `ExportButton`, IA.md File › Export… ⌘E): a
 * secondary button opening a format menu. Registers Mod+E to open the menu while mounted and
 * enabled; the tooltip shows the shortcut.
 */
export function ExportButton({ formats, onExport, exporting = false, disabledReason }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const inert = exporting || Boolean(disabledReason);

  useKeyBindings([
    {
      id: "view.export",
      keys: "Mod+E",
      label: "Export…",
      group: "General",
      enabled: !inert,
      run: () => setOpen(true),
    },
  ]);

  if (inert)
    return (
      <Button icon={Download} loading={exporting} loadingLabel="Exporting…" disabledReason={disabledReason}>
        Export…
      </Button>
    );

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button icon={Download} shortcut="Mod+E">
          Export…
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end" aria-label="Export format">
        {formats.map((format) => (
          <MenuItem key={format.id} onSelect={() => onExport(format.id)}>
            {format.label}
          </MenuItem>
        ))}
      </MenuContent>
    </DropdownMenu.Root>
  );
}
