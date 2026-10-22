/**
 * Sidebar destinations, in sidebar order. The position doubles as the ⌘/Ctrl+number shortcut.
 * Insights and Settings join in their own milestones.
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
