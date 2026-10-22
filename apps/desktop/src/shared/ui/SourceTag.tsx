import {
  Briefcase,
  Building2,
  FileText,
  Mail,
  Sparkles,
  User,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { SourceKind, SourceVM } from "../model/types";

/** One glyph per provenance; decorative, the label names the source. */
const sourceIcon: Record<SourceKind, LucideIcon> = {
  you: User,
  mail: Mail,
  cv: FileText,
  ai: Sparkles,
  rule: Workflow,
  job_board: Briefcase,
  employer: Building2,
};

export interface SourceTagProps {
  /** Provenance kind (picks the icon) and its label ("From CV", "Automatic · Mail", "LinkedIn"). */
  source: SourceVM;
}

/**
 * Provenance tag (components.md `SourceTag`): icon + label in a small neutral tag, so a value or
 * change made by the user reads differently from one taken from an email, the CV or a rule.
 */
export function SourceTag({ source }: SourceTagProps) {
  const Icon = sourceIcon[source.kind];
  return (
    <span className="bg-surface-sunken text-fg-secondary inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-caption1 whitespace-nowrap">
      <Icon aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
      <span>{source.label}</span>
    </span>
  );
}
