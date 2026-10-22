/**
 * A horizontally scrolling strip without a visible scrollbar (CV editor tabs, chip rows, a board
 * of columns). WebView2 on Windows draws classic scrollbars that take height and stay visible even
 * when nothing overflows; macOS overlay bars only appear while scrolling. The strip hides the bar
 * on both and stays scrollable:
 * - mouse wheel: a vertical wheel scrolls the strip sideways when it can scroll that way
 *   (trackpads and Shift+wheel already scroll horizontally);
 * - keyboard: focusing an item inside scrolls it into view; when the items aren't focusable, pass
 *   `label` and the strip itself becomes a focusable region that ← / → scroll.
 *
 * Only for horizontal strips. Vertical content keeps its (thin) scrollbar for accessibility.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../cx";

export interface ScrollStripProps {
  children: ReactNode;
  /**
   * Accessible name. Set it when the content has no focusable items: the strip then takes focus
   * (tab stop, `role="region"`) so ← / → can scroll it. Leave it out for strips of buttons or tabs.
   */
  label?: string;
  /** Layout classes (gap, padding); the strip is a flex row by default. */
  className?: string;
}

export function ScrollStrip({ children, label, className }: ScrollStripProps) {
  const ref = useRef<HTMLDivElement>(null);

  // React registers wheel listeners as passive, which can't preventDefault: listen natively.
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxLeft = strip.scrollWidth - strip.clientWidth;
      if (maxLeft <= 0) return;
      const atStart = strip.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = strip.scrollLeft >= maxLeft && event.deltaY > 0;
      // At an edge the page keeps the wheel, so a parent pane can still scroll vertically.
      if (atStart || atEnd) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      {...(label !== undefined && { role: "region", "aria-label": label, tabIndex: 0 })}
      className={cx("scrollbar-hidden flex min-w-0 overflow-x-auto overscroll-x-contain", className)}
    >
      {children}
    </div>
  );
}
