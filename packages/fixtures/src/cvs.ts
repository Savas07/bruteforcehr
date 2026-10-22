import type { CoverLetter, Cv, CvContent, CvRevision, CvTheme, RenderedFile } from "@bfhr/core";
import { FIXTURE_UID } from "./persona";
import { daysAgo } from "./time";

const theme: CvTheme = {
  accentColor: "#2F5D8A",
  fontPair: "inter-source-serif",
  density: "comfortable",
  paperSize: "a4",
};

const basicsEn: NonNullable<CvContent["basics"]> = {
  name: "Deniz Aksoy",
  label: "Frontend & Product Engineer",
  email: "deniz.aksoy@example.com",
  phone: "+90 532 555 01 47",
  url: "https://deniz.example.com",
  summary:
    "Frontend engineer with five years of experience building fast, accessible product UIs in React and TypeScript. I led the design-system rebuild at Pazarbox, care about performance budgets and localization, and like working closely with designers and product managers on measurable outcomes.",
  location: { city: "Istanbul", countryCode: "TR" },
  profiles: [
    { network: "GitHub", username: "deniz-aksoy-example", url: "https://github.com/deniz-aksoy-example" },
    {
      network: "LinkedIn",
      username: "deniz-aksoy-example",
      url: "https://www.linkedin.com/in/deniz-aksoy-example",
    },
  ],
};

const workEnV2: NonNullable<CvContent["work"]> = [
  {
    name: "Pazarbox",
    position: "Frontend Engineer",
    location: "Istanbul, Türkiye",
    url: "https://pazarbox.example.com",
    startDate: "2022-03",
    summary: "E-commerce marketplace with 4M monthly shoppers; member of the checkout and platform squads.",
    highlights: [
      "Led the rebuild of the design system (62 components, React + TypeScript, Storybook), adopted by 7 product teams.",
      "Cut checkout Largest Contentful Paint from 3.9 s to 1.8 s through code splitting and image budgets.",
      "Introduced Playwright visual tests that caught 40+ regressions before release in the first quarter.",
      "Shipped right-to-left and Arabic localization for the Gulf expansion together with the i18n guild.",
    ],
  },
  {
    name: "Kuzey Labs",
    position: "Frontend Developer",
    location: "Istanbul, Türkiye",
    startDate: "2020-02",
    endDate: "2022-02",
    summary: "Product studio building web and mobile apps for fintech and logistics clients.",
    highlights: [
      "Built a React Native driver app for a logistics client, used by 3,500 drivers daily.",
      "Delivered a GraphQL-backed portfolio dashboard for a Turkish neobank in four months.",
    ],
  },
  {
    name: "Mavi Yazılım",
    position: "Junior Web Developer",
    location: "Istanbul, Türkiye",
    startDate: "2019-07",
    endDate: "2020-01",
    highlights: [
      "Maintained customer-facing booking forms and raised their Lighthouse accessibility score to 98.",
    ],
  },
];

const educationEn: NonNullable<CvContent["education"]> = [
  {
    institution: "Istanbul Technical University",
    area: "Computer Engineering",
    studyType: "BSc",
    startDate: "2015-09",
    endDate: "2019-06",
  },
];

const skillsEn: NonNullable<CvContent["skills"]> = [
  { name: "Frontend", keywords: ["React", "TypeScript", "Next.js", "Redux", "Tailwind CSS", "Vite"] },
  {
    name: "Quality",
    keywords: ["Accessibility (WCAG 2.2)", "Web performance", "Jest", "Playwright", "Storybook"],
  },
  { name: "Product", keywords: ["Design systems", "Figma", "A/B testing", "Localization"] },
  { name: "Also", keywords: ["React Native", "Node.js", "GraphQL"] },
];

const metaEn: CvContent["meta"] = {
  template: "classic",
  theme,
  sectionOrder: ["basics", "work", "projects", "skills", "education", "languages", "custom:talks"],
  customSections: [
    {
      id: "talks",
      title: "Talks",
      items: [
        {
          title: "Design systems that survive seven teams",
          subtitle: "Frontend Istanbul meetup",
          startDate: "2025-04",
          url: "https://deniz.example.com/talks/design-systems",
        },
      ],
    },
  ],
};

const contentEnV1: CvContent = {
  basics: {
    ...basicsEn,
    summary: "Frontend engineer with five years of experience in React and TypeScript.",
  },
  work: workEnV2.map((job) => ({ ...job, highlights: job.highlights?.slice(0, 2) ?? [] })),
  education: educationEn,
  skills: skillsEn,
  languages: [
    { language: "Turkish", fluency: "Native" },
    { language: "English", fluency: "Fluent (C1)" },
  ],
  meta: {
    ...metaEn,
    sectionOrder: ["basics", "work", "skills", "education", "languages"],
    customSections: [],
  },
};

