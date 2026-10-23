import { Briefcase, ChartColumn, FileUser, Mail, SquareKanban, Sun, type LucideIcon } from "lucide-react";
import type { DestinationId } from "../lib/destinations";

export const destinationIcons: Record<DestinationId, LucideIcon> = {
  today: Sun,
  jobs: Briefcase,
  tracker: SquareKanban,
  cvs: FileUser,
  mail: Mail,
  insights: ChartColumn,
};
