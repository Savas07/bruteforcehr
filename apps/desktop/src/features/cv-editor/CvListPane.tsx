/**
 * `CvList` (components.md): base CVs with their variants indented beneath, a language / role pill,
 * last edit and usage; filter All / Archived. Row menu (••• and right-click): Rename (F2),
 * Version history (Mod+Shift+H), Archive. Below 1280 px window width it collapses to icons with
 * tooltips. J / K / ↑ / ↓ move between CVs.
 */
import { Archive, ArchiveRestore, FileText, History, MoreHorizontal, PencilLine } from "lucide-react";
import { ContextMenu, DropdownMenu } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Hint } from "../../shared/ui/Hint";
import { IconButton } from "../../shared/ui/Button";
import { useListNavigation, type ListNavigation } from "../../shared/ui/focus";
import { ContextMenuContent, MenuContent, MenuItem } from "../../shared/ui/Menu";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import type { CvListRowVM, CvListVM } from "./model";

const messages = defineMessages({
  heading: { id: "cv-editor.list.heading", defaultMessage: "Your CVs" },
  filter: { id: "cv-editor.list.filterLabel", defaultMessage: "Show" },
  filterCount: {
    id: "cv-editor.list.filterCount",
    defaultMessage: "{label} {count, number}",
    description: "Filter segment: 'All 2', 'Archived 0'",
  },
  edited: {
    id: "cv-editor.list.edited",
    defaultMessage: "Edited {time}",
    description: "{time}: relative time, 'last week'",
  },
  actions: { id: "cv-editor.list.actions", defaultMessage: "Actions for {title}" },
  rename: { id: "cv-editor.list.rename", defaultMessage: "Rename" },
  renameField: { id: "cv-editor.list.renameField", defaultMessage: "CV name" },
  history: { id: "cv-editor.list.history", defaultMessage: "Version history" },
  archive: { id: "cv-editor.list.archive", defaultMessage: "Archive" },
  unarchive: { id: "cv-editor.list.unarchive", defaultMessage: "Move back to your CVs" },
  noArchived: {
    id: "cv-editor.list.noArchived",
    defaultMessage: "Nothing archived. Archived CVs stay here, with their history.",
  },
  variantOf: {
    id: "cv-editor.list.iconLabel",
    defaultMessage: "{title} · {pill}",
    description: "Tooltip and name of a CV in the icon-only list",
  },
});

export interface CvListActions {
  readonly onSelect: (cvId: string) => void;
  readonly onRename: (cvId: string, title: string) => void;
  readonly onHistory: (cvId: string) => void;
  readonly onArchive: (cvId: string) => void;
  readonly onUnarchive: (cvId: string) => void;
}

function RowMenu({
  row,
  actions,
  startRename,
  kind,
}: {
  row: CvListRowVM;
  actions: CvListActions;
  startRename: () => void;
  kind: "dropdown" | "context";
}) {
  const intl = useIntl();
  const items = (
    <>
      <MenuItem icon={PencilLine} shortcut="F2" onSelect={startRename}>
        {intl.formatMessage(messages.rename)}
      </MenuItem>
      <MenuItem icon={History} shortcut="Mod+Shift+H" onSelect={() => actions.onHistory(row.cvId)}>
        {intl.formatMessage(messages.history)}
      </MenuItem>
      {row.archived ? (
        <MenuItem icon={ArchiveRestore} onSelect={() => actions.onUnarchive(row.cvId)}>
          {intl.formatMessage(messages.unarchive)}
        </MenuItem>
      ) : (
        <MenuItem icon={Archive} onSelect={() => actions.onArchive(row.cvId)}>
          {intl.formatMessage(messages.archive)}
        </MenuItem>
      )}
    </>
  );
  const label = intl.formatMessage(messages.actions, { title: row.title });
  return kind === "context" ? (
    <ContextMenuContent aria-label={label}>{items}</ContextMenuContent>
  ) : (
    <MenuContent aria-label={label} align="end">
      {items}
    </MenuContent>
  );
}

