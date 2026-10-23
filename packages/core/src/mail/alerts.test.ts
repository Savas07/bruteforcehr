import { describe, expect, it } from "vitest";
import { JobSchema } from "../job";
import { alertPostingToJob, alertTextFromHtml, parseJobAlert, postedAtOf, salaryOf } from "./alerts";

const at = new Date("2026-10-20T05:00:00Z");
const alert = (fromAddress: string, text: string, html: string | null = null) =>
  parseJobAlert({ fromAddress, subject: "Job alert", text, html, receivedAt: at });

describe("job-alert parser", () => {
  it("reads LinkedIn text cards and strips tracking from the links", () => {
    const postings = alert(
      "jobalerts-noreply@linkedin.com",
      `Your job alert for frontend in Berlin
2 new jobs match your preferences.

Senior Frontend Engineer
Northbeam Studio · Berlin, Germany (Hybrid)
Actively recruiting
View job: https://www.linkedin.com/comm/jobs/view/4051229871/?trackingId=Zx1&refId=8f&trk=eml-job_card

Frontend Developer
Mercator Travel · Berlin, Germany
View job: https://www.linkedin.com/comm/jobs/view/4051230017/?trackingId=Ab9&trk=eml-job_card

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=frontend
Unsubscribe: https://www.linkedin.com/comm/jobs/alerts?trk=unsub`,
    );
    expect(
      postings.map(({ title, company, location, url, board }) => ({ title, company, location, url, board })),
    ).toEqual([
      {
        title: "Senior Frontend Engineer",
        company: "Northbeam Studio",
        location: "Berlin, Germany (Hybrid)",
        url: "https://www.linkedin.com/jobs/view/4051229871",
        board: "linkedin",
      },
      {
        title: "Frontend Developer",
        company: "Mercator Travel",
        location: "Berlin, Germany",
        url: "https://www.linkedin.com/jobs/view/4051230017",
        board: "linkedin",
      },
    ]);
  });

  it("keeps HTML links: title anchors, logo + title anchors and repeated buttons", () => {
    const html = `<table><tr><td><h2>Neue Jobs für dich</h2></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4062118830/?trk=logo"><img alt="Alpenwerk"></a>
<a href="https://www.linkedin.com/comm/jobs/view/4062118830/?trk=title&amp;refId=1">Backend Entwickler (m/w/d)</a>
<p>Alpenwerk Software · München</p><p>Schnellbewerbung</p></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4062120457/?trk=logo"><img alt="Isarlogik"></a>
<a href="https://www.linkedin.com/comm/jobs/view/4062120457/?trk=title">Senior Java Entwickler</a>
<p>Isarlogik GmbH · München</p></td></tr></table>`;
    expect(alertTextFromHtml('<a href="https://x.example/a?b=1&amp;c=2">Go</a>')).toBe(
      "Go <https://x.example/a?b=1&c=2>",
    );
    const postings = alert("jobs-listings@linkedin.com", "Neue Jobs für dich", html);
    expect(postings.map((p) => [p.title, p.company, p.location, p.url])).toEqual([
      [
        "Backend Entwickler (m/w/d)",
        "Alpenwerk Software",
        "München",
        "https://www.linkedin.com/jobs/view/4062118830",
      ],
      [
        "Senior Java Entwickler",
        "Isarlogik GmbH",
        "München",
        "https://www.linkedin.com/jobs/view/4062120457",
      ],
    ]);
  });

  it("reads Indeed salary and age lines and canonicalizes redirect links by job key", () => {
    const [first, second] = alert(
      "alert@indeed.com",
      `Backend Engineer jobs in Remote

Backend Engineer (Go)
Quarry Systems - Remote
$140,000 - $165,000 a year
Easily apply
Just posted
https://www.indeed.com/rc/clk?jk=3f2a9c1d7e6b5a40&from=ja&tk=1hg2

Platform Engineer
Fernway - New York, NY
5 days ago
https://www.indeed.com/pagead/clk?jk=0be7713c9d2a6f58&from=ja`,
    );
    expect(first).toMatchObject({
      title: "Backend Engineer (Go)",
      company: "Quarry Systems",
      location: "Remote",
      url: "https://www.indeed.com/viewjob?jk=3f2a9c1d7e6b5a40",
      salary: { min: 140_000, max: 165_000, currency: "USD", period: "year", estimated: false },
      postedAt: at,
    });
    expect(second?.url).toBe("https://www.indeed.com/viewjob?jk=0be7713c9d2a6f58");
    expect(second?.postedAt).toEqual(new Date(at.getTime() - 5 * 86_400_000));
  });

  it("puts the Glassdoor employer above the title and drops its rating", () => {
    const [posting] = alert(
      "noreply@glassdoor.com",
      `New jobs for you

Harbor Analytics 4.2 ★
Product Manager
Amsterdam
€65K - €80K (Glassdoor est.)
https://www.glassdoor.com/partner/jobListing.htm?pos=101&jobListingId=1009471236001&jrtk=5`,
    );
    expect(posting).toMatchObject({
      title: "Product Manager",
      company: "Harbor Analytics",
      location: "Amsterdam",
      url: "https://www.glassdoor.com/job-listing/j?jl=1009471236001",
      salary: { min: 65_000, max: 80_000, currency: "EUR", period: "year", estimated: true },
    });
  });

  it("reads one-line cards from other senders, and nothing from ordinary mail", () => {
    const postings = alert(
      "careers@larkspur-health.example",
      `New roles at Larkspur Health:

Data Engineer — Larkspur Health — Manchester
https://careers.larkspur-health.example/jobs/data-engineer-1190?utm_source=alert&ref=mail&team=data`,
    );
    expect(postings).toEqual([
      expect.objectContaining({
        title: "Data Engineer",
        company: "Larkspur Health",
        location: "Manchester",
        url: "https://careers.larkspur-health.example/jobs/data-engineer-1190?team=data",
        board: null,
      }),
    ]);
    expect(
      alert(
        "marcus@brightwave.io",
        "Does Wednesday 28 October at 10:00 ET work?\nHere's the link: https://meet.google.com/bwq-ztkx-rmh\n\nBest,\nMarcus",
      ),
    ).toEqual([]);
    expect(alert("alert@indeed.com", "Backend Engineer – Quarry Systems – Remote\nSee all jobs")).toEqual([]);
  });

  it("parses salaries and posting ages in EN/DE/TR", () => {
    expect(salaryOf("52.000 € - 64.000 € pro Jahr")).toMatchObject({
      min: 52_000,
      max: 64_000,
      period: "year",
    });
    expect(salaryOf("45.000 TL - 60.000 TL / ay")).toMatchObject({ currency: "TRY", period: "month" });
    expect(salaryOf("$70 - $85 an hour")).toMatchObject({ min: 70, max: 85, period: "hour" });
    expect(salaryOf("Berlin, Germany")).toBeNull();
    expect(postedAtOf("vor 3 Tagen", at)).toEqual(new Date(at.getTime() - 3 * 86_400_000));
    expect(postedAtOf("2 gün önce", at)).toEqual(new Date(at.getTime() - 2 * 86_400_000));
    expect(postedAtOf("Bugün", at)).toEqual(at);
    expect(postedAtOf("Senior Engineer", at)).toBeNull();
  });

  it("turns a posting into a valid alert_email job draft", () => {
    const [posting] = alert(
      "jobagent@stepstone.de",
      `DevOps Engineer (m/w/d)
Rheinwerk Cloud GmbH
Köln
Zum Job: https://www.stepstone.de/stellenangebote--DevOps-Engineer-Koeln-Rheinwerk--10234567-inline.html?cid=JobAgent`,
    );
    if (posting === undefined) throw new Error("expected a posting");
    const draft = alertPostingToJob(posting, at);
    expect(JobSchema.parse({ id: "j1", ...draft }).sourceKeys).toEqual([
      "alert_email:https://www.stepstone.de/stellenangebote--DevOps-Engineer-Koeln-Rheinwerk--10234567-inline.html",
    ]);
    expect(draft.sources[0]).toMatchObject({
      source: "alert_email",
      sourceId: null,
      isDirectFromEmployer: false,
    });
    expect(draft.locations[0]).toMatchObject({ label: "Köln" });
  });
});
