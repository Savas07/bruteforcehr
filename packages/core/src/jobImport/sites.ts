import { detectRemoteType, detectSeniority, htmlToText, parseLocation } from "../jobs/normalize";
import { type HtmlElement, blockText, find, findAll, hasClass, textOf } from "./html";
import { cleanLine, employmentType, parseDate, salaryRange } from "./normalize";
import { EMPTY_POSTING, type ExtractedPosting } from "./posting";

/** A request for a public JSON API that serves the same posting (ATS boards). */
export interface ApiRequest {
  url: string;
  method: "GET" | "POST";
  body?: string;
}

/**
 * Site-specific knowledge for one host family. Adapters only read public pages and public APIs;
 * nothing here logs in or works around a block (ADR 0005).
 */
export interface SiteAdapter {
  readonly id: string;
  /** Host suffixes (`linkedin.com` matches `www.linkedin.com`, `de.linkedin.com`). */
  readonly hosts: readonly string[];
  /** ATS or employer careers site, as opposed to a job board. */
  readonly isDirectFromEmployer: boolean;
  /** Canonical posting URL (tracking parameters and UI state removed), or null if not a posting. */
  canonicalUrl?(url: URL): string | null;
  /** Public JSON API with the same posting, when the HTML does not carry it. */
  apiRequest?(url: URL): ApiRequest | null;
  parseApi?(json: unknown, url: URL): ExtractedPosting | null;
  parseHtml?(document: HtmlElement, url: URL): ExtractedPosting | null;
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Obj) : {});
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const byAttr = (name: string, value: string) => (element: HtmlElement) => element.attrs[name] === value;
const byClass = (name: string) => (element: HtmlElement) => hasClass(element, name);

/** Builds a posting from the fields a site adapter read; derived fields come from the shared normalizers. */
function posting(fields: {
  title: string | null;
  company: string | null;
  location?: string | readonly string[] | null;
  description?: string;
  employment?: readonly string[];
  remoteText?: string;
  datePosted?: Date | null;
  validThrough?: Date | null;
  salary?: ExtractedPosting["salary"];
  applyUrl?: string | null;
  companyUrl?: string | null;
  language?: string | null;
}): ExtractedPosting {
  const title = cleanLine(fields.title);
  const labels = (typeof fields.location === "string" ? [fields.location] : (fields.location ?? []))
    .map((label) => cleanLine(label))
    .filter((label): label is string => label !== null);
  const locations = [...new Set(labels)].slice(0, 20).map((label) => parseLocation(label));
  return {
    ...EMPTY_POSTING,
    title,
    company: cleanLine(fields.company),
    companyUrl: fields.companyUrl ?? null,
    locations,
    remoteType: detectRemoteType([fields.remoteText ?? "", title ?? "", ...labels].join(" ")),
    employmentType: employmentType(fields.employment ?? []),
    seniority: title === null ? null : detectSeniority(title),
    description: fields.description ?? "",
    datePosted: fields.datePosted ?? null,
    validThrough: fields.validThrough ?? null,
    salary: fields.salary ?? null,
    applyUrl: fields.applyUrl ?? null,
    language: fields.language ?? null,
  };
}

const firstPathId = (url: URL, pattern: RegExp): string | null => pattern.exec(url.pathname)?.[1] ?? null;

// ---------------------------------------------------------------------------------------------
// Job boards (single user-shared postings only, ADR 0005)

