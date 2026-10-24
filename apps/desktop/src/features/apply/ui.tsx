/**
 * The Apply panels' shared pieces (email composer and external-apply kit): the panel frame, a
 * labelled field, the one-sentence blocker line and the outcome block.
 */
import { CircleCheck, X } from "lucide-react";
import { type ReactNode, type Ref, useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button, IconButton } from "../../shared/ui/Button";

const messages = defineMessages({
  close: {
    id: "apply.email.panel.close",
    defaultMessage: "Close (your draft is kept)",
    description: "Close button of the Apply panel; the draft stays for this session",
  },
  viewInTracker: { id: "apply.email.panel.viewInTracker", defaultMessage: "View in Tracker" },
  done: { id: "apply.email.panel.done", defaultMessage: "Done" },
});

/** The panel frame: header (title, role, close), scrolling body, footer with the primary action. */
export function Shell({
  title,
  subtitle,
  headingRef,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const intl = useIntl();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="bg-surface-base flex h-full min-h-0 w-full flex-col">
      <header className="border-line-subtle flex items-start gap-3 border-b px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-display text-title3 outline-none">
            {title}
          </h2>
          {subtitle && <p className="text-fg-secondary text-callout mt-0.5 truncate">{subtitle}</p>}
        </div>
        <IconButton icon={X} label={intl.formatMessage(messages.close)} shortcut="Escape" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="border-line-subtle border-t px-5 py-3">{footer}</footer>}
    </section>
  );
}

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";
export const inputClass = `${controlClass} h-8`;
export const textareaClass = `${controlClass} py-1.5 leading-relaxed resize-y`;

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-footnote text-fg-secondary font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-fg-tertiary text-footnote">
          {hint}
        </p>
      )}
    </div>
  );
}

/** SendBlockerLine: exactly one reason, next to the action it blocks. */
export function BlockerLine({ text, id }: { text: string | null; id: string }) {
  return (
    <p id={id} role="status" className="text-fg-secondary text-footnote min-w-0 flex-1">
      {text}
    </p>
  );
}

export function Outcome({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <CircleCheck aria-hidden="true" className="text-success-text mt-1 size-5 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-body font-semibold">{title}</p>
        <p className="text-fg-secondary text-callout">{body}</p>
      </div>
    </div>
  );
}

export function OutcomeFooter({ onView, onClose }: { onView: () => void; onClose: () => void }) {
  const intl = useIntl();
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onView}>
        {intl.formatMessage(messages.viewInTracker)}
      </Button>
      <Button variant="primary" onClick={onClose}>
        {intl.formatMessage(messages.done)}
      </Button>
    </div>
  );
}
