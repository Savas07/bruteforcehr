/**
 * "Save search" in the Jobs filter bar (job-feed-search.md "Decision — Desktop" 3, Mod+S while
 * mounted): saves the current query + filters at once with the default alert (daily digest, Good
 * and above), offers Undo, and becomes "Saved · Edit alert" with a popover for Name, Alert
 * cadence and Notify threshold. A search already saved with the same query and filters shows as
 * saved instead of creating a duplicate. Writes work offline (they queue locally).
 */
import type { SavedSearch, SavedSearchFilters } from "@bfhr/core";
import { BellRing, Bookmark } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { useJobsRepository } from "../../data/jobs/repository";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button } from "../../shared/ui/Button";
import { useToast } from "../../shared/ui/Toast";
import { AlertFields } from "./AlertFields";
import { findSavedSearch, newSavedSearchInput } from "./model";

const messages = defineMessages({
  save: { id: "saved-searches.button.save", defaultMessage: "Save search", description: "Filter bar primary: save the current search" },
  saved: { id: "saved-searches.button.saved", defaultMessage: "Saved · Edit alert", description: "The Save search button once this search is saved" },
  hint: { id: "saved-searches.button.hint", defaultMessage: "Get alerts for this search", description: "Tooltip of Save search" },
  disabled: {
    id: "saved-searches.button.disabled",
    defaultMessage: "Type a search or pick a filter first",
    description: "Why Save search is unavailable",
  },
  loading: {
    id: "saved-searches.button.loading",
    defaultMessage: "Your saved searches are still loading",
    description: "Why Save search is unavailable while the saved searches load",
  },
  keysLabel: { id: "saved-searches.button.keysLabel", defaultMessage: "Save search", description: "Shortcuts-sheet entry for Mod+S" },
  keysGroup: { id: "saved-searches.button.keysGroup", defaultMessage: "Jobs", description: "Shortcuts-sheet group" },
  toast: { id: "saved-searches.toast.saved", defaultMessage: "Search saved", description: "Toast after Save search; followed by Undo · Edit" },
  undo: { id: "saved-searches.toast.undo", defaultMessage: "Undo" },
  edit: { id: "saved-searches.toast.edit", defaultMessage: "Edit", description: "Toast action: open the alert settings of the search just saved" },
  failed: {
    id: "saved-searches.toast.failed",
    defaultMessage: "We couldn't save this search. Try again in a moment.",
  },
  deleted: { id: "saved-searches.toast.deleted", defaultMessage: "Deleted “{name}”", description: "Toast after deleting a saved search" },
  title: { id: "saved-searches.popover.title", defaultMessage: "Alert settings", description: "Title of the Save search popover" },
  subtitle: {
    id: "saved-searches.popover.subtitle",
    defaultMessage: "New matches for this search appear under Jobs in the sidebar.",
  },
  name: { id: "saved-searches.popover.name", defaultMessage: "Name", description: "Field label" },
  nameMissing: { id: "saved-searches.popover.nameMissing", defaultMessage: "Give this search a name." },
  delete: { id: "saved-searches.popover.delete", defaultMessage: "Delete search" },
  done: { id: "saved-searches.popover.done", defaultMessage: "Done" },
});

