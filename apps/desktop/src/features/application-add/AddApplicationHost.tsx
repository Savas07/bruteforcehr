/**
 * Mounted once in the signed-in shell (inside the tracker providers and `ToastProvider`): opens
 * "Log an application" on Mod+N (IA.md global keys; Jobs and CVs may claim it while mounted), on
 * `openAddApplication()` and when the route's search has `add=1` (removed again on close).
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { AddApplicationDialog } from "./AddApplicationDialog";
import { type AddApplicationOptions, onAddApplicationRequest } from "./request";

const messages = defineMessages({
  newApplication: {
    id: "application-add.host.newApplication",
    defaultMessage: "New application",
    description: "Shortcuts-sheet label of Mod+N",
  },
});

export function AddApplicationHost() {
  const intl = useIntl();
  const navigate = useNavigate();
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const fromRoute = search["add"] === 1 || search["add"] === "1";
  // The options of the open dialog, null while closed. Closing unmounts the dialog, so every
  // add starts from a blank form.
  const [open, setOpen] = useState<AddApplicationOptions | null>(null);

  useEffect(() => onAddApplicationRequest((options) => setOpen((current) => current ?? options)), []);
  // `add=1` arriving on the route opens it (adjusting state while rendering, not in an effect).
  const [routeSeen, setRouteSeen] = useState(false);
  if (fromRoute !== routeSeen) {
    setRouteSeen(fromRoute);
    if (fromRoute) setOpen((current) => current ?? {});
  }

  useKeyBindings([
    {
      id: "application-add.open",
      keys: "Mod+N",
      label: intl.formatMessage(messages.newApplication),
      group: "General",
      enabled: open === null,
      run: () => setOpen({}),
    },
  ]);

  if (open === null) return null;
  return (
    <AddApplicationDialog
      initial={open}
      onClose={(applicationId) => {
        setOpen(null);
        const cleared = fromRoute
          ? navigate({
              to: ".",
              search: (previous: Readonly<Record<string, unknown>>) => {
                const { add: _add, ...rest } = previous;
                return rest;
              },
              replace: true,
            })
          : Promise.resolve();
        if (applicationId !== null)
          void cleared.then(() =>
            navigate({ to: "/tracker/applications/$applicationId", params: { applicationId } }),
          );
      }}
    />
  );
}
