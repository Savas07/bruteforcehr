import type { CoverLetterTone, CvAssistLanguage, TailorIntensity, UiLanguage } from "@bfhr/core";

/**
 * Apply eval cases (docs/adr/0010-ai.md "Tailoring", "Cover letters"): 12 synthetic postings for
 * 12 of the import-eval CVs (4 EN, 4 TR, 4 DE; companies invented). Each posting asks for things
 * the CV does not have (`bait`): a tailoring edit or a first-person letter sentence that names one
 * is a fabrication and fails the CI gate. `keywords` are posting terms the CV does support.
 */
export interface ApplyJobFixture {
  /** CV fixture id from eval/fixtures (its `expected` resume is the CV). */
  cvId: string;
  /** Posting language. */
  language: CvAssistLanguage;
  title: string;
  company: string;
  /** As `jobs.skills`: normalized terms the importer extracted. */
  skills: string[];
  description: string;
  bait: string[];
  keywords: string[];
}

export interface TailorCase {
  id: string;
  job: ApplyJobFixture;
  intensity: TailorIntensity;
  locale: UiLanguage;
}

export interface LetterCase {
  id: string;
  job: ApplyJobFixture;
  tone: CoverLetterTone;
  language: CvAssistLanguage;
  /** Starter template id, or null for a free draft. */
  templateId: string | null;
}

