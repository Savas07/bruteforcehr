import type { Answer } from "./index";

const at = new Date("2026-10-20T09:00:00.000Z");

/** Answers shared by the tests and the conformance vectors (scripts/apply-vectors.ts). Not exported from the package. */
export const ANSWERS_SAMPLE: readonly Answer[] = [
  {
    id: "why",
    kind: "qa",
    label: "Why do you want to work here?",
    values: [{ language: "en", text: "I want to build payment systems that people rely on every day." }],
    countries: [],
    currency: null,
    position: 0,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "auth-uk",
    kind: "work_authorization",
    label: "Right to work in the UK",
    values: [{ language: "en", text: "I would need a Skilled Worker visa." }],
    countries: ["GB"],
    currency: null,
    position: 1,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "auth-eu",
    kind: "work_authorization",
    label: "Work authorization",
    values: [
      { language: "en", text: "EU citizen, no work permit needed." },
      { language: "de", text: "EU-Bürger, keine Arbeitserlaubnis nötig." },
    ],
    countries: ["EU"],
    currency: null,
    position: 0,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "salary-eur",
    kind: "salary_expectation",
    label: "Salary expectation",
    values: [
      { language: "en", text: "€70,000–80,000 gross per year" },
      { language: "de", text: "70.000–80.000 € brutto im Jahr" },
    ],
    countries: [],
    currency: "EUR",
    position: 0,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "notice",
    kind: "notice_period",
    label: "Notice period",
    values: [
      { language: "en", text: "One month" },
      { language: "tr", text: "Bir ay" },
      { language: "de", text: "Ein Monat" },
    ],
    countries: [],
    currency: null,
    position: 0,
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "linkedin",
    kind: "link",
    label: "LinkedIn",
    values: [{ language: "en", text: "https://www.linkedin.com/in/deniz-arslan-example" }],
    countries: [],
    currency: null,
    position: 0,
    createdAt: at,
    updatedAt: at,
  },
];