const contentEnV2: CvContent = {
  basics: basicsEn,
  work: workEnV2,
  education: educationEn,
  skills: skillsEn,
  languages: [
    { language: "Turkish", fluency: "Native" },
    { language: "English", fluency: "Fluent (C1)" },
    { language: "German", fluency: "Elementary (A2)" },
  ],
  meta: {
    ...metaEn,
    sectionOrder: ["basics", "work", "skills", "education", "languages"],
    customSections: [],
  },
};

const contentEnV3: CvContent = {
  ...contentEnV2,
  projects: [
    {
      name: "tiny-i18n-lint",
      description: "ESLint plugin that flags hard-coded UI strings and missing translation keys.",
      highlights: ["1.2k weekly npm downloads", "Used by two Istanbul startups in CI"],
      url: "https://github.com/deniz-aksoy-example/tiny-i18n-lint",
      startDate: "2024-01",
      roles: ["Author", "Maintainer"],
    },
  ],
  certificates: [{ name: "Web Accessibility Specialist (WAS)", issuer: "IAAP", date: "2024-11" }],
  meta: metaEn,
};

const contentDeV1: CvContent = {
  basics: {
    ...basicsEn,
    label: "Frontend- & Product-Engineer",
    summary:
      "Frontend-Engineer mit fünf Jahren Erfahrung in der Entwicklung schneller, barrierefreier Produktoberflächen mit React und TypeScript. Bei Pazarbox habe ich den Neuaufbau des Designsystems geleitet; mir sind Performance-Budgets, Lokalisierung und die enge Zusammenarbeit mit Design und Produktmanagement wichtig.",
  },
  work: [
    {
      ...workEnV2[0],
      location: "Istanbul, Türkei",
      summary:
        "E-Commerce-Marktplatz mit 4 Mio. monatlichen Käufer:innen; Mitglied der Checkout- und Plattform-Squads.",
      highlights: [
        "Neuaufbau des Designsystems geleitet (62 Komponenten, React + TypeScript, Storybook), von 7 Produktteams genutzt.",
        "Largest Contentful Paint im Checkout durch Code-Splitting und Bildbudgets von 3,9 s auf 1,8 s gesenkt.",
        "Visuelle Playwright-Tests eingeführt, die im ersten Quartal über 40 Regressionen vor dem Release fanden.",
        "Rechts-nach-links-Layout und arabische Lokalisierung für die Expansion in die Golfstaaten umgesetzt.",
      ],
    },
    {
      ...workEnV2[1],
      location: "Istanbul, Türkei",
      summary: "Produktstudio für Web- und Mobile-Apps von Fintech- und Logistikkunden.",
      highlights: [
        "React-Native-Fahrer-App für einen Logistikkunden entwickelt, täglich von 3.500 Fahrer:innen genutzt.",
        "GraphQL-basiertes Portfolio-Dashboard für eine türkische Neobank in vier Monaten ausgeliefert.",
      ],
    },
  ],
  education: [{ ...educationEn[0], area: "Technische Informatik", studyType: "B.Sc." }],
  skills: [
    { name: "Frontend", keywords: ["React", "TypeScript", "Next.js", "Redux", "Tailwind CSS", "Vite"] },
    {
      name: "Qualität",
      keywords: ["Barrierefreiheit (WCAG 2.2)", "Web-Performance", "Jest", "Playwright", "Storybook"],
    },
    { name: "Produkt", keywords: ["Designsysteme", "Figma", "A/B-Tests", "Lokalisierung"] },
  ],
  languages: [
    { language: "Türkisch", fluency: "Muttersprache" },
    { language: "Englisch", fluency: "Verhandlungssicher (C1)" },
    { language: "Deutsch", fluency: "Grundkenntnisse (A2)" },
  ],
  meta: {
    ...metaEn,
    sectionOrder: ["basics", "work", "skills", "education", "languages", "custom:vortraege"],
    customSections: [
      {
        id: "vortraege",
        title: "Vorträge",
        items: [
          {
            title: "Designsysteme, die sieben Teams überstehen",
            subtitle: "Frontend Istanbul Meetup",
            startDate: "2025-04",
          },
        ],
      },
    ],
  },
};