function Row({
  row,
  variant,
  iconsOnly,
  nav,
  actions,
  renaming,
  setRenaming,
}: {
  row: CvListRowVM;
  variant: boolean;
  iconsOnly: boolean;
  nav: ListNavigation;
  actions: CvListActions;
  renaming: boolean;
  setRenaming: (on: boolean) => void;
}) {
  const intl = useIntl();
  const [draftTitle, setDraftTitle] = useState(row.title);
  const commit = () => {
    const title = draftTitle.trim();
    if (title && title !== row.title) actions.onRename(row.cvId, title);
    setRenaming(false);
  };
  const name = intl.formatMessage(messages.variantOf, { title: row.title, pill: row.pill });

  let body: ReactNode;
  if (iconsOnly) {
    body = (
      <Hint label={name} side="right">
        <span
          aria-label={name}
          className={cx(
            "relative flex size-10 flex-col items-center justify-center rounded-md",
            variant && "ml-2 size-9",
          )}
        >
          <FileText aria-hidden className="size-4" />
          <span aria-hidden className="text-fg-secondary text-caption2 font-semibold">
            {row.languageCode}
          </span>
          {row.pendingSync && (
            <span className="absolute -top-1 -right-1">
              <SyncGlyph />
            </span>
          )}
        </span>
      </Hint>
    );
  } else {
    body = (
      <span className="flex min-w-0 flex-1 flex-col">
        {renaming ? (
          <input
            autoFocus
            value={draftTitle}
            aria-label={intl.formatMessage(messages.renameField)}
            onChange={(event) => setDraftTitle(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={commit}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setDraftTitle(row.title);
                setRenaming(false);
              }
            }}
            className="border-line-control bg-surface-base h-7 w-full rounded-sm border px-1.5 text-callout"
          />
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="truncate text-callout font-semibold">{row.title}</span>
            {row.pendingSync && <SyncGlyph />}
          </span>
        )}
        <span className="text-fg-secondary mt-0.5 flex flex-wrap items-center gap-x-1.5 text-footnote">
          <span className="bg-surface-selected text-fg-primary rounded-sm px-1.5 text-caption1">{row.pill}</span>
          {row.defaultLabel && (
            <span className="border-line-subtle rounded-sm border px-1.5 text-caption1">{row.defaultLabel}</span>
          )}
          <span>{intl.formatMessage(messages.edited, { time: row.lastEdited.label })}</span>
        </span>
        {row.usedIn && <span className="text-fg-tertiary mt-0.5 text-footnote">{row.usedIn}</span>}
      </span>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <li
          {...nav.itemProps(row.cvId)}
          data-cv-row={row.cvId}
          aria-label={iconsOnly ? name : undefined}
          onClick={() => actions.onSelect(row.cvId)}
          onKeyDown={(event) => {
            if (event.key === "F2" && !iconsOnly) {
              event.preventDefault();
              setDraftTitle(row.title);
              setRenaming(true);
            }
          }}
          className={cx(
            "group hover:bg-surface-hover aria-[current=true]:bg-surface-selected flex cursor-default items-start gap-2 rounded-md outline-offset-[-2px]",
            iconsOnly ? "justify-center p-1" : "py-2 pr-1 pl-2",
            variant && !iconsOnly && "ml-4",
          )}
        >
          {body}
          {!iconsOnly && !renaming && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  size="sm"
                  icon={MoreHorizontal}
                  tabIndex={-1}
                  label={intl.formatMessage(messages.actions, { title: row.title })}
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 group-aria-[current=true]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                />
              </DropdownMenu.Trigger>
              <RowMenu
                row={row}
                actions={actions}
                kind="dropdown"
                startRename={() => {
                  setDraftTitle(row.title);
                  setRenaming(true);
                }}
              />
            </DropdownMenu.Root>
          )}
        </li>
      </ContextMenu.Trigger>
      <RowMenu
        row={row}
        actions={actions}
        kind="context"
        startRename={() => {
          setDraftTitle(row.title);
          setRenaming(true);
        }}
      />
    </ContextMenu.Root>
  );
}

