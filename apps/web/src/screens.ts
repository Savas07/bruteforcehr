/**
 * App screenshots shown on the Features page and in the User guide: captures of the real app with
 * sample data (desktop: the design harness, `pnpm --filter @bfhr/desktop capture:design`, WebKit for
 * Mac and Chromium for Windows at 1280 × 800; iPhone: `apps/ios/scripts/capture.sh`, iPhone 17 Pro),
 * in the light and dark variant. Alt text describes what each capture shows.
 */
import type { ImageMetadata } from "astro";
import iphoneApplyDark from "./assets/screens/iphone-apply-dark.webp";
import iphoneApplyLight from "./assets/screens/iphone-apply-light.webp";
import iphoneCvEditorDark from "./assets/screens/iphone-cv-editor-dark.webp";
import iphoneCvEditorLight from "./assets/screens/iphone-cv-editor-light.webp";
import iphoneInsightsDark from "./assets/screens/iphone-insights-dark.webp";
import iphoneInsightsLight from "./assets/screens/iphone-insights-light.webp";
import iphoneJobsDark from "./assets/screens/iphone-jobs-dark.webp";
import iphoneJobsLight from "./assets/screens/iphone-jobs-light.webp";
import iphoneMailReviewDark from "./assets/screens/iphone-mail-review-dark.webp";
import iphoneMailReviewLight from "./assets/screens/iphone-mail-review-light.webp";
import iphoneShareSheetDark from "./assets/screens/iphone-share-sheet-dark.webp";
import iphoneShareSheetLight from "./assets/screens/iphone-share-sheet-light.webp";
import iphoneTrackerDark from "./assets/screens/iphone-tracker-dark.webp";
import iphoneTrackerLight from "./assets/screens/iphone-tracker-light.webp";
import macApplicationDetailDark from "./assets/screens/mac-application-detail-dark.webp";
import macApplicationDetailLight from "./assets/screens/mac-application-detail-light.webp";
import macApplyDark from "./assets/screens/mac-apply-dark.webp";
import macApplyLight from "./assets/screens/mac-apply-light.webp";
import macCvEditorDark from "./assets/screens/mac-cv-editor-dark.webp";
import macCvEditorLight from "./assets/screens/mac-cv-editor-light.webp";
import macInsightsDark from "./assets/screens/mac-insights-dark.webp";
import macInsightsLight from "./assets/screens/mac-insights-light.webp";
import macJobsDark from "./assets/screens/mac-jobs-dark.webp";
import macJobsLight from "./assets/screens/mac-jobs-light.webp";
import macMailConnectDark from "./assets/screens/mac-mail-connect-dark.webp";
import macMailConnectLight from "./assets/screens/mac-mail-connect-light.webp";
import macMailReviewQueueDark from "./assets/screens/mac-mail-review-queue-dark.webp";
import macMailReviewQueueLight from "./assets/screens/mac-mail-review-queue-light.webp";
import macSavedSearchesDark from "./assets/screens/mac-saved-searches-dark.webp";
import macSavedSearchesLight from "./assets/screens/mac-saved-searches-light.webp";
import macSettingsDataPrivacyDark from "./assets/screens/mac-settings-data-privacy-dark.webp";
import macSettingsDataPrivacyLight from "./assets/screens/mac-settings-data-privacy-light.webp";
import macTodayDark from "./assets/screens/mac-today-dark.webp";
import macTodayLight from "./assets/screens/mac-today-light.webp";
import windowsCvEditorDark from "./assets/screens/windows-cv-editor-dark.webp";
import windowsCvEditorLight from "./assets/screens/windows-cv-editor-light.webp";
import windowsSettingsJobSourcesDark from "./assets/screens/windows-settings-job-sources-dark.webp";
import windowsSettingsJobSourcesLight from "./assets/screens/windows-settings-job-sources-light.webp";
import windowsTrackerCalendarDark from "./assets/screens/windows-tracker-calendar-dark.webp";
import windowsTrackerCalendarLight from "./assets/screens/windows-tracker-calendar-light.webp";
import windowsTrackerTableDark from "./assets/screens/windows-tracker-table-dark.webp";
import windowsTrackerTableLight from "./assets/screens/windows-tracker-table-light.webp";

export interface Screen {
  readonly device: "Mac" | "Windows" | "iPhone";
  readonly light: ImageMetadata;
  readonly dark: ImageMetadata;
  readonly alt: string;
}

