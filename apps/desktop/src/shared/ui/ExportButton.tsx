import { Download } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../keyboard/useKeyBindings";
import { Button } from "./Button";
import { MenuContent, MenuItem } from "./Menu";

const messages = defineMessages({
  export: {
    id: "shared.ui.exportButton.export",
    defaultMessage: "Export…",
    description: "Button and shortcut that open the export format menu",
  },
  exporting: {
    id: "shared.ui.exportButton.exporting",
    defaultMessage: "Exporting…",
    description: "Button label while an export runs",
  },
  formatMenu: {
    id: "shared.ui.exportButton.formatMenu",
    defaultMessage: "Export format",
    description: "Accessible name of the export format menu",
  },
});

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
  const intl = useIntl();
  const exportLabel = intl.formatMessage(messages.export);
  const [open, setOpen] = useState(false);
  const inert = exporting || Boolean(disabledReason);

  useKeyBindings([
    {
      id: "view.export",
      keys: "Mod+E",
      label: exportLabel,
      group: "General",
      enabled: !inert,
      run: () => setOpen(true),
    },
  ]);

  if (inert)
    return (
      <Button
        icon={Download}
        loading={exporting}
        loadingLabel={intl.formatMessage(messages.exporting)}
        disabledReason={disabledReason}
      >
        {exportLabel}
      </Button>
    );

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button icon={Download} shortcut="Mod+E">
          {exportLabel}
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end" aria-label={intl.formatMessage(messages.formatMenu)}>
        {formats.map((format) => (
          <MenuItem key={format.id} onSelect={() => onExport(format.id)}>
            {format.label}
          </MenuItem>
        ))}
      </MenuContent>
    </DropdownMenu.Root>
  );
}
