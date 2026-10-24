/**
 * The User guide's topics in reading order: the guide navigation, the overview cards, previous /
 * next links and each page's title and description all come from here. Pages live at
 * `src/pages/guide/<slug>.md` (keyboard shortcuts: `.astro`, generated from the desktop app).
 */
import type { ScreenName } from "../screens.ts";

export interface GuidePage {
  readonly href: string;
  readonly title: string;
  /** One sentence: the overview card and the page's meta description. */
  readonly description: string;
  /** Screenshot under the page title. */
  readonly screen?: ScreenName;
}

export const GUIDE_PAGES: readonly GuidePage[] = [
  {
    href: "/guide/getting-started/",
    title: "Getting started",
    description:
      "Install the app on Mac, Windows or iPhone, sign in, and set up your CV and what you're looking for.",
    screen: "macToday",
  },
  {
    href: "/guide/jobs/",
    title: "Jobs",
    description:
      "Where jobs come from, how matches are scored, saved searches with alerts, and saving a job from a link.",
    screen: "macJobs",
  },
  {
    href: "/guide/cv-studio/",
    title: "CV Studio",
    description:
      "Import or write your CV, make versions for other roles and languages, use suggestions and export.",
    screen: "macCvEditor",
  },
  {
    href: "/guide/apply/",
    title: "Apply",
    description: "Apply on the company's site or by email, with the right CV and an optional cover letter.",
    screen: "macApply",
  },
  {
    href: "/guide/tracker/",
    title: "Tracker",
    description: "Follow every application from saved to offer in a board, a table or a calendar.",
    screen: "windowsTrackerTable",
  },
  {
    href: "/guide/mail/",
    title: "Mail",
    description: "Connect Gmail, Outlook, iCloud or another inbox, review what it finds and undo any change.",
    screen: "macMailReview",
  },
  {
    href: "/guide/insights/",
    title: "Insights",
    description: "See how far your applications get, where replies come from and how long they take.",
    screen: "macInsights",
  },
  {
    href: "/guide/settings/",
    title: "Settings",
    description: "Job preferences, mail accounts, job sources, notifications, AI, language and updates.",
    screen: "windowsSettingsJobSources",
  },
  {
    href: "/guide/data-and-privacy/",
    title: "Data & privacy",
    description: "What BruteForceHR stores, how to export everything and how to delete your account.",
    screen: "macSettingsDataPrivacy",
  },
  {
    href: "/guide/troubleshooting/",
    title: "Troubleshooting",
    description: "Fixes for installing, signing in, connecting email, sending and syncing.",
  },
  {
    href: "/guide/keyboard-shortcuts/",
    title: "Keyboard shortcuts",
    description: "Every shortcut in the Mac and Windows app, by screen.",
  },
];
