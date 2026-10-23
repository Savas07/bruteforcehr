import type { EntityPolicy } from "../src/grounding/grounding";

/**
 * Grounding checker cases (offline, CI-safe; run by src/grounding/grounding.test.ts). Each pairs
 * a source with a model output: `ungrounded` lists exactly the spans the checker must flag (empty
 * for a faithful output); `repaired`, when given, is the expected placeholder repair.
 */
export interface GroundingCase {
  id: string;
  source: string;
  output: string;
  entities: EntityPolicy;
  ungrounded: string[];
  repaired?: string;
}

export const GROUNDING_CASES: readonly GroundingCase[] = [
  // Faithful outputs: rephrased, reformatted, translated, but nothing new.
  {
    id: "ok-en-rephrase",
    source: "Increased conversion by 12% in Q3 2021 at Acme Corp using A/B tests.",
    output: "Raised conversion 12% in Q3 2021 at Acme Corp through A/B tests.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-tr-suffixes",
    source: "2019'dan beri Siemens'te 5 kişilik ekibi yönettim.",
    output: "Siemens'te 5 kişilik ekibe 2019'dan bu yana liderlik ettim.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-de-nouns",
    source: "Leitung eines Teams von 8 Entwicklern bei der Lumenfold GmbH seit März 2020.",
    output: "Seit März 2020 Führung von 8 Entwicklern bei der Lumenfold GmbH.",
    entities: "hard",
    ungrounded: [],
  },
  {
    id: "ok-money-notation",
    source: "Managed a budget of €1,200,000 across 4 regions.",
    output: "Managed a €1.2M budget across 4 regions.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-tr-percent-prefix",
    source: "Lojistik maliyetlerini %18 düşürdüm.",
    output: "Lojistik maliyetlerini %18 oranında azalttım.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-de-decimal-scale",
    source: "Umsatzsteigerung um 1,5 Mio. € im Jahr 2023.",
    output: "2023 den Umsatz um 1,5 Mio. € gesteigert.",
    entities: "hard",
    ungrounded: [],
  },
  {
    id: "ok-translate-degree",
    source: "Boğaziçi Üniversitesi, Bilgisayar Mühendisliği Lisans, 2015",
    output: "B.Sc. in Computer Engineering, Boğaziçi University, 2015",
    entities: "hard",
    ungrounded: [],
  },
  {
    id: "ok-date-notation",
    source: "Backend Engineer, 03/2019 – 12/2020",
    output: "Backend Engineer, Mar 2019 – Dec 2020",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-placeholder",
    source: "Improved the onboarding flow.",
    output: "Redesigned the onboarding flow, lifting activation by [X%] within [X] weeks.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-number-word",
    source: "Led a team of three engineers.",
    output: "Led 3 engineers.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-tech-tokens",
    source: "Built services in Node.js and PostgreSQL on AWS with CI/CD.",
    output: "Built Node.js services backed by PostgreSQL on AWS, shipped through CI/CD.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  {
    id: "ok-translate-languages",
    source: "Englisch (C1), Deutsch (Muttersprache)",
    output: "İngilizce (C1), Almanca (anadil)",
    entities: "hard",
    ungrounded: [],
  },
  {
    id: "ok-context-company",
    source: "Kestrel Analytics Ltd\nBuilt dashboards for the sales team.",
    output: "Built sales dashboards at Kestrel Analytics.",
    entities: "hard+capitalized",
    ungrounded: [],
  },
  // Fabrications.
  {
    id: "bad-invented-percent",
    source: "Improved checkout performance.",
    output: "Improved checkout performance by 35%.",
    entities: "hard+capitalized",
    ungrounded: ["35%"],
    repaired: "Improved checkout performance by [X%].",
  },
  {
    id: "bad-changed-percent",
    source: "Reduced costs by 18%.",
    output: "Reduced costs by 28%.",
    entities: "hard+capitalized",
    ungrounded: ["28%"],
    repaired: "Reduced costs by [X%].",
  },
  {
    id: "bad-changed-year",
    source: "Senior Engineer at Acme since 2019.",
    output: "Senior Engineer at Acme since 2018.",
    entities: "hard+capitalized",
    ungrounded: ["2018"],
    repaired: "Senior Engineer at Acme since [date].",
  },
  {
    id: "bad-invented-month",
    source: "Joined Acme in 2019.",
    output: "Joined Acme in March 2019.",
    entities: "hard+capitalized",
    ungrounded: ["March 2019"],
  },
  {
    id: "bad-invented-company",
    source: "Led the migration to the cloud.",
    output: "Led the migration to Google Cloud.",
    entities: "hard+capitalized",
    ungrounded: ["Google"],
  },
  {
    id: "bad-invented-tech",
    source: "Built REST APIs.",
    output: "Built REST APIs with Kubernetes and gRPC.",
    entities: "hard+capitalized",
    ungrounded: ["Kubernetes", "gRPC"],
  },
  {
    id: "bad-invented-certificate",
    source: "Holds cloud certifications.",
    output: "Holds the AWS Solutions Architect certification.",
    entities: "hard+capitalized",
    ungrounded: ["AWS", "Solutions", "Architect"],
  },
  {
    id: "bad-tr-invented-amount",
    source: "Departman bütçesini yönettim.",
    output: "₺2,5 milyon departman bütçesini yönettim.",
    entities: "hard+capitalized",
    ungrounded: ["2,5 milyon"],
    repaired: "[X] departman bütçesini yönettim.",
  },
  {
    id: "bad-tr-invented-percent-prefix",
    source: "Müşteri memnuniyetini artırdım.",
    output: "Müşteri memnuniyetini %40 artırdım.",
    entities: "hard+capitalized",
    ungrounded: ["%40"],
    repaired: "Müşteri memnuniyetini [X%] artırdım.",
  },
  {
    id: "bad-de-team-size",
    source: "Leitung des Vertriebsteams.",
    output: "Leitung des 12-köpfigen Vertriebsteams.",
    entities: "hard",
    ungrounded: ["12"],
    repaired: "Leitung des [X]-köpfigen Vertriebsteams.",
  },
  {
    id: "bad-number-word",
    source: "Led a team.",
    output: "Led a team of five engineers.",
    entities: "hard+capitalized",
    ungrounded: ["five"],
  },
  {
    id: "bad-contact-details",
    source: "Contact me via LinkedIn.",
    output: "Contact: max@example.com, linkedin.com/in/maxm",
    entities: "hard+capitalized",
    ungrounded: ["max@example.com", "linkedin.com/in/maxm"],
  },
  {
    id: "bad-thousands-trap",
    source: "Served 1,500 customers.",
    output: "Served 15,000 customers.",
    entities: "hard+capitalized",
    ungrounded: ["15,000"],
  },
  {
    id: "bad-invented-day",
    source: "Started 03/2020.",
    output: "Started on 15.03.2020.",
    entities: "hard+capitalized",
    ungrounded: ["15.03.2020"],
  },
  {
    id: "bad-tr-acronym",
    source: "Satış süreçlerini iyileştirdim.",
    output: "CRM ile satış süreçlerini iyileştirdim.",
    entities: "hard+capitalized",
    ungrounded: ["CRM"],
  },
  {
    id: "bad-de-product",
    source: "Einführung eines neuen Systems.",
    output: "Einführung von SAP S/4HANA.",
    entities: "hard",
    ungrounded: ["SAP", "S/4HANA"],
  },
  {
    id: "bad-fortune-500",
    source: "Worked with large clients.",
    output: "Worked with Fortune 500 clients.",
    entities: "hard+capitalized",
    ungrounded: ["Fortune", "500"],
  },
  {
    id: "bad-extended-range",
    source: "Engineer, 2016 – 2019",
    output: "Engineer, 2016 – 2021",
    entities: "hard+capitalized",
    ungrounded: ["2021"],
  },
  {
    id: "bad-multiplier",
    source: "Improved ROI.",
    output: "Improved ROI 3x.",
    entities: "hard+capitalized",
    ungrounded: ["3x"],
    repaired: "Improved ROI [X].",
  },
  {
    id: "bad-example-in-placeholder",
    source: "Raised NPS.",
    output: "Raised NPS by [e.g. 20%] in [Q2].",
    entities: "hard+capitalized",
    ungrounded: [],
    repaired: "Raised NPS by [X%] in [X].",
  },
  {
    id: "bad-cefr-level",
    source: "Deutsch: gute Kenntnisse",
    output: "Deutsch: C1",
    entities: "hard",
    ungrounded: ["C1"],
  },
];