export function CvListPane({
  list,
  selectedCvId,
  iconsOnly,
  hiddenIds,
  titles,
  actions,
}: {
  list: CvListVM;
  selectedCvId: string | null;
  iconsOnly: boolean;
  /** Archived on this device (optimistic). */
  hiddenIds: ReadonlySet<string>;
  /** Renamed on this device (optimistic). */
  titles: Readonly<Record<string, string>>;
  actions: CvListActions;
}) {
  const intl = useIntl();
  const [filter, setFilter] = useState<"all" | "archived">("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLUListElement>(null);
  const retitle = (row: CvListRowVM): CvListRowVM => ({ ...row, title: titles[row.cvId] ?? row.title });

  const groups = list.groups
    .filter((group) => !hiddenIds.has(group.base.cvId))
    .map((group) => ({
      base: retitle(group.base),
      variants: group.variants.filter((row) => !hiddenIds.has(row.cvId)).map(retitle),
    }));
  const allRows = [...list.groups.flatMap((group) => [group.base, ...group.variants]), ...list.archived];
  const archived = [
    ...list.archived,
    ...allRows.filter((row) => hiddenIds.has(row.cvId) && !row.archived).map((row) => ({ ...row, archived: true })),
  ].map(retitle);
  const visible =
    filter === "all"
      ? groups.flatMap((group) => [
          { row: group.base, variant: false },
          ...group.variants.map((row) => ({ row, variant: true })),
        ])
      : archived.map((row) => ({ row, variant: false }));

  const nav = useListNavigation({
    containerRef,
    ids: visible.map(({ row }) => row.cvId),
    activeId: selectedCvId,
    onActivate: actions.onSelect,
    group: "CVs",
  });
  useKeyBindings([
    {
      id: "cv-editor.list.history",
      keys: "Mod+Shift+H",
      label: intl.formatMessage(messages.history),
      group: "CVs",
      enabled: selectedCvId !== null,
      run: () => {
        if (selectedCvId) actions.onHistory(selectedCvId);
      },
    },
  ]);

  const counts = {
    all: groups.reduce((total, group) => total + 1 + group.variants.length, 0),
    archived: archived.length,
  };
  return (
    <nav
      aria-label={intl.formatMessage(messages.heading)}
      className={cx(
        "border-line-subtle bg-surface-base flex shrink-0 flex-col border-r",
        iconsOnly ? "w-16 items-center" : "w-66",
      )}
    >
      {!iconsOnly && (
        <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
          <h2 className="text-headline">{intl.formatMessage(messages.heading)}</h2>
          <SegmentedControl
            size="sm"
            label={intl.formatMessage(messages.filter)}
            value={filter}
            onValueChange={setFilter}
            options={list.filters.map((option) => ({
              value: option.id,
              label: intl.formatMessage(messages.filterCount, { label: option.label, count: counts[option.id] }),
            }))}
          />
        </div>
      )}
      <ul ref={containerRef} className={cx("flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto", iconsOnly ? "items-center pt-3" : "px-2 pb-3")}>
        {visible.map(({ row, variant }) => (
          <Row
            key={row.cvId}
            row={{ ...row, selected: row.cvId === selectedCvId }}
            variant={variant}
            iconsOnly={iconsOnly}
            nav={nav}
            actions={actions}
            renaming={renamingId === row.cvId}
            setRenaming={(on) => setRenamingId(on ? row.cvId : null)}
          />
        ))}
        {visible.length === 0 && filter === "archived" && !iconsOnly && (
          <li className="text-fg-secondary px-2 py-2 text-footnote">{intl.formatMessage(messages.noArchived)}</li>
        )}
      </ul>
    </nav>
  );
}
