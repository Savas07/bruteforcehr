/** Site-wide constants shared by the layout, the Astro config and the capture script. */
import { color } from "@bfhr/ui-tokens";

export const SITE_URL = "https://bruteforcehr.web.app";
export const SITE_NAME = "BruteForceHR";
/** One-line product description: home page meta description and the footer. */
export const SITE_DESCRIPTION =
  "Find jobs, tailor your CV and track every application on iPhone, Mac and Windows.";

export const LOCALES = ["en", "tr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Browser UI colour per scheme (`<meta name="theme-color">`): the token canvas the page is drawn on. */
export const THEME_COLOR = {
  light: color.light.surface.canvas,
  dark: color.dark.surface.canvas,
} as const;

/**
 * Public GitHub repo: source, release binaries + notes (the Download and Changelog pages read its
 * Releases at build time) and, per user decision U4, support issues.
 */
export const GITHUB_REPO = "Savas07/bruteforcehr";
export const REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

/**
 * Code-signing state of the published desktop builds (docs/adr/0004-release-updates-signing.md).
 * The Download page shows first-launch instructions while a build is unsigned. Set to `true` in the
 * same change that configures the signing secrets (docs/runbooks/release.md).
 */
export const MAC_BUILD_NOTARIZED = false;
export const WINDOWS_BUILD_SIGNED = false;

/** Apple's TestFlight app on the App Store (needed to install the iPhone beta). */
export const TESTFLIGHT_APP_URL = "https://apps.apple.com/app/testflight/id899247664";

/**
 * New-issue link with a prefilled body. Issues are public, so the template itself repeats the
 * "no personal details" warning shown on the Support page.
 */
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new?${new URLSearchParams({
  body: [
    "### What happened?",
    "",
    "",
    "### What did you expect to happen?",
    "",
    "",
    "### App, version and device",
    "<!-- Settings › About shows the version. For example: Mac app, Windows app or iPhone app. -->",
    "",
    "",
    "<!-- Issues are public. Please don't include email addresses, CV content, message text, or screenshots that show personal details. -->",
  ].join("\n"),
}).toString()}`;

/** Existing issues, so a visitor can check whether the problem is already known. */
export const ISSUES_URL = `${REPO_URL}/issues?q=is%3Aissue`;

export interface NavItem {
  href: string;
  label: string;
}

/** Header navigation. Only pages that exist are listed; Features joins when that page ships. */
export const HEADER_NAV: readonly NavItem[] = [
  { href: "/download/", label: "Download" },
  { href: "/changelog/", label: "Changelog" },
  { href: "/support/", label: "Support" },
];

/** Footer link groups. Legal links stay on every page (OAuth consent screen and App Store reviewers). */
export const FOOTER_NAV: readonly { title: string; items: readonly NavItem[] }[] = [
  {
    title: "Product",
    items: [
      { href: "/download/", label: "Download" },
      { href: "/changelog/", label: "Changelog" },
    ],
  },
  {
    title: "Help",
    items: [
      { href: "/support/", label: "Support" },
      { href: "/support/#contact", label: "Report a problem" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "/privacy/", label: "Privacy Policy" },
      { href: "/terms/", label: "Terms of Use" },
    ],
  },
];
