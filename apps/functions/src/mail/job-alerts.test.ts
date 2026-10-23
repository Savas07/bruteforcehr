import { alertPostingToJob, type AlertPosting, type Job } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { planAlertUpserts } from "./job-alerts";

const day1 = new Date("2026-10-20T06:00:00Z");
const day2 = new Date("2026-10-21T06:00:00Z");
const posting = (over: Partial<AlertPosting> = {}): AlertPosting => ({
  title: "Senior Frontend Engineer",
  company: "Northbeam Studio",
  location: "Berlin, Germany",
  url: "https://www.linkedin.com/jobs/view/4051229871",
  postedAt: null,
  salary: null,
  board: "linkedin",
  ...over,
});

describe("alert job upserts", () => {
  it("creates new jobs, merging duplicates within one alert", () => {
    let next = 0;
    const plan = planAlertUpserts(
      [
        alertPostingToJob(posting(), day1),
        alertPostingToJob(
          posting({ url: "https://de.indeed.com/viewjob?jk=7c1e55d0a9b34f21", board: "indeed" }),
          day1,
        ),
        alertPostingToJob(
          posting({ title: "Data Engineer", url: "https://www.linkedin.com/jobs/view/1" }),
          day1,
        ),
      ],
      [],
      () => `job-${++next}`,
      day1,
    );
    expect(plan.updated).toEqual([]);
    expect(plan.created.map((job) => [job.id, job.sourceKeys])).toEqual([
      [
        "job-1",
        [
          "alert_email:https://www.linkedin.com/jobs/view/4051229871",
          "alert_email:https://de.indeed.com/viewjob?jk=7c1e55d0a9b34f21",
        ],
      ],
      ["job-2", ["alert_email:https://www.linkedin.com/jobs/view/1"]],
    ]);
  });

  it("merges into stored jobs by source key or as the same job from another source", () => {
    const stored: Job[] = [
      { id: "known", ...alertPostingToJob(posting(), day1) },
      {
        id: "from-ats",
        ...alertPostingToJob(
          posting({ title: "Backend Engineer", url: "https://boards.greenhouse.io/acme/jobs/1" }),
          day1,
        ),
      },
    ];
    const plan = planAlertUpserts(
      [
        alertPostingToJob(posting(), day2),
        alertPostingToJob(
          posting({ title: "Backend Engineer", url: "https://www.xing.com/jobs/berlin-backend-1" }),
          day2,
        ),
      ],
      stored,
      () => "unused",
      day2,
    );
    expect(plan.created).toEqual([]);
    expect(plan.updated.map((job) => job.id)).toEqual(["known", "from-ats"]);
    expect(plan.updated[0]?.sources[0]?.lastSeenAt).toEqual(day2);
    expect(plan.updated[1]?.sourceKeys).toHaveLength(2);
  });
});
