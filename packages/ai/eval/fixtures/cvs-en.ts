import type { CvFixture } from "./types";

/* English fixtures (en-01 … en-06). Bullet lists are shared between the document and `expected`
 * so highlights stay verbatim. */

/* ---------------------------------------------------------------- en-01 */

const en01Summary =
  "Backend engineer with 8+ years building high-throughput data services in Go and Python. I design event-driven systems on Kubernetes, care about observability and on-call health, and enjoy mentoring engineers who are new to distributed systems.";
const en01Kestrel = [
  "Led migration of 40+ microservices from EC2 to Kubernetes (EKS), cutting infrastructure spend by 28% ($410K per year).",
  "Designed a PostgreSQL partitioning scheme that kept p99 query latency under 120 ms at 3x data growth.",
  "Built the Kafka-based ingestion pipeline processing 1.2B events per day for 300+ enterprise customers.",
  "Mentored a team of 5 engineers and introduced weekly architecture reviews.",
];
const en01Brightwater = [
  "Rewrote the shipment-tracking API in Go, reducing average response time from 450 ms to 90 ms.",
  "Introduced contract testing across 12 services, lowering production incidents by 35%.",
  "Maintained CI/CD pipelines in GitHub Actions serving 60 engineers.",
];
const en01Pgshard = [
  "Written in Go; 1.4k GitHub stars and 30 external contributors.",
  "Supports online resharding with zero downtime for tables up to 2 TB.",
];
const en01Trailhead = ["React Native app with offline maps used by 8,000 monthly users."];

/* ---------------------------------------------------------------- en-02 */

const en02Summary =
  "Data scientist with six years of experience turning retail and loyalty data into pricing and forecasting decisions. Comfortable owning models end to end, from SQL and feature engineering to deployment and stakeholder presentations.";
const en02Kestrel = [
  "Built a demand-forecasting model for 14,000 SKUs that reduced stock-outs by 18% for a national grocery client.",
  "Designed uplift models for loyalty campaigns, adding an estimated £1.8M in annual incremental revenue.",
  "Moved model training from notebooks to scheduled pipelines on Snowflake and dbt, cutting refresh time from 2 days to 3 hours.",
  "Line-managed 3 junior data scientists and ran the team's fortnightly reading group.",
];
const en02Northgate = [
  "Automated weekly trading reports in Tableau, saving the commercial team 10 hours per week.",
  "Analysed 2 years of basket data to redesign promotional calendars across 120 stores.",
  "Ran A/B tests on email campaigns reaching 450,000 customers.",
];
const en02Skills = ["Python", "R", "SQL", "scikit-learn", "PyTorch", "dbt", "Snowflake", "Tableau"];

/* ---------------------------------------------------------------- en-03 */

const en03Summary =
  "Product manager with 9 years in fintech and B2B SaaS. I run discovery with customers, turn it into clear bets, and ship with small cross-functional teams. Strongest in pricing, onboarding and payments, with a habit of writing things down so decisions survive reorganisations.";
const en03Lumenfold =
  "Own the onboarding and billing product for a 40-person engineering org. Relaunched self-serve onboarding, lifting trial-to-paid conversion from 9% to 14%; introduced usage-based pricing that grew net revenue retention to 118%; manage a shared roadmap across 3 squads and report quarterly to the executive team.";
const en03Copperline =
  "Launched instant payouts for 12,000 merchants, processing $3.4M in the first quarter. Cut chargeback disputes by 22% with a redesigned dispute flow, validated with Figma prototypes and weekly usability tests. Partnered with risk and compliance on FCA reporting requirements.";
const en03Harlow =
  "Mapped payment processes for retail banking clients and wrote requirements for two core-banking migrations; ran workshops with up to 30 stakeholders.";
const en03Skills = [
  "Product discovery",
  "A/B testing",
  "SQL",
  "Amplitude",
  "Jira",
  "Figma",
  "Pricing strategy",
  "Stakeholder management",
];

/* ---------------------------------------------------------------- en-04 */

const en04Summary =
  "Compassionate critical care nurse with five years of experience in adult intensive care. Confident managing ventilated and multi-organ-support patients, mentoring students, and leading quality improvement on the unit. Calm under pressure and committed to family-centred care.";
