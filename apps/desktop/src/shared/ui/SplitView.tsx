/**
 * Pane layouts with the D04 breakpoints (components.md `SplitView`, `DetailSidePanel`; IA.md
 * "Panes"): list pane 340–440 px (default 400) | detail ≥ 480 px, pushed one-at-a-time below
 * 980 px, optional right rail from 1440 px; side panel 400–640 px (default 480) docked right.
 * Every pane owns its own empty / loading / error state (states.md), so these only lay out.
 */
import { layout } from "@bfhr/ui-tokens";
import { ArrowLeft, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useKeyBindings } from "../keyboard/useKeyBindings";
import { cx } from "../cx";
import { Button, IconButton } from "./Button";
import { useFocusOnMount, useReturnFocus } from "./focus";
import { useBreakpoints } from "./layout";

const RESIZE_STEP = 8;

/** Keyboard- and pointer-resizable vertical splitter (`role="separator"`). */
function Splitter({
  controls,
  label,
  value,
  min,
  max,
  onChange,
}: {
  controls: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
}) {
  const clamp = (width: number) => Math.min(max, Math.max(min, width));
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className="group relative z-(--bfhr-layer-sticky) -mx-1 w-2 shrink-0 cursor-col-resize outline-offset-0 focus-visible:outline-2"
      onKeyDown={(event: ReactKeyboardEvent) => {
        const delta = event.key === "ArrowLeft" ? -RESIZE_STEP : event.key === "ArrowRight" ? RESIZE_STEP : 0;
        if (event.key === "Home") onChange(min);
        else if (event.key === "End") onChange(max);
        else if (delta !== 0) onChange(clamp(value + delta));
        else return;
        event.preventDefault();
      }}
      onPointerDown={(event: PointerEvent) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: value };
      }}
      onPointerMove={(event: PointerEvent) => {
        if (drag.current) onChange(clamp(drag.current.startWidth + event.clientX - drag.current.startX));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <span
        aria-hidden="true"
        className="bg-line-subtle group-hover:bg-line-control mx-auto block h-full w-px transition-colors duration-(--bfhr-duration-fast)"
      />
    </div>
  );
}

export interface SplitViewProps {
  /** Accessible names of the panes: "Jobs", "Job details". */
  listLabel: string;
  detailLabel: string;
  list: ReactNode;
  detail: ReactNode;
  /**
   * Below 980 px only one pane shows: the detail when this is true (something is open), else the
   * list. At wider sizes both always show.
   */
  detailOpen: boolean;
  /** Back from the pushed detail: the back button and Esc. Restore the list selection here. */
  onBack: () => void;
  /** Back button text in pushed mode, e.g. "Back to Jobs". */
  backLabel: string;
  /** Right rail from 1440 px (Today agenda, Mail details); hidden below. */
  rail?: ReactNode;
  railLabel?: string;
}

/**
 * List | detail panes. The list is resizable (340–440 px, default 400, ← / → on the splitter);
 * below `narrow` (980 px) the detail is pushed over the list with a back button and Esc, and focus
 * moves into it, then back to the list row on return.
 */
