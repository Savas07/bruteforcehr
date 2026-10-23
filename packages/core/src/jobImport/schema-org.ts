import type { JobLocation } from "../job";
import { detectRemoteType, detectSeniority, htmlToText, parseLocation } from "../jobs/normalize";
import { type HtmlElement, elements, findAll, rawText, textOf } from "./html";
import { cleanLine, employmentType, parseDate, salaryRange } from "./normalize";
import { EMPTY_POSTING, type ExtractedPosting } from "./posting";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: Json | undefined): Json[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** `@type` matches (`JobPosting`, `schema:JobPosting`, `["JobPosting", …]`, full IRI). */
function hasType(node: JsonObject, type: string): boolean {
  return asArray(node["@type"]).some(
    (value) =>
      typeof value === "string" &&
      (value === type || value.endsWith(`/${type}`) || value.endsWith(`:${type}`)),
  );
}

/** First string of a value that may be a string, a `{ name }`/`{ @value }` object or an array. */
function text(value: Json | undefined): string | null {
  for (const item of asArray(value)) {
    if (typeof item === "string" && item.trim() !== "") return item;
    if (typeof item === "number") return String(item);
    if (isObject(item)) {
      const inner = text(item.name ?? item["@value"] ?? item.value);
      if (inner !== null) return inner;
    }
  }
  return null;
}

/**
 * Parses a JSON-LD script body. Pages often break JSON with raw control characters inside
 * strings or wrap it in CDATA/comments; those are repaired before giving up.
 */
export function parseJsonLd(body: string): Json | undefined {
  const trimmed = body
    .trim()
    .replace(/^\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>$/g, "")
    .replace(/^<!--|-->$/g, "")
    .trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed) as Json;
  } catch {
    try {
      // eslint-disable-next-line no-control-regex -- raw control characters are what breaks the JSON
      return JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, " ")) as Json;
    } catch {
      return undefined;
    }
  }
}

/** Every `JobPosting` object in the page's JSON-LD (top level, arrays and `@graph`). */
export function jsonLdJobPostings(document: HtmlElement): JsonObject[] {
  const postings: JsonObject[] = [];
  const visit = (value: Json, depth: number): void => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (!isObject(value)) return;
    if (hasType(value, "JobPosting")) {
      postings.push(value);
      return;
    }
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
      const inner = value[key];
      if (inner !== undefined) visit(inner, depth + 1);
    }
  };
  for (const script of findAll(
    document,
    (element) => element.tag === "script" && (element.attrs.type ?? "").toLowerCase().includes("ld+json"),
  )) {
    const parsed = parseJsonLd(rawText(script));
    if (parsed !== undefined) visit(parsed, 0);
  }
  return postings;
}

function locationOf(place: Json): JobLocation | null {
  if (typeof place === "string") return place.trim() === "" ? null : parseLocation(place);
  if (!isObject(place)) return null;
  const address = place.address ?? place;
  if (typeof address === "string") return address.trim() === "" ? null : parseLocation(address);
  const addressObject = asArray(address).find(isObject);
  if (addressObject === undefined) {
    const name = cleanLine(text(place.name));
    return name === null ? null : parseLocation(name);
  }
  const locality = cleanLine(text(addressObject.addressLocality), 120);
  const region = cleanLine(text(addressObject.addressRegion), 120);
  const country = cleanLine(text(addressObject.addressCountry), 120);
  // Lever writes "Singapore, Singapore" into addressLocality; repeated parts are dropped.
  const parts = [locality, region, country].filter(
    (part, index, all): part is string => part !== null && all.indexOf(part) === index,
  );
  if (parts.length === 0) return null;
  const parsed = parseLocation(parts.join(", "));
  return {
    label: parsed.label,
    // Workday writes "US, CA, Santa Clara" as the locality; only a single-part locality is a city.
    city: parsed.city ?? (locality === null || locality.includes(",") ? null : locality),
    countryCode: parsed.countryCode ?? (country !== null && /^[A-Z]{2}$/.test(country) ? country : null),
  };
}

/**
 * Maps a schema.org `JobPosting` (from JSON-LD or microdata) to an `ExtractedPosting`.
 * Description HTML becomes plain text with paragraph breaks.
 */