const linkedin: SiteAdapter = {
  id: "linkedin",
  hosts: ["linkedin.com"],
  isDirectFromEmployer: false,
  canonicalUrl(url) {
    const id =
      firstPathId(url, /\/jobs\/view\/(?:[^/]*-)?(\d{6,})\/?$/) ??
      firstPathId(url, /\/jobs-guest\/jobs\/api\/jobPosting\/(\d{6,})/) ??
      url.searchParams.get("currentJobId");
    return id !== null && /^\d{6,}$/.test(id) ? `https://www.linkedin.com/jobs/view/${id}` : null;
  },
  parseHtml(document) {
    const title = textOf(find(document, byClass("top-card-layout__title")) ?? find(document, byClass("topcard__title")));
    const company = textOf(find(document, byClass("topcard__org-name-link")));
    const location = textOf(
      find(document, (element) => hasClass(element, "topcard__flavor--bullet") && !hasClass(element, "num-applicants__figure")),
    );
    const markup = find(document, byClass("show-more-less-html__markup")) ?? find(document, byClass("description__text"));
    const criteria = new Map<string, string>();
    for (const item of findAll(document, byClass("description__job-criteria-item"))) {
      criteria.set(textOf(find(item, byClass("description__job-criteria-subheader"))), textOf(find(item, byClass("description__job-criteria-text"))));
    }
    return posting({
      title,
      company,
      location,
      description: markup === undefined ? "" : blockText(markup),
      employment: [criteria.get("Employment type") ?? criteria.get("Beschäftigungsverhältnis") ?? criteria.get("İstihdam türü") ?? ""],
      // The company link points at LinkedIn's company page, not the employer's site: no companyUrl.
    });
  },
};

const indeed: SiteAdapter = {
  id: "indeed",
  hosts: ["indeed.com", "indeed.co.uk", "indeed.de", "indeed.nl", "indeed.com.tr"],
  isDirectFromEmployer: false,
  canonicalUrl(url) {
    const jk = url.searchParams.get("jk") ?? url.searchParams.get("vjk");
    return jk !== null && /^[0-9a-f]{16}$/i.test(jk) ? `https://${url.hostname}/viewjob?jk=${jk}` : null;
  },
  parseHtml(document) {
    const title = textOf(
      find(document, byAttr("data-testid", "jobsearch-JobInfoHeader-title")) ??
        find(document, byClass("jobsearch-JobInfoHeader-title")),
    );
    const company = textOf(
      find(document, byAttr("data-testid", "inlineHeader-companyName")) ?? find(document, byAttr("data-company-name", "true")),
    );
    const location = textOf(
      find(document, byAttr("data-testid", "inlineHeader-companyLocation")) ?? find(document, byAttr("data-testid", "job-location")),
    );
    const description = find(document, (element) => element.attrs.id === "jobDescriptionText");
    return posting({ title, company, location, description: description === undefined ? "" : blockText(description) });
  },
};

const glassdoor: SiteAdapter = {
  id: "glassdoor",
  hosts: ["glassdoor.com", "glassdoor.co.uk", "glassdoor.de", "glassdoor.nl", "glassdoor.ca", "glassdoor.ie"],
  isDirectFromEmployer: false,
  parseHtml(document) {
    const description =
      find(document, (element) => /JobDetails_jobDescription/.test(element.attrs.class ?? "")) ??
      find(document, byClass("jobDescriptionContent"));
    return posting({
      title: textOf(find(document, byAttr("data-test", "job-title"))),
      company: textOf(find(document, byAttr("data-test", "employer-name"))),
      location: textOf(find(document, byAttr("data-test", "location"))),
      description: description === undefined ? "" : blockText(description),
    });
  },
};

const stepstone: SiteAdapter = {
  id: "stepstone",
  hosts: ["stepstone.de", "stepstone.at", "stepstone.nl", "stepstone.be", "stepstone.fr", "stepstone.co.uk"],
  isDirectFromEmployer: false,
  canonicalUrl(url) {
    return /\/stellenangebote--|\/job\//.test(url.pathname) ? `${url.origin}${url.pathname}` : null;
  },
  parseHtml(document) {
    const sections = findAll(document, (element) => /^section-text-.*-content$/.test(element.attrs["data-at"] ?? ""));
    return posting({
      title: textOf(find(document, byAttr("data-at", "header-job-title"))),
      company: textOf(find(document, byAttr("data-at", "metadata-company-name"))),
      location: textOf(find(document, byAttr("data-at", "metadata-location"))),
      employment: [textOf(find(document, byAttr("data-at", "metadata-contract-type"))), textOf(find(document, byAttr("data-at", "metadata-work-type")))],
      remoteText: textOf(find(document, byAttr("data-at", "metadata-work-type"))),
      description: sections.map((section) => blockText(section)).join("\n\n"),
    });
  },
};

