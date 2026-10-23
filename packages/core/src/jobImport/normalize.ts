import type { EmploymentType, SalaryRange } from "../job";
import { foldText, hostOf } from "../jobs/normalize";
import type { SalaryPeriod } from "../profile";

// Field readers for URL import. Location, remote type, seniority, language and skills reuse the
// connector normalizers in ../jobs/normalize, so imported and ingested jobs dedupe alike.

const EMPLOYMENT_BY_WORDING: Readonly<Record<string, EmploymentType>> = {
  "full time": "full_time",
  fulltime: "full_time",
  "full-time": "full_time",
  permanent: "full_time",
  vollzeit: "full_time",
  festanstellung: "full_time",
  "tam zamanli": "full_time",
  "part time": "part_time",
  "part-time": "part_time",
  parttime: "part_time",
  teilzeit: "part_time",
  "yari zamanli": "part_time",
  contractor: "contract",
  contract: "contract",
  freelance: "contract",
  freelancer: "contract",
  "proje bazli": "contract",
  temporary: "temporary",
  temp: "temporary",
  seasonal: "temporary",
  befristet: "temporary",
  donemsel: "temporary",
  intern: "internship",
  internship: "internship",
  praktikum: "internship",
  werkstudent: "internship",
  staj: "internship",
  stajyer: "internship",
};

/** schema.org `employmentType` values (`FULL_TIME`) or job-board wording (`Vollzeit`) → `EmploymentType`. */
export function employmentType(values: readonly string[]): EmploymentType | null {
  for (const value of values) {
    const mapped = EMPLOYMENT_BY_WORDING[foldText(value.replace(/_/g, " "))];
    if (mapped !== undefined) return mapped;
  }
  return null;
}

/** A date or date-time → `Date`; date-only values are UTC midnight. Null when invalid or outside 2000–2100. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (text === "") return null;
  const date =
    typeof value === "number" ? new Date(value) : /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00Z`) : new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? date : null;
}

const PERIOD_BY_UNIT: Readonly<Record<string, SalaryPeriod>> = {
  hour: "hour",
  hourly: "hour",
  "per-hour-wage": "hour",
  day: "day",
  daily: "day",
  month: "month",
  monthly: "month",
  "per-month-salary": "month",
  year: "year",
  yearly: "year",
  annual: "year",
  annually: "year",
  "per-year-salary": "year",
};

/**
 * A published salary from loose values (schema.org `QuantitativeValue`, ATS compensation): positive
 * ordered numbers, an ISO currency and a known period (missing unit = per year). Null otherwise.
 */
export function salaryRange(input: { min: unknown; max: unknown; currency: unknown; unit: unknown }): SalaryRange | null {
  const amount = (value: unknown): number | null => {
    const parsed =
      typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[, ]/g, "")) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const min = amount(input.min);
  const max = amount(input.max);
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  const period = typeof input.unit === "string" && input.unit.trim() !== "" ? PERIOD_BY_UNIT[input.unit.trim().toLowerCase()] : "year";
  if ((min === null && max === null) || !/^[A-Z]{3}$/.test(currency) || period === undefined) return null;
  if (min !== null && max !== null && min > max) return null;
  return { min, max, currency, period, estimated: false };
}

/** The employer's domain from its website URL, unless that is a job board or ATS host. */
export function companyDomainOf(url: string | null, notEmployerHosts: readonly string[]): string | null {
  const host = url === null ? null : hostOf(url);
  if (host === null) return null;
  return notEmployerHosts.some((board) => host === board || host.endsWith(`.${board}`)) ? null : host;
}

/** Collapses whitespace in a one-line field and cuts it to `max` characters; null when empty. */
export function cleanLine(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\s\u00a0]+/g, " ").trim();
  return clean === "" ? null : clean.slice(0, max).trim();
}
