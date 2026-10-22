/**
 * Horizontal strips that scroll sideways (section jump bar, inspector tabs). WebView2 draws a
 * classic scrollbar under `overflow-x: auto`; the strips scroll by wheel, trackpad and focus
 * (every entry is a button, so Tab scrolls it into view), so the bar is hidden.
 * Interim until the shared horizontal-strip utility lands on main (DesktopFoundation); then this
 * module is replaced by it.
 */
export const HORIZONTAL_STRIP = "overflow-x-auto overscroll-x-contain [scrollbar-width:none]";