export function SplitView({
  listLabel,
  detailLabel,
  list,
  detail,
  detailOpen,
  onBack,
  backLabel,
  rail,
  railLabel,
}: SplitViewProps) {
  const { narrow, wide } = useBreakpoints();
  const [listWidth, setListWidth] = useState<number>(layout.listPane.default);
  const listId = useId();
  const pushed = narrow && detailOpen;
  const detailRef = useRef<HTMLElement>(null);
  useFocusOnMount(detailRef, pushed);
  useReturnFocus(pushed);
  useKeyBindings([
    {
      id: "split.back",
      keys: "Escape",
      label: "Back to the list",
      group: "Lists",
      enabled: pushed,
      run: onBack,
    },
  ]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {!pushed && (
        <section
          id={listId}
          aria-label={listLabel}
          className="flex min-h-0 shrink-0 flex-col"
          style={narrow ? { width: "100%" } : { width: listWidth }}
        >
          {list}
        </section>
      )}
      {!narrow && (
        <Splitter
          controls={listId}
          label={`Resize ${listLabel}`}
          value={listWidth}
          min={layout.listPane.min}
          max={layout.listPane.max}
          onChange={setListWidth}
        />
      )}
      {(!narrow || pushed) && (
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label={detailLabel}
          className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
          style={{ minWidth: narrow ? undefined : layout.detailPaneMin }}
        >
          {pushed && (
            <div className="border-line-subtle flex h-11 shrink-0 items-center border-b px-3">
              <Button
                variant="plain"
                size="sm"
                icon={ArrowLeft}
                shortcut="Escape"
                hint={backLabel}
                onClick={onBack}
              >
                {backLabel}
              </Button>
            </div>
          )}
          {detail}
        </section>
      )}
      {wide && rail !== undefined && (
        <aside
          aria-label={railLabel}
          className="border-line-subtle flex min-h-0 w-72 shrink-0 flex-col border-l"
        >
          {rail}
        </aside>
      )}
    </div>
  );
}

export interface DetailPanelNav {
  /** 1-based position and total in the scope, for "3 of 12 in Interviewing". */
  position: number;
  total: number;
  scopeLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Right-docked detail panel (Tracker Enter, Jobs pop-out source): 400–640 px (default 480),
 * resizable, Esc closes and returns focus, optional prev / next ("3 of 12 in Interviewing", K / J
 * while focus is in the panel). Below 980 px it covers the content area instead.
 */
export function DetailSidePanel({
  open,
  label,
  onClose,
  nav,
  actions,
  children,
}: {
  open: boolean;
  /** Accessible name and visible heading context, e.g. "Application details". */
  label: string;
  onClose: () => void;
  nav?: DetailPanelNav;
  /** Extra header actions (pop-out, open full page). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { narrow } = useBreakpoints();
  const [width, setWidth] = useState<number>(layout.sidePanel.default);
  const panelId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useFocusOnMount(panelRef, open);
  useReturnFocus(open);
  const inPanel = (event: KeyboardEvent) =>
    event.target instanceof Node && panelRef.current?.contains(event.target) === true;
  useKeyBindings([
    {
      id: "panel.close",
      keys: "Escape",
      label: "Close the details panel",
      group: "Lists",
      enabled: open,
      run: onClose,
    },
    {
      id: "panel.next",
      keys: "J",
      label: "Next record",
      group: "Lists",
      enabled: open && nav !== undefined,
      when: inPanel,
      run: () => nav?.onNext(),
    },
    {
      id: "panel.previous",
      keys: "K",
      label: "Previous record",
      group: "Lists",
      enabled: open && nav !== undefined,
      when: inPanel,
      run: () => nav?.onPrevious(),
    },
  ]);
  if (!open) return null;

  return (
    <>
      {!narrow && (
        <Splitter
          controls={panelId}
          label={`Resize ${label}`}
          value={width}
          min={layout.sidePanel.min}
          max={layout.sidePanel.max}
          onChange={(next) => setWidth(next)}
        />
      )}
      <aside
        id={panelId}
        ref={panelRef}
        tabIndex={-1}
        aria-label={label}
        className={cx(
          "bg-surface-base flex min-h-0 flex-col outline-none",
          narrow ? "absolute inset-0 z-(--bfhr-layer-sticky)" : "shrink-0",
        )}
        style={narrow ? undefined : { width }}
      >
        <div className="border-line-subtle flex h-11 shrink-0 items-center gap-1 border-b px-2">
          {nav && (
            <>
              <IconButton
                icon={ChevronUp}
                size="sm"
                label="Previous record"
                shortcut="K"
                onClick={nav.onPrevious}
              />
              <IconButton
                icon={ChevronDown}
                size="sm"
                label="Next record"
                shortcut="J"
                onClick={nav.onNext}
              />
              <span className="text-fg-secondary px-1 text-footnote tabular-nums">
                {nav.position} of {nav.total} in {nav.scopeLabel}
              </span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1">
            {actions}
            <IconButton icon={X} size="sm" label="Close" shortcut="Escape" onClick={onClose} />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