const contentDeV2: CvContent = {
  ...contentDeV1,
  basics: {
    ...contentDeV1.basics,
    summary:
      "Frontend-Engineer mit fünf Jahren Erfahrung in React und TypeScript und Schwerpunkt auf Designsystemen und Barrierefreiheit – passend zu Tannenbaums Plattform für den Mittelstand. Ich bringe Erfahrung mit B2B-Oberflächen, Lokalisierung und messbaren Performance-Zielen mit.",
  },
};

export const cvs: Cv[] = [
  {
    id: "cv-en",
    title: "Base CV — English",
    language: "en",
    parentCvId: null,
    currentRevisionId: "rev-en-3",
    templateId: "classic",
    theme,
    isDefault: true,
    archivedAt: null,
    version: 4,
    importedFrom: {
      kind: "pdf",
      storagePath: `users/${FIXTURE_UID}/cv-imports/import-deniz-cv-2025`,
      fileName: "Deniz_Aksoy_CV_2025.pdf",
    },
    createdAt: daysAgo(70),
    updatedAt: daysAgo(12),
  },
  {
    id: "cv-de",
    title: "Lebenslauf — Deutsch",
    language: "de",
    parentCvId: "cv-en",
    currentRevisionId: "rev-de-2",
    templateId: "classic",
    theme,
    isDefault: false,
    archivedAt: null,
    version: 3,
    importedFrom: null,
    createdAt: daysAgo(40),
    updatedAt: daysAgo(8),
  },
];

export const cvRevisions: CvRevision[] = [
  {
    id: "rev-en-1",
    cvId: "cv-en",
    content: contentEnV1,
    source: "import",
    basedOnRevisionId: null,
    jobId: null,
    diffSummary: "Imported from Deniz_Aksoy_CV_2025.pdf",
    createdAt: daysAgo(70),
  },
  {
    id: "rev-en-2",
    cvId: "cv-en",
    content: contentEnV2,
    source: "manual",
    basedOnRevisionId: "rev-en-1",
    jobId: null,
    diffSummary: "Rewrote summary, added 4 highlights and German (A2)",
    createdAt: daysAgo(50),
  },
  {
    id: "rev-en-3",
    cvId: "cv-en",
    content: contentEnV3,
    source: "manual",
    basedOnRevisionId: "rev-en-2",
    jobId: null,
    diffSummary: "Added Projects, Certificates and a Talks section",
    createdAt: daysAgo(12),
  },
  {
    id: "rev-de-1",
    cvId: "cv-de",
    content: contentDeV1,
    source: "manual",
    basedOnRevisionId: "rev-en-2",
    jobId: null,
    diffSummary: "German translation of the base CV",
    createdAt: daysAgo(40),
  },
  {
    id: "rev-de-2",
    cvId: "cv-de",
    content: contentDeV2,
    source: "ai_tailor",
    basedOnRevisionId: "rev-de-1",
    jobId: "job-tannenbaum-frontend",
    diffSummary: "Tailored summary for Tannenbaum Software (2 of 3 suggestions accepted)",
    createdAt: daysAgo(8),
  },
];

export const coverLetters: CoverLetter[] = [
  {
    id: "cl-template-en",
    applicationId: null,
    jobId: null,
    title: "Short & warm (EN)",
    language: "en",
    body: "Dear {{hiringManager}},\n\nI'm applying for the {{role}} role at {{company}}. For the past five years I've built product interfaces in React and TypeScript, most recently leading the design-system rebuild at Pazarbox.\n\n{{whyCompany}}\n\nI'd love to talk about how I could help. Thank you for your time.\n\nBest regards,\nDeniz Aksoy",
    author: "user",
    isTemplate: true,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(30),
  },
  {
    id: "cl-thames",
    applicationId: "app-thames",
    jobId: "job-thames-frontend",
    title: "Thames Ledger — Frontend Engineer",
    language: "en",
    body: "Dear Priya,\n\nI'm applying for the Frontend Engineer role on Thames Ledger's invoicing team. At Pazarbox I led a design-system rebuild adopted by seven teams and halved checkout load time — work that maps closely to your goal of a faster, more consistent invoicing experience for small businesses.\n\nI'm based in Istanbul and ready to relocate to London with sponsorship. I'd love to hear more about the team.\n\nBest regards,\nDeniz Aksoy",
    author: "user",
    isTemplate: false,
    createdAt: daysAgo(18),
    updatedAt: daysAgo(18),
  },
  {
    id: "cl-tannenbaum",
    applicationId: "app-tannenbaum",
    jobId: "job-tannenbaum-frontend",
    title: "Tannenbaum Software — Frontend-Entwickler:in",
    language: "de",
    body: "Sehr geehrte Frau Krüger,\n\nhiermit bewerbe ich mich als Frontend-Entwickler bei Tannenbaum Software. In den letzten fünf Jahren habe ich Produktoberflächen mit React und TypeScript gebaut und zuletzt bei Pazarbox den Neuaufbau unseres Designsystems geleitet.\n\nIhre Plattform für den Mittelstand reizt mich besonders, weil gute B2B-Oberflächen viel Arbeit sparen. Für einen Umzug nach München bin ich offen.\n\nMit freundlichen Grüßen\nDeniz Aksoy",
    author: "ai",
    isTemplate: false,
    createdAt: daysAgo(8),
    updatedAt: daysAgo(8),
  },
  {
    id: "cl-halden",
    applicationId: "app-halden",
    jobId: "job-halden-product",
    title: "Halden Freight — Product Engineer",
    language: "en",
    body: "Hello Tom,\n\nI saw the Product Engineer opening on Halden Freight's careers page and wanted to apply directly. I've shipped logistics software before — a React Native driver app used by 3,500 drivers daily — and I enjoy owning features from discovery to release.\n\nMy CV is attached. I'd be glad to talk whenever suits you.\n\nKind regards,\nDeniz Aksoy",
    author: "ai",
    isTemplate: false,
    createdAt: daysAgo(2, -1),
    updatedAt: daysAgo(2, -0.5),
  },
];