const xing: SiteAdapter = {
  id: "xing",
  hosts: ["xing.com"],
  isDirectFromEmployer: false,
  canonicalUrl(url) {
    const id = firstPathId(url, /^\/jobs\/[^/]*-(\d{6,})\/?$/);
    return id === null ? null : `https://www.xing.com${url.pathname.replace(/\/$/, "")}`;
  },
  parseHtml(document) {
    const title = textOf(find(document, (element) => element.tag === "h1"));
    return title === "" ? null : posting({ title, company: null });
  },
};

const kariyer: SiteAdapter = {
  id: "kariyer_net",
  hosts: ["kariyer.net"],
  isDirectFromEmployer: false,
  canonicalUrl(url) {
    return /^\/is-ilani\/[^/]+-\d+\/?$/.test(url.pathname) ? `https://www.kariyer.net${url.pathname.replace(/\/$/, "")}` : null;
  },
  parseHtml(document) {
    const features = findAll(document, byAttr("data-test", "job-feature-item")).map((element) => textOf(element));
    const description = find(document, byAttr("data-test", "qualifications-and-job-description"));
    const detail = find(document, (element) => element.attrs.worktype !== undefined);
    const companyLink = find(document, byAttr("data-test", "company-name"));
    return posting({
      title: textOf(find(document, byAttr("data-test", "job-title"))),
      company: textOf(companyLink),
      location: textOf(find(document, byAttr("data-test", "company-location"))),
      employment: [detail?.attrs.worktype ?? "", ...features],
      remoteText: [detail?.attrs.workmodeltext ?? "", ...features].join(" "),
      description: description === undefined ? "" : blockText(description),
      language: "tr",
    });
  },
};

// ---------------------------------------------------------------------------------------------
// ATS boards (direct from employer): public posting APIs

const greenhouse: SiteAdapter = {
  id: "greenhouse",
  hosts: ["greenhouse.io"],
  isDirectFromEmployer: true,
  canonicalUrl(url) {
    const match = /^\/(?:embed\/job_app\?.*|([^/]+)\/jobs\/(\d+))/.exec(url.pathname);
    const token = match?.[1] ?? url.searchParams.get("for");
    const id = match?.[2] ?? url.searchParams.get("token") ?? url.searchParams.get("gh_jid");
    return token === null || token === undefined || id === null || id === undefined
      ? null
      : `https://${url.hostname}/${token}/jobs/${id}`;
  },
  apiRequest(url) {
    const match = /^\/([^/]+)\/jobs\/(\d+)/.exec(url.pathname);
    if (match === null) return null;
    const api = url.hostname.includes(".eu.") ? "boards-api.eu.greenhouse.io" : "boards-api.greenhouse.io";
    return { url: `https://${api}/v1/boards/${match[1]}/jobs/${match[2]}?content=true`, method: "GET" };
  },
  parseApi(json) {
    const job = obj(json);
    const title = str(job.title);
    if (title === null) return null;
    const offices = list(job.offices).map((office) => str(obj(office).location) ?? str(obj(office).name));
    const location = str(obj(job.location).name);
    return posting({
      title,
      company: str(job.company_name),
      location: location !== null ? location.split(/\s*;\s*/) : offices.filter((office): office is string => office !== null),
      description: htmlToText(str(job.content) ?? ""),
      datePosted: parseDate(job.first_published ?? job.updated_at),
      validThrough: parseDate(job.application_deadline),
      applyUrl: str(job.absolute_url),
      language: str(job.language),
    });
  },
};

