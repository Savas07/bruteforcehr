import { describe, expect, it } from "vitest";
import { createAppIntl } from "../../i18n/intl";
import { clearFacet, FILTER_FACETS, type FilterPillVM, removableChips } from "./filterBarModel";
import { activeFilterCount, type JobsFilterState, readFilterParams } from "./filters";

const intl = createAppIntl({ language: "en", locale: "en-GB" });

/** Every facet set, plus a search text and a sort that no facet owns. */
const everything: JobsFilterState = readFilterParams({
  q: "react",
  remote: "remote",
  level: "senior",
  country: "DE",
  posted: "7",
  visa: "1",
  salary: "60000:EUR:year",
  source: "greenhouse",
  match: "good",
  sort: "newest",
});

describe("clearFacet", () => {
  it("removes exactly one filter per facet and keeps the search and sort", () => {
    expect(activeFilterCount(everything)).toBe(FILTER_FACETS.length);
    for (const facet of FILTER_FACETS) {
      const cleared = clearFacet(everything, facet);
      expect(activeFilterCount(cleared), facet).toBe(FILTER_FACETS.length - 1);
      expect(cleared.query).toBe("react");
      expect(cleared.sort).toBe("newest");
    }
    expect(clearFacet(everything, "match").minBand).toBeNull();
    expect(clearFacet(everything, "salary").filters.salaryMin).toBeNull();
    expect(clearFacet(everything, "workMode").filters.remoteTypes).toEqual([]);
  });
});

describe("removableChips", () => {
  const pill = (facet: FilterPillVM["facet"], label: string, active = true): FilterPillVM => ({
    facet,
    title: label,
    label,
    active,
  });

  it("lists the active pills with what removing each alone brings back", () => {
    const counts = { workMode: 0, seniority: 1, salary: 3 } as const;
    const chips = removableChips(
      [
        pill("workMode", "Work mode: On-site"),
        pill("location", "Location", false),
        pill("seniority", "Seniority: Intern"),
        pill("salary", "Salary: From €200,000 a year"),
      ],
      (facet) => (facet in counts ? counts[facet as keyof typeof counts] : 99),
      { intl },
    );
    expect(chips.map((chip) => chip.facet)).toEqual(["workMode", "seniority", "salary"]);
    expect(chips[0]).toMatchObject({ removeLabel: "Remove filter: Work mode: On-site", count: null });
    expect(chips[1]?.count).toEqual({ label: "+1", hint: "Shows 1 more job" });
    expect(chips[2]?.count).toEqual({ label: "+3", hint: "Shows 3 more jobs" });
  });
});