function rendered(
  id: string,
  subject: { cvId: string; cvRevisionId: string } | { coverLetterId: string },
  fileName: string,
  sizeBytes: number,
  sha256: string,
  createdAt: Date,
): RenderedFile {
  return {
    id,
    kind: "pdf",
    cvId: "cvId" in subject ? subject.cvId : null,
    cvRevisionId: "cvRevisionId" in subject ? subject.cvRevisionId : null,
    coverLetterId: "coverLetterId" in subject ? subject.coverLetterId : null,
    storagePath: `users/${FIXTURE_UID}/rendered/${id}`,
    fileName,
    sizeBytes,
    sha256,
    createdAt,
  };
}

export const renderedFiles: RenderedFile[] = [
  rendered(
    "file-cv-en-2",
    { cvId: "cv-en", cvRevisionId: "rev-en-2" },
    "Deniz-Aksoy-CV.pdf",
    84_211,
    "ca993c36c5922d15abb653fe3c8464a349cd628f2a271ba1f653f7702d144623",
    daysAgo(50),
  ),
  rendered(
    "file-cv-en-3",
    { cvId: "cv-en", cvRevisionId: "rev-en-3" },
    "Deniz-Aksoy-CV.pdf",
    91_604,
    "2feea6128b5808cb9de60ab6c14b4cd67db4a70566337c3bdba559126dada361",
    daysAgo(12),
  ),
  rendered(
    "file-cv-de-1",
    { cvId: "cv-de", cvRevisionId: "rev-de-1" },
    "Deniz-Aksoy-Lebenslauf.pdf",
    88_930,
    "856f0e9113009775bace68f5621b34025692efd2506e4a53ab6ec7667f5df866",
    daysAgo(40),
  ),
  rendered(
    "file-cv-de-2",
    { cvId: "cv-de", cvRevisionId: "rev-de-2" },
    "Deniz-Aksoy-CV-Tannenbaum-Software.pdf",
    89_412,
    "ee278f8280f853d5e696d9b6e829b4a6dc1a663190758f88940302b063fa8b31",
    daysAgo(8),
  ),
  rendered(
    "file-cl-thames",
    { coverLetterId: "cl-thames" },
    "Deniz-Aksoy-Cover-Letter-Thames-Ledger.pdf",
    41_207,
    "4ba3b4bdae1f3bb4a8bd45ba912659d2c3a48f9792c4c823b37899496c6119ec",
    daysAgo(18),
  ),
  rendered(
    "file-cl-tannenbaum",
    { coverLetterId: "cl-tannenbaum" },
    "Deniz-Aksoy-Anschreiben-Tannenbaum-Software.pdf",
    43_018,
    "f90fb29823c6b3419397417517aebd2139a6915a81de6151f5a42b9e7ddc139e",
    daysAgo(8),
  ),
  rendered(
    "file-cl-halden",
    { coverLetterId: "cl-halden" },
    "Deniz-Aksoy-Cover-Letter-Halden-Freight.pdf",
    39_876,
    "3d91b7a3e4aefc6379123111ac5749a685482f1a7e5930b0084b94c01b9eb923",
    daysAgo(2, -0.5),
  ),
];
