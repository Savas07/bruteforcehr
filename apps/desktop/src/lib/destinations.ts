/**
 * Sidebar destinations, in sidebar order. The position doubles as the ⌘/Ctrl+number shortcut.
 * The native Go menu (DESTINATIONS in src-tauri/src/menu.rs) mirrors this list; its tests read
 * this file. Insights and Settings join in their own milestones.
 */
export const destinations = [
  { id: "today", label: "Today", path: "/today" },
  { id: "jobs", label: "Jobs", path: "/jobs" },
  { id: "tracker", label: "Tracker", path: "/tracker" },
  { id: "cvs", label: "CVs", path: "/cvs" },
  { id: "mail", label: "Mail", path: "/mail" },
] as const;

export type Destination = (typeof destinations)[number];
export type DestinationId = Destination["id"];

export const destinationIds = destinations.map((destination) => destination.id) as [
  DestinationId,
  ...DestinationId[],
];