export function SaveSearchButton({
  query,
  filters,
  disabled = false,
}: {
  readonly query: string;
  readonly filters: SavedSearchFilters;
  readonly disabled?: boolean;
}) {
  const intl = useIntl();
  const state = useJobsData();
  const repository = useJobsRepository();
  const toast = useToast();
  const [requestedOpen, setOpen] = useState(false);
  const saved = state.status === "ready" ? findSavedSearch(state.data.savedSearches, query, filters) : null;
  // Undo (or a delete elsewhere) takes the search away: nothing left to edit.
  const open = requestedOpen && saved !== null;

  const disabledReason = disabled
    ? intl.formatMessage(messages.disabled)
    : state.status !== "ready"
      ? intl.formatMessage(messages.loading)
      : null;

  const save = () => {
    if (disabledReason) return;
    if (saved) {
      setOpen(true);
      return;
    }
    const { ids, done } = repository.createSavedSearch(newSavedSearchInput(query, filters, intl));
    void done.catch(() => toast.show({ variant: "info", message: intl.formatMessage(messages.failed) }));
    setOpen(true);
    toast.show({
      message: intl.formatMessage(messages.toast),
      action: {
        label: intl.formatMessage(messages.undo),
        run: () => void repository.deleteSavedSearch(ids.savedSearchId).done,
      },
      secondaryAction: { label: intl.formatMessage(messages.edit), run: () => setOpen(true) },
    });
  };

  useKeyBindings([
    {
      id: "saved-searches.save",
      keys: "Mod+S",
      label: intl.formatMessage(messages.keysLabel),
      group: intl.formatMessage(messages.keysGroup),
      enabled: !disabledReason,
      run: save,
    },
  ]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        {saved ? (
          <Button
            variant="secondary"
            icon={BellRing}
            aria-expanded={open}
            aria-haspopup="dialog"
            shortcut="Mod+S"
            hint={intl.formatMessage(messages.saved)}
            onClick={() => setOpen(!open)}
          >
            {intl.formatMessage(messages.saved)}
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={Bookmark}
            shortcut="Mod+S"
            hint={intl.formatMessage(messages.hint)}
            disabledReason={disabledReason}
            onClick={save}
          >
            {intl.formatMessage(messages.save)}
          </Button>
        )}
      </Popover.Anchor>
      <Popover.Portal>
        {saved && (
          <SavedSearchPopover
            search={saved}
            onClose={() => setOpen(false)}
            onDelete={() => {
              setOpen(false);
              void repository.deleteSavedSearch(saved.id).done;
              toast.show({
                message: intl.formatMessage(messages.deleted, { name: saved.name }),
                action: {
                  label: intl.formatMessage(messages.undo),
                  run: () => void repository.restoreSavedSearch(saved).done,
                },
              });
            }}
          />
        )}
      </Popover.Portal>
    </Popover.Root>
  );
}

function SavedSearchPopover({
  search,
  onClose,
  onDelete,
}: {
  readonly search: SavedSearch;
  readonly onClose: () => void;
  readonly onDelete: () => void;
}) {
  const intl = useIntl();
  const repository = useJobsRepository();
  const id = useId();
  const [name, setName] = useState(search.name);
  const [nameError, setNameError] = useState(false);
  const commitName = (): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return false;
    }
    setNameError(false);
    if (trimmed !== search.name) void repository.updateSavedSearch(search, { name: trimmed }).done;
    return true;
  };

  return (
    <Popover.Content
      side="bottom"
      align="end"
      sideOffset={8}
      collisionPadding={16}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-subtitle`}
      onInteractOutside={() => commitName()}
      onEscapeKeyDown={() => commitName()}
      className="bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) flex max-h-[calc(100vh-96px)] w-96 max-w-[calc(100vw-32px)] flex-col gap-4 overflow-y-auto rounded-lg border p-4"
    >
      <div>
        <h2 id={`${id}-title`} className="text-title3">
          {intl.formatMessage(messages.title)}
        </h2>
        <p id={`${id}-subtitle`} className="text-fg-secondary text-footnote mt-0.5">
          {intl.formatMessage(messages.subtitle)}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.name)}
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={120}
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => commitName()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
            }
          }}
          className="bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary aria-invalid:border-danger-solid h-8 w-full min-w-0 rounded-md border px-2"
        />
        {nameError && (
          <p id={`${id}-name-error`} className="text-danger-text text-footnote">
            {intl.formatMessage(messages.nameMissing)}
          </p>
        )}
      </div>
      <AlertFields search={search} onChange={(patch) => void repository.updateSavedSearch(search, patch).done} />
      <div className="border-line-subtle -mx-4 -mb-4 flex items-center justify-between gap-2 border-t px-4 py-3">
        <Button size="sm" variant="plain" className="text-danger-text" onClick={onDelete}>
          {intl.formatMessage(messages.delete)}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            if (commitName()) onClose();
          }}
        >
          {intl.formatMessage(messages.done)}
        </Button>
      </div>
    </Popover.Content>
  );
}
