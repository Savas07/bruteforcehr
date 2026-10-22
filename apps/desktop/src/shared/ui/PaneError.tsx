/**
 * `PaneError` (system.md "Feedback", states.md rule 5): a whole pane couldn't load and nothing is
 * cached. Scoped to its pane under real chrome; the other panes keep working. Copy follows
 * what + why + how to fix in first person plural, never a raw code in the body: codes go in the
 * "Show details" disclosure, with "Copy details" for support. Focus moves to "Try again" on mount.
 */
import { ChevronRight, CircleAlert, type LucideIcon } from "lucide-react";
import { Collapsible } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

/** A pane-sized error with "Try again" (focused on mount) and an optional second way out. */
export function PaneError({
  title,
  body,
  onRetry,
  secondary,
  details,
  glyph: Glyph = CircleAlert,
}: {
  /** What failed, per screen: "We couldn't load your applications". */
  title: string;
  /** Why + reassurance: "Our server didn't respond. Your saved data is safe. Try again in a moment." */
  body: string;
  /** Shows "Try again". Omit for not-found errors, which offer navigation instead (`secondary`). */
  onRetry?: () => void;
  /** "Go back", "Back to Jobs". Gets the initial focus when there's no `onRetry`. */
  secondary?: { readonly label: string; readonly onClick: () => void };
  /** Technical details for support (error code, request id); behind a disclosure, never in the body. */
  details?: string;
  /** Monochrome line glyph (`fg-tertiary`, 32 px). Default: a circled exclamation mark. */
  glyph?: LucideIcon;
}) {
  const focusTarget = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    focusTarget.current?.focus();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-8 text-center">
      <Glyph aria-hidden="true" className="text-fg-tertiary size-8" strokeWidth={1.75} />
      <div className="flex max-w-90 flex-col gap-1">
        <h2 className="text-title3 text-fg-primary">{title}</h2>
        <p className="text-body text-fg-secondary">{body}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button ref={focusTarget} variant="primary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {secondary && (
          <Button ref={onRetry ? undefined : focusTarget} variant="secondary" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
      </div>
      {details !== undefined && <ErrorDetails details={details} />}
    </div>
  );
}

function ErrorDetails({ details }: { details: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="flex w-full max-w-90 flex-col items-center gap-2"
    >
      <Collapsible.Trigger className="text-fg-secondary hover:text-fg-primary group inline-flex h-6 items-center gap-1 rounded-sm px-1 text-footnote">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform duration-(--bfhr-duration-fast) ease-standard group-data-[state=open]:rotate-90"
          strokeWidth={1.75}
        />
        {open ? "Hide details" : "Show details"}
      </Collapsible.Trigger>
      <Collapsible.Content className="flex w-full flex-col items-start gap-2 text-left">
        <pre className="bg-surface-sunken text-fg-secondary w-full overflow-x-auto rounded-sm p-2 font-mono text-caption1 break-all whitespace-pre-wrap select-text">
          {details}
        </pre>
        <Button
          size="sm"
          variant="plain"
          onClick={() => {
            void navigator.clipboard.writeText(details).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy details"}
        </Button>
        <span role="status" className="sr-only">
          {copied ? "Details copied" : ""}
        </span>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
