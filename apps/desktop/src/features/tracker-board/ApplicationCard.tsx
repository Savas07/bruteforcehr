/**
 * `ApplicationCard` (components.md "Tracker", tracker.md "Card"): monogram + company, role (two
 * lines at most), one meta line (next action, else time in stage), the calm staleness line and the
 * envelope glyph when the last move was automatic. The card body is the drag handle and the button
 * that toggles the detail panel; "Move to…" (`M`) sits in the corner.
 */
import type { ApplicationStatus } from "@bfhr/core";
import { useDraggable } from "@dnd-kit/core";
import { ArrowRightLeft, CalendarClock, Mail } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { forwardRef, type Ref, useRef } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Monogram } from "../../shared/ui/Company";
import { Hint } from "../../shared/ui/Hint";
import { StatusMenu } from "../../shared/ui/StatusPill";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import type { TrackerCardVM } from "./model";

const messages = defineMessages({
  moveTo: {
    id: "tracker-board.card.moveTo",
    defaultMessage: "Move to…",
    description: "Tooltip and accessible name of the card's status menu button",
  },
  roleDescription: {
    id: "tracker-board.card.roleDescription",
    defaultMessage: "movable card",
    description: "Screen-reader role description of a draggable application card",
  },
  nextAction: {
    id: "tracker-board.card.nextAction",
    defaultMessage: "{action} · {due}",
    description: "Card meta line: the next to-do and when it's due",
  },
});

/** The visible card content, shared by the board card and the drag overlay. */
export function CardBody({ card, muted }: { card: TrackerCardVM; muted: boolean }) {
  const intl = useIntl();
  const action = card.nextAction;
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 pe-7">
        <Monogram company={card.company} size="sm" />
        <span className="text-fg-secondary min-w-0 truncate text-footnote">{card.company.name}</span>
        {card.autoMove && (
          <span className="text-fg-secondary inline-flex shrink-0">
            <Mail aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            <span className="sr-only">{card.autoMove}</span>
          </span>
        )}
        {card.pendingSync && <SyncGlyph />}
      </span>
      <span
        className={cx(
          "line-clamp-2 text-callout font-medium text-pretty",
          muted ? "text-fg-secondary" : "text-fg-primary",
        )}
      >
        {card.role}
      </span>
      {action ? (
        <span className="text-fg-secondary flex items-start gap-1.5 text-footnote">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          <span>
            {action.due
              ? intl.formatMessage(messages.nextAction, { action: action.label, due: action.due.label })
              : action.label}
          </span>
        </span>
      ) : (
        <span className="text-fg-secondary text-footnote tabular-nums">
          <span aria-hidden="true">{card.age.label}</span>
          <span className="sr-only">{card.age.accessibleLabel}</span>
        </span>
      )}
      {card.staleness !== null && <span className="text-fg-secondary text-footnote">{card.staleness}</span>}
    </>
  );
}

export interface ApplicationCardProps {
  card: TrackerCardVM;
  /** Roving focus: the one card in the board that takes Tab. */
  tabbable: boolean;
  /** The detail panel shows this card. */
  selected: boolean;
  /** Being dragged: its slot keeps a ghost (tracker.md "While dragging"). */
  ghost: boolean;
  /** Closed outcomes read grey. */
  muted: boolean;
  /** Id of the instructions ("Press M to move…") for `aria-describedby`. */
  instructionsId: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onMove: (to: ApplicationStatus) => void;
  onActivate: () => void;
  onFocus: () => void;
}

export const ApplicationCard = forwardRef(function ApplicationCard(
  {
    card,
    tabbable,
    selected,
    ghost,
    muted,
    instructionsId,
    menuOpen,
    onMenuOpenChange,
    onMove,
    onActivate,
    onFocus,
  }: ApplicationCardProps,
  ref: Ref<HTMLButtonElement>,
) {
  const intl = useIntl();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: card.applicationId, data: { card } });
  const cardRef = useRef<HTMLButtonElement | null>(null);
  // Radix gives focus back to the corner trigger when the menu closes; the card is where the user
  // pressed `M`, and where ↑ ↓ ← → and ⇧⌘→ continue from.
  const returnToCard = useRef(false);
  return (
    <li className="group relative" data-card-id={card.applicationId} onFocus={onFocus}>
      <button
        ref={(node) => {
          cardRef.current = node;
          setNodeRef(node);
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        type="button"
        {...listeners}
        tabIndex={tabbable ? 0 : -1}
        aria-roledescription={intl.formatMessage(messages.roleDescription)}
        aria-describedby={instructionsId}
        aria-current={selected || undefined}
        onClick={onActivate}
        className={cx(
          "bg-surface-base border-line-subtle flex w-full cursor-default flex-col gap-1.5 rounded-md border p-3 text-start transition-shadow duration-(--bfhr-duration-fast) ease-standard hover:shadow-raised",
          selected && "border-accent-solid ring-accent-solid ring-1",
          (ghost || isDragging) && "opacity-40",
        )}
      >
        <CardBody card={card} muted={muted} />
      </button>
      <DropdownMenu.Root
        // Non-modal (APG menus): a modal Radix menu hides the app from screen readers while open.
        modal={false}
        open={menuOpen}
        onOpenChange={(open) => {
          returnToCard.current = !open;
          onMenuOpenChange(open);
        }}
      >
        <Hint label={intl.formatMessage(messages.moveTo)} keys="M">
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              tabIndex={tabbable ? 0 : -1}
              aria-label={intl.formatMessage(messages.moveTo)}
              aria-describedby={undefined}
              onFocus={() => {
                if (!returnToCard.current) return;
                returnToCard.current = false;
                cardRef.current?.focus();
              }}
              className={cx(
                "text-fg-secondary hover:bg-surface-hover hover:text-fg-primary data-[state=open]:bg-surface-selected absolute end-2 top-2 inline-flex size-6 items-center justify-center rounded-sm opacity-0 transition-opacity duration-(--bfhr-duration-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
              )}
            >
              <ArrowRightLeft aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            </button>
          </DropdownMenu.Trigger>
        </Hint>
        <StatusMenu current={card.status.key} onSelect={onMove} />
      </DropdownMenu.Root>
    </li>
  );
});

/** Where the dragged card would land in the target column (outlined, same height as a card). */
export function DropPlaceholder({ card }: { card: TrackerCardVM }) {
  return (
    <li aria-hidden="true" className="border-accent-solid relative rounded-md border border-dashed">
      <span className="invisible flex flex-col gap-1.5 p-3">
        <CardBody card={card} muted={false} />
      </span>
    </li>
  );
}
