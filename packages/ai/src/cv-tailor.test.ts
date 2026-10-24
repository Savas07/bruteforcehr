import { applyTailorEdits, type CvContent, CvTailorResponseSchema } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { DailyCapError } from "./budget";
import { tailorCv, tailorCvLines, type CvTailorInput } from "./cv-tailor";
import { memoryLedger, scriptedProvider } from "./test-helpers";

const content: CvContent = {
  basics: {
    name: "Deniz Arslan",
    label: "Backend Engineer",
    summary: "Backend engineer building payment services in Go.",
  },
  work: [
    {
      name: "Paynova",
      position: "Senior Backend Engineer",
      startDate: "2021-03",
      highlights: ["Built a ledger service in Go handling 2M transactions a day.", "Mentored 3 engineers."],
    },
    {
      name: "Kargo Lab",
      position: "Backend Engineer",
      startDate: "2018-06",
      highlights: ["Moved deployments to Kubernetes.", "Cut p95 latency by 40% with Redis caching."],
    },
  ],
  skills: [{ name: "Languages", keywords: ["Go", "SQL"] }],
  meta: {
    template: "classic",
    theme: {
      accentColor: "#0f766e",
      fontPair: "inter-source-serif",
      density: "comfortable",
      paperSize: "a4",
    },
    sectionOrder: ["basics", "work", "skills"],
    customSections: [],
  },
};

const input: CvTailorInput = {
  content,
  cvLanguage: "en",
  job: {
    title: "Payments Platform Engineer",
    company: "Ledgerly",
    skills: ["go", "kafka", "terraform"],
    description:
      "You build high-volume payment systems in Go with Kafka and Terraform. Mentoring matters to us.",
  },
  locale: "en",
  intensity: "thorough",
};

const proposal = (fields: Record<string, unknown>) => ({
  text: "",
  order: [],
  reason: "Fits the job.",
  sources: [],
  ...fields,
});

describe("tailorCvLines", () => {
  it("lists every text value with its pointer and announces arrays", () => {
    const lines = tailorCvLines(content);
    expect(lines).toContain("/work (2 items)");
    expect(lines).toContain("/work/0/highlights (2 items)");
    expect(lines).toContain('/work/0/highlights/1 = "Mentored 3 engineers."');
    expect(lines).toContain('/meta/sectionOrder/2 = "skills"');
    expect(lines.some((line) => line.startsWith("/meta/theme"))).toBe(false);
  });
});

describe("tailorCv", () => {
  it("keeps grounded edits, takes `before` from the CV and numbers edits in order", async () => {
    const provider = scriptedProvider([
      {
        edits: [
          proposal({
            op: "replace",
            path: "/work/0/highlights/0",
            text: "Built a high-volume payment ledger service in Go handling 2M transactions a day.",
            sources: ["/work/0/highlights/0", "/nowhere"],
          }),
          proposal({ op: "reorder", path: "/work/0/highlights", order: [1, 0] }),
          proposal({
            op: "insert",
            path: "/skills/0/keywords/2",
            text: "Redis",
            sources: ["/work/1/highlights/1"],
          }),
          proposal({ op: "remove", path: "/work/1/highlights/0" }),
        ],
      },
    ]);
    const result = await tailorCv(input, { provider, ledger: memoryLedger().ledger });
    expect(result.dropped).toBe(0);
    expect(result.edits.map((edit) => [edit.id, edit.op, edit.path])).toEqual([
      ["e1", "replace", "/work/0/highlights/0"],
      ["e2", "reorder", "/work/0/highlights"],
      ["e3", "insert", "/skills/0/keywords/2"],
      ["e4", "remove", "/work/1/highlights/0"],
    ]);
    expect(result.edits[0]).toMatchObject({
      before: "Built a ledger service in Go handling 2M transactions a day.",
      groundedIn: ["/work/0/highlights/0"],
    });
    expect(result.edits[1]).toMatchObject({
      before: "Built a ledger service in Go handling 2M transactions a day. · Mentored 3 engineers.",
      after: "Mentored 3 engineers. · Built a ledger service in Go handling 2M transactions a day.",
    });
    expect(result.edits[3]).toMatchObject({ before: "Moved deployments to Kubernetes.", after: null });
    expect(CvTailorResponseSchema.safeParse({ ...result, model: result.model }).success).toBe(true);
    const applied = applyTailorEdits(content, result.edits, ["e1", "e2", "e3", "e4"]);
    expect(applied.skipped).toEqual([]);
    expect(applied.content.skills?.[0]?.keywords).toEqual(["Go", "SQL", "Redis"]);
  });

  it("drops edits that add a number, a skill from the job, or a fact from another job", async () => {
    const provider = scriptedProvider([
      {
        edits: [
          // Invented number.
          proposal({ op: "replace", path: "/work/0/highlights/1", text: "Mentored 5 engineers." }),
          // Skill only the job names (lower-case, so only the job-term check catches it).
          proposal({
            op: "replace",
            path: "/basics/summary",
            text: "Backend engineer building payment services in Go and kafka.",
          }),
          // Kubernetes and 40% belong to Kargo Lab, not Paynova.
          proposal({
            op: "insert",
            path: "/work/0/highlights/2",
            text: "Moved deployments to Kubernetes.",
            sources: ["/work/1/highlights/0"],
          }),
          proposal({ op: "replace", path: "/work/0/highlights/0", text: "Cut ledger latency by 40% in Go." }),
          // Placeholder, a path tailoring may not touch, a broken reorder.
          proposal({
            op: "replace",
            path: "/work/1/highlights/0",
            text: "Moved [X] deployments to Kubernetes.",
          }),
          proposal({ op: "replace", path: "/work/0/position", text: "Staff Backend Engineer" }),
          proposal({ op: "reorder", path: "/work/1/highlights", order: [0, 0] }),
        ],
      },
    ]);
    const result = await tailorCv(input, { provider, ledger: memoryLedger().ledger });
    expect(result.edits).toEqual([]);
    expect(result.dropped).toBe(7);
    expect(result.dropReasons).toEqual({ path: 1, invalid: 2, ungrounded: 3, job_term: 1 });
    expect(result.droppedTerms).toEqual(expect.arrayContaining(["5", "kafka", "Kubernetes", "40%"]));
  });

  it("allows only light edits at light intensity", async () => {
    const provider = scriptedProvider([
      {
        edits: [
          proposal({
            op: "replace",
            path: "/basics/summary",
            text: "Payment backend engineer working in Go.",
          }),
          proposal({ op: "reorder", path: "/work/1/highlights", order: [1, 0] }),
        ],
      },
    ]);
    const result = await tailorCv(
      { ...input, intensity: "light" },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(result.edits.map((edit) => edit.path)).toEqual(["/work/1/highlights"]);
    expect(result.dropReasons.path).toBe(1);
  });

  it("is refused before calling the model when the daily cap is reached", async () => {
    const provider = scriptedProvider([{ edits: [] }]);
    await expect(tailorCv(input, { provider, ledger: memoryLedger(1).ledger })).rejects.toBeInstanceOf(
      DailyCapError,
    );
    expect(provider.requests).toEqual([]);
  });
});
