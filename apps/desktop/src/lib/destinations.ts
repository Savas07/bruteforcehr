import { defineMessages, type MessageDescriptor } from "react-intl";

/**
 * Sidebar destinations, in sidebar order. The position doubles as the ⌘/Ctrl+number shortcut.
 * The native Go menu (DESTINATIONS in src-tauri/src/menu.rs) mirrors this list; its tests read
 * this file. Settings joins in its own milestone.
 */
export const destinations = [
  { id: "today", label: "Today", path: "/today" },
  { id: "jobs", label: "Jobs", path: "/jobs" },
  { id: "tracker", label: "Tracker", path: "/tracker" },
  { id: "cvs", label: "CVs", path: "/cvs" },
  { id: "mail", label: "Mail", path: "/mail" },
  { id: "insights", label: "Insights", path: "/insights" },
] as const;

export type Destination = (typeof destinations)[number];
export type DestinationId = Destination["id"];

/**
 * What the UI shows for each destination. `label` above stays English for the native menu
 * (src-tauri/src/menu.rs reads it); the webview renders these messages. `defaultMessage` comes
 * first on purpose: menu.rs counts the entries above by their leading id field.
 */
export const destinationMessages: Readonly<Record<DestinationId, MessageDescriptor>> = defineMessages({
  today: { defaultMessage: "Today", id: "shell.destination.today" },
  jobs: { defaultMessage: "Jobs", id: "shell.destination.jobs" },
  tracker: { defaultMessage: "Tracker", id: "shell.destination.tracker" },
  cvs: { defaultMessage: "CVs", id: "shell.destination.cvs" },
  mail: { defaultMessage: "Mail", id: "shell.destination.mail" },
  insights: { defaultMessage: "Insights", id: "shell.destination.insights" },
});

export const destinationIds = destinations.map((destination) => destination.id) as [
  DestinationId,
  ...DestinationId[],
];
