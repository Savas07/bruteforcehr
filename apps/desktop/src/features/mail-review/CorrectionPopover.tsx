/**
 * The correction popover behind Change… (`M`; IA.md "Mail", components.md `CategoryPicker` /
 * `ApplicationPicker`): one cmdk list per field, Tab cycles Category ↔ Application, typing filters,
 * Enter chooses and moves on (on Application it saves), Mod+Enter saves from any field, Esc
 * cancels. "Create application" is always the first application option.
 *
 * The status isn't picked: the server applies the category's status as the user's move, forward
 * or to a decision only (`mailMessageReviewed`), and clients may write only the review fields. The
 * Status row says what will happen (`correctionMove`); any other move is made in the Tracker.
 */
import { type ApplicationStatus, canTransition, categoryTargetStatus, type MailCategory } from "@bfhr/core";
import { Command } from "cmdk";
import { Check, Plus, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome } from "../../lib/desktop";
import { cx } from "../../shared/cx";
import { spokenAlternatives } from "../../shared/keyboard/keymap";
import { Button } from "../../shared/ui/Button";
import { Keycaps } from "../../shared/ui/Keycaps";
import { StatusPill } from "../../shared/ui/StatusPill";
import type { StatusVM } from "../../shared/model/types";
import type { MailCorrectionVM } from "./model";

const messages = defineMessages({
  title: { id: "mail-review.correction.title", defaultMessage: "Correct this email" },
  category: { id: "mail-review.correction.category", defaultMessage: "Category" },
  application: { id: "mail-review.correction.application", defaultMessage: "Application" },
  status: { id: "mail-review.correction.status", defaultMessage: "Status" },
  searchCategory: { id: "mail-review.correction.searchCategory", defaultMessage: "Search categories" },
  searchApplication: {
    id: "mail-review.correction.searchApplication",
    defaultMessage: "Search applications",
  },
  createApplication: {
    id: "mail-review.correction.createApplication",
    defaultMessage: "Create application: {application}",
    description: "{application} is company · role, e.g. 'Acme · Frontend Engineer'",
  },
  newApplication: {
    id: "mail-review.correction.newApplication",
    defaultMessage: "{application} (new)",
    description: "Summary of the application the correction will create",
  },
  noApplication: { id: "mail-review.correction.noApplication", defaultMessage: "No application" },
  noStatusChange: { id: "mail-review.correction.noStatusChange", defaultMessage: "No status change" },
  statusMovesTo: {
    id: "mail-review.correction.statusMovesTo",
    defaultMessage: "Moves to {status}",
    description: "What saving the correction does to the application's status",
  },
  statusExplain: {
    id: "mail-review.correction.statusExplain",
    defaultMessage: "Follows from the category. For another status, move the application in the Tracker.",
  },
  statusNeedsApplication: {
    id: "mail-review.correction.statusNeedsApplication",
    defaultMessage: "Choose an application first",
  },
  noMatches: { id: "mail-review.correction.noMatches", defaultMessage: "No matches" },
  nextField: {
    id: "mail-review.correction.nextField",
    defaultMessage: "Next field",
    description: "Footer hint next to the Tab key",
  },
  choose: {
    id: "mail-review.correction.choose",
    defaultMessage: "Choose",
    description: "Footer hint next to ↵",
  },
  cancel: { id: "mail-review.correction.cancel", defaultMessage: "Cancel" },
  save: { id: "mail-review.correction.save", defaultMessage: "Save correction" },
  hint: {
    id: "mail-review.correction.hint",
    defaultMessage: "Tab moves to the next field. Enter chooses. {saveKeys} saves.",
    description: "Screen-reader description of the search field; {saveKeys} is the spoken shortcut",
  },
});

export type CorrectionField = "category" | "application";

const FIELDS: readonly CorrectionField[] = ["category", "application"];

/** `applicationId` "new" creates the application the email names. */
export interface CorrectionDraft {
  readonly category: MailCategory;
  readonly applicationId: string | null;
}

export const NEW_APPLICATION = "new";

/** Status a new application from an email starts in, before the email's move. */
export const NEW_APPLICATION_STATUS: ApplicationStatus = "applied";

/** The classifier's proposal the correction starts from. */
export interface CorrectionOrigin {
  readonly category: MailCategory;
  readonly suggestedStatus: ApplicationStatus | null;
}

/**
 * The status move saving `draft` makes (mirrors the `mailMessageReviewed` trigger): the
 * classifier's suggestion while the category is unchanged, else the category's status; applied
 * only when it is a forward move or a decision. Null: no status change.
 */