export function postingFromSchemaOrg(node: JsonObject): ExtractedPosting {
  const title = cleanLine(text(node.title) ?? text(node.name));
  const organization = asArray(node.hiringOrganization)[0];
  // Workday names the legal entity with a numeric company code ("2100 NVIDIA USA").
  const company = cleanLine(
    (typeof organization === "string" ? organization : text(organization ?? null))?.replace(
      /^\d{2,6}\s+(?=\p{L})/u,
      "",
    ),
  );
  const companyUrl = isObject(organization) ? (text(organization.sameAs) ?? text(organization.url)) : null;

  const locations: JobLocation[] = [];
  for (const place of asArray(node.jobLocation)) {
    const location = locationOf(place);
    if (location !== null && !locations.some((known) => known.label === location.label))
      locations.push(location);
  }

  const locationType = asArray(node.jobLocationType)
    .map((value) => text(value) ?? "")
    .join(" ");
  const eligibility = asArray(node.applicantLocationRequirements)
    .map((value) => text(value))
    .filter((value): value is string => value !== null);
  const remoteType =
    /telecommute/i.test(locationType) || (eligibility.length > 0 && locations.length === 0)
      ? "remote"
      : detectRemoteType([title ?? "", ...locations.map((location) => location.label)].join(" "));

  const salaryNode = asArray(node.baseSalary ?? node.estimatedSalary)[0];
  let salary = null;
  if (isObject(salaryNode)) {
    const value = asArray(salaryNode.value)[0];
    const quantity = isObject(value) ? value : { value: value ?? null };
    salary = salaryRange({
      min: quantity.minValue ?? quantity.value,
      max: quantity.maxValue ?? quantity.value,
      currency: text(salaryNode.currency) ?? text(quantity.currency),
      unit: text(quantity.unitText) ?? text(salaryNode.unitText),
    });
  }

  const description = typeof node.description === "string" ? htmlToText(node.description) : "";
  const skills = asArray(node.skills)
    .flatMap((value) => (typeof value === "string" ? value.split(/\s*[,;]\s*/) : [text(value) ?? ""]))
    .map((skill) => cleanLine(skill, 60))
    .filter((skill): skill is string => skill !== null && skill.split(" ").length <= 5)
    .slice(0, 100);

  return {
    ...EMPTY_POSTING,
    title,
    company,
    companyUrl: companyUrl === null || !/^https?:\/\//i.test(companyUrl) ? null : companyUrl,
    locations,
    remoteType,
    remoteEligibility: cleanLine(eligibility.join(", ")),
    employmentType: employmentType(asArray(node.employmentType).map((value) => text(value) ?? "")),
    seniority: title === null ? null : detectSeniority(title),
    description,
    datePosted: parseDate(node.datePosted),
    validThrough: parseDate(node.validThrough),
    salary,
    applyUrl: null,
    skills,
    language: cleanLine(text(node.inLanguage), 20),
  };
}

/** Microdata item → JSON object (`itemprop` values; nested `itemscope` items become objects). */
function microdataItem(scope: HtmlElement): JsonObject {
  const item: JsonObject = {};
  const itemType = scope.attrs.itemtype;
  if (itemType !== undefined) item["@type"] = itemType.trim().split(/\s+/);
  const visit = (element: HtmlElement): void => {
    for (const child of element.children) {
      if (child.type !== "element") continue;
      const props = child.attrs.itemprop?.trim().split(/\s+/) ?? [];
      const isScope = "itemscope" in child.attrs;
      if (props.length > 0) {
        let value: Json;
        if (isScope) value = microdataItem(child);
        else if (child.tag === "meta") value = child.attrs.content ?? "";
        else if (["a", "link", "area"].includes(child.tag)) value = child.attrs.href ?? "";
        else if (["img", "audio", "video", "source", "iframe"].includes(child.tag))
          value = child.attrs.src ?? "";
        else if (child.tag === "time") value = child.attrs.datetime ?? textOf(child);
        else if (child.tag === "data" || child.tag === "meter") value = child.attrs.value ?? textOf(child);
        else if (props.includes("description")) value = serialize(child);
        else value = child.attrs.content ?? textOf(child);
        for (const prop of props) {
          const existing = item[prop];
          item[prop] = existing === undefined ? value : [...asArray(existing), value];
        }
      }
      if (!isScope) visit(child);
    }
  };
  visit(scope);
  return item;
}

/** Inner HTML of an element (enough for `htmlToText`). */
function serialize(element: HtmlElement): string {
  return element.children
    .map((child) => {
      if (child.type === "text") return child.text.replace(/</g, "&lt;");
      return `<${child.tag}>${serialize(child)}</${child.tag}>`;
    })
    .join("");
}

/** Every microdata `JobPosting` item on the page. */
export function microdataJobPostings(document: HtmlElement): JsonObject[] {
  const postings: JsonObject[] = [];
  for (const element of elements(document)) {
    if (!("itemscope" in element.attrs)) continue;
    if (!/schema\.org\/JobPosting\b/i.test(element.attrs.itemtype ?? "")) continue;
    postings.push(microdataItem(element));
  }
  return postings;
}
