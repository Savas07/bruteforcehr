/**
 * The job emails linked to the application (Mail links them; the timeline shows what they
 * changed). Each opens in Mail; nothing shows when none is linked.
 */
import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { defineMessages, useIntl } from "react-intl";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { Section } from "./fields";
import type { LinkedEmailVM } from "./model";

const messages = defineMessages({
  title: { id: "application-detail.emails.title", defaultMessage: "Emails" },
});

export function EmailsSection({ emails }: { emails: readonly LinkedEmailVM[] }) {
  const intl = useIntl();
  if (emails.length === 0) return null;
  return (
    <Section title={intl.formatMessage(messages.title)}>
      <ul className="flex flex-col gap-1">
        {emails.map((email) => (
          <li key={email.messageId}>
            <Link
              to="/mail/review/$messageId"
              params={{ messageId: email.messageId }}
              className="hover:bg-surface-hover -mx-2 flex gap-2.5 rounded-md px-2 py-1.5"
            >
              <Mail aria-hidden="true" className="text-fg-secondary mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-callout text-fg-primary truncate">{email.subject}</span>
                <span className="text-footnote text-fg-secondary flex flex-wrap gap-x-1.5">
                  <span>{email.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{email.sender}</span>
                  <span aria-hidden="true">·</span>
                  <RelativeTimeChip time={email.receivedAt} />
                </span>
                {email.state && <span className="text-footnote text-fg-tertiary">{email.state}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
