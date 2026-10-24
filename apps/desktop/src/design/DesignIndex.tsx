import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { ScreenTitle } from "../shared/ui/ScreenTitle";
import { designHash, type DesignScreenName, designScreenPaths, designStates } from "./matrix";

const screenTitles: Readonly<Record<DesignScreenName, MessageDescriptor>> = defineMessages({
  demo: { id: "design.index.screen.demo", defaultMessage: "Shared components demo" },
  today: { id: "design.index.screen.today", defaultMessage: "Today" },
  "job-detail": { id: "design.index.screen.jobDetail", defaultMessage: "Job detail" },
  "jobs-search": { id: "design.index.screen.jobsSearch", defaultMessage: "Jobs search and filters" },
  "saved-searches": { id: "design.index.screen.savedSearches", defaultMessage: "Saved searches" },
  "jobs-import": { id: "design.index.screen.jobsImport", defaultMessage: "Import a job from a link" },
  apply: { id: "design.index.screen.apply", defaultMessage: "Apply by email" },
  "tailor-review": { id: "design.index.screen.tailorReview", defaultMessage: "Tailor review" },
  "cover-letter": { id: "design.index.screen.coverLetter", defaultMessage: "Cover letter" },
  "attachment-picker": { id: "design.index.screen.attachmentPicker", defaultMessage: "Attachment picker" },
  "apply-kit": { id: "design.index.screen.applyKit", defaultMessage: "Application kit" },
  "answers-settings": { id: "design.index.screen.answersSettings", defaultMessage: "Settings › Application answers" },
  "cv-editor": { id: "design.index.screen.cvEditor", defaultMessage: "CV editor" },
  "tracker-board": { id: "design.index.screen.trackerBoard", defaultMessage: "Tracker board" },
  "application-detail": { id: "design.index.screen.applicationDetail", defaultMessage: "Application detail" },
  "application-add": { id: "design.index.screen.applicationAdd", defaultMessage: "Log an application" },
  "tracker-table": { id: "design.index.screen.trackerTable", defaultMessage: "Tracker table" },
  "tracker-calendar": { id: "design.index.screen.trackerCalendar", defaultMessage: "Tracker calendar" },
  "mail-review": { id: "design.index.screen.mailReview", defaultMessage: "Mail review" },
  "mail-connect": { id: "design.index.screen.mailConnect", defaultMessage: "Connect your email" },
  insights: { id: "design.index.screen.insights", defaultMessage: "Insights" },
  "settings-mail-accounts": {
    id: "design.index.screen.settingsMail",
    defaultMessage: "Settings › Mail accounts",
  },
  "settings-job-preferences": {
    id: "design.index.screen.settingsJobPreferences",
    defaultMessage: "Settings › Job preferences",
  },
  "settings-notifications": {
    id: "design.index.screen.settingsNotifications",
    defaultMessage: "Settings › Notifications",
  },
  "settings-job-sources": {
    id: "design.index.screen.settingsSources",
    defaultMessage: "Settings › Job sources",
  },
  "settings-companies": {
    id: "design.index.screen.settingsCompanies",
    defaultMessage: "Settings › Companies",
  },
  "settings-ai": { id: "design.index.screen.settingsAi", defaultMessage: "Settings › AI" },
  "settings-general": { id: "design.index.screen.settingsGeneral", defaultMessage: "Settings › General" },
  "settings-data-privacy": {
    id: "design.index.screen.settingsDataPrivacy",
    defaultMessage: "Settings › Data & privacy",
  },
});

const messages = defineMessages({
  title: { id: "design.index.title", defaultMessage: "Design build" },
  intro: {
    id: "design.index.intro",
    defaultMessage:
      "Fixture data from @bfhr/fixtures. Each link forces a state with <code>?fixture</code> and <code>?state</code>; add <code>&theme=dark</code> to override the system appearance.",
  },
  screen: { id: "design.index.screen", defaultMessage: "Screen", description: "Column heading" },
  open: { id: "design.index.open", defaultMessage: "Open" },
  openLabel: {
    id: "design.index.openLabel",
    defaultMessage: "{screen}, {state}",
    description: "Accessible name of a link; {state} is a state key (ready, loading…)",
  },
});

/** `#/design`: every screen in every forced state, one click away (design builds only). */
export function DesignIndex() {
  const intl = useIntl();
  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-8 pt-5 pb-8">
      <ScreenTitle title={intl.formatMessage(messages.title)} />
      <p className="text-fg-secondary mt-1 max-w-180 text-callout">
        {intl.formatMessage(messages.intro, {
          code: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
      </p>
      <table className="mt-6 border-collapse text-callout">
        <thead>
          <tr>
            <th scope="col" className="text-fg-secondary py-2 pr-6 text-left font-medium">
              {intl.formatMessage(messages.screen)}
            </th>
            {designStates.map((state) => (
              <th key={state} scope="col" className="text-fg-secondary px-3 py-2 text-left font-medium">
                {state}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-line-subtle divide-y">
          {(Object.keys(designScreenPaths) as DesignScreenName[]).map((screen) => (
            <tr key={screen}>
              <th scope="row" className="py-2 pr-6 text-left font-medium">
                {intl.formatMessage(screenTitles[screen])}
              </th>
              {designStates.map((state) => (
                <td key={state} className="px-3 py-2">
                  <a
                    className="text-fg-link underline-offset-2 hover:underline"
                    href={designHash(screen, state)}
                    aria-label={intl.formatMessage(messages.openLabel, {
                      screen: intl.formatMessage(screenTitles[screen]),
                      state,
                    })}
                  >
                    {intl.formatMessage(messages.open)}
                  </a>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
