/**
 * `InlineAlert` (system.md "InlineAlert"): something about the current view, placed above the
 * affected content. Stale data, a section that failed while the rest loaded, an account that needs
 * reconnecting, a CV conflict, a queued write the server rejected. Never blocking, never red alone
 * (icon + text + border).
 */
import { CircleAlert, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../cx";
import { Button, IconButton } from "./Button";

const messages = defineMessages({
  dismiss: {
    id: "shared.ui.inlineAlert.dismiss",
    defaultMessage: "Dismiss",
    description: "Closes an inline alert",
  },
});

export type InlineAlertTone = "info" | "warning" | "error";

const toneSurface: Record<InlineAlertTone, string> = {
  info: "bg-info-subtle border-info-solid/40",
  warning: "bg-warning-subtle border-warning-solid/40",
  error: "bg-danger-subtle border-danger-solid/40",
};

const toneText: Record<InlineAlertTone, string> = {
  info: "text-info-text",
  warning: "text-warning-text",
  error: "text-danger-text",
};

const toneIcon: Record<InlineAlertTone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
};

/**
 * Icon + title + body + one action (+ optional dismiss). `role="status"` for info and warning;
 * errors use `role="alert"` only when `fromAction` says the user's own action caused them (save
 * failed), otherwise they're announced politely too (a section that failed to load).
 */
export function InlineAlert({
  tone,
  title,
  children,
  action,
  onDismiss,
  fromAction = false,
  className,
}: {
  /** `info` (stale data, AI disclosure), `warning` (needs reconnecting, partial success), `error` (failed load or save). */
  tone: InlineAlertTone;
  /** What happened, one sentence: "Couldn't refresh. Showing what was saved at 14:05." */
  title: string;
  /** Why and what to do next, when the title alone doesn't say it. */
  children?: ReactNode;
  /** The one action: "Try again", "Reconnect", "Open original". */
  action?: { readonly label: string; readonly onClick: () => void };
  /** Shows a Dismiss button. Omit for alerts that must stay (a broken mail account). */
  onDismiss?: () => void;
  /** `error` only: the user's own action caused it, so it's announced assertively (`role="alert"`). */
  fromAction?: boolean;
  /** Layout classes (margins, width). */
  className?: string;
}) {
  const intl = useIntl();
  const Icon = toneIcon[tone];
  return (
    <div
      role={tone === "error" && fromAction ? "alert" : "status"}
      className={cx(
        "text-fg-primary flex items-start gap-3 rounded-md border py-2 pr-2 pl-3",
        toneSurface[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className={cx("mt-1 size-4 shrink-0", toneText[tone])} strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <p className={cx("text-callout font-semibold", toneText[tone])}>{title}</p>
        {children !== undefined && <div className="text-callout">{children}</div>}
      </div>
      {action && (
        <Button size="sm" variant="secondary" className="mt-0.5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <IconButton
          icon={X}
          label={intl.formatMessage(messages.dismiss)}
          size="sm"
          className="mt-0.5"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
