/**
 * `AiBadge` and `AiDisclosureLine` (components.md, decisions.md "AI wording"): AI output is always
 * labelled, with the sparkle glyph and words, never the glyph alone.
 */
import { Sparkles } from "lucide-react";
import { defineMessages, useIntl } from "react-intl";

const messages = defineMessages({
  badge: {
    id: "shared.ui.aiBadge.badge",
    defaultMessage: "AI-assisted",
    description: "Label on AI-written or AI-suggested content",
  },
  disclosure: {
    id: "shared.ui.aiBadge.disclosure",
    defaultMessage: "AI summary · can be wrong",
    description: "Default always-visible disclaimer under AI summaries",
  },
});

/** "AI-assisted" chip with the sparkle, on AI-written or AI-suggested content. */
export function AiBadge() {
  const intl = useIntl();
  return (
    <span className="bg-info-subtle text-info-text inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-caption1 font-medium whitespace-nowrap">
      <Sparkles aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.75} />
      {intl.formatMessage(messages.badge)}
    </span>
  );
}

export interface AiDisclosureLineProps {
  /**
   * The always-visible disclaimer. Default "AI summary · can be wrong" (match summaries); CV and
   * cover-letter suggestions use "Suggested by Claude. Check names, numbers and dates before you use it."
   */
  text?: string;
}

/** One-line AI disclaimer with the sparkle, in secondary footnote text; never hidden or dismissible. */
export function AiDisclosureLine({ text }: AiDisclosureLineProps) {
  const intl = useIntl();
  return (
    <p className="text-fg-secondary flex items-start gap-1.5 text-footnote">
      <Sparkles aria-hidden="true" className="text-info-text mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
      <span>{text ?? intl.formatMessage(messages.disclosure)}</span>
    </p>
  );
}
