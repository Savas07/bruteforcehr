import { type AppConfig, DEFAULT_PROFILE_SETTINGS, type Device, type Profile } from "@bfhr/core";
import { daysAgo } from "./time";

/** Fixture user: Deniz Aksoy, mid-level frontend/product engineer in Istanbul. */
export const FIXTURE_UID = "fixture-user-deniz";

export const profile: Profile = {
  id: FIXTURE_UID,
  fullName: "Deniz Aksoy",
  email: "deniz.aksoy@example.com",
  phone: "+90 532 555 01 47",
  headline: "Frontend & product engineer · React, TypeScript, design systems",
  links: [
    { label: "Portfolio", url: "https://deniz.example.com" },
    { label: "GitHub", url: "https://github.com/deniz-aksoy-example" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/deniz-aksoy-example" },
  ],
  targetRoles: [
    "Frontend Engineer",
    "Product Engineer",
    "Senior Frontend Engineer",
    "Design Systems Engineer",
  ],
  seniority: "mid",
  locations: [
    { label: "Istanbul", city: "Istanbul", countryCode: "TR", relocation: false },
    { label: "Berlin", city: "Berlin", countryCode: "DE", relocation: true },
    { label: "Amsterdam", city: "Amsterdam", countryCode: "NL", relocation: true },
    { label: "London", city: "London", countryCode: "GB", relocation: true },
    { label: "United States (remote)", city: null, countryCode: "US", relocation: false },
  ],
  remotePreferences: ["remote", "hybrid"],
  salaryFloor: { amount: 55_000, currency: "EUR", period: "year" },
  workAuthorization: [
    { region: "TR", status: "citizen" },
    { region: "EU", status: "needs_sponsorship" },
    { region: "GB", status: "needs_sponsorship" },
    { region: "US", status: "needs_sponsorship" },
  ],
  languages: [
    { language: "tr", level: "native" },
    { language: "en", level: "C1" },
    { language: "de", level: "A2" },
  ],
  timezone: "Europe/Istanbul",
  uiLanguage: "en",
  hiddenCompanies: [{ name: "Spinwell Gaming", domain: "spinwell.example.com", hiddenAt: daysAgo(20) }],
  skills: [
    "react",
    "typescript",
    "javascript",
    "next.js",
    "react native",
    "node.js",
    "graphql",
    "css",
    "tailwind css",
    "design systems",
    "accessibility",
    "storybook",
    "jest",
    "playwright",
    "figma",
    "web performance",
    "i18n",
    "vite",
    "redux",
    "a/b testing",
  ],
  defaultCvId: "cv-en",
  onboardingCompletedAt: daysAgo(70),
  settings: {
    ...DEFAULT_PROFILE_SETTINGS,
    aiMailTextAllowed: true,
    quietHours: { start: "22:30", end: "08:00" },
  },
  createdAt: daysAgo(70, -0.5),
  updatedAt: daysAgo(3),
};

export const devices: Device[] = [
  {
    id: "device-iphone",
    platform: "ios",
    pushToken: "fixture-apns-token-0f3c9a7e51d24b6e",
    appVersion: "0.1.0",
    osVersion: "26.5",
    locale: "en-GB",
    lastSeenAt: daysAgo(0, -1),
    createdAt: daysAgo(70),
  },
  {
    id: "device-macbook",
    platform: "macos",
    pushToken: null,
    appVersion: "0.1.0",
    osVersion: "26.5",
    locale: "en-GB",
    lastSeenAt: daysAgo(0, -0.2),
    createdAt: daysAgo(69),
  },
];

/** Public `appConfig/{platform}` documents (not user data). */
export const appConfigs: AppConfig[] = [
  {
    id: "ios",
    latestVersion: "0.1.0",
    minSupportedVersion: "0.1.0",
    downloadUrl: null,
    releaseNotesUrl: "https://github.com/Savas07/bruteforcehr-releases/releases/tag/v0.1.0",
    featureFlags: { mailIntelligence: false, insights: false },
    updatedAt: daysAgo(5),
  },
  {
    id: "macos",
    latestVersion: "0.1.0",
    minSupportedVersion: "0.1.0",
    downloadUrl: "https://github.com/Savas07/bruteforcehr-releases/releases/latest",
    releaseNotesUrl: "https://github.com/Savas07/bruteforcehr-releases/releases/tag/v0.1.0",
    featureFlags: { mailIntelligence: false, insights: false },
    updatedAt: daysAgo(5),
  },
  {
    id: "windows",
    latestVersion: "0.1.0",
    minSupportedVersion: "0.1.0",
    downloadUrl: "https://github.com/Savas07/bruteforcehr-releases/releases/latest",
    releaseNotesUrl: "https://github.com/Savas07/bruteforcehr-releases/releases/tag/v0.1.0",
    featureFlags: { mailIntelligence: false, insights: false },
    updatedAt: daysAgo(5),
  },
];