const lever: SiteAdapter = {
  id: "lever",
  hosts: ["lever.co"],
  isDirectFromEmployer: true,
  canonicalUrl(url) {
    const match = /^\/([^/]+)\/([0-9a-f-]{36})/.exec(url.pathname);
    return match === null ? null : `https://${url.hostname}/${match[1]}/${match[2]}`;
  },
  apiRequest(url) {
    const match = /^\/([^/]+)\/([0-9a-f-]{36})/.exec(url.pathname);
    if (match === null) return null;
    const api = url.hostname.includes(".eu.") ? "api.eu.lever.co" : "api.lever.co";
    return { url: `https://${api}/v0/postings/${match[1]}/${match[2]}`, method: "GET" };
  },
  parseApi(json) {
    const job = obj(json);
    const title = str(job.text);
    if (title === null) return null;
    const categories = obj(job.categories);
    const sections = list(job.lists).map((section) => {
      const item = obj(section);
      return `${str(item.text) ?? ""}\n${htmlToText(`<ul>${str(item.content) ?? ""}</ul>`)}`;
    });
    const range = obj(job.salaryRange);
    return posting({
      title,
      // The postings API has no company name; JSON-LD on the page provides it.
      company: null,
      location: list(categories.allLocations).length > 0 ? (list(categories.allLocations) as string[]) : str(categories.location),
      description: [str(job.descriptionPlain) ?? htmlToText(str(job.description) ?? ""), ...sections, str(job.additionalPlain) ?? ""]
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .join("\n\n"),
      employment: [str(categories.commitment) ?? ""],
      remoteText: str(job.workplaceType) ?? "",
      datePosted: parseDate(job.createdAt),
      salary: salaryRange({
        min: range.min,
        max: range.max,
        currency: range.currency,
        unit: str(range.interval)?.replace(/^per-/, "").replace(/-.*/, "") ?? null,
      }),
      applyUrl: str(job.applyUrl) ?? str(job.hostedUrl),
    });
  },
};

const ashby: SiteAdapter = {
  id: "ashby",
  hosts: ["ashbyhq.com"],
  isDirectFromEmployer: true,
  canonicalUrl(url) {
    const match = /^\/([^/]+)\/([0-9a-f-]{36})/.exec(url.pathname);
    return match === null ? null : `https://jobs.ashbyhq.com/${match[1]}/${match[2]}`;
  },
  apiRequest(url) {
    const match = /^\/([^/]+)\/([0-9a-f-]{36})/.exec(url.pathname);
    return match === null
      ? null
      : { url: `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`, method: "GET" };
  },
  parseApi(json, url) {
    const id = /\/([0-9a-f-]{36})/.exec(url.pathname)?.[1];
    const job = obj(list(obj(json).jobs).find((item) => obj(item).id === id || str(obj(item).jobUrl)?.includes(id ?? "?")));
    const title = str(job.title);
    if (title === null) return null;
    const secondary = list(job.secondaryLocations).map((item) => str(obj(item).location));
    return posting({
      title,
      company: null,
      location: [str(job.location), ...secondary].filter((item): item is string => item !== null),
      description: str(job.descriptionPlain) ?? htmlToText(str(job.descriptionHtml) ?? ""),
      employment: [str(job.employmentType) ?? ""],
      remoteText: job.isRemote === true ? "remote" : (str(job.workplaceType) ?? ""),
      datePosted: parseDate(job.publishedAt),
      applyUrl: str(job.applyUrl) ?? str(job.jobUrl),
    });
  },
};