const en04Icu = [
  "Coordinate care for up to 4 level-3 patients per shift on a 24-bed unit.",
  "Led a pressure-ulcer prevention project that reduced hospital-acquired pressure injuries by 40% in 12 months.",
  "Mentor 6 student nurses per year as a practice assessor.",
];
const en04Amu = [
  "Delivered care for 8–10 acutely unwell patients per shift, including NIV and sepsis management.",
  "Redeployed to ICU during the COVID-19 surge in 2020.",
];
const en04Volunteer = [
  "Provided first aid cover at festivals and sports events across Bristol.",
  "Trained 25 new volunteers in basic life support.",
];

/* ---------------------------------------------------------------- en-05 */

const en05Summary =
  "Product designer with 8 years of experience shaping consumer finance and health apps. I lead projects from research to shipped UI, build design systems that scale, and partner closely with engineers to get the details right.";
const en05Fernway = [
  "Redesigned mobile onboarding, raising account-opening completion from 41% to 63%.",
  "Built and maintain the Fernway design system in Figma (300+ components) used by 9 product teams.",
  "Ran 40+ moderated usability sessions per year and set up a shared research repository.",
];
const en05Pulsepoint = [
  "Designed the appointment-booking flow for 1.5M patients across 200 clinics.",
  "Partnered with engineers to ship an accessible component library meeting WCAG 2.1 AA.",
  "Introduced design critiques and a weekly handoff checklist for a team of 4 designers.",
];
const en05Tools = ["Figma", "FigJam", "Framer", "Adobe Illustrator", "Maze"];
const en05Expertise = [
  "Design systems",
  "Interaction design",
  "Usability testing",
  "Accessibility (WCAG 2.1)",
];

/* ---------------------------------------------------------------- en-06 */

const en06Summary =
  "Financial analyst with 7 years in FP&A for consumer goods and private equity portfolio companies. Builds driver-based models, owns monthly close reporting and translates numbers into decisions for executives.";
const en06Harrowgate =
  "Build operating models for 6 portfolio companies with combined revenue of $640M. Led the 2024 budget process and cut the monthly reporting cycle from 10 to 6 business days by moving reporting to Power BI.";
const en06Bramblewood =
  "Owned the $85M marketing budget forecast and variance analysis. Identified $2.1M in annual savings across co-packing contracts and supported the SAP S/4HANA finance migration.";
const en06Intern = "Prepared client billing reconciliations and supported the year-end audit file.";

