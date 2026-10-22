/**
 * A section's nested navigation in the shell sidebar (IA.md § Desktop "Shell": the children of a
 * section appear under it while it is active — Jobs: Saved, saved searches, Hidden jobs; Mail: To
 * review (n), Updates, All job mail, Categories, Accounts).
 *
 * The shell Sidebar renders a `SidebarChildrenOutlet` under the active destination row; a screen
 * renders `<SidebarChildren destination="mail" label="Mail folders">…</SidebarChildren>` with
 * `SidebarChildItem`s inside, and they are portalled there. Hidden in the narrow icon rail
 * (< 640 px), where the screen must offer the same choices itself.
 */
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DestinationId } from "../../lib/destinations";
import { cx } from "../cx";

/** Outlet elements by destination; at most one outlet per destination is mounted. */
const outlets = new Map<DestinationId, HTMLElement>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Where a destination's children render (the shell Sidebar places it under the active row). */
export function SidebarChildrenOutlet({ destination }: { destination: DestinationId }) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) outlets.set(destination, element);
      else outlets.delete(destination);
      notify();
    },
    [destination],
  );
  return <div className="narrow:hidden" ref={ref} />;
}

/**
 * Portals `children` (a list of `SidebarChildItem`s) under `destination` in the sidebar. Renders
 * nothing while that destination isn't active or the sidebar is the narrow rail.
 */
export function SidebarChildren({
  destination,
  label,
  children,
}: {
  destination: DestinationId;
  /** Accessible name of the nested list, e.g. "Mail folders". */
  label: string;
  children: ReactNode;
}) {
  const outlet = useSyncExternalStore(subscribe, () => outlets.get(destination) ?? null);
  if (!outlet) return null;
  return createPortal(
    <ul aria-label={label} className="mt-0.5 mb-1 flex flex-col gap-0.5">
      {children}
    </ul>,
    outlet,
  );
}

/**
 * One nested row: indented under its section, 28 px, `aria-current="page"` when it is the view
 * shown. `count` is plain text (only Mail › To review carries one, D01); `trailing` holds a health
 * dot or similar (with its own text alternative).
 */
export function SidebarChildItem({
  current,
  onSelect,
  count,
  trailing,
  children,
}: {
  current: boolean;
  onSelect: () => void;
  count?: number;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        onClick={onSelect}
        className={cx(
          "text-callout text-fg-secondary hover:bg-surface-hover flex h-7 w-full items-center gap-2 rounded-md pr-2 pl-8 text-left outline-offset-0",
          current && "bg-surface-selected text-fg-primary font-medium",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {count !== undefined && <span className="text-fg-tertiary text-footnote tabular-nums">{count}</span>}
        {trailing}
      </button>
    </li>
  );
}
