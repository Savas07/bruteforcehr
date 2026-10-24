/**
 * Focus management shared by every screen (IA.md § Keyboard map "Lists, boards and tables",
 * states.md "Keyboard"): roving focus with J / K / ↑ / ↓ and Enter, focus on mount for the
 * element a state change should announce (pane errors, pushed detail), and focus return when a
 * pane or panel closes.
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../keyboard/useKeyBindings";

const messages = defineMessages({
  lists: { id: "shared.ui.focus.lists", defaultMessage: "Lists", description: "Shortcuts-sheet group name" },
  next: {
    id: "shared.ui.focus.next",
    defaultMessage: "Move down the list",
    description: "Shortcut label (J / ↓): focus moves to the next row",
  },
  previous: {
    id: "shared.ui.focus.previous",
    defaultMessage: "Move up the list",
    description: "Shortcut label (K / ↑): focus moves to the previous row",
  },
  open: {
    id: "shared.ui.focus.open",
    defaultMessage: "Open in detail pane",
    description: "Shortcut label (Enter)",
  },
});

/** Shortcuts-sheet group of list and pane navigation keys ("Lists"). */
export const LIST_GROUP = messages.lists;

/** Moves focus to `ref` when it mounts (or when `when` turns true). */
export function useFocusOnMount(ref: RefObject<HTMLElement | null>, when = true): void {
  useEffect(() => {
    if (when) ref.current?.focus({ preventScroll: false });
  }, [ref, when]);
}

/**
 * Remembers the focused element while `open` is true and gives focus back when it turns false
 * (side panels, pushed detail panes, inline expansions; Radix dialogs already do this).
 */
export function useReturnFocus(open: boolean): void {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target = previous.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [open]);
}

export interface ListNavigation {
  /** Spread on each row: roving `tabIndex`, `data-nav-id`, `aria-current` for the active row. */
  readonly itemProps: (id: string) => {
    readonly tabIndex: 0 | -1;
    readonly "data-nav-id": string;
    readonly "aria-current": "true" | undefined;
    readonly onFocus: () => void;
  };
  /** Focus a row by id (after a pushed detail closes, or a row is removed). */
  readonly focusItem: (id: string) => void;
}

/**
 * Roving focus over one collection. `J` / `↓` and `K` / `↑` move the active row (and focus it),
 * `Enter` opens it. Keys register while the hook is mounted and `enabled`, under the
 * shortcuts-sheet group `group` (default "Lists"). Rows live inside `containerRef`.
 *
 * ```tsx
 * const nav = useListNavigation({ containerRef, ids, activeId, onActivate: select, onOpen: open });
 * <ul ref={containerRef}>{rows.map((row) => <li key={row.id} {...nav.itemProps(row.id)}>…</li>)}</ul>
 * ```
 */
export function useListNavigation({
  containerRef,
  ids,
  activeId,
  onActivate,
  onOpen,
  group: groupProp,
  enabled = true,
}: {
  containerRef: RefObject<HTMLElement | null>;
  ids: readonly string[];
  activeId: string | null;
  /** The active row changed (selection follows focus in list/detail panes). */
  onActivate: (id: string) => void;
  /** Enter on the active row. */
  onOpen?: (id: string) => void;
  group?: string;
  enabled?: boolean;
}): ListNavigation {
  const intl = useIntl();
  // Binding ids stay locale-independent; only the sheet label is translated.
  const idPrefix = groupProp ?? "Lists";
  const group = groupProp ?? intl.formatMessage(LIST_GROUP);
  const focusItem = useCallback(
    (id: string) => {
      containerRef.current?.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(id)}"]`)?.focus();
    },
    [containerRef],
  );

  const step = (delta: 1 | -1) => {
    if (ids.length === 0) return;
    const index = activeId === null ? -1 : ids.indexOf(activeId);
    const next = ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
    if (next === undefined) return;
    onActivate(next);
    focusItem(next);
  };

  // J / K work anywhere outside text fields; arrows and Enter only from inside the list (or with
  // nothing focused), so they keep scrolling pages and activating other controls elsewhere.
  const fromList = (event: KeyboardEvent) =>
    event.target === document.body ||
    (event.target instanceof Node && containerRef.current?.contains(event.target) === true);
  useKeyBindings([
    {
      id: `${idPrefix}.next`,
      keys: ["J", "ArrowDown"],
      label: intl.formatMessage(messages.next),
      group,
      enabled,
      when: (event) => event.key !== "ArrowDown" || fromList(event),
      run: () => step(1),
    },
    {
      id: `${idPrefix}.previous`,
      keys: ["K", "ArrowUp"],
      label: intl.formatMessage(messages.previous),
      group,
      enabled,
      when: (event) => event.key !== "ArrowUp" || fromList(event),
      run: () => step(-1),
    },
    {
      id: `${idPrefix}.open`,
      keys: "Enter",
      label: intl.formatMessage(messages.open),
      group,
      enabled: enabled && onOpen !== undefined && activeId !== null,
      when: fromList,
      run: () => {
        if (activeId !== null) onOpen?.(activeId);
      },
    },
  ]);

  const firstId = ids[0];
  return {
    itemProps: (id) => ({
      tabIndex: id === activeId || (activeId === null && id === firstId) ? 0 : -1,
      "data-nav-id": id,
      "aria-current": id === activeId ? "true" : undefined,
      onFocus: () => {
        if (id !== activeId) onActivate(id);
      },
    }),
    focusItem,
  };
}