export const CV_FIXTURES_EN: readonly CvFixture[] = [
  {
    id: "en-01-backend-projects",
    language: "en",
    format: "pdf",
    layout: "single-column",
    notes:
      "Two projects (one undated, one with a year range and repo URL) must not be merged into work, and grouped skill lines ('Programming:', 'Infrastructure:', 'Data:') map to grouped skills.",
    main: [
      { kind: "name", text: "Ethan Caldwell" },
      { kind: "line", text: "Senior Backend Engineer" },
      {
        kind: "line",
        text: "Seattle, WA · ethan.caldwell@example.com · +1 555 010 4478 · github.com/ecaldwell-dev · linkedin.com/in/ethan-caldwell-eng",
      },
      { kind: "heading", text: "Summary" },
      { kind: "paragraph", text: en01Summary },
      { kind: "heading", text: "Experience" },
      {
        kind: "entry",
        left: "Senior Backend Engineer — Kestrel Analytics Inc.",
        right: "Mar 2021 – Present",
        sub: "Seattle, WA",
      },
      { kind: "bullets", items: en01Kestrel },
      {
        kind: "entry",
        left: "Backend Engineer — Brightwater Logistics",
        right: "Jun 2017 – Feb 2021",
        sub: "Portland, OR",
      },
      { kind: "bullets", items: en01Brightwater },
      { kind: "heading", text: "Projects" },
      {
        kind: "entry",
        left: "pgshard — Open-source PostgreSQL sharding proxy",
        right: "2022 – 2023",
        sub: "github.com/ecaldwell-dev/pgshard",
      },
      { kind: "bullets", items: en01Pgshard },
      { kind: "entry", left: "Trailhead — Route planner for hikers" },
      { kind: "bullets", items: en01Trailhead },
      { kind: "heading", text: "Education" },
      {
        kind: "entry",
        left: "B.S. Computer Science — University of Washington",
        right: "2013 – 2017",
        sub: "GPA: 3.7/4.0",
      },
      { kind: "heading", text: "Skills" },
      { kind: "line", text: "Programming: Go, Python, TypeScript, SQL" },
      { kind: "line", text: "Infrastructure: Kubernetes, Terraform, AWS, Docker" },
      { kind: "line", text: "Data: PostgreSQL, Kafka, Redis, ClickHouse" },
      { kind: "heading", text: "Certifications" },
      { kind: "line", text: "Certified Kubernetes Administrator (CKA) — The Linux Foundation, Nov 2022" },
      { kind: "heading", text: "Languages" },
      { kind: "line", text: "English (native) · Spanish (B1)" },
    ],
    expected: {
      basics: {
        name: "Ethan Caldwell",
        label: "Senior Backend Engineer",
        email: "ethan.caldwell@example.com",
        phone: "+1 555 010 4478",
        summary: en01Summary,
        location: { city: "Seattle", region: "WA" },
        profiles: [
          { network: "GitHub", url: "github.com/ecaldwell-dev" },
          { network: "LinkedIn", url: "linkedin.com/in/ethan-caldwell-eng" },
        ],
      },
      work: [
        {
          name: "Kestrel Analytics Inc.",
          position: "Senior Backend Engineer",
          location: "Seattle, WA",
          startDate: "2021-03",
          highlights: en01Kestrel,
        },
        {
          name: "Brightwater Logistics",
          position: "Backend Engineer",
          location: "Portland, OR",
          startDate: "2017-06",
          endDate: "2021-02",
          highlights: en01Brightwater,
        },
      ],
      projects: [
        {
          name: "pgshard",
          description: "Open-source PostgreSQL sharding proxy",
          url: "github.com/ecaldwell-dev/pgshard",
          startDate: "2022",
          endDate: "2023",
          highlights: en01Pgshard,
        },
        {
          name: "Trailhead",
          description: "Route planner for hikers",
          highlights: en01Trailhead,
        },
      ],
      education: [
        {
          institution: "University of Washington",
          area: "Computer Science",
          studyType: "B.S.",
          startDate: "2013",
          endDate: "2017",
          score: "3.7/4.0",
        },
      ],
      skills: [
        { name: "Programming", keywords: ["Go", "Python", "TypeScript", "SQL"] },
        { name: "Infrastructure", keywords: ["Kubernetes", "Terraform", "AWS", "Docker"] },
        { name: "Data", keywords: ["PostgreSQL", "Kafka", "Redis", "ClickHouse"] },
      ],
      certificates: [
        { name: "Certified Kubernetes Administrator (CKA)", issuer: "The Linux Foundation", date: "2022-11" },
      ],
      languages: [
        { language: "English", fluency: "native" },
        { language: "Spanish", fluency: "B1" },
      ],
    },
  },
  {
    id: "en-02-data-sidebar-publications",
    language: "en",
    format: "docx",
    layout: "sidebar",
    notes:
      "Two-column layout with contact, an ungrouped skills list (expected as one skill per name) and languages in the sidebar, numeric MM/YYYY dates, and a publications section whose entries look like jobs.",
    sidebar: [
      { kind: "heading", text: "Contact" },
      { kind: "line", text: "hannah.whitlock@example.com" },
      { kind: "line", text: "+44 7700 900318" },
      { kind: "line", text: "Manchester" },
      { kind: "line", text: "linkedin.com/in/hannahwhitlock-data" },
      { kind: "heading", text: "Skills" },
      { kind: "bullets", items: en02Skills },
      { kind: "heading", text: "Languages" },
      { kind: "line", text: "English — Native" },
      { kind: "line", text: "French — C1" },
    ],
    main: [
      { kind: "name", text: "Hannah Whitlock" },
      { kind: "line", text: "Data Scientist" },
      { kind: "heading", text: "Profile" },
      { kind: "paragraph", text: en02Summary },
      { kind: "heading", text: "Experience" },
      {
        kind: "entry",
        left: "Senior Data Scientist, Kestrel Analytics Ltd",
        right: "01/2021 – Present",
        sub: "Manchester",
      },
      { kind: "bullets", items: en02Kestrel },
      {
        kind: "entry",
        left: "Data Analyst, Northgate Retail Group",
        right: "03/2019 – 12/2020",
        sub: "Leeds",
      },
      { kind: "bullets", items: en02Northgate },
      { kind: "heading", text: "Education" },
      {
        kind: "entry",
        left: "MSc Statistics, University of Leeds",
        right: "2017 – 2018",
        sub: "Distinction",
      },
      {
        kind: "entry",
        left: "BSc Mathematics, University of Sheffield",
        right: "2014 – 2017",
        sub: "First Class Honours",
      },
      { kind: "heading", text: "Publications" },
      {
        kind: "entry",
        left: "Forecasting basket demand with hierarchical models",
        right: "2020",
        sub: "Journal of Retail Analytics",
      },
      {
        kind: "entry",
        left: "Causal uplift modelling for loyalty campaigns",
        right: "Jun 2022",
        sub: "PyData Manchester",
      },
      { kind: "heading", text: "Certifications" },
      { kind: "line", text: "AWS Certified Machine Learning – Specialty, Amazon Web Services, 04/2022" },
    ],
    expected: {
      basics: {
        name: "Hannah Whitlock",
        label: "Data Scientist",
        email: "hannah.whitlock@example.com",
        phone: "+44 7700 900318",
        summary: en02Summary,
        location: { city: "Manchester" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/hannahwhitlock-data" }],
      },
      work: [
        {
          name: "Kestrel Analytics Ltd",
          position: "Senior Data Scientist",
          location: "Manchester",
          startDate: "2021-01",
          highlights: en02Kestrel,
        },
        {
          name: "Northgate Retail Group",
          position: "Data Analyst",
          location: "Leeds",
          startDate: "2019-03",
          endDate: "2020-12",
          highlights: en02Northgate,
        },
      ],
      education: [
        {
          institution: "University of Leeds",
          area: "Statistics",
          studyType: "MSc",
          startDate: "2017",
          endDate: "2018",
          score: "Distinction",
        },
        {
          institution: "University of Sheffield",
          area: "Mathematics",
          studyType: "BSc",
          startDate: "2014",
          endDate: "2017",
          score: "First Class Honours",
        },
      ],
      publications: [
        {
          name: "Forecasting basket demand with hierarchical models",
          publisher: "Journal of Retail Analytics",
          releaseDate: "2020",
        },
        {
          name: "Causal uplift modelling for loyalty campaigns",
          publisher: "PyData Manchester",
          releaseDate: "2022-06",
        },
      ],
      certificates: [
        {
          name: "AWS Certified Machine Learning – Specialty",
          issuer: "Amazon Web Services",
          date: "2022-04",
        },
      ],
      skills: en02Skills.map((name) => ({ name })),
      languages: [
        { language: "English", fluency: "Native" },
        { language: "French", fluency: "C1" },
      ],
    },
  },
  {
    id: "en-03-product-compact-pipe-headline",
    language: "en",
    format: "pdf",
    layout: "compact",
    notes:
      "The name line carries the headline after '|', jobs are dense '·'-separated entries with prose instead of bullets (expected as work.summary), and skills are an inline comma list (expected as one skill per name).",
    main: [
      { kind: "name", text: "Daniel Okafor | Senior Product Manager" },
      {
        kind: "line",
        text: "London · daniel.okafor@example.com · +44 7700 900452 · linkedin.com/in/dokafor-pm",
      },
      { kind: "paragraph", text: en03Summary },
      { kind: "heading", text: "Experience" },
      { kind: "entry", left: "Senior Product Manager · Lumenfold Ltd · London", right: "Mar 2021 – Present" },
      { kind: "paragraph", text: en03Lumenfold },
      { kind: "entry", left: "Product Manager · Copperline Payments · London", right: "Aug 2018 – Feb 2021" },
      { kind: "paragraph", text: en03Copperline },
      {
        kind: "entry",
        left: "Business Analyst · Harlow & Pike Consulting · London",
        right: "Sep 2015 – Jul 2018",
      },
      { kind: "paragraph", text: en03Harlow },
      { kind: "heading", text: "Education" },
      { kind: "entry", left: "BSc Economics · University of Bristol", right: "2012 – 2015" },
      { kind: "heading", text: "Additional" },
      { kind: "line", text: `Skills: ${en03Skills.join(", ")}` },
      { kind: "line", text: "Languages: English (native) · Yoruba (conversational)" },
      { kind: "line", text: "Certification: Certified Scrum Product Owner (CSPO), Scrum Alliance, 2019" },
    ],
    expected: {
      basics: {
        name: "Daniel Okafor",
        label: "Senior Product Manager",
        email: "daniel.okafor@example.com",
        phone: "+44 7700 900452",
        summary: en03Summary,
        location: { city: "London" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/dokafor-pm" }],
      },
      work: [
        {
          name: "Lumenfold Ltd",
          position: "Senior Product Manager",
          location: "London",
          startDate: "2021-03",
          summary: en03Lumenfold,
        },
        {
          name: "Copperline Payments",
          position: "Product Manager",
          location: "London",
          startDate: "2018-08",
          endDate: "2021-02",
          summary: en03Copperline,
        },
        {
          name: "Harlow & Pike Consulting",
          position: "Business Analyst",
          location: "London",
          startDate: "2015-09",
          endDate: "2018-07",
          summary: en03Harlow,
        },
      ],
      education: [
        {
          institution: "University of Bristol",
          area: "Economics",
          studyType: "BSc",
          startDate: "2012",
          endDate: "2015",
        },
      ],
      skills: en03Skills.map((name) => ({ name })),
      languages: [
        { language: "English", fluency: "native" },
        { language: "Yoruba", fluency: "conversational" },
      ],
      certificates: [
        { name: "Certified Scrum Product Owner (CSPO)", issuer: "Scrum Alliance", date: "2019" },
      ],
    },
  },
  {
    id: "en-04-nurse-education-first-volunteer",
    language: "en",
    format: "docx",
    layout: "single-column",
    notes:
      "Education comes before experience, all dates are year-only ranges, two jobs share one employer with the unit in the position, and a volunteering section must go to volunteer rather than work; skills are grouped ('Clinical:', 'Systems:').",
    main: [
      { kind: "name", text: "Megan O'Sullivan" },
      { kind: "line", text: "Registered Nurse — Critical Care" },
      { kind: "line", text: "Bristol | megan.osullivan@example.com | +44 7700 900781" },
      { kind: "heading", text: "Personal Statement" },
      { kind: "paragraph", text: en04Summary },
      { kind: "heading", text: "Education" },
      {
        kind: "entry",
        left: "BSc (Hons) Adult Nursing — University of the West of England",
        right: "2016 – 2019",
        sub: "First Class",
      },
      { kind: "heading", text: "Experience" },
      {
        kind: "entry",
        left: "Senior Staff Nurse, Intensive Care Unit — Severn Vale NHS Foundation Trust",
        right: "2021 – Present",
        sub: "Bristol",
      },
      { kind: "bullets", items: en04Icu },
      {
        kind: "entry",
        left: "Staff Nurse, Acute Medical Unit — Severn Vale NHS Foundation Trust",
        right: "2019 – 2021",
        sub: "Bristol",
      },
      { kind: "bullets", items: en04Amu },
      { kind: "heading", text: "Volunteering" },
      {
        kind: "entry",
        left: "Volunteer First Aider — Harbourside Community First Aid",
        right: "2017 – 2020",
      },
      { kind: "bullets", items: en04Volunteer },
      { kind: "heading", text: "Certificates" },
      { kind: "line", text: "Advanced Life Support (ALS) — Resuscitation Council UK, May 2022" },
      {
        kind: "line",
        text: "Mentorship and Practice Assessor Course — University of the West of England, Sep 2021",
      },
      { kind: "heading", text: "Skills" },
      {
        kind: "line",
        text: "Clinical: Ventilator management, Arterial line care, Sepsis management, IV cannulation",
      },
      { kind: "line", text: "Systems: Cerner, Datix, ICNARC reporting" },
      { kind: "heading", text: "Languages" },
      { kind: "line", text: "English (native), Irish (basic)" },
    ],
    expected: {
      basics: {
        name: "Megan O'Sullivan",
        label: "Registered Nurse — Critical Care",
        email: "megan.osullivan@example.com",
        phone: "+44 7700 900781",
        summary: en04Summary,
        location: { city: "Bristol" },
      },
      education: [
        {
          institution: "University of the West of England",
          area: "Adult Nursing",
          studyType: "BSc (Hons)",
          startDate: "2016",
          endDate: "2019",
          score: "First Class",
        },
      ],
      work: [
        {
          name: "Severn Vale NHS Foundation Trust",
          position: "Senior Staff Nurse, Intensive Care Unit",
          location: "Bristol",
          startDate: "2021",
          highlights: en04Icu,
        },
        {
          name: "Severn Vale NHS Foundation Trust",
          position: "Staff Nurse, Acute Medical Unit",
          location: "Bristol",
          startDate: "2019",
          endDate: "2021",
          highlights: en04Amu,
        },
      ],
      volunteer: [
        {
          organization: "Harbourside Community First Aid",
          position: "Volunteer First Aider",
          startDate: "2017",
          endDate: "2020",
          highlights: en04Volunteer,
        },
      ],
      certificates: [
        { name: "Advanced Life Support (ALS)", issuer: "Resuscitation Council UK", date: "2022-05" },
        {
          name: "Mentorship and Practice Assessor Course",
          issuer: "University of the West of England",
          date: "2021-09",
        },
      ],
      skills: [
        {
          name: "Clinical",
          keywords: ["Ventilator management", "Arterial line care", "Sepsis management", "IV cannulation"],
        },
        { name: "Systems", keywords: ["Cerner", "Datix", "ICNARC reporting"] },
      ],
      languages: [
        { language: "English", fluency: "native" },
        { language: "Irish", fluency: "basic" },
      ],
    },
  },
  {
    id: "en-05-designer-sidebar-awards-interests",
    language: "en",
    format: "pdf",
    layout: "sidebar",
    notes:
      "Sidebar skills are grouped by their sidebar headings ('Tools', 'Expertise'), dates use full month names, an awards section has an award summary line, and a bare 'Interests:' line at the end must become interests.",
    sidebar: [
      { kind: "heading", text: "Contact" },
      { kind: "line", text: "olivia.bennett@example.com" },
      { kind: "line", text: "+1 555 010 7731" },
      { kind: "line", text: "Austin, TX" },
      { kind: "line", text: "oliviabennett.example.com" },
      { kind: "line", text: "linkedin.com/in/olivia-bennett-design" },
      { kind: "heading", text: "Tools" },
      { kind: "bullets", items: en05Tools },
      { kind: "heading", text: "Expertise" },
      { kind: "bullets", items: en05Expertise },
      { kind: "heading", text: "Languages" },
      { kind: "line", text: "English — Native" },
      { kind: "line", text: "Portuguese — Professional working proficiency" },
    ],
    main: [
      { kind: "name", text: "Olivia Bennett" },
      { kind: "line", text: "Senior Product Designer" },
      { kind: "heading", text: "About" },
      { kind: "paragraph", text: en05Summary },
      { kind: "heading", text: "Experience" },
      {
        kind: "entry",
        left: "Senior Product Designer — Fernway Bank",
        right: "January 2020 – Present",
        sub: "Austin, TX",
      },
      { kind: "bullets", items: en05Fernway },
      {
        kind: "entry",
        left: "Product Designer — Pulsepoint Health",
        right: "September 2016 – December 2019",
        sub: "Remote",
      },
      { kind: "bullets", items: en05Pulsepoint },
      { kind: "heading", text: "Education" },
      { kind: "entry", left: "BFA Graphic Design — Rhode Island School of Design", right: "2012 – 2016" },
      { kind: "heading", text: "Awards" },
      {
        kind: "entry",
        left: "Gold, Digital Product Design — Northfield Design Awards",
        right: "2022",
        sub: "For the Fernway mobile onboarding redesign.",
      },
      { kind: "entry", left: "Designer of the Year — Fernway Bank", right: "2021" },
      { kind: "line", text: "Interests: Letterpress printing, trail running, urban sketching" },
    ],
    expected: {
      basics: {
        name: "Olivia Bennett",
        label: "Senior Product Designer",
        email: "olivia.bennett@example.com",
        phone: "+1 555 010 7731",
        url: "oliviabennett.example.com",
        summary: en05Summary,
        location: { city: "Austin", region: "TX" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/olivia-bennett-design" }],
      },
      work: [
        {
          name: "Fernway Bank",
          position: "Senior Product Designer",
          location: "Austin, TX",
          startDate: "2020-01",
          highlights: en05Fernway,
        },
        {
          name: "Pulsepoint Health",
          position: "Product Designer",
          location: "Remote",
          startDate: "2016-09",
          endDate: "2019-12",
          highlights: en05Pulsepoint,
        },
      ],
      education: [
        {
          institution: "Rhode Island School of Design",
          area: "Graphic Design",
          studyType: "BFA",
          startDate: "2012",
          endDate: "2016",
        },
      ],
      awards: [
        {
          title: "Gold, Digital Product Design",
          awarder: "Northfield Design Awards",
          date: "2022",
          summary: "For the Fernway mobile onboarding redesign.",
        },
        { title: "Designer of the Year", awarder: "Fernway Bank", date: "2021" },
      ],
      skills: [
        { name: "Tools", keywords: en05Tools },
        { name: "Expertise", keywords: en05Expertise },
      ],
      languages: [
        { language: "English", fluency: "Native" },
        { language: "Portuguese", fluency: "Professional working proficiency" },
      ],
      interests: [{ name: "Letterpress printing" }, { name: "trail running" }, { name: "urban sketching" }],
    },
  },
  {
    id: "en-06-finance-compact-undated-job",
    language: "en",
    format: "pdf",
    layout: "compact",
    notes:
      "Compact prose entries with a 'Since 2022' open start, an internship with no dates at all (no dates may be invented), and two skill groups plus two certificates packed into single '·'-separated lines.",
    main: [
      { kind: "name", text: "James Thornbury" },
      { kind: "line", text: "Senior Financial Analyst" },
      {
        kind: "line",
        text: "Chicago, IL · james.thornbury@example.com · +1 555 010 2290 · linkedin.com/in/jthornbury",
      },
      { kind: "paragraph", text: en06Summary },
      { kind: "heading", text: "Experience" },
      {
        kind: "entry",
        left: "Senior Financial Analyst · Harrowgate Capital Partners · Chicago, IL",
        right: "Since 2022",
      },
      { kind: "paragraph", text: en06Harrowgate },
      {
        kind: "entry",
        left: "Financial Analyst · Bramblewood Foods Inc. · Milwaukee, WI",
        right: "2018 – 2022",
      },
      { kind: "paragraph", text: en06Bramblewood },
      { kind: "entry", left: "Finance Intern · Ostrander & Lowe LLP · Chicago, IL" },
      { kind: "paragraph", text: en06Intern },
      { kind: "heading", text: "Education" },
      {
        kind: "entry",
        left: "B.S. Accountancy · University of Illinois Urbana-Champaign",
        right: "2014 – 2018",
      },
      { kind: "heading", text: "Skills & Credentials" },
      {
        kind: "line",
        text: "Modelling: Excel (VBA), Python (pandas), Anaplan · Reporting: Power BI, Hyperion, SAP S/4HANA",
      },
      {
        kind: "line",
        text: "Certifications: CFA Level II, CFA Institute, Aug 2023 · Financial Modeling & Valuation Analyst (FMVA), Corporate Finance Institute, 2021",
      },
      { kind: "line", text: "Languages: English (native), German (B2)" },
    ],
    expected: {
      basics: {
        name: "James Thornbury",
        label: "Senior Financial Analyst",
        email: "james.thornbury@example.com",
        phone: "+1 555 010 2290",
        summary: en06Summary,
        location: { city: "Chicago", region: "IL" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/jthornbury" }],
      },
      work: [
        {
          name: "Harrowgate Capital Partners",
          position: "Senior Financial Analyst",
          location: "Chicago, IL",
          startDate: "2022",
          summary: en06Harrowgate,
        },
        {
          name: "Bramblewood Foods Inc.",
          position: "Financial Analyst",
          location: "Milwaukee, WI",
          startDate: "2018",
          endDate: "2022",
          summary: en06Bramblewood,
        },
        {
          name: "Ostrander & Lowe LLP",
          position: "Finance Intern",
          location: "Chicago, IL",
          summary: en06Intern,
        },
      ],
      education: [
        {
          institution: "University of Illinois Urbana-Champaign",
          area: "Accountancy",
          studyType: "B.S.",
          startDate: "2014",
          endDate: "2018",
        },
      ],
      skills: [
        { name: "Modelling", keywords: ["Excel (VBA)", "Python (pandas)", "Anaplan"] },
        { name: "Reporting", keywords: ["Power BI", "Hyperion", "SAP S/4HANA"] },
      ],
      certificates: [
        { name: "CFA Level II", issuer: "CFA Institute", date: "2023-08" },
        {
          name: "Financial Modeling & Valuation Analyst (FMVA)",
          issuer: "Corporate Finance Institute",
          date: "2021",
        },
      ],
      languages: [
        { language: "English", fluency: "native" },
        { language: "German", fluency: "B2" },
      ],
    },
  },
];