export function correctionMove(
  draft: CorrectionDraft,
  options: MailCorrectionVM,
  origin: CorrectionOrigin,
): StatusVM | null {
  if (draft.applicationId === null) return null;
  const target =
    draft.category === origin.category && origin.suggestedStatus !== null
      ? origin.suggestedStatus
      : categoryTargetStatus(draft.category, false);
  const from =
    draft.applicationId === NEW_APPLICATION
      ? NEW_APPLICATION_STATUS
      : options.applications.find((application) => application.id === draft.applicationId)?.status.key;
  if (target === null || from === undefined) return null;
  const check = canTransition(from, target, "user");
  if (!check.allowed || (check.direction !== "forward" && check.direction !== "exit")) return null;
  return options.statuses.find((status) => status.key === target) ?? null;
}

const itemClass =
  "text-callout text-fg-primary data-[selected=true]:bg-surface-hover flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 py-1";

interface Option {
  readonly value: string;
  readonly label: string;
  readonly leading?: ReactNode;
}

export interface CorrectionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: MailCorrectionVM;
  /** Values the popover opens with (the proposal as shown). */
  initial: CorrectionDraft;
  /** The classifier's proposal (decides the status move, `correctionMove`). */
  origin: CorrectionOrigin;
  /** "Nordlicht Mobility · Frontend Engineer": what Create application would create. */
  newApplicationLabel: string;
  onSave: (draft: CorrectionDraft) => void;
}

