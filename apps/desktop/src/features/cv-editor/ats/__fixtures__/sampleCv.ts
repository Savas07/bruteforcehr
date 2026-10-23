/**
 * Test-only CV behind `sample-cv.pdf` (rendered by `generate.ts`). Diacritics, a C#/Node.js/CI/CD
 * skill set and a custom section exercise the ATS round-trip normalisation.
 */
import type { CvContent } from "@bfhr/core";

export const sampleCv: CvContent = {
  basics: {
    name: "Ayşe Yılmaz",
    label: "Senior Backend Engineer",
    email: "ayse.yilmaz@example.com",
    phone: "+49 30 1234 5678",
    location: { city: "Berlin", countryCode: "DE" },
    summary: "Backend engineer who builds efficient, well-tested services for logistics platforms.",
  },
  work: [
    {
      name: "Müller & Söhne GmbH",
      position: "Senior Backend Engineer",
      startDate: "2021-03",
      highlights: [
        "Moved the order pipeline to Kubernetes and cut deployment time from 40 to 6 minutes with a new CI/CD setup.",
        "Led the office-wide migration from a monolith to event-driven microservices in C# and .NET.",
      ],
    },
    {
      name: "Kargo Teknoloji A.Ş.",
      position: "Software Engineer",
      startDate: "2017-09",
      endDate: "2021-02",
      highlights: [
        "Built the courier tracking API in Node.js and TypeScript, serving 2 million requests a day.",
      ],
    },
  ],
  education: [
    {
      institution: "Orta Doğu Teknik Üniversitesi",
      area: "Computer Engineering",
      studyType: "BSc",
      startDate: "2013-09",
      endDate: "2017-06",
    },
  ],
  skills: [
    { name: "Backend", keywords: ["C#", ".NET", "Node.js", "TypeScript", "PostgreSQL"] },
    { name: "Operations", keywords: ["Kubernetes", "Docker", "CI/CD"] },
  ],
  languages: [
    { language: "Turkish", fluency: "Native" },
    { language: "German", fluency: "Fluent" },
    { language: "English", fluency: "Fluent" },
  ],
  certificates: [{ name: "Certified Kubernetes Administrator", issuer: "CNCF", date: "2022-05" }],
  meta: {
    template: "classic",
    theme: {
      accentColor: "#1F4E79",
      fontPair: "inter-source-serif",
      density: "comfortable",
      paperSize: "a4",
    },
    sectionOrder: ["basics", "work", "education", "skills", "languages", "certificates", "custom:talks"],
    customSections: [
      {
        id: "talks",
        title: "Talks",
        items: [{ title: "Zero-downtime deploys at scale", subtitle: "GoDays Berlin", startDate: "2023-01" }],
      },
    ],
  },
};
