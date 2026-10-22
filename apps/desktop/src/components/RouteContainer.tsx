import { useEffect } from "react";
import { defineMessages, useIntl } from "react-intl";
import { destinationMessages, type DestinationId } from "../lib/destinations";

export const ROUTE_TITLE_ID = "route-title";

const messages = defineMessages({
  documentTitle: {
    id: "shell.routeContainer.documentTitle",
    defaultMessage: "{section} · BruteForceHR",
    description: "Window title; {section} is the sidebar section name",
  },
});

/** Container for one sidebar destination; the window title follows the section. */
export function RouteContainer({ destination }: { destination: DestinationId }) {
  const intl = useIntl();
  const title = intl.formatMessage(destinationMessages[destination]);
  const documentTitle = intl.formatMessage(messages.documentTitle, { section: title });
  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  return (
    <section aria-labelledby={ROUTE_TITLE_ID} className="min-h-0 flex-1 overflow-y-auto px-8 pt-5 pb-8">
      {/* Focus target after keyboard navigation (palette, ⌘1–5) so screen readers announce it. */}
      <h1
        id={ROUTE_TITLE_ID}
        tabIndex={-1}
        className="font-display text-large-title tracking-tight outline-none"
      >
        {title}
      </h1>
    </section>
  );
}