/** Renders the anchor (place it right before the review card) and the popover. */
export function CorrectionPopover({ open, onOpenChange, ...form }: CorrectionPopoverProps) {
  const intl = useIntl();
  // There's no trigger (M, the card's Change… and the row's ✎ all open it), so focus goes back by hand.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor className="h-0" />
      <Popover.Portal>
        <Popover.Content
          // Beside the card, over the list pane: the proposal and the email stay readable while
          // correcting (Radix flips it over the pane when the window is too narrow).
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          aria-label={intl.formatMessage(messages.title)}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // After a save the opener's row may be gone: continue at the selected row.
            const target = opener.current?.isConnected
              ? opener.current
              : document.querySelector<HTMLElement>('[data-nav-id][aria-current="true"]');
            target?.focus();
          }}
          className="bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) flex max-h-(--radix-popover-content-available-height) w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border"
        >
          <CorrectionForm {...form} onCancel={() => onOpenChange(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CorrectionForm({
  options,
  initial,
  origin,
  newApplicationLabel,
  onSave,
  onCancel,
}: Omit<CorrectionPopoverProps, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const intl = useIntl();
  const idBase = useId();
  const hintId = `${idBase}-hint`;
  const [draft, setDraft] = useState(initial);
  const [field, setField] = useState<CorrectionField>("category");
  const [query, setQuery] = useState("");

  const applicationLabel = (id: string | null): string => {
    if (id === NEW_APPLICATION)
      return intl.formatMessage(messages.newApplication, { application: newApplicationLabel });
    return (
      options.applications.find((application) => application.id === id)?.label ??
      intl.formatMessage(messages.noApplication)
    );
  };
  const categoryLabel = options.categories.find((category) => category.key === draft.category)?.label ?? "";
  const move = correctionMove(draft, options, origin);
  const statusSummaryId = `${idBase}-status`;

  const lists: Readonly<
    Record<CorrectionField, { readonly placeholder: string; readonly options: readonly Option[] }>
  > = {
    category: {
      placeholder: intl.formatMessage(messages.searchCategory),
      options: options.categories.map((category) => ({ value: category.key, label: category.label })),
    },
    application: {
      placeholder: intl.formatMessage(messages.searchApplication),
      options: [
        {
          value: NEW_APPLICATION,
          label: intl.formatMessage(messages.createApplication, { application: newApplicationLabel }),
          leading: (
            <Plus aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
          ),
        },
        ...options.applications.map((application) => ({
          value: application.id,
          label: application.label,
          leading: <StatusPill status={application.status} size="sm" />,
        })),
        { value: "none", label: intl.formatMessage(messages.noApplication) },
      ],
    },
  };
  const current: Readonly<Record<CorrectionField, string>> = {
    category: draft.category,
    application: draft.applicationId ?? "none",
  };
  const list = lists[field];
  const [highlight, setHighlight] = useState(() => labelOf(lists.category.options, current.category));

  const goTo = (next: CorrectionField, values: Readonly<Record<CorrectionField, string>> = current) => {
    setField(next);
    setQuery("");
    setHighlight(labelOf(lists[next].options, values[next]));
  };

  const choose = (value: string) => {
    if (field === "application") {
      onSave({ ...draft, applicationId: value === "none" ? null : value });
      return;
    }
    const next: CorrectionDraft = { ...draft, category: value as MailCategory };
    setDraft(next);
    goTo("application", { category: next.category, application: next.applicationId ?? "none" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const index = FIELDS.indexOf(field) + (event.shiftKey ? -1 : 1);
      goTo(FIELDS[(index + FIELDS.length) % FIELDS.length] ?? "category");
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave(draft);
    }
  };

  const summary: Readonly<Record<CorrectionField, ReactNode>> = {
    category: categoryLabel,
    application: applicationLabel(draft.applicationId),
  };

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <p className="text-headline px-4 pt-3 pb-2">{intl.formatMessage(messages.title)}</p>
      <div role="tablist" aria-label={intl.formatMessage(messages.title)} className="flex flex-col px-2">
        {FIELDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            id={`${idBase}-tab-${candidate}`}
            aria-selected={candidate === field}
            aria-controls={`${idBase}-panel`}
            tabIndex={-1}
            onClick={() => goTo(candidate)}
            className={cx(
              "text-callout grid min-h-8 grid-cols-[96px_1fr] items-center gap-2 rounded-md px-2 py-1 text-left",
              candidate === field ? "bg-surface-selected" : "hover:bg-surface-hover",
            )}
          >
            <span className={candidate === field ? "text-fg-primary font-medium" : "text-fg-secondary"}>
              {intl.formatMessage(messages[candidate])}
            </span>
            <span className="text-fg-primary min-w-0 text-pretty">{summary[candidate]}</span>
          </button>
        ))}
      </div>
      {/* What saving does to the status: derived, not chosen (see the file comment). */}
      <div
        id={statusSummaryId}
        className="text-callout mx-2 grid min-h-8 grid-cols-[96px_1fr] items-start gap-2 px-2 py-1"
      >
        <span className="text-fg-secondary">{intl.formatMessage(messages.status)}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-fg-primary flex flex-wrap items-center gap-1.5">
            {move
              ? intl.formatMessage(messages.statusMovesTo, {
                  status: <StatusPill key="status" status={move} size="sm" />,
                })
              : intl.formatMessage(messages.noStatusChange)}
          </span>
          <span className="text-footnote text-fg-secondary">
            {draft.applicationId === null
              ? intl.formatMessage(messages.statusNeedsApplication)
              : intl.formatMessage(messages.statusExplain)}
          </span>
        </span>
      </div>
      <Command
        id={`${idBase}-panel`}
        role="tabpanel"
        aria-labelledby={`${idBase}-tab-${field}`}
        label={intl.formatMessage(messages[field])}
        value={highlight}
        onValueChange={setHighlight}
        loop
        className="border-line-subtle mt-2 flex min-h-0 flex-col border-t"
      >
        <div className="border-line-subtle flex items-center gap-2 border-b px-4">
          <Search aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
          <Command.Input
            // Each field opens with an empty query, focused, so typing filters right away.
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={list.placeholder}
            aria-describedby={`${hintId} ${statusSummaryId}`}
            className="placeholder:text-fg-tertiary text-callout h-10 flex-1 bg-transparent outline-none"
          />
        </div>
        <Command.List className="max-h-64 overflow-y-auto p-1.5">
          <Command.Empty className="text-fg-secondary text-callout px-2 py-4 text-center">
            {intl.formatMessage(messages.noMatches)}
          </Command.Empty>
          {list.options.map((option) => (
            <Command.Item
              key={option.value}
              value={option.label}
              onSelect={() => choose(option.value)}
              className={itemClass}
            >
              {option.leading}
              <span className="min-w-0 flex-1">{option.label}</span>
              {option.value === current[field] && (
                <Check aria-hidden="true" className="text-accent-text size-4 shrink-0" strokeWidth={2} />
              )}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
      {/* The search field stays focused while Tab switches fields: say which field it searches now. */}
      <p className="sr-only" aria-live="polite">
        {intl.formatMessage(messages[field])}
      </p>
      <p id={hintId} className="sr-only">
        {intl.formatMessage(messages.hint, {
          saveKeys: spokenAlternatives("Mod+Enter", chrome.platform, intl),
        })}
      </p>
      <div className="border-line-subtle flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2">
        <span aria-hidden="true" className="text-caption1 text-fg-secondary flex items-center gap-1.5">
          <Keycaps keys="Tab" />
          {intl.formatMessage(messages.nextField)}
        </span>
        <span aria-hidden="true" className="text-caption1 text-fg-secondary flex items-center gap-1.5">
          <Keycaps keys="Enter" />
          {intl.formatMessage(messages.choose)}
        </span>
        <span className="ms-auto flex gap-2">
          <Button size="sm" variant="plain" onClick={onCancel}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button size="sm" variant="primary" shortcut="Mod+Enter" onClick={() => onSave(draft)}>
            {intl.formatMessage(messages.save)}
          </Button>
        </span>
      </div>
    </div>
  );
}

function labelOf(options: readonly Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "";
}