export const APPLY_JOBS: readonly ApplyJobFixture[] = [
  {
    cvId: "en-01-backend-projects",
    language: "en",
    title: "Senior Platform Engineer, Payments",
    company: "Ledgerly",
    skills: ["go", "kafka", "kubernetes", "postgresql", "rust", "pci dss"],
    description:
      "Ledgerly moves money for 4,000 merchants across Europe. As a Senior Platform Engineer on the Payments team you will design and run the event-driven services behind every transfer.\n\nWhat you'll do:\n- Build high-throughput services in Go and Rust on Kubernetes.\n- Own our Kafka streaming platform and PostgreSQL clusters.\n- Lead incident reviews and improve on-call health.\n- Mentor engineers across three squads.\n\nWhat we look for:\n- 7+ years of backend experience with distributed systems.\n- Production experience with Rust.\n- Experience operating systems under PCI DSS.\n- Strong observability practice (metrics, tracing).",
    bait: ["Rust", "PCI DSS"],
    keywords: ["Kafka", "Kubernetes", "PostgreSQL", "Go", "mentor", "observability"],
  },
  {
    cvId: "en-02-data-sidebar-publications",
    language: "en",
    title: "Senior Data Scientist, Pricing",
    company: "Harbourline Retail",
    skills: ["python", "sql", "pricing", "forecasting", "spark", "databricks"],
    description:
      "Harbourline Retail runs 220 stores and a growing online shop. Our pricing team is looking for a Senior Data Scientist to build price-elasticity and demand-forecasting models that store managers trust.\n\nResponsibilities: own pricing models end to end, partner with commercial stakeholders, run experiments, and present findings to leadership.\n\nRequirements: strong Python and SQL, experience with forecasting at SKU level, Spark for large-scale feature pipelines, and Databricks. A PhD in a quantitative field is a plus.",
    bait: ["Spark", "Databricks", "PhD"],
    keywords: ["forecasting", "pricing", "SQL", "stakeholder"],
  },
  {
    cvId: "en-04-nurse-education-first-volunteer",
    language: "en",
    title: "ICU Charge Nurse",
    company: "Riverside General Hospital",
    skills: ["critical care", "ventilator management", "ecmo", "epic"],
    description:
      "Riverside General Hospital is recruiting an experienced ICU Charge Nurse for our 30-bed adult intensive care unit.\n\nYou will coordinate the shift, support junior staff and students, and lead quality improvement work. We are looking for at least 5 years of critical care experience, confidence with ventilated patients and sepsis management, and experience with ECMO. Our unit documents in Epic. Band 7.",
    bait: ["ECMO", "Epic"],
    keywords: ["ventilated", "sepsis", "quality improvement", "students"],
  },
  {
    cvId: "en-05-designer-sidebar-awards-interests",
    language: "en",
    title: "Lead Product Designer",
    company: "Coinwell",
    skills: ["figma", "design systems", "user research", "protopie", "webflow"],
    description:
      "Coinwell helps 2 million people save automatically. We're hiring a Lead Product Designer to own our savings experience end to end.\n\nYou'll lead research, shape flows from first sketch to shipped UI, grow our design system in Figma, and partner closely with engineers. Prototyping in ProtoPie and experience building marketing sites in Webflow are expected. Experience in consumer finance is a strong plus.",
    bait: ["ProtoPie", "Webflow"],
    keywords: ["design system", "Figma", "research", "engineers", "finance"],
  },
  {
    cvId: "tr-01-backend-odd-phone-projects",
    language: "tr",
    title: "Kıdemli Backend Geliştirici (Ödeme Sistemleri)",
    company: "Parakod Ödeme Sistemleri A.Ş.",
    skills: ["go", "java", "kubernetes", "postgresql", "elixir", "cassandra"],
    description:
      "Parakod, günde 5 milyon ödeme işlemi işleyen bir ödeme kuruluşudur. Ödeme altyapımızı geliştirecek Kıdemli Backend Geliştirici arıyoruz.\n\nSorumluluklar:\n- Go ve Java ile yüksek trafikli mikroservisler geliştirmek\n- Kubernetes üzerinde çalışan servislerin güvenilirliğini artırmak\n- PostgreSQL ve Cassandra veritabanlarını yönetmek\n\nAradığımız nitelikler:\n- En az 6 yıl backend deneyimi\n- Elixir deneyimi\n- BDDK mevzuatına uygun sistemlerde çalışmış olmak",
    bait: ["Elixir", "Cassandra", "BDDK"],
    keywords: ["Go", "Java", "Kubernetes", "PostgreSQL", "mikroservis"],
  },
  {
    cvId: "tr-02-marketing-sidebar",
    language: "tr",
    title: "Büyüme Pazarlama Müdürü",
    company: "Sepetim Teknoloji",
    skills: ["performans pazarlama", "seo", "hubspot", "tiktok ads", "braze"],
    description:
      "Sepetim, 3 milyon kullanıcıya hizmet veren bir e-ticaret platformudur. Büyüme ekibimizi yönetecek bir Büyüme Pazarlama Müdürü arıyoruz.\n\nPerformans kampanyalarının bütçesini yönetecek, SEO ve CRM çalışmalarını koordine edecek, ajanslarla birlikte çalışacaksınız. TikTok Ads ve Braze deneyimi ile mobil uygulama büyütme tecrübesi beklenmektedir.",
    bait: ["TikTok", "Braze"],
    keywords: ["SEO", "HubSpot", "bütçe", "ajans"],
  },
  {
    cvId: "tr-04-hr-education-end-year-only",
    language: "tr",
    title: "İnsan Kaynakları Müdürü",
    company: "Trakya Otomotiv A.Ş.",
    skills: ["işe alım", "performans yönetimi", "bordro", "oracle hcm", "cipd"],
    description:
      "Trakya Otomotiv, 2.500 çalışanıyla otomotiv yan sanayinde faaliyet göstermektedir. İnsan Kaynakları Müdürü olarak işe alım, performans yönetimi, ücret yönetimi ve çalışan bağlılığı süreçlerinden sorumlu olacaksınız.\n\nAranan nitelikler: üretim sektöründe en az 8 yıl İK deneyimi, Oracle HCM bilgisi, CIPD sertifikası tercih sebebidir, sendikal ilişkiler deneyimi.",
    bait: ["Oracle", "CIPD", "sendika"],
    keywords: ["işe alım", "performans yönetimi", "üretim", "bağlılık"],
  },
  {
    cvId: "tr-05-teacher-sidebar-volunteer",
    language: "en",
    title: "English Teacher (Secondary)",
    company: "Bilge International School",
    skills: ["english", "cambridge", "ib", "delta"],
    description:
      "Bilge International School in Istanbul is looking for an English teacher for grades 9–12 from September.\n\nYou will teach English language and literature, prepare students for Cambridge exams, and contribute to our exchange programmes. Experience teaching the IB Diploma Programme and a DELTA qualification are required.",
    bait: ["IB Diploma", "DELTA"],
    keywords: ["Cambridge", "Erasmus", "English"],
  },
  {
    cvId: "de-02-vertrieb-table",
    language: "de",
    title: "Key Account Manager (m/w/d) Medizintechnik",
    company: "Vitalis Medizinsysteme GmbH",
    skills: ["key account management", "salesforce", "rahmenverträge", "microsoft dynamics", "mdr"],
    description:
      "Die Vitalis Medizinsysteme GmbH entwickelt Diagnosesysteme für Kliniken in ganz Europa. Zur Verstärkung unseres Vertriebs suchen wir eine/n Key Account Manager (m/w/d) für die Region Nord.\n\nIhre Aufgaben: Betreuung und Ausbau von Klinikverbünden, Verhandlung von Rahmenverträgen, Pflege der Pipeline in Microsoft Dynamics.\n\nIhr Profil: mehrjährige Erfahrung im B2B-Vertrieb, Kenntnisse der MDR, Erfahrung mit Vergabeverfahren öffentlicher Kliniken.",
    bait: ["Microsoft Dynamics", "MDR", "Vergabeverfahren"],
    keywords: ["Rahmenverträge", "B2B", "Salesforce", "Kundenbeziehungen"],
  },
  {
    cvId: "de-03-data-sidebar",
    language: "de",
    title: "Senior Data Analyst (m/w/d)",
    company: "Fahrwerk Mobility GmbH",
    skills: ["sql", "python", "dbt", "a/b-tests", "metabase", "bigquery"],
    description:
      "Fahrwerk Mobility betreibt E-Scooter in 40 Städten. Als Senior Data Analyst (m/w/d) machst du Produktentscheidungen messbar.\n\nDeine Aufgaben: Datenmodelle mit dbt, Dashboards und A/B-Tests, Zusammenarbeit mit Produkt und Operations.\n\nDein Profil: sehr gute SQL- und Python-Kenntnisse, Erfahrung mit Metabase und BigQuery, idealerweise Erfahrung mit Snowplow.",
    bait: ["Metabase", "BigQuery", "Snowplow"],
    keywords: ["dbt", "Python", "A/B-Tests", "Dashboards"],
  },
  {
    cvId: "de-04-controlling-compact",
    language: "de",
    title: "Senior Controller (m/w/d)",
    company: "Rheinhafen Logistik AG",
    skills: ["controlling", "sap s/4hana", "forecasting", "lucanet", "jedox"],
    description:
      "Die Rheinhafen Logistik AG ist ein Logistikdienstleister mit 2.000 Beschäftigten. Wir suchen einen Senior Controller (m/w/d) für Planung, Forecasting und Monatsabschluss.\n\nSie verantworten die Budgetplanung unserer Standorte, entwickeln das Reporting weiter und beraten die Geschäftsführung. Erfahrung mit SAP S/4HANA, LucaNet und Jedox setzen wir voraus.",
    bait: ["LucaNet", "Jedox"],
    keywords: ["Forecast", "SAP S/4HANA", "Budgetplanung", "Monatsabschluss"],
  },
  {
    cvId: "de-05-devops-single-column",
    language: "en",
    title: "Senior Site Reliability Engineer",
    company: "Cloudhaven",
    skills: ["kubernetes", "terraform", "argo cd", "prometheus", "google cloud", "istio", "pulumi"],
    description:
      "Cloudhaven runs a developer platform used by 900 engineering teams. As a Senior SRE you will keep our Kubernetes fleet reliable, automate infrastructure, and improve incident response.\n\nYou bring: deep Kubernetes experience, infrastructure as code with Terraform or Pulumi, GitOps with Argo CD, monitoring with Prometheus and Grafana, and experience on Google Cloud. Experience with Istio is a plus.",
    bait: ["Google Cloud", "Istio", "Pulumi"],
    keywords: ["Kubernetes", "Terraform", "Argo CD", "Prometheus", "GitOps"],
  },
];

/** Every posting once; intensity alternates, reasons in the CV's market language (one EN for a DE CV). */
export const TAILOR_CASES: readonly TailorCase[] = APPLY_JOBS.map((posting, index) => ({
  id: `tailor-${posting.cvId.slice(0, 5)}`,
  job: posting,
  intensity: index % 2 === 0 ? "thorough" : "light",
  locale: posting.cvId.startsWith("de-05") ? "en" : (posting.cvId.slice(0, 2) as UiLanguage),
}));

const TONES: readonly CoverLetterTone[] = ["formal", "warm", "concise"];

/** Every posting once, in the posting's language; tones rotate; one starter template per language. */
export const LETTER_CASES: readonly LetterCase[] = APPLY_JOBS.map((posting, index) => ({
  id: `letter-${posting.cvId.slice(0, 5)}`,
  job: posting,
  tone: TONES[index % TONES.length] ?? "formal",
  language: posting.language,
  templateId: ["en-02", "tr-02", "de-03"].includes(posting.cvId.slice(0, 5))
    ? `starter-${posting.language}`
    : null,
}));
