import type { CvFixture } from "./types";

/* German fixtures (de-01 … de-05). Bullet lists are shared between the document and `expected`
 * so highlights stay verbatim. */

/** A Lebenslauf table cell: header lines, then `•` bullets, one per line. */
function cell(lines: string[], bullets: string[] = []): string {
  return [...lines, ...bullets.map((b) => `• ${b}`)].join("\n");
}

/* ---------------------------------------------------------------- de-01 */

const de01Lumenfold = [
  "Konstruktion von Montage- und Prüfanlagen für die Automobilzulieferindustrie in Siemens NX",
  "Verantwortung für Projekte mit einem Volumen von bis zu €1,2 Mio.",
  "Reduzierung der Fertigungskosten einer Baugruppe um 15 % durch konstruktive Optimierung",
  "Abstimmung mit Fertigung, Einkauf und Kunden in einem Team von 8 Konstrukteuren",
];
const de01Brenntal = [
  "Entwicklung modularer Förderbandsysteme mit SolidWorks",
  "FEM-Berechnungen tragender Rahmenstrukturen mit ANSYS Mechanical",
  "Erstellung von Stücklisten und Fertigungszeichnungen in SAP S/4HANA",
];

/* ---------------------------------------------------------------- de-02 */

const de02Summary =
  "Vertriebsprofi mit über 10 Jahren Erfahrung im B2B-Vertrieb technischer Produkte. Ich baue langfristige Kundenbeziehungen auf, verhandle Rahmenverträge auf Geschäftsführungsebene und arbeite eng mit Produktmanagement und Service zusammen.";
const de02Nordwerk = [
  "Betreuung von 35 Schlüsselkunden mit einem Jahresumsatz von €18,5 Mio.",
  "Steigerung des Umsatzes im Bestandskundengeschäft um 22 % in zwei Jahren",
  "Abschluss von 6 neuen Rahmenverträgen mit Automobilzulieferern",
  "Pflege der Vertriebspipeline und Forecasts in Salesforce",
];
const de02Hansebuero = [
  "Angebotserstellung und Auftragsabwicklung in SAP S/4HANA",
  "Betreuung von rund 200 mittelständischen Kunden",
  "Einarbeitung von 4 neuen Kolleginnen und Kollegen",
];
const de02Elbtal = [
  "Unterstützung des Außendienstes bei Messen und Kundenterminen",
  "Aufbereitung von Vertriebskennzahlen in Excel",
];

/* ---------------------------------------------------------------- de-03 */

const de03Summary =
  "Data Analystin mit acht Jahren Erfahrung in Mobilitäts- und E-Commerce-Unternehmen. Ich übersetze Geschäftsfragen in saubere Datenmodelle, aussagekräftige Dashboards und Experimente, die Produktentscheidungen messbar verbessern.";
const de03Lumenfold = [
  "Aufbau eines Churn-Modells in Python, das die Kündigungsquote im Abo-Geschäft um 9 % senkte",
  "Migration von 120 Reports auf ein dbt-basiertes Data Warehouse in PostgreSQL",
  "Verantwortung für das Experimentation-Framework mit über 60 A/B-Tests pro Jahr",
  "Fachliche Führung von 2 Werkstudierenden",
];
const de03Spreeblick = [
  "Entwicklung von Tableau-Dashboards für 15 Städteteams",
  "Analyse der Flottenauslastung, die zu Einsparungen von €450.000 pro Jahr führte",
  "Automatisierung von Datenpipelines mit Apache Airflow",
];
const de03Skills = [
  "Python (pandas, scikit-learn)",
  "SQL / PostgreSQL",
  "dbt",
  "Apache Airflow",
  "Tableau",
  "Looker",
];

/* ---------------------------------------------------------------- de-04 */

const de04Summary =
  "Controller mit neun Jahren Erfahrung in Logistik und Energiewirtschaft. Schwerpunkte sind Planung, Forecasting und Kostenstellenrechnung in SAP; ich liefere dem Management belastbare Zahlen und klare Handlungsempfehlungen.";
const de04Mainfeld =
  "Verantwortlich für Budgetplanung und Monatsabschluss von 14 Niederlassungen mit einem Umsatz von €320 Mio. Einführung eines rollierenden Forecasts in SAP S/4HANA; Identifikation von Einsparungen in Höhe von €1,2 Mio. jährlich im Fuhrparkbereich; Führung eines Teams von 3 Controllern.";
