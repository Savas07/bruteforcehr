/**
 * The correction popover behind Change… (`M`; IA.md "Mail", components.md `CategoryPicker` /
 * `ApplicationPicker` / `StatusPicker`): one cmdk list per field, Tab cycles Category →
 * Application → Status, typing filters, Enter chooses and moves on (on Status it saves), Mod+Enter
 * saves from any field, Esc cancels. "Create application" is always the first application option.
 */
import type { ApplicationStatus, MailCategory } from "@bfhr/core";
import { Command } from "cmdk";
import { Check, Plus, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome } from "../../lib/desktop";
import { cx } from "../../shared/cx";
import { spokenAlternatives } from "../../shared/keyboard/keymap";
import { Button } from "../../shared/ui/Button";
import { Keycaps } from "../../shared/ui/Keycaps";
import { StatusPill } from "../../shared/ui/StatusPill";
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
  searchStatus: { id: "mail-review.correction.searchStatus", defaultMessage: "Search statuses" },
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

export type CorrectionField = "category" | "application" | "status";

const FIELDS: readonly CorrectionField[] = ["category", "application", "status"];

/** `applicationId` "new" creates the application the email names. */
export interface CorrectionDraft {
  readonly category: MailCategory;
  readonly applicationId: string | null;
  readonly status: ApplicationStatus | null;
}

export const NEW_APPLICATION = "new";

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
  /** "Nordlicht Mobility · Frontend Engineer": what Create application would create. */
  newApplicationLabel: string;
  onSave: (draft: CorrectionDraft) => void;
}

/** Renders the anchor (place it right before the review card) and the popover. */
export function CorrectionPopover({ open, onOpenChange, ...form }: CorrectionPopoverProps) {
  const intl = useIntl();
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
  const status = options.statuses.find((candidate) => candidate.key === draft.status) ?? null;

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
    status: {
      placeholder: intl.formatMessage(messages.searchStatus),
      // Without an application there is nothing to move: say so instead of listing dead options.
      options: [
        { value: "none", label: intl.formatMessage(messages.noStatusChange) },
        ...(draft.applicationId === null
          ? []
          : options.statuses.map((candidate) => ({ value: candidate.key, label: candidate.label }))),
      ],
    },
  };
  const current: Readonly<Record<CorrectionField, string>> = {
    category: draft.category,
    application: draft.applicationId ?? "none",
    status: draft.status ?? "none",
  };
  const list = lists[field];
  const [highlight, setHighlight] = useState(() => labelOf(lists.category.options, current.category));

  const goTo = (next: CorrectionField, values: Readonly<Record<CorrectionField, string>> = current) => {
    setField(next);
    setQuery("");
    setHighlight(labelOf(lists[next].options, values[next]));
  };

  const choose = (value: string) => {
    let next: CorrectionDraft = draft;
    if (field === "category") next = { ...draft, category: value as MailCategory };
    if (field === "application") {
      const applicationId = value === "none" ? null : value;
      next = { ...draft, applicationId, status: applicationId === null ? null : draft.status };
    }
    if (field === "status") {
      onSave({ ...draft, status: value === "none" ? null : (value as ApplicationStatus) });
      return;
    }
    setDraft(next);
    const index = FIELDS.indexOf(field);
    goTo(FIELDS[index + 1] ?? "status", {
      category: next.category,
      application: next.applicationId ?? "none",
      status: next.status ?? "none",
    });
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
    status: status ? <StatusPill status={status} size="sm" /> : intl.formatMessage(messages.noStatusChange),
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
            aria-describedby={hintId}
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
          {field === "status" && draft.applicationId === null && (
            <p className="text-footnote text-fg-secondary px-2 py-2">
              {intl.formatMessage(messages.statusNeedsApplication)}
            </p>
          )}
        </Command.List>
      </Command>
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