const workday: SiteAdapter = {
  id: "workday",
  hosts: ["myworkdayjobs.com"],
  isDirectFromEmployer: true,
  canonicalUrl(url) {
    const match = /^\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)\/job\/(.+?)\/?$/.exec(url.pathname);
    return match === null ? null : `https://${url.hostname}/${match[1]}/job/${match[2]}`;
  },
  apiRequest(url) {
    const match = /^\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)\/job\/(.+?)\/?$/.exec(url.pathname);
    const tenant = url.hostname.split(".")[0];
    if (match === null || tenant === undefined) return null;
    return { url: `https://${url.hostname}/wday/cxs/${tenant}/${match[1]}/job/${match[2]}`, method: "GET" };
  },
  parseApi(json) {
    const info = obj(obj(json).jobPostingInfo);
    const title = str(info.title);
    if (title === null) return null;
    const locations = [str(info.location), ...list(info.additionalLocations).map(str)].filter(
      (item): item is string => item !== null,
    );
    return posting({
      title,
      // `hiringOrganization.name` is the legal entity ("2100 NVIDIA USA"); the page's JSON-LD names the company.
      company: null,
      location: locations,
      description: htmlToText(str(info.jobDescription) ?? ""),
      employment: [str(info.timeType) ?? ""],
      remoteText: str(info.remoteType) ?? "",
      datePosted: parseDate(info.startDate),
      applyUrl: str(info.externalUrl),
    });
  },
};

const smartrecruiters: SiteAdapter = {
  id: "smartrecruiters",
  hosts: ["smartrecruiters.com"],
  isDirectFromEmployer: true,
  apiRequest(url) {
    const match = /^\/([^/]+)\/(\d{6,})/.exec(url.pathname);
    return match === null ? null : { url: `https://api.smartrecruiters.com/v1/companies/${match[1]}/postings/${match[2]}`, method: "GET" };
  },
  parseApi(json) {
    const job = obj(json);
    const title = str(job.name);
    if (title === null) return null;
    const location = obj(job.location);
    const sections = obj(obj(job.jobAd).sections);
    return posting({
      title,
      company: str(obj(job.company).name),
      location: str(location.fullLocation) ?? [str(location.city), str(location.country)?.toUpperCase()].filter(Boolean).join(", "),
      description: ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
        .map((key) => htmlToText(str(obj(sections[key]).text) ?? ""))
        .filter((part) => part !== "")
        .join("\n\n"),
      employment: [str(obj(job.typeOfEmployment).label) ?? ""],
      remoteText: location.remote === true ? "remote" : location.hybrid === true ? "hybrid" : "",
      datePosted: parseDate(job.releasedDate),
      applyUrl: str(job.applyUrl) ?? str(job.postingUrl),
    });
  },
};

/** Other ATS/career-site hosts: direct from the employer, JSON-LD carries the posting. */
const otherAts: SiteAdapter = {
  id: "ats",
  hosts: [
    "personio.de",
    "personio.com",
    "workable.com",
    "recruitee.com",
    "teamtailor.com",
    "successfactors.com",
    "successfactors.eu",
    "jobs.sap.com",
    "join.com",
    "bamboohr.com",
    "jobvite.com",
    "icims.com",
    "taleo.net",
    "breezy.hr",
    "rippling.com",
    "dover.com",
    "softgarden.io",
    "softgarden.de",
    "kenjo.io",
  ],
  isDirectFromEmployer: true,
};

export const SITE_ADAPTERS: readonly SiteAdapter[] = [
  linkedin,
  indeed,
  glassdoor,
  stepstone,
  xing,
  kariyer,
  greenhouse,
  lever,
  ashby,
  workday,
  smartrecruiters,
  otherAts,
];

/** Job boards whose ToS restrict automated access: user-shared single postings only (ADR 0005). */
export const RESTRICTED_SITES: readonly string[] = ["linkedin", "indeed", "glassdoor", "stepstone", "xing", "kariyer_net"];

/** Hosts that never are the employer's own domain (job boards, ATS, link shorteners). */
export const NOT_EMPLOYER_HOSTS: readonly string[] = [
  ...SITE_ADAPTERS.flatMap((adapter) => adapter.hosts),
  "monster.com",
  "monster.de",
  "jobs.ch",
  "lnkd.in",
  "bit.ly",
  "google.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "wikipedia.org",
];

export function siteFor(url: URL): SiteAdapter | null {
  const host = url.hostname.toLowerCase();
  return (
    SITE_ADAPTERS.find((adapter) => adapter.hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) ??
    null
  );
}
