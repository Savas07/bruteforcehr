import type { CvContent } from "../cv";
import type { TailorEdit } from "./tailor";

/**
 * A small CV and edits proposed against it, shared by the tailor tests and the conformance vectors
 * (scripts/apply-vectors.ts). Not exported from the package.
 */
export const TAILOR_SAMPLE_CONTENT: CvContent = {
  basics: {
    name: "Deniz Arslan",
    label: "Backend Engineer",
    email: "deniz@example.com",
    summary: "Backend engineer building payment services in Go and PostgreSQL.",
  },
  work: [
    {
      name: "Paynova",
      position: "Senior Backend Engineer",
      startDate: "2021-03",
      highlights: [
        "Built a ledger service in Go handling 2M transactions a day.",
        "Moved deployments to Kubernetes with Helm.",
        "Mentored 3 engineers.",
      ],
    },
    {
      name: "Kargo Lab",
      position: "Backend Engineer",
      startDate: "2018-06",
      endDate: "2021-02",
      summary: "Shipment tracking APIs.",
      highlights: ["Wrote REST APIs in Node.js.", "Cut p95 latency by 40% with Redis caching."],
    },
  ],
  skills: [
    { name: "Languages", keywords: ["Go", "TypeScript", "SQL"] },
    { name: "Infrastructure", keywords: ["Kubernetes", "Helm", "Redis"] },
  ],
  projects: [{ name: "pgaudit-lite", description: "Audit logging for PostgreSQL.", highlights: [] }],
  meta: {
    template: "classic",
    theme: {
      accentColor: "#0f766e",
      fontPair: "inter-source-serif",
      density: "comfortable",
      paperSize: "a4",
    },
    sectionOrder: ["basics", "work", "skills", "projects"],
    customSections: [],
  },
};

/** The sample after the user rewrote Paynova's second bullet: edits proposed against it are stale. */
export const TAILOR_SAMPLE_STALE_CONTENT: CvContent = {
  ...TAILOR_SAMPLE_CONTENT,
  work: TAILOR_SAMPLE_CONTENT.work?.map((entry, index) =>
    index === 0
      ? {
          ...entry,
          highlights: entry.highlights?.map((text, i) => (i === 1 ? "Ran Kubernetes clusters." : text)),
        }
      : entry,
  ),
};

const edit = (fields: Partial<TailorEdit> & Pick<TailorEdit, "id" | "path" | "op">): TailorEdit => ({
  before: null,
  after: null,
  order: null,
  reason: "Mirrors the job's wording.",
  groundedIn: [fields.path],
  ...fields,
});

export const TAILOR_SAMPLE_EDITS: readonly TailorEdit[] = [
  edit({
    id: "e1",
    path: "/basics/summary",
    op: "replace",
    before: "Backend engineer building payment services in Go and PostgreSQL.",
    after: "Backend engineer building payment and ledger services in Go and PostgreSQL.",
  }),
  edit({
    id: "e2",
    path: "/work/0/highlights/1",
    op: "replace",
    before: "Moved deployments to Kubernetes with Helm.",
    after: "Moved service deployments to Kubernetes, packaged with Helm.",
  }),
  edit({ id: "e3", path: "/work/0/highlights/2", op: "remove", before: "Mentored 3 engineers." }),
  edit({
    id: "e4",
    path: "/work/0/highlights/0",
    op: "insert",
    after: "Owned the payments ledger end to end in Go.",
  }),
  edit({ id: "e5", path: "/work/0/highlights", op: "reorder", order: [1, 0, 2] }),
  edit({ id: "e6", path: "/skills/1/keywords/3", op: "insert", after: "PostgreSQL" }),
  edit({ id: "e7", path: "/skills", op: "reorder", order: [1, 0] }),
  edit({ id: "e8", path: "/meta/sectionOrder", op: "reorder", order: [0, 2, 1, 3] }),
  edit({
    id: "e9",
    path: "/work/1/highlights/1",
    op: "replace",
    before: "Cut p95 latency by 40% with Redis caching.",
    after: "Cut API p95 latency by 40% with Redis caching.",
  }),
];

export function sampleEdit(id: string): TailorEdit {
  const found = TAILOR_SAMPLE_EDITS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no sample edit ${id}`);
  return found;
}
