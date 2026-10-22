/**
 * What the email is about (mail-review.md "Details rail", Lemni Details / Linear Properties):
 * company, role, the linked application, contact, extracted dates and the meeting link. The right
 * rail from 1440 px; below that it folds into the reading pane under the email.
 */
import { ExternalLink, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { destinationIcons } from "../../components/icons";
import { openExternal } from "../../lib/desktop";
import { cx } from "../../shared/cx";
import { ApplicationSummaryBlock } from "../../shared/ui/ApplicationSummaryBlock";
import { Button } from "../../shared/ui/Button";
import { CompanyChip } from "../../shared/ui/Company";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { StatusPill } from "../../shared/ui/StatusPill";
import type { MailDetailsVM, MailReviewModel } from "./model";

const messages = defineMessages({
  company: { id: "mail-review.details.company", defaultMessage: "Company" },
  role: { id: "mail-review.details.role", defaultMessage: "Role" },
  application: { id: "mail-review.details.application", defaultMessage: "Application" },
  contact: { id: "mail-review.details.contact", defaultMessage: "Contact" },
  meeting: { id: "mail-review.details.meeting", defaultMessage: "Meeting link" },
  openMeeting: {
    id: "mail-review.details.openMeeting",
    defaultMessage: "Open meeting link in your browser",
  },
});

export function MailDetails({
  details,
  copy,
  layout,
  onOpenApplication,
  onCreateApplication,
}: {
  details: MailDetailsVM;
  copy: MailReviewModel["copy"];
  /** `rail`: its own column with the application summary; `folded`: a section in the reading pane. */
  layout: "rail" | "folded";
  onOpenApplication: (applicationId: string) => void;
  /** Review items only: opens the correction popover at Application. */
  onCreateApplication: (() => void) | null;
}) {
  const intl = useIntl();
  const headingId = useId();
  const { application, contact } = details;
  const rows: { readonly term: string; readonly value: ReactNode }[] = [
    {
      term: intl.formatMessage(messages.company),
      value: <CompanyChip company={details.company} size="sm" />,
    },
    ...(details.role ? [{ term: intl.formatMessage(messages.role), value: details.role }] : []),
    // The rail shows the application in its own summary block below.
    ...(layout === "rail" && application
      ? []
      : [
          {
            term: intl.formatMessage(messages.application),
            value: application ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span>{application.label}</span>
                {layout === "folded" && <StatusPill status={application.summary.status} size="sm" />}
              </span>
            ) : (
              <span className="text-fg-tertiary">{copy.noApplication}</span>
            ),
          },
        ]),
    ...(contact
      ? [
          {
            term: intl.formatMessage(messages.contact),
            value: (
              <span className="flex flex-col">
                <span>{contact.role ? `${contact.name} · ${contact.role}` : contact.name}</span>
                {contact.email && <span className="text-fg-secondary break-all">{contact.email}</span>}
              </span>
            ),
          },
        ]
      : []),
    ...details.dates.map((date) => ({ term: date.label, value: <RelativeTimeChip time={date.at} /> })),
  ];

  return (
    <section
      aria-labelledby={headingId}
      className={cx("flex flex-col gap-3", layout === "rail" ? "p-4" : "border-line-subtle border-t pt-5")}
    >
      <h2 id={headingId} className="text-headline text-fg-primary">
        {copy.detailsHeading}
      </h2>
      <dl
        className={cx(
          "text-callout grid items-baseline gap-x-4 gap-y-2",
          layout === "rail" ? "grid-cols-1" : "grid-cols-[max-content_1fr]",
        )}
      >
        {rows.map((row) => (
          <div key={row.term} className="contents">
            <dt className={cx("text-fg-secondary", layout === "rail" && "text-footnote -mb-1.5")}>
              {row.term}
            </dt>
            <dd className="text-fg-primary min-w-0">{row.value}</dd>
          </div>
        ))}
        {details.meetingUrl && (
          <div className="contents">
            <dt className={cx("text-fg-secondary", layout === "rail" && "text-footnote -mb-1.5")}>
              {intl.formatMessage(messages.meeting)}
            </dt>
            <dd className="min-w-0">
              <Button
                size="sm"
                variant="plain"
                icon={ExternalLink}
                hint={intl.formatMessage(messages.openMeeting)}
                className="-ms-2 max-w-full"
                onClick={() => void openExternal(details.meetingUrl ?? "")}
              >
                <span className="truncate">{details.meetingUrl}</span>
              </Button>
            </dd>
          </div>
        )}
      </dl>
      {application && layout === "rail" && (
        <ApplicationSummaryBlock summary={application.summary} headingLevel={3} className="mt-2" />
      )}
      <div>
        {application ? (
          <Button size="sm" icon={destinationIcons.tracker} onClick={() => onOpenApplication(application.id)}>
            {copy.openApplication}
          </Button>
        ) : (
          onCreateApplication && (
            <Button size="sm" icon={Plus} onClick={onCreateApplication}>
              {copy.createApplication}
            </Button>
          )
        )}
      </div>
    </section>
  );
}
