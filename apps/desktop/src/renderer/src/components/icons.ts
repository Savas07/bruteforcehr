import { Briefcase, FileUser, Mail, SquareKanban, Sun, type LucideIcon } from "lucide-react";
import type { DestinationId } from "../../../shared/destinations";

export const destinationIcons: Record<DestinationId, LucideIcon> = {
  today: Sun,
  jobs: Briefcase,
  tracker: SquareKanban,
  cvs: FileUser,
  mail: Mail,
};
