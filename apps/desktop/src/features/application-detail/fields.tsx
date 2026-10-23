/**
 * Layout and form pieces the detail page's sections and editors share: a titled section, the
 * modal shell with Cancel / Save, and labelled fields with their hint or problem line. Token
 * classes only; the global `:focus-visible` ring applies.
 */
import { Dialog } from "radix-ui";
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
  cloneElement,
  useId,
  useState,
} from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";

const messages = defineMessages({
  cancel: { id: "application-detail.fields.cancel", defaultMessage: "Cancel" },
  optional: {
    id: "application-detail.fields.optional",
    defaultMessage: "{label} (optional)",
    description: "Field label of an optional field",
  },
});

export const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary w-full rounded-md border px-2";

/** A page or panel section: `h2` title, optional trailing actions, then the content. */
export function Section({
  ref,
  title,
  actions,
  children,
  className,
}: {
  ref?: Ref<HTMLElement>;
  title: string;
  /** Buttons on the title line ("Add", "Export all rounds"). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section ref={ref} aria-labelledby={headingId} className={cx("flex flex-col gap-3", className)}>
      <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id={headingId} className="text-headline text-fg-primary me-auto font-semibold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * A label above its control; `hint` or `problem` below it (the problem replaces the hint and is
 * the control's description). The control gets the ids through `cloneElement`.
 */
export function Field({
  label,
  hint,
  problem,
  optional = false,
  className,
  children,
}: {
  label: string;
  hint?: string | null;
  /** Why the value can't be saved; shown once the user tried to save. */
  problem?: string | null;
  optional?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}) {
  const intl = useIntl();
  const id = useId();
  const noteId = useId();
  const note = problem ?? hint ?? null;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-footnote text-fg-secondary">
        {optional ? intl.formatMessage(messages.optional, { label }) : label}
      </label>
      {cloneElement(children, {
        id,
        ...(note !== null && { "aria-describedby": noteId }),
        ...(problem ? { "aria-invalid": true } : {}),
      })}
      {note !== null && (
        <p id={noteId} className={cx("text-footnote", problem ? "text-danger-text" : "text-fg-tertiary")}>
          {note}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input type="text" {...props} className={cx(controlClass, "h-8", className)} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(controlClass, "resize-y py-1.5 leading-snug", className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(controlClass, "h-8", className)} />;
}

/** A modal editor: title, optional description, the form, then Cancel and the submit button. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitDisabledReason,
  onSubmit,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  /** Why Save is disabled (a required field is empty), or null. */
  submitDisabledReason?: string | null;
  onSubmit: () => void;
  /** 560 px instead of 440 px (the interview editor). */
  wide?: boolean;
  children: ReactNode;
}) {
  const intl = useIntl();
  // These dialogs open from buttons, shortcuts and menus without a Radix trigger (and most are
  // mounted already open): remember what had focus when the dialog opened, before an autofocused
  // field takes it, and return there on close.
  const [opener, setOpener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpener(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          {...(description === undefined && { "aria-describedby": undefined })}
          onCloseAutoFocus={(event) => {
            if (!opener?.isConnected || opener === document.body) return;
            event.preventDefault();
            opener.focus();
          }}
          className={cx(
            "bg-surface-elevated text-fg-primary shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg",
            wide ? "w-[min(560px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))]",
          )}
        >
          <div className="px-5 pt-5 pb-3">
            <Dialog.Title className="font-display text-title3">{title}</Dialog.Title>
            {description !== undefined && (
              <Dialog.Description className="text-fg-secondary mt-1 text-callout">
                {description}
              </Dialog.Description>
            )}
          </div>
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (!submitDisabledReason) onSubmit();
            }}
          >
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pt-1 pb-4">{children}</div>
            <div className="border-line-subtle flex justify-end gap-2 border-t px-5 py-3">
              <Dialog.Close asChild>
                <Button>{intl.formatMessage(messages.cancel)}</Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabledReason={submitDisabledReason}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
