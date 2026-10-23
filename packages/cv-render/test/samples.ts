// Test and critique inputs. EN/DE come from @bfhr/fixtures (the persona's real fixture CVs); the
// Turkish variant and the "every section" CV exist only here, for tests (never production code).
import type { CvContent } from "@bfhr/core";
import { populatedDataset } from "@bfhr/fixtures";
import type { CvRenderInput, TemplateId } from "../src/index";
import type { PaperSize } from "../src/themes";

function revision(id: string): CvContent {
  const found = populatedDataset.cvRevisions.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`fixture revision ${id} missing`);
  return found.content;
}

export const enCv: CvContent = revision("rev-en-3");
export const deCv: CvContent = revision("rev-de-2");

export const trCv: CvContent = {
  basics: {
    name: "Deniz Aksoy",
    label: "Frontend ve Ürün Mühendisi",
    email: "deniz.aksoy@example.com",
    phone: "+90 532 555 01 47",
    url: "https://deniz.example.com",
    summary:
      "React ve TypeScript ile hızlı, erişilebilir ürün arayüzleri geliştirmede beş yıllık deneyime sahip frontend mühendisiyim. Pazarbox'ta tasarım sisteminin yeniden inşasına liderlik ettim; performans bütçeleri, yerelleştirme ve tasarım ile ürün ekipleriyle yakın çalışma benim için önemli.",
    location: { city: "İstanbul", countryCode: "TR" },
    profiles: [
      { network: "GitHub", username: "deniz-aksoy-example", url: "https://github.com/deniz-aksoy-example" },
    ],
  },
  work: [
    {
      name: "Pazarbox",
      position: "Frontend Mühendisi",
      location: "İstanbul, Türkiye",
      startDate: "2022-03",
      summary: "Aylık 4 milyon alışverişçiye sahip e-ticaret pazaryeri; ödeme ve platform ekiplerinin üyesi.",
      highlights: [
        "Tasarım sisteminin yeniden inşasına liderlik ettim (62 bileşen, React + TypeScript, Storybook); 7 ürün ekibi kullanıyor.",
        "Kod bölme ve görsel bütçeleriyle ödeme sayfasında Largest Contentful Paint süresini 3,9 sn'den 1,8 sn'ye düşürdüm.",
        "İlk çeyrekte yayından önce 40'tan fazla gerilemeyi yakalayan görsel Playwright testlerini başlattım.",
      ],
    },
    {
      name: "Kuzey Labs",
      position: "Frontend Geliştirici",
      location: "İstanbul, Türkiye",
      startDate: "2020-02",
      endDate: "2022-02",
      highlights: [
        "Bir lojistik müşterisi için günde 3.500 sürücünün kullandığı React Native sürücü uygulamasını geliştirdim.",
        "Bir dijital banka için GraphQL tabanlı portföy panelini dört ayda teslim ettim.",
      ],
    },
  ],
  education: [
    {
      institution: "İstanbul Teknik Üniversitesi",
      area: "Bilgisayar Mühendisliği",
      studyType: "Lisans",
      startDate: "2015-09",
      endDate: "2019-06",
    },
  ],
  skills: [
    { name: "Frontend", keywords: ["React", "TypeScript", "Next.js", "Redux", "Tailwind CSS", "Vite"] },
    { name: "Kalite", keywords: ["Erişilebilirlik (WCAG 2.2)", "Web performansı", "Jest", "Playwright"] },
    { name: "Ürün", keywords: ["Tasarım sistemleri", "Figma", "A/B testleri", "Yerelleştirme"] },
  ],
  languages: [
    { language: "Türkçe", fluency: "Ana dil" },
    { language: "İngilizce", fluency: "İleri (C1)" },
    { language: "Almanca", fluency: "Başlangıç (A2)" },
  ],
  interests: [{ name: "İlgi", keywords: ["Işık fotoğrafçılığı", "Dağcılık"] }],
  meta: {
    template: "classic",
    theme: {
      accentColor: "#1F635D",
      fontPair: "inter-source-serif",
      density: "comfortable",
      paperSize: "a4",
    },
    sectionOrder: ["basics", "work", "skills", "education", "languages", "interests"],
    customSections: [],
  },
};

/** One-pixel PNG: enough to prove the opt-in photo path without shipping a face. */
export const PHOTO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Every standard section plus a custom one, an AI placeholder and opt-in personal details. */
export const fullCv: CvContent = {
  ...enCv,
  basics: { ...enCv.basics, image: "users/u1/cv-photos/p1" },
  work: [
    {
      ...enCv.work?.[0],
      highlights: [
        "Raised checkout conversion by [X%] after the redesign.",
        ...(enCv.work?.[0]?.highlights ?? []),
      ],
    },
    ...(enCv.work?.slice(1) ?? []),
  ],
  volunteer: [
    {
      organization: "Kodluyoruz",
      position: "Mentor",
      startDate: "2021-01",
      endDate: "2023-06",
      summary: "Mentored bootcamp students in React.",
    },
  ],
  awards: [
    { title: "Hackathon winner", awarder: "Istanbul JS", date: "2023-11", summary: "Accessible maps." },
  ],
  publications: [{ name: "Design systems at scale", publisher: "Smashing Magazine", releaseDate: "2024-05" }],
  interests: [{ name: "Outdoors", keywords: ["Climbing", "Photography"] }],
  references: [{ name: "Ayşe Kaya", reference: "Available on request." }],
  meta: {
    ...enCv.meta,
    sectionOrder: [
      "basics",
      "work",
      "projects",
      "skills",
      "education",
      "languages",
      "certificates",
      "awards",
      "publications",
      "volunteer",
      "interests",
      "references",
      "custom:talks",
    ],
    personal: { showPhoto: true, showDateOfBirth: true, dateOfBirth: "1996-05-14" },
  },
};

export const TEMPLATE_IDS: readonly TemplateId[] = ["classic", "modern", "compact"];
export const PAPERS: readonly PaperSize[] = ["a4", "letter"];

export function inputFor(
  content: CvContent,
  locale: string,
  templateId: TemplateId = "classic",
  paper: PaperSize = "a4",
): CvRenderInput {
  const { meta, ...resume } = content;
  return {
    resume,
    meta,
    templateId,
    theme: { accent: meta.theme.accentColor, fontPair: meta.theme.fontPair, density: meta.theme.density },
    paper,
    locale,
  };
}
