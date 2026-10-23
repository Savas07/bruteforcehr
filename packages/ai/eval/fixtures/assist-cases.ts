import type { AssistCase } from "./types";

/**
 * 15 cvAssist cases: 4 rewrite, 4 shorten, 4 strongerVerb, 3 translate (en→de, tr→en, de→tr);
 * 5 source texts per language. For translations `mustKeep` lists only numbers and proper nouns
 * that stay identical in the target language.
 */
export const ASSIST_CASES: readonly AssistCase[] = [
  /* ------------------------------------------------------------------ rewrite */
  {
    id: "rewrite-01-en-social-media-no-metric",
    action: "rewrite",
    language: "en",
    text: "Responsible for managing the company's social media accounts and posting content regularly.",
    context: { section: "work", role: "Marketing Coordinator", company: "Brightwater Logistics" },
    mustKeep: [],
    expectPlaceholder: true,
  },
  {
    id: "rewrite-02-tr-support-zendesk",
    action: "rewrite",
    language: "tr",
    text: "Müşteri şikayetlerini takip ettim ve çözüm sürecinde ilgili departmanlarla iletişim kurdum. Zendesk üzerinden aylık 1.500 talebi yönettim.",
    context: { section: "work", role: "Müşteri Hizmetleri Uzmanı", company: "Anatolia Yazılım A.Ş." },
    mustKeep: ["Zendesk", "1.500"],
    expectPlaceholder: false,
  },
  {
    id: "rewrite-03-de-einkauf-sap-no-metric",
    action: "rewrite",
    language: "de",
    text: "Zuständig für die Betreuung der Lieferanten und die Kontrolle der Rechnungen in SAP S/4HANA.",
    context: { section: "work", role: "Einkäuferin", company: "Lumenfold GmbH" },
    mustKeep: ["SAP S/4HANA"],
    expectPlaceholder: true,
  },
  {
    id: "rewrite-04-en-summary-data-analyst",
    action: "rewrite",
    language: "en",
    text: "I am a hard-working data analyst with 5 years of experience. I know SQL, Python and Tableau and I like working with people from different teams to solve problems with data.",
    context: { section: "summary" },
    mustKeep: ["5 years", "SQL", "Python", "Tableau"],
    expectPlaceholder: false,
  },

  /* ------------------------------------------------------------------ shorten */
  {
    id: "shorten-01-tr-summary-backend",
    action: "shorten",
    language: "tr",
    text: "Yazılım sektöründe yaklaşık yedi yıllık deneyime sahip, özellikle backend geliştirme alanında uzmanlaşmış bir mühendisim. Bu süre zarfında Go, Java ve PostgreSQL gibi teknolojilerle çalışarak birçok farklı projede yer aldım. Takım çalışmasına önem veren, yeni teknolojileri öğrenmeye açık ve sorumluluk sahibi bir kişiyim. Ayrıca Kubernetes üzerinde çalışan sistemlerin yönetimi konusunda da deneyimim bulunmaktadır ve bu alanda kendimi sürekli geliştirmeye çalışıyorum.",
    context: { section: "summary" },
    mustKeep: ["Go", "Java", "PostgreSQL", "Kubernetes"],
    expectPlaceholder: false,
  },
  {
    id: "shorten-02-de-events-budget",
    action: "shorten",
    language: "de",
    text: "Im Rahmen meiner Tätigkeit war ich für die vollständige Planung, Organisation und Durchführung von insgesamt 12 Kundenveranstaltungen pro Jahr verantwortlich, wobei ich das dafür vorgesehene Budget in Höhe von €350.000 eigenständig verwaltet und dabei eng mit externen Agenturen, Caterern sowie den internen Vertriebsteams in Deutschland, Österreich und der Schweiz zusammengearbeitet habe, um eine durchgehend hohe Teilnehmerzufriedenheit von 92 % zu erreichen.",
    context: { section: "work", role: "Eventmanagerin", company: "Nordwerk Industrietechnik GmbH" },
    mustKeep: ["12", "€350.000", "92 %"],
    expectPlaceholder: false,
  },
  {
    id: "shorten-03-en-onboarding-launch",
    action: "shorten",
    language: "en",
    text: "Worked closely with the engineering, design and customer success teams over a period of eighteen months in order to plan, build and successfully launch a completely new self-service onboarding experience for our small business customers, which ultimately resulted in the trial-to-paid conversion rate increasing from 9% to 14% and a significant reduction in the number of onboarding-related support tickets that the support team had to handle.",
    context: { section: "work", role: "Senior Product Manager", company: "Lumenfold Ltd" },
    mustKeep: ["9%", "14%"],
    expectPlaceholder: false,
  },
  {
    id: "shorten-04-de-summary-pflege",
    action: "shorten",
    language: "de",
    text: "Ich bin eine engagierte und zuverlässige Pflegefachkraft mit mehr als acht Jahren Berufserfahrung auf internistischen und intensivmedizinischen Stationen. In meiner bisherigen Laufbahn habe ich gelernt, auch in stressigen Situationen einen kühlen Kopf zu bewahren, und ich lege großen Wert auf eine einfühlsame Kommunikation mit Patientinnen, Patienten und Angehörigen. Zudem habe ich die Weiterbildung zur Praxisanleiterin abgeschlossen und betreue regelmäßig Auszubildende.",
    context: { section: "summary" },
    mustKeep: ["Praxisanleiterin"],
    expectPlaceholder: false,
  },

  /* ------------------------------------------------------------------ strongerVerb */
  {
    id: "stronger-01-en-helped-stripe-no-metric",
    action: "strongerVerb",
    language: "en",
    text: "Helped with the migration of the billing system to Stripe.",
    context: { section: "work", role: "Backend Engineer", company: "Copperline Payments" },
    mustKeep: ["Stripe"],
    expectPlaceholder: true,
  },
  {
    id: "stronger-02-tr-onboarding-no-metric",
    action: "strongerVerb",
    language: "tr",
    text: "Yeni çalışanların oryantasyon sürecinde yer aldım ve eğitim materyallerinin hazırlanmasına destek oldum.",
    context: { section: "work", role: "İK Uzmanı", company: "Marmara Tekstil San. ve Tic. A.Ş." },
    mustKeep: [],
    expectPlaceholder: true,
  },
  {
    id: "stronger-03-de-power-bi-report",
    action: "strongerVerb",
    language: "de",
    text: "War beteiligt an der Einführung von Power BI im Controlling und habe dadurch die Erstellung des Monatsberichts von 5 auf 2 Tage verkürzt.",
    context: { section: "work", role: "Controller", company: "Mainfeld Logistik AG" },
    mustKeep: ["Power BI", "5", "2"],
    expectPlaceholder: false,
  },
  {
    id: "stronger-04-tr-sap-ewm-errors",
    action: "strongerVerb",
    language: "tr",
    text: "Depo süreçlerinde görev aldım; SAP EWM geçişi sırasında sipariş hazırlama hatalarının %22 azalmasına katkıda bulundum.",
    context: { section: "work", role: "Lojistik Operasyon Şefi", company: "Ege Liman Lojistik A.Ş." },
    mustKeep: ["SAP EWM", "%22"],
    expectPlaceholder: false,
  },

  /* ------------------------------------------------------------------ translate */
  {
    id: "translate-01-en-de-kubernetes-migration",
    action: "translate",
    language: "en",
    targetLanguage: "de",
    text: "Led a team of 6 engineers to migrate 40 services to Kubernetes, cutting hosting costs by 28% ($410K per year).",
    context: { section: "work", role: "Senior Backend Engineer", company: "Kestrel Analytics Inc." },
    mustKeep: ["6", "40", "Kubernetes", "28"],
    expectPlaceholder: false,
  },
  {
    id: "translate-02-tr-en-ad-budget",
    action: "translate",
    language: "tr",
    targetLanguage: "en",
    text: "Lale Kozmetik A.Ş. bünyesinde yıllık ₺12.000.000 reklam bütçesini yöneterek Google Ads ve Meta Ads kampanyalarında ROAS'ı 3,1'den 4,6'ya çıkardım.",
    context: { section: "work", role: "Dijital Pazarlama Müdürü", company: "Lale Kozmetik A.Ş." },
    mustKeep: ["Lale Kozmetik A.Ş.", "Google Ads", "Meta Ads", "ROAS"],
    expectPlaceholder: false,
  },
  {
    id: "translate-03-de-tr-konstruktion",
    action: "translate",
    language: "de",
    targetLanguage: "tr",
    text: "Konstruktion von Montageanlagen in Siemens NX für Kunden aus der Automobilzulieferindustrie; Reduzierung der Fertigungskosten einer Baugruppe um 15 %.",
    context: { section: "work", role: "Konstrukteur Sondermaschinenbau", company: "Lumenfold GmbH" },
    mustKeep: ["Siemens NX", "15"],
    expectPlaceholder: false,
  },
];
