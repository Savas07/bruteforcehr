/**
 * `Monogram` and `CompanyChip` (components.md `CompanyChip` / `Monogram`). No logos in v1
 * (decisions.md: monogram fallback, nothing persisted), so a company is its initials on a neutral
 * tile next to its name. The initials are decorative: the name is always written out beside them.
 */
import type { ReactNode } from "react";
import { cx } from "../cx";
import type { CompanyVM } from "../model/types";

const tileSize: Record<"sm" | "md" | "lg", string> = {
  sm: "size-5 rounded-xs text-caption2",
  md: "size-8 rounded-md text-footnote",
  lg: "size-10 rounded-md text-callout",
};

export interface MonogramProps {
  /** The company; `monogram` holds its one or two initials ("AR"). */
  company: CompanyVM;
  /** 20 px (`sm`, inline with text), 32 px (`md`, rows; default) or 40 px (`lg`, headers). */
  size?: "sm" | "md" | "lg";
  /**
   * Small element pinned to the bottom-right corner (auto-change glyph, account icon). It stays in
   * the accessibility tree, so give it its own label when it means something.
   */
  badge?: ReactNode;
}

/** Initials tile on a neutral tone; decorative (`aria-hidden`) except for its `badge`. */
export function Monogram({ company, size = "md", badge }: MonogramProps) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        className={cx(
          "bg-surface-sunken text-fg-secondary border-line-subtle inline-flex items-center justify-center border font-semibold select-none",
          tileSize[size],
        )}
      >
        {company.monogram}
      </span>
      {badge !== undefined && <span className="absolute -right-1 -bottom-1 inline-flex">{badge}</span>}
    </span>
  );
}

export interface CompanyChipProps {
  /** The company to show. */
  company: CompanyVM;
  /** `sm` (20 px tile, footnote) for dense rows, `md` (default; 20 px tile, callout) elsewhere. */
  size?: "sm" | "md";
}

/** Monogram + company name. The name wraps instead of truncating (labels with meaning never truncate). */
export function CompanyChip({ company, size = "md" }: CompanyChipProps) {
  return (
    <span
      className={cx(
        "text-fg-primary inline-flex min-w-0 items-center gap-1.5",
        size === "sm" ? "text-footnote" : "text-callout",
      )}
    >
      <Monogram company={company} size="sm" />
      <span className="min-w-0 break-words">{company.name}</span>
    </span>
  );
}
