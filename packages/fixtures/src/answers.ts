import type { Answer } from "@bfhr/core";
import { daysAgo } from "./time";

/** Deniz's answers library (Settings › Application answers), copied from the application kit. */
export const answers: Answer[] = [
  {
    id: "answer-auth-tr",
    kind: "work_authorization",
    label: "Work authorization",
    values: [
      { language: "en", text: "Turkish citizen, no work permit needed in Turkey." },
      { language: "tr", text: "T.C. vatandaşıyım, çalışma izni gerekmiyor." },
    ],
    countries: ["TR"],
    currency: null,
    position: 0,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
  },
  {
    id: "answer-auth-eu",
    kind: "work_authorization",
    label: "Work authorization",
    values: [
      { language: "en", text: "I'd need visa sponsorship (EU Blue Card); I can relocate within 3 months." },
      {
        language: "de",
        text: "Ich benötige ein Visum (Blaue Karte EU) und kann innerhalb von 3 Monaten umziehen.",
      },
    ],
    countries: ["EU"],
    currency: null,
    position: 1,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(12),
  },
  {
    id: "answer-notice",
    kind: "notice_period",
    label: "Notice period",
    values: [
      { language: "en", text: "Four weeks" },
      { language: "tr", text: "Dört hafta" },
      { language: "de", text: "Vier Wochen" },
    ],
    countries: [],
    currency: null,
    position: 0,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
  },
  {
    id: "answer-salary-eur",
    kind: "salary_expectation",
    label: "Salary expectation",
    values: [
      { language: "en", text: "€60,000–70,000 gross per year" },
      { language: "de", text: "60.000–70.000 € brutto pro Jahr" },
    ],
    countries: [],
    currency: "EUR",
    position: 0,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(12),
  },
  {
    id: "answer-github",
    kind: "link",
    label: "GitHub",
    values: [{ language: "en", text: "https://github.com/deniz-aksoy-example" }],
    countries: [],
    currency: null,
    position: 0,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
  },
  {
    id: "answer-why",
    kind: "qa",
    label: "Why do you want to work with us?",
    values: [
      {
        language: "en",
        text: "I enjoy building design systems that make product teams faster, and your team ships the kind of product I want to work on.",
      },
    ],
    countries: [],
    currency: null,
    position: 0,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
  },
];
