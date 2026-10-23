import type { Job, SavedSearchFilters } from "../job";
import type { SalaryPeriod } from "../profile";

const DAY_MS = 86_400_000;
/** Salary periods as multiples of a year (220 working days, 1,760 working hours). */
export const SALARY_PERIODS_PER_YEAR: Readonly<Record<SalaryPeriod, number>> = {
  year: 1,
  month: 12,
  day: 220,
  hour: 1_760,
};

/**
 * Whether a normalized job satisfies a search's filters. Connectors pass the filters on where the
 * API supports them; this check applies them uniformly afterwards. Unknown job values pass (a
 * posting that doesn't state its salary is not excluded by a salary minimum).
 */
export function passesSearchFilters(job: Job, filters: SavedSearchFilters, now: Date): boolean {
  if (filters.sources.length > 0 && !job.sources.some((source) => filters.sources.includes(source.source))) {
    return false;
  }
  if (
    filters.remoteTypes.length > 0 &&
    job.remoteType !== null &&
    !filters.remoteTypes.includes(job.remoteType)
  ) {
    return false;
  }
  if (filters.countryCodes.length > 0) {
    const countries = job.locations.flatMap((location) =>
      location.countryCode === null ? [] : [location.countryCode],
    );
    const remoteAllowed = job.remoteType === "remote" && filters.remoteTypes.includes("remote");
    if (
      countries.length > 0 &&
      !countries.some((country) => filters.countryCodes.includes(country)) &&
      !remoteAllowed
    ) {
      return false;
    }
  }
  if (filters.seniority.length > 0 && job.seniority !== null && !filters.seniority.includes(job.seniority)) {
    return false;
  }
  if (filters.visaSponsorship === true && job.visaSponsorship === false) return false;
  if (filters.postedWithinDays !== null) {
    const posted = job.postedAt ?? job.sources[0]?.firstSeenAt ?? null;
    if (posted !== null && now.getTime() - posted.getTime() > filters.postedWithinDays * DAY_MS) return false;
  }
  if (
    filters.salaryMin !== null &&
    job.salary !== null &&
    job.salary.currency === filters.salaryMin.currency
  ) {
    const top = (job.salary.max ?? job.salary.min ?? 0) * SALARY_PERIODS_PER_YEAR[job.salary.period];
    if (top < filters.salaryMin.amount * SALARY_PERIODS_PER_YEAR[filters.salaryMin.period]) return false;
  }
  return true;
}