const de04Taunus =
  "Investitionscontrolling für Netzprojekte mit einem Volumen von €60 Mio. Aufbau eines Power-BI-Reportings für die Geschäftsführung, Kostenstellenrechnung für 40 Kostenstellen und Begleitung der IFRS-16-Umstellung.";
const de04Skills = ["SAP S/4HANA CO/FI", "Excel/VBA", "Power BI", "IFRS", "HGB"];

/* ---------------------------------------------------------------- de-05 */

const de05Summary =
  "DevOps Engineer mit zehn Jahren Erfahrung im Betrieb geschäftskritischer Plattformen. Ich automatisiere Infrastruktur konsequent, baue zuverlässige CI/CD-Pipelines und sorge dafür, dass Entwicklungsteams schnell und sicher ausliefern können.";
const de05Alpenkern = [
  "Betrieb von 120 Microservices auf Kubernetes (EKS) mit einer Verfügbarkeit von 99,95 %",
  "Senkung der Cloud-Kosten um 31 % (rund €240.000 pro Jahr) durch Rightsizing und Spot-Instanzen",
  "Einführung von GitOps mit Argo CD für 14 Entwicklungsteams",
  "Aufbau von Monitoring und Alerting mit Prometheus und Grafana",
];
const de05Isartal = [
  "Automatisierung der Serverbereitstellung mit Ansible für über 400 Linux-Server",
  "Migration der Build-Infrastruktur von Jenkins auf GitLab CI",
  "Rufbereitschaft für zentrale Versicherungsanwendungen im 24/7-Betrieb",
];

