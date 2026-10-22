/**
 * Parts of Mail's list pane: the Updates overflow menu, one re-auth callout per broken inbox
 * (states.md mail.reauth, can't be dismissed), the empty states and the first-use keyboard hint bar.
 */
import { CircleCheck, Inbox, MoreHorizontal, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { Keycaps } from "../../shared/ui/Keycaps";
import { MenuContent, MenuItem } from "../../shared/ui/Menu";
import type { MailEmptyAction, MailNoSelectionVM, MailEmptyVM, MailReauthVM } from "./model";

const messages = defineMessages({
  more: { id: "mail-review.list.more", defaultMessage: "More actions" },
  markAllSeen: { id: "mail-review.list.markAllSeen", defaultMessage: "Mark all as seen" },
  hintBar: {
    id: "mail-review.list.hintBar",
    defaultMessage: "Keyboard shortcuts for reviewing",
    description: "Accessible name of the first-use shortcut hint bar",
  },
  hintConfirm: { id: "mail-review.list.hintConfirm", defaultMessage: "Confirm" },
  hintChange: { id: "mail-review.list.hintChange", defaultMessage: "Change" },
  hintNotJobMail: { id: "mail-review.list.hintNotJobMail", defaultMessage: "Not job mail" },
  hintLater: { id: "mail-review.list.hintLater", defaultMessage: "Review later" },
  hideHints: { id: "mail-review.list.hideHints", defaultMessage: "Hide these tips" },
});

const HINT_BAR_KEY = "bfhr.mail-review.hintBarDismissed";

/** First-use hint bar (Superhuman), dismissible for good; keys mirror the shortcuts sheet. */
export function KeyboardHintBar() {
  const intl = useIntl();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(HINT_BAR_KEY) === "true");
  if (dismissed) return null;
  const hints = [
    { keys: "C", label: intl.formatMessage(messages.hintConfirm) },
    { keys: "M", label: intl.formatMessage(messages.hintChange) },
    { keys: "N", label: intl.formatMessage(messages.hintNotJobMail) },
    { keys: "H", label: intl.formatMessage(messages.hintLater) },
  ];
  return (
    <section
      aria-label={intl.formatMessage(messages.hintBar)}
      className="border-line-subtle bg-surface-sunken flex shrink-0 items-center gap-2 border-t py-1.5 pr-2 pl-4"
    >
      <ul className="text-footnote text-fg-secondary flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
        {hints.map((hint) => (
          <li key={hint.keys} className="flex items-center gap-1.5">
            <Keycaps keys={hint.keys} />
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
      <IconButton
        size="sm"
        icon={X}
        label={intl.formatMessage(messages.hideHints)}
        onClick={() => {
          localStorage.setItem(HINT_BAR_KEY, "true");
          setDismissed(true);
        }}
      />
    </section>
  );
}

/** "Mark all as seen" for Updates (Notion overflow): never touches items waiting for review. */
export function UpdatesMenu({ onMarkAllSeen }: { onMarkAllSeen: () => void }) {
  const intl = useIntl();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton size="sm" icon={MoreHorizontal} label={intl.formatMessage(messages.more)} />
      </DropdownMenu.Trigger>
      <MenuContent align="end" aria-label={intl.formatMessage(messages.more)}>
        <MenuItem icon={CircleCheck} onSelect={onMarkAllSeen}>
          {intl.formatMessage(messages.markAllSeen)}
        </MenuItem>
      </MenuContent>
    </DropdownMenu.Root>
  );
}

export function ReauthCallouts({
  reauth,
  onReconnect,
}: {
  reauth: readonly MailReauthVM[];
  onReconnect: (accountId: string) => void;
}) {
  if (reauth.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      {reauth.map((account) => (
        <InlineAlert
          key={account.accountId}
          tone="warning"
          title={account.title}
          action={{ label: account.actionLabel, onClick: () => onReconnect(account.accountId) }}
        >
          <p className="text-fg-secondary text-footnote">{account.body}</p>
        </InlineAlert>
      ))}
    </div>
  );
}

/** Empty list pane by kind (states.md "Mail review"). */
export function ListEmpty({
  empty,
  onAction,
}: {
  empty: MailEmptyVM | (MailNoSelectionVM & { readonly kind: "caughtUp" });
  onAction: (target: MailEmptyAction) => void;
}) {
  const primary = empty.action && {
    label: empty.action.label,
    onClick: () => onAction(empty.action?.target ?? "showAll"),
  };
  const body = empty.body ?? empty.title;
  switch (empty.kind) {
    case "noCategoryMail":
      return <EmptyState kind="noResults" body={empty.title} {...(primary && { primary })} />;
    case "caughtUp":
      return (
        <EmptyState
          kind="caughtUp"
          glyph={Inbox}
          title={empty.title}
          body={body}
          {...(primary && { primary })}
        />
      );
    default:
      return <EmptyState kind="caughtUp" title={empty.title} body={body} {...(primary && { primary })} />;
  }
}
