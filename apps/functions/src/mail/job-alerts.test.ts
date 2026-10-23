import { alertPostingToJob, type AlertPosting, type Job } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { planUpserts } from "../jobs/store";

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

// Alert drafts go through the jobs pipeline's dedupe (JobStore.upsert → planUpserts).
describe("alert postings in the jobs dedupe", () => {
  it("merges one posting seen on two boards and keeps distinct postings apart", () => {
    let next = 0;
    const plan = planUpserts(
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
    expect(plan.jobs.map((job) => [job.id, job.sourceKeys])).toEqual([
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

  it("merges a repeated alert posting, and one the search already found, into the stored job", () => {
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
    const plan = planUpserts(
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
    expect(plan.updated).toEqual(["known", "from-ats"]);
    expect(plan.jobs[0]?.sources[0]?.lastSeenAt).toEqual(day2);
    expect(plan.jobs[1]?.sourceKeys).toHaveLength(2);
  });
});