export const CV_FIXTURES_DE: readonly CvFixture[] = [
  {
    id: "de-01-maschinenbau-table-persoenliche-daten",
    language: "de",
    format: "pdf",
    layout: "table",
    notes:
      "Tabular Lebenslauf with a 'Persönliche Daten' table (Geburtsdatum, Geburtsort and Staatsangehörigkeit must be ignored; Wohnort is the city), company/position/bullets packed in one right cell, 'heute' as open end, and a trailing 'Ulm, <date>' signature line that is not a date of anything.",
    main: [
      { kind: "heading", text: "Lebenslauf" },
      { kind: "name", text: "Lukas Brenner" },
      { kind: "heading", text: "Persönliche Daten" },
      {
        kind: "table",
        rows: [
          ["Name", "Lukas Brenner"],
          ["Geburtsdatum", "14.05.1991"],
          ["Geburtsort", "Augsburg"],
          ["Staatsangehörigkeit", "deutsch"],
          ["Wohnort", "Ulm"],
          ["Telefon", "+49 151 2384 5521"],
          ["E-Mail", "lukas.brenner@example.com"],
        ],
      },
      { kind: "heading", text: "Berufserfahrung" },
      {
        kind: "table",
        rows: [
          [
            "04/2021 – heute",
            cell(["Lumenfold GmbH, Ulm", "Konstrukteur Sondermaschinenbau"], de01Lumenfold),
          ],
          [
            "09/2017 – 03/2021",
            cell(["Brenntal Fördertechnik GmbH & Co. KG, Neu-Ulm", "Entwicklungsingenieur"], de01Brenntal),
          ],
        ],
      },
      { kind: "heading", text: "Ausbildung" },
      {
        kind: "table",
        rows: [
          [
            "10/2013 – 08/2017",
            cell([
              "Technische Hochschule Ulm",
              "Bachelor of Engineering, Maschinenbau",
              "Abschlussnote: 1,8",
            ]),
          ],
        ],
      },
      { kind: "heading", text: "Kenntnisse" },
      {
        kind: "table",
        rows: [
          ["CAD", "SolidWorks, Siemens NX, AutoCAD"],
          ["Simulation", "ANSYS Mechanical, MATLAB"],
          ["ERP / PLM", "SAP S/4HANA, Teamcenter"],
        ],
      },
      { kind: "heading", text: "Sprachen" },
      {
        kind: "table",
        rows: [
          ["Deutsch", "Muttersprache"],
          ["Englisch", "verhandlungssicher (C1)"],
          ["Französisch", "Grundkenntnisse (A2)"],
        ],
      },
      { kind: "heading", text: "Weiterbildung" },
      { kind: "table", rows: [["11/2022", "Six Sigma Green Belt – TÜV SÜD Akademie"]] },
      { kind: "line", text: "Ulm, 15.10.2026" },
    ],
    expected: {
      basics: {
        name: "Lukas Brenner",
        email: "lukas.brenner@example.com",
        phone: "+49 151 2384 5521",
        location: { city: "Ulm" },
      },
      work: [
        {
          name: "Lumenfold GmbH",
          position: "Konstrukteur Sondermaschinenbau",
          location: "Ulm",
          startDate: "2021-04",
          highlights: de01Lumenfold,
        },
        {
          name: "Brenntal Fördertechnik GmbH & Co. KG",
          position: "Entwicklungsingenieur",
          location: "Neu-Ulm",
          startDate: "2017-09",
          endDate: "2021-03",
          highlights: de01Brenntal,
        },
      ],
      education: [
        {
          institution: "Technische Hochschule Ulm",
          area: "Maschinenbau",
          studyType: "Bachelor of Engineering",
          startDate: "2013-10",
          endDate: "2017-08",
          score: "1,8",
        },
      ],
      skills: [
        { name: "CAD", keywords: ["SolidWorks", "Siemens NX", "AutoCAD"] },
        { name: "Simulation", keywords: ["ANSYS Mechanical", "MATLAB"] },
        { name: "ERP / PLM", keywords: ["SAP S/4HANA", "Teamcenter"] },
      ],
      languages: [
        { language: "Deutsch", fluency: "Muttersprache" },
        { language: "Englisch", fluency: "verhandlungssicher (C1)" },
        { language: "Französisch", fluency: "Grundkenntnisse (A2)" },
      ],
      certificates: [{ name: "Six Sigma Green Belt", issuer: "TÜV SÜD Akademie", date: "2022-11" }],
    },
  },
  {
    id: "de-02-vertrieb-table",
    language: "de",
    format: "docx",
    layout: "table",
    notes:
      "DOCX Lebenslauf table mixing 'seit 03/2022' (open start), 'MM.YYYY' and 'MM/YYYY' date cells, with company, city, position and bullets packed into one cell per job, and grouped skills from a two-column 'Kenntnisse' table.",
    main: [
      { kind: "name", text: "Katharina Vogel" },
      { kind: "line", text: "Key Account Managerin" },
      {
        kind: "line",
        text: "Hamburg · katharina.vogel@example.com · +49 151 4471 2093 · linkedin.com/in/katharina-vogel-sales",
      },
      { kind: "heading", text: "Profil" },
      { kind: "paragraph", text: de02Summary },
      { kind: "heading", text: "Berufserfahrung" },
      {
        kind: "table",
        rows: [
          [
            "seit 03/2022",
            cell(["Nordwerk Industrietechnik GmbH, Hamburg", "Key Account Managerin DACH"], de02Nordwerk),
          ],
          [
            "01.2019 – 02.2022",
            cell(["Hansebüro Vertriebs GmbH, Bremen", "Vertriebsmitarbeiterin Innendienst"], de02Hansebuero),
          ],
          [
            "10/2015 – 12/2018",
            cell(["Elbtal Medizintechnik AG, Hamburg", "Vertriebsassistentin"], de02Elbtal),
          ],
        ],
      },
      { kind: "heading", text: "Ausbildung" },
      {
        kind: "table",
        rows: [
          [
            "10/2011 – 09/2015",
            cell([
              "Hochschule für Angewandte Wissenschaften Hamburg",
              "Bachelor of Arts, Betriebswirtschaftslehre",
              "Schwerpunkt: Marketing und Vertrieb",
            ]),
          ],
        ],
      },
      { kind: "heading", text: "Kenntnisse" },
      {
        kind: "table",
        rows: [
          ["CRM", "Salesforce, HubSpot"],
          ["ERP", "SAP S/4HANA"],
          ["Office", "Excel, PowerPoint, Teams"],
        ],
      },
      { kind: "heading", text: "Sprachen" },
      {
        kind: "table",
        rows: [
          ["Deutsch", "Muttersprache"],
          ["Englisch", "fließend"],
          ["Spanisch", "gute Kenntnisse"],
        ],
      },
      { kind: "heading", text: "Weiterbildung" },
      {
        kind: "table",
        rows: [["06/2023", "Verhandlungsführung nach dem Harvard-Konzept, Akademie Nordlicht"]],
      },
    ],
    expected: {
      basics: {
        name: "Katharina Vogel",
        label: "Key Account Managerin",
        email: "katharina.vogel@example.com",
        phone: "+49 151 4471 2093",
        summary: de02Summary,
        location: { city: "Hamburg" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/katharina-vogel-sales" }],
      },
      work: [
        {
          name: "Nordwerk Industrietechnik GmbH",
          position: "Key Account Managerin DACH",
          location: "Hamburg",
          startDate: "2022-03",
          highlights: de02Nordwerk,
        },
        {
          name: "Hansebüro Vertriebs GmbH",
          position: "Vertriebsmitarbeiterin Innendienst",
          location: "Bremen",
          startDate: "2019-01",
          endDate: "2022-02",
          highlights: de02Hansebuero,
        },
        {
          name: "Elbtal Medizintechnik AG",
          position: "Vertriebsassistentin",
          location: "Hamburg",
          startDate: "2015-10",
          endDate: "2018-12",
          highlights: de02Elbtal,
        },
      ],
      education: [
        {
          institution: "Hochschule für Angewandte Wissenschaften Hamburg",
          area: "Betriebswirtschaftslehre",
          studyType: "Bachelor of Arts",
          startDate: "2011-10",
          endDate: "2015-09",
        },
      ],
      skills: [
        { name: "CRM", keywords: ["Salesforce", "HubSpot"] },
        { name: "ERP", keywords: ["SAP S/4HANA"] },
        { name: "Office", keywords: ["Excel", "PowerPoint", "Teams"] },
      ],
      languages: [
        { language: "Deutsch", fluency: "Muttersprache" },
        { language: "Englisch", fluency: "fließend" },
        { language: "Spanisch", fluency: "gute Kenntnisse" },
      ],
      certificates: [
        {
          name: "Verhandlungsführung nach dem Harvard-Konzept",
          issuer: "Akademie Nordlicht",
          date: "2023-06",
        },
      ],
    },
  },
  {
    id: "de-03-data-sidebar",
    language: "de",
    format: "pdf",
    layout: "sidebar",
    notes:
      "Two-column PDF with 'Berlin, DE' (countryCode shown), full and abbreviated German month names ('März 2018', 'Okt. 2015'), 'heute' as open end, and an ungrouped sidebar skill list containing parenthesised commas (expected one skill per bullet).",
    sidebar: [
      { kind: "heading", text: "Kontakt" },
      { kind: "line", text: "lena.hoffmann@example.com" },
      { kind: "line", text: "+49 151 6620 1187" },
      { kind: "line", text: "Berlin, DE" },
      { kind: "line", text: "github.com/lhoffmann-data" },
      { kind: "heading", text: "Kenntnisse" },
      { kind: "bullets", items: de03Skills },
      { kind: "heading", text: "Sprachen" },
      { kind: "line", text: "Deutsch – Muttersprache" },
      { kind: "line", text: "Englisch – C1" },
      { kind: "line", text: "Spanisch – B1" },
    ],
    main: [
      { kind: "name", text: "Lena Hoffmann" },
      { kind: "line", text: "Data Analystin" },
      { kind: "heading", text: "Profil" },
      { kind: "paragraph", text: de03Summary },
      { kind: "heading", text: "Berufserfahrung" },
      {
        kind: "entry",
        left: "Senior Data Analystin — Lumenfold GmbH",
        right: "Juli 2020 – heute",
        sub: "Berlin",
      },
      { kind: "bullets", items: de03Lumenfold },
      {
        kind: "entry",
        left: "Data Analystin — Spreeblick Mobility GmbH",
        right: "März 2018 – Juni 2020",
        sub: "Berlin",
      },
      { kind: "bullets", items: de03Spreeblick },
      { kind: "heading", text: "Ausbildung" },
      {
        kind: "entry",
        left: "M.Sc. Statistik — Humboldt-Universität zu Berlin",
        right: "Okt. 2015 – Feb. 2018",
        sub: "Note: 1,3",
      },
      { kind: "entry", left: "B.Sc. Wirtschaftsmathematik — Universität Potsdam", right: "2012 – 2015" },
      { kind: "heading", text: "Zertifikate" },
      { kind: "line", text: "Tableau Desktop Specialist, Tableau, Mai 2021" },
    ],
    expected: {
      basics: {
        name: "Lena Hoffmann",
        label: "Data Analystin",
        email: "lena.hoffmann@example.com",
        phone: "+49 151 6620 1187",
        summary: de03Summary,
        location: { city: "Berlin", countryCode: "DE" },
        profiles: [{ network: "GitHub", url: "github.com/lhoffmann-data" }],
      },
      work: [
        {
          name: "Lumenfold GmbH",
          position: "Senior Data Analystin",
          location: "Berlin",
          startDate: "2020-07",
          highlights: de03Lumenfold,
        },
        {
          name: "Spreeblick Mobility GmbH",
          position: "Data Analystin",
          location: "Berlin",
          startDate: "2018-03",
          endDate: "2020-06",
          highlights: de03Spreeblick,
        },
      ],
      education: [
        {
          institution: "Humboldt-Universität zu Berlin",
          area: "Statistik",
          studyType: "M.Sc.",
          startDate: "2015-10",
          endDate: "2018-02",
          score: "1,3",
        },
        {
          institution: "Universität Potsdam",
          area: "Wirtschaftsmathematik",
          studyType: "B.Sc.",
          startDate: "2012",
          endDate: "2015",
        },
      ],
      certificates: [{ name: "Tableau Desktop Specialist", issuer: "Tableau", date: "2021-05" }],
      skills: de03Skills.map((name) => ({ name })),
      languages: [
        { language: "Deutsch", fluency: "Muttersprache" },
        { language: "Englisch", fluency: "C1" },
        { language: "Spanisch", fluency: "B1" },
      ],
    },
  },
  {
    id: "de-04-controlling-compact",
    language: "de",
    format: "pdf",
    layout: "compact",
    notes:
      "Headline and contact share one '|' line, 'seit 2021' is a year-only open start, jobs are prose with euro amounts in German notation (expected as work.summary), and skills are a '·'-separated inline list (expected ungrouped, one per name).",
    main: [
      { kind: "name", text: "Felix Neumann" },
      {
        kind: "line",
        text: "Controller | Frankfurt am Main | felix.neumann@example.com | +49 151 3309 7742",
      },
      { kind: "heading", text: "Profil" },
      { kind: "paragraph", text: de04Summary },
      { kind: "heading", text: "Berufserfahrung" },
      {
        kind: "entry",
        left: "Senior Controller · Mainfeld Logistik AG · Frankfurt am Main",
        right: "seit 2021",
      },
      { kind: "paragraph", text: de04Mainfeld },
      { kind: "entry", left: "Controller · Taunus Energie GmbH · Bad Homburg", right: "2017 – 2020" },
      { kind: "paragraph", text: de04Taunus },
      { kind: "heading", text: "Ausbildung" },
      { kind: "entry", left: "M.Sc. Finance · Goethe-Universität Frankfurt", right: "2015 – 2017" },
      { kind: "entry", left: "B.Sc. Betriebswirtschaftslehre · Universität Mannheim", right: "2011 – 2015" },
      { kind: "heading", text: "Weitere Angaben" },
      { kind: "line", text: `Kenntnisse: ${de04Skills.join(" · ")}` },
      { kind: "line", text: "Sprachen: Deutsch (Muttersprache) · Englisch (fließend)" },
      {
        kind: "line",
        text: "Zertifikat: Geprüfter Bilanzbuchhalter (IHK), IHK Frankfurt am Main, 2019",
      },
    ],
    expected: {
      basics: {
        name: "Felix Neumann",
        label: "Controller",
        email: "felix.neumann@example.com",
        phone: "+49 151 3309 7742",
        summary: de04Summary,
        location: { city: "Frankfurt am Main" },
      },
      work: [
        {
          name: "Mainfeld Logistik AG",
          position: "Senior Controller",
          location: "Frankfurt am Main",
          startDate: "2021",
          summary: de04Mainfeld,
        },
        {
          name: "Taunus Energie GmbH",
          position: "Controller",
          location: "Bad Homburg",
          startDate: "2017",
          endDate: "2020",
          summary: de04Taunus,
        },
      ],
      education: [
        {
          institution: "Goethe-Universität Frankfurt",
          area: "Finance",
          studyType: "M.Sc.",
          startDate: "2015",
          endDate: "2017",
        },
        {
          institution: "Universität Mannheim",
          area: "Betriebswirtschaftslehre",
          studyType: "B.Sc.",
          startDate: "2011",
          endDate: "2015",
        },
      ],
      skills: de04Skills.map((name) => ({ name })),
      languages: [
        { language: "Deutsch", fluency: "Muttersprache" },
        { language: "Englisch", fluency: "fließend" },
      ],
      certificates: [
        { name: "Geprüfter Bilanzbuchhalter (IHK)", issuer: "IHK Frankfurt am Main", date: "2019" },
      ],
    },
  },
  {
    id: "de-05-devops-single-column",
    language: "de",
    format: "docx",
    layout: "single-column",
    notes:
      "Single-column DOCX with both GitHub and LinkedIn in the contact line, 'MM/YYYY – heute' and 'MM.YYYY' dates, certificate names that themselves contain a dash, and grouped skills whose group titles contain '&' ('Container & Orchestrierung:').",
    main: [
      { kind: "name", text: "Sebastian Lange" },
      { kind: "line", text: "Senior DevOps Engineer" },
      {
        kind: "line",
        text: "München · sebastian.lange@example.com · +49 151 5523 8810 · github.com/slange-ops · linkedin.com/in/sebastian-lange-devops",
      },
      { kind: "heading", text: "Profil" },
      { kind: "paragraph", text: de05Summary },
      { kind: "heading", text: "Berufserfahrung" },
      {
        kind: "entry",
        left: "Senior DevOps Engineer — Alpenkern Software GmbH",
        right: "04/2021 – heute",
        sub: "München",
      },
      { kind: "bullets", items: de05Alpenkern },
      {
        kind: "entry",
        left: "Systemadministrator — Isartal Versicherungs-AG",
        right: "09.2016 – 03.2021",
        sub: "München",
      },
      { kind: "bullets", items: de05Isartal },
      { kind: "heading", text: "Ausbildung" },
      { kind: "entry", left: "B.Sc. Informatik — Technische Universität München", right: "2012 – 2016" },
      { kind: "heading", text: "Kenntnisse" },
      { kind: "line", text: "Cloud: AWS, Azure, OpenStack" },
      { kind: "line", text: "Container & Orchestrierung: Kubernetes, Helm, Docker" },
      { kind: "line", text: "IaC & CI/CD: Terraform, Ansible, GitLab CI, Argo CD" },
      { kind: "line", text: "Monitoring: Prometheus, Grafana, Loki" },
      { kind: "heading", text: "Zertifikate" },
      { kind: "line", text: "Certified Kubernetes Administrator (CKA), The Linux Foundation, 06/2022" },
      {
        kind: "line",
        text: "AWS Certified Solutions Architect – Professional, Amazon Web Services, 02/2023",
      },
      { kind: "heading", text: "Sprachen" },
      { kind: "line", text: "Deutsch – Muttersprache, Englisch – verhandlungssicher (C1)" },
    ],
    expected: {
      basics: {
        name: "Sebastian Lange",
        label: "Senior DevOps Engineer",
        email: "sebastian.lange@example.com",
        phone: "+49 151 5523 8810",
        summary: de05Summary,
        location: { city: "München" },
        profiles: [
          { network: "GitHub", url: "github.com/slange-ops" },
          { network: "LinkedIn", url: "linkedin.com/in/sebastian-lange-devops" },
        ],
      },
      work: [
        {
          name: "Alpenkern Software GmbH",
          position: "Senior DevOps Engineer",
          location: "München",
          startDate: "2021-04",
          highlights: de05Alpenkern,
        },
        {
          name: "Isartal Versicherungs-AG",
          position: "Systemadministrator",
          location: "München",
          startDate: "2016-09",
          endDate: "2021-03",
          highlights: de05Isartal,
        },
      ],
      education: [
        {
          institution: "Technische Universität München",
          area: "Informatik",
          studyType: "B.Sc.",
          startDate: "2012",
          endDate: "2016",
        },
      ],
      skills: [
        { name: "Cloud", keywords: ["AWS", "Azure", "OpenStack"] },
        { name: "Container & Orchestrierung", keywords: ["Kubernetes", "Helm", "Docker"] },
        { name: "IaC & CI/CD", keywords: ["Terraform", "Ansible", "GitLab CI", "Argo CD"] },
        { name: "Monitoring", keywords: ["Prometheus", "Grafana", "Loki"] },
      ],
      certificates: [
        {
          name: "Certified Kubernetes Administrator (CKA)",
          issuer: "The Linux Foundation",
          date: "2022-06",
        },
        {
          name: "AWS Certified Solutions Architect – Professional",
          issuer: "Amazon Web Services",
          date: "2023-02",
        },
      ],
      languages: [
        { language: "Deutsch", fluency: "Muttersprache" },
        { language: "Englisch", fluency: "verhandlungssicher (C1)" },
      ],
    },
  },
];
