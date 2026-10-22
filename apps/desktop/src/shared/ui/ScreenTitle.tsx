import { useEffect, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { ROUTE_TITLE_ID } from "../../components/RouteContainer";
import { cx } from "../cx";

const messages = defineMessages({
  documentTitle: {
    id: "shared.ui.screenTitle.documentTitle",
    defaultMessage: "{title} · BruteForceHR",
    description: "Window title; {title} is the screen or record name",
  },
});

/**
 * A screen's `h1` (components.md `RouteContainer`): sets the window title and is the focus target
 * after keyboard navigation (⌘1–5, palette), so screen readers announce the new section. Render
 * exactly one per screen, also in loading, empty and error states.
 */
export function ScreenTitle({
  title,
  documentTitle = title,
  className,
  children,
}: {
  title: string;
  /** Window title prefix when it differs from the visible title ("Acme · Frontend Engineer"). */
  documentTitle?: string;
  className?: string;
  /** Trailing content on the title line (date, counts). */
  children?: ReactNode;
}) {
  const intl = useIntl();
  const windowTitle = intl.formatMessage(messages.documentTitle, { title: documentTitle });
  useEffect(() => {
    document.title = windowTitle;
  }, [windowTitle]);
  return (
    <h1
      id={ROUTE_TITLE_ID}
      tabIndex={-1}
      className={cx("font-display text-large-title tracking-tight outline-none", className)}
    >
      {title}
      {children}
    </h1>
  );
}