export const screens = {
  macToday: {
    device: "Mac",
    light: macTodayLight,
    dark: macTodayDark,
    alt: "Today on Mac: the next interview with time, place and people, emails to review, and applications that moved on their own, each with its source.",
  },
  macJobs: {
    device: "Mac",
    light: macJobsLight,
    dark: macJobsDark,
    alt: "Jobs on Mac: filters for work mode, location, seniority, salary and visa sponsorship above a list of 37 jobs; the open job shows “Strong match, 88 of 100” with each requirement checked against a quote from the posting.",
  },
  macSavedSearches: {
    device: "Mac",
    light: macSavedSearchesLight,
    dark: macSavedSearchesDark,
    alt: "Saved searches on Mac: three searches with their filters and alert schedule; the selected one checks daily for “frontend engineer OR product engineer” in Germany and the Netherlands with visa sponsorship.",
  },
  macCvEditor: {
    device: "Mac",
    light: macCvEditorLight,
    dark: macCvEditorDark,
    alt: "CV editor on Mac: an English base CV and its German version in the list, the CV's sections with three suggestions to review, and a live A4 preview.",
  },
  windowsCvEditor: {
    device: "Windows",
    light: windowsCvEditorLight,
    dark: windowsCvEditorDark,
    alt: "CV editor on Windows: the sections of an English base CV with suggestions on three roles, next to a two-page A4 preview.",
  },
  macApply: {
    device: "Mac",
    light: macApplyLight,
    dark: macApplyDark,
    alt: "Apply by email on Mac: a message in German to the address from the job posting, sent from a connected Gmail account, with the German CV attached and a Review email button.",
  },
  windowsTrackerTable: {
    device: "Windows",
    light: windowsTrackerTableLight,
    dark: windowsTrackerTableDark,
    alt: "Tracker table on Windows: 18 active applications with company, role, status, date applied, last activity and next action, plus Import CSV and Export buttons.",
  },
  windowsTrackerCalendar: {
    device: "Windows",
    light: windowsTrackerCalendarLight,
    dark: windowsTrackerCalendarDark,
    alt: "Tracker calendar on Windows: interviews, reminders, deadlines and follow-ups across October, with the next 7 days listed beside it and “Add to calendar (.ics)” on each interview.",
  },
  macApplicationDetail: {
    device: "Mac",
    light: macApplicationDetailLight,
    dark: macApplicationDetailDark,
    alt: "An application on Mac: its stage from Saved to Offer, a timeline where an email moved it to Interviewing with Undo and View source, the interview round with time and meeting link, and a reminder.",
  },
  macMailReview: {
    device: "Mac",
    light: macMailReviewQueueLight,
    dark: macMailReviewQueueDark,
    alt: "Mail on Mac: three job emails to review; the open one is a recruiter message linked to an application, with a quote from the email and Confirm, Change and Not job mail buttons.",
  },
  macMailConnect: {
    device: "Mac",
    light: macMailConnectLight,
    dark: macMailConnectDark,
    alt: "Connect your email on Mac: Gmail, Outlook, iCloud Mail, Yahoo Mail, Yandex Mail, GMX, WEB.DE and other IMAP accounts, how far to look back, and what BruteForceHR reads.",
  },
  macInsights: {
    device: "Mac",
    light: macInsightsLight,
    dark: macInsightsDark,
    alt: "Insights on Mac: 20 applications in 90 days, a 60% response rate, 35% interview rate, 15% offer rate and 7 days to a first response, above a funnel from Applied to Offer.",
  },
  windowsSettingsJobSources: {
    device: "Windows",
    light: windowsSettingsJobSourcesLight,
    dark: windowsSettingsJobSourcesDark,
    alt: "Settings › Job sources on Windows: each job site with whether it's working, when it last found jobs and how many postings it returned.",
  },
  macSettingsDataPrivacy: {
    device: "Mac",
    light: macSettingsDataPrivacyLight,
    dark: macSettingsDataPrivacyDark,
    alt: "Settings › Data & privacy on Mac: Export everything as a ZIP file, with what's included and what isn't, and Delete account.",
  },
  iphoneJobs: {
    device: "iPhone",
    light: iphoneJobsLight,
    dark: iphoneJobsDark,
    alt: "Jobs on iPhone: the search field, the All matches, Saved and saved-search lists, filters, and 37 jobs with salary and “Strong match”.",
  },
  iphoneShareSheet: {
    device: "iPhone",
    light: iphoneShareSheetLight,
    dark: iphoneShareSheetDark,
    alt: "Save job on iPhone, opened from the share sheet: the role, company and location read from a jobs.ashbyhq.com page, with Save and “Save and log as applied”.",
  },
  iphoneCvEditor: {
    device: "iPhone",
    light: iphoneCvEditorLight,
    dark: iphoneCvEditorDark,
    alt: "A CV on iPhone: the Edit and Preview switch above the header, summary and experience of the English base CV.",
  },
  iphoneApply: {
    device: "iPhone",
    light: iphoneApplyLight,
    dark: iphoneApplyDark,
    alt: "Apply on iPhone: choosing the CV (the English base CV is a strong match), an optional cover letter, and whether to send via the company site, a job board or a recruiter's email address.",
  },
  iphoneTracker: {
    device: "iPhone",
    light: iphoneTrackerLight,
    dark: iphoneTrackerDark,
    alt: "Tracker on iPhone: the pipeline with Active, Closed and All, a chip per stage, and applications grouped under Saved and Preparing.",
  },
  iphoneMailReview: {
    device: "iPhone",
    light: iphoneMailReviewLight,
    dark: iphoneMailReviewDark,
    alt: "Mail on iPhone: three emails to review, a note to reconnect one account, and what BruteForceHR thinks each email means, such as a recruiter reaching out.",
  },
  iphoneInsights: {
    device: "iPhone",
    light: iphoneInsightsLight,
    dark: iphoneInsightsDark,
    alt: "Insights on iPhone: 20 applications in 12 weeks, a 60% response rate, 7 interviews, 7 days to a first response, and how far applications get.",
  },
} as const satisfies Record<string, Screen>;

export type ScreenName = keyof typeof screens;
