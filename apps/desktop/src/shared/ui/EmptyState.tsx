/**
 * `EmptyState` and `GhostRow` (system.md "Empty states", states.md rule 8). Four kinds, sized
 * differently; copy says what arrives here and how, with no praise. Glyphs are monochrome line
 * icons. Each primary action shows its shortcut on desktop ("Add application ⌘N").
 */
import { Plus, type LucideIcon } from "lucide-react";
import { cx } from "../cx";
import { Button, type ButtonVariant } from "./Button";
import { Keycaps } from "./Keycaps";

/**
 * - `firstUse`: nothing here yet. Glyph (≤ 48 px), title, one line, one primary + optional secondary.
 * - `noResults`: filters hide everything. Text only; the filters stay visible; "Clear filters".
 * - `caughtUp`: nothing to do right now. Says what will arrive here; text action at most.
 * - `subArea`: an empty column or section. One muted line.
 */
export type EmptyStateKind = "firstUse" | "noResults" | "caughtUp" | "subArea";

/** An empty state's action. */
export interface EmptyStateAction {
  /** Verb + object, sentence case: "Add application", "Clear filters". */
  readonly label: string;
  /** Runs the action. */
  readonly onClick: () => void;
  /** Keymap syntax shown as keycaps inside the button ("Mod+N"). */
  readonly keys?: string;
}

/** Labels past this many characters stack the buttons vertically (DE runs ~35% longer). */
const STACK_AFTER = 18;

const primaryVariant: Record<EmptyStateKind, ButtonVariant> = {
  firstUse: "primary",
  noResults: "secondary",
  caughtUp: "plain",
  subArea: "plain",
};

/** An empty pane, list or section; `kind` sets the size and emphasis. */
export function EmptyState({
  kind,
  glyph: Glyph,
  title,
  body,
  primary,
  secondary,
  className,
}: {
  /** See `EmptyStateKind`. */
  kind: EmptyStateKind;
  /** Monochrome line glyph, 48 px, `fg-tertiary`. Shown for `firstUse` and `caughtUp` only. */
  glyph?: LucideIcon;
  /** "No applications yet". Not shown for `subArea`. */
  title?: string;
  /** What arrives here and how: "Add a job you've applied to, or save one from Jobs to track it here." */
  body: string;
  /** The main way forward. Accent fill only for `firstUse`; `caughtUp` and `subArea` render it as a text action. */
  primary?: EmptyStateAction;
  /** Optional second way forward (`firstUse`: "Find jobs", "Import CSV"). */
  secondary?: EmptyStateAction;
  /** Layout classes (padding, alignment within the pane). */
  className?: string;
}) {
  if (kind === "subArea") {
    return (
      <div className={cx("flex flex-wrap items-center gap-x-2 px-3 py-2", className)}>
        <p className="text-footnote text-fg-tertiary">{body}</p>
        {primary && <ActionButton action={primary} variant="plain" size="sm" />}
      </div>
    );
  }

  const stacked = [primary, secondary].some(
    (action) => action !== undefined && action.label.length > STACK_AFTER,
  );
  const showGlyph = Glyph !== undefined && (kind === "firstUse" || kind === "caughtUp");

  return (
    <div className={cx("flex flex-col items-center gap-4 px-6 py-10 text-center", className)}>
      {showGlyph && <Glyph aria-hidden="true" className="text-fg-tertiary size-12" strokeWidth={1.75} />}
      <div className="flex max-w-100 flex-col gap-1">
        {title !== undefined && (
          <p className={cx("text-fg-primary", kind === "firstUse" ? "text-title3" : "text-headline")}>
            {title}
          </p>
        )}
        <p className="text-body text-fg-secondary">{body}</p>
      </div>
      {(primary || secondary) && (
        <div
          className={cx(
            "flex gap-2",
            stacked ? "flex-col items-stretch" : "flex-row flex-wrap justify-center",
          )}
        >
          {primary && <ActionButton action={primary} variant={primaryVariant[kind]} size="md" />}
          {secondary && (
            <ActionButton
              action={secondary}
              variant={kind === "firstUse" ? "secondary" : "plain"}
              size="md"
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  variant,
  size,
}: {
  action: EmptyStateAction;
  variant: ButtonVariant;
  size: "sm" | "md";
}) {
  return (
    <Button variant={variant} size={size} onClick={action.onClick}>
      <span className="inline-flex items-center gap-2">
        {action.label}
        {action.keys !== undefined && <Keycaps keys={action.keys} />}
      </span>
    </Button>
  );
}

/**
 * A dashed placeholder row that adds the first item to an empty section ("Add your first role")
 * or column. A real button: focusable, Enter / Space activate it.
 */
export function GhostRow({
  label,
  onClick,
}: {
  /** What it adds, without a leading "+" (the icon draws it): "Add your first role". */
  label: string;
  /** Adds the item (opens the inline editor or the add dialog). */
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line-control text-fg-secondary hover:bg-surface-hover hover:text-fg-primary active:bg-surface-selected flex min-h-8 w-full items-center gap-2 rounded-md border border-dashed px-3 py-1 text-left text-callout transition-colors duration-(--bfhr-duration-fast) ease-standard"
    >
      <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  );
}
