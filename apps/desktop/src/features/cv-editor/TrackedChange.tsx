/**
 * `TrackedChange` (components.md `InlineDiff` + `TrackedChange`): a pending AI suggestion shown in
 * place of the field it would change. Deletions are struck through, insertions underlined and
 * tinted (never colour alone), with ✓ Use suggestion · ✕ Keep original · Edit at its end and an
 * accent gutter bar. Placeholders ("[X%]") become inline fields and block ✓ until filled (D13).
 */
import { Check, Pencil, Sparkles, X } from "lucide-react";
import { Fragment } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { hasUnfilledPlaceholders, type CvSuggestionVM, type DiffToken } from "./suggestions";

const messages = defineMessages({
  label: {
    id: "cv-editor.tracked.label",
    defaultMessage: "Suggested change: {mode}",
    description: "Accessible name of an inline AI suggestion; {mode} is 'Shorten', 'Add a result'",
  },
  use: { id: "cv-editor.tracked.use", defaultMessage: "Use suggestion" },
  keep: { id: "cv-editor.tracked.keep", defaultMessage: "Keep original" },
  edit: { id: "cv-editor.tracked.edit", defaultMessage: "Edit" },
  editHint: {
    id: "cv-editor.tracked.editHint",
    defaultMessage: "Use it and keep editing",
    description: "Tooltip of Edit on a suggestion",
  },
  fill: {
    id: "cv-editor.tracked.fill",
    defaultMessage: "Your number for {placeholder}",
    description: "Accessible name of the inline field that replaces a placeholder like [X%]",
  },
  fillFirst: {
    id: "cv-editor.tracked.fillFirst",
    defaultMessage: "Fill in {placeholders} with your real numbers first.",
    description: "Why 'Use suggestion' is disabled; {placeholders} lists e.g. '[X%]'",
  },
  disclaimer: {
    id: "cv-editor.tracked.disclaimer",
    defaultMessage: "Suggested by Claude. Check names, numbers and dates before you use it.",
  },
  removed: { id: "cv-editor.tracked.removed", defaultMessage: "Removed", description: "Screen-reader prefix" },
  added: { id: "cv-editor.tracked.added", defaultMessage: "Added", description: "Screen-reader prefix" },
});

const PLACEHOLDER = /(\[[^\]\n]{1,40}\])/u;

function Inserted({
  token,
  suggestion,
  fills,
  onFill,
}: {
  token: DiffToken;
  suggestion: CvSuggestionVM;
  fills: Readonly<Record<string, string>>;
  onFill: (placeholder: string, value: string) => void;
}) {
  const intl = useIntl();
  return (
    <ins className="bg-accent-subtle text-fg-primary decoration-accent-text rounded-xs underline decoration-2 underline-offset-2">
      <span className="sr-only">{intl.formatMessage(messages.added)}: </span>
      {token.text.split(PLACEHOLDER).map((part, index) =>
        suggestion.placeholders.includes(part) ? (
          <input
            key={index}
            value={fills[part] ?? ""}
            placeholder={part}
            aria-label={intl.formatMessage(messages.fill, { placeholder: part })}
            onChange={(event) => onFill(part, event.target.value)}
            size={Math.max(4, (fills[part] ?? part).length + 1)}
            className="border-warning-solid bg-warning-subtle text-fg-primary placeholder:text-warning-text mx-0.5 rounded-xs border px-1 text-callout no-underline"
          />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </ins>
  );
}

export function TrackedChange({
  suggestion,
  fills,
  onFill,
  onUse,
  onKeep,
  onEdit,
}: {
  suggestion: CvSuggestionVM;
  fills: Readonly<Record<string, string>>;
  onFill: (placeholder: string, value: string) => void;
  onUse: () => void;
  onKeep: () => void;
  onEdit: () => void;
}) {
  const intl = useIntl();
  const blocked = hasUnfilledPlaceholders(suggestion.placeholders, fills);
  const blockedReason = blocked
    ? intl.formatMessage(messages.fillFirst, { placeholders: intl.formatList(suggestion.placeholders) })
    : null;
  return (
    <div
      role="group"
      tabIndex={-1}
      data-suggestion-id={suggestion.id}
      aria-label={intl.formatMessage(messages.label, { mode: suggestion.modeLabel })}
      className="border-accent-solid bg-surface-base focus-visible:outline-line-focus rounded-r-md border-l-[3px] py-2 pr-2 pl-3"
    >
      <p className="text-fg-secondary flex items-center gap-1.5 text-footnote">
        <Sparkles aria-hidden className="text-accent-text size-3.5" />
        <span className="text-fg-primary font-semibold">{suggestion.modeLabel}</span>
        <span aria-hidden>·</span>
        <span>{suggestion.reason}</span>
      </p>
      <p className="mt-1.5 text-callout leading-relaxed">
        {suggestion.tokens.map((token, index) => (
          <Fragment key={index}>
            {index > 0 && " "}
            {token.kind === "same" && token.text}
            {token.kind === "del" && (
              <del className="text-fg-secondary decoration-fg-secondary line-through">
                <span className="sr-only">{intl.formatMessage(messages.removed)}: </span>
                {token.text}
              </del>
            )}
            {token.kind === "ins" && (
              <Inserted token={token} suggestion={suggestion} fills={fills} onFill={onFill} />
            )}
          </Fragment>
        ))}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="primary"
          icon={Check}
          shortcut="Mod+Enter"
          disabledReason={blockedReason}
          onClick={onUse}
        >
          {intl.formatMessage(messages.use)}
        </Button>
        <Button size="sm" variant="secondary" icon={X} shortcut="Escape" onClick={onKeep}>
          {intl.formatMessage(messages.keep)}
        </Button>
        <Button
          size="sm"
          variant="plain"
          icon={Pencil}
          hint={intl.formatMessage(messages.editHint)}
          disabledReason={blockedReason}
          onClick={onEdit}
        >
          {intl.formatMessage(messages.edit)}
        </Button>
      </div>
      {blockedReason && <p className="text-warning-text mt-1.5 text-footnote">{blockedReason}</p>}
      <p className="text-fg-tertiary mt-1 text-caption1">{intl.formatMessage(messages.disclaimer)}</p>
    </div>
  );
}
