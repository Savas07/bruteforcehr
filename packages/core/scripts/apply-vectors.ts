// Conformance vectors for the Apply logic the iPhone app shares with TypeScript (BRIEF §4.4):
// `applyTailorEdits` and `isTailorTarget`, `fillMergeFields`, and `answersForJob`. Written to
// conformance/apply.json by scripts/conformance.ts and replayed by BFHRCore's ApplyConformanceTests.
import { ANSWERS_SAMPLE } from "../src/answers/sample";
import {
  sampleEdit,
  TAILOR_SAMPLE_CONTENT,
  TAILOR_SAMPLE_EDITS,
  TAILOR_SAMPLE_STALE_CONTENT as stale,
} from "../src/apply/sample";
import {
  answersForJob,
  applyTailorEdits,
  COVER_LETTER_MERGE_FIELDS,
  EU_AUTHORIZATION_COUNTRIES,
  fillMergeFields,
  isTailorTarget,
  type KitContext,
  type MergeValues,
  STARTER_COVER_LETTER_TEMPLATES,
  type TailorEdit,
  type TailorEditOp,
  type TailorIntensity,
} from "../src/index";

const content = TAILOR_SAMPLE_CONTENT;
const edits = TAILOR_SAMPLE_EDITS;
const all = edits.map((edit) => edit.id);

const forged: TailorEdit[] = [
  { ...sampleEdit("e2"), id: "x1", path: "/work/0/position", before: "Senior Backend Engineer" },
  { ...sampleEdit("e2"), id: "x2", after: "Something else." },
  { ...sampleEdit("e5"), id: "x3", order: [1, 0] },
  { ...sampleEdit("e4"), id: "x4", path: "/work/0/highlights/9" },
  {
    ...sampleEdit("e4"),
    id: "x5",
    path: "/projects/0/highlights/0",
    after: "Wrote the PostgreSQL audit hooks.",
  },
];

const tailorCases: { name: string; content: unknown; accepted: string[]; edits: readonly TailorEdit[] }[] = [
  { name: "none accepted", content, edits, accepted: [] },
  { name: "replacements only", content, edits, accepted: ["e1", "e9"] },
  { name: "one array: insert, remove, replace, reorder", content, edits, accepted: ["e2", "e3", "e4", "e5"] },
  { name: "nested arrays then parent reorder", content, edits, accepted: ["e6", "e7", "e8"] },
  { name: "everything", content, edits, accepted: all },
  { name: "everything, reversed", content, edits: [...edits].reverse(), accepted: [...all].reverse() },
  { name: "stale text", content: stale, edits, accepted: ["e2", "e3"] },
  {
    name: "invalid, conflicting and stale edits",
    content,
    edits: [...edits, ...forged],
    accepted: ["e2", ...forged.map((edit) => edit.id)],
  },
];

const targetPaths = [
  "/basics/name",
  "/basics/label",
  "/basics/summary",
  "/basics/email",
  "/work",
  "/work/0",
  "/work/0/name",
  "/work/0/position",
  "/work/0/startDate",
  "/work/0/summary",
  "/work/0/highlights",
  "/work/0/highlights/2",
  "/work/12/highlights/105",
  "/work/01/highlights/1",
  "/volunteer/1/highlights/0",
  "/projects",
  "/projects/0/description",
  "/projects/0/keywords/1",
  "/skills",
  "/skills/0/name",
  "/skills/0/keywords",
  "/skills/0/keywords/3",
  "/education/0/studyType",
  "/meta/sectionOrder",
  "/meta/template",
];
const ops: TailorEditOp[] = ["replace", "insert", "remove", "reorder"];
const intensities: (TailorIntensity | null)[] = [null, "light", "thorough"];

const mergeValues: MergeValues[] = [
  { name: "Deniz Arslan", role: "Data Engineer", company: "Nordwind GmbH" },
  {
    name: "  ",
    role: "Veri Mühendisi",
    company: "Ada Lojistik A.Ş.",
    hiring_manager: null,
    date: "24.10.2026",
  },
  { company: "{name} Ltd", email: "deniz@example.com", phone: "+90 555 010 2030", job_source: "Greenhouse" },
];
const mergeTexts = [
  ...STARTER_COVER_LETTER_TEMPLATES.map((template) => template.body),
  `${COVER_LETTER_MERGE_FIELDS.map((field) => `{${field}}`).join(" ")} {unknown} {Company} { company}`,
];

const kitContexts: KitContext[] = [
  { countryCode: "DE", currency: "EUR", language: "de", fallbackLanguage: "en" },
  { countryCode: "GB", currency: "GBP", language: "en", fallbackLanguage: "tr" },
  { countryCode: null, currency: null, language: null, fallbackLanguage: "tr" },
  { countryCode: "AT", currency: null, language: "de-AT", fallbackLanguage: "en" },
  { countryCode: "TR", currency: "TRY", language: "tr", fallbackLanguage: "en" },
];

export function buildApplyVectors() {
  return {
    format: 1,
    tailor: tailorCases.map((testCase) => ({
      ...testCase,
      expected: applyTailorEdits(testCase.content as typeof content, testCase.edits, testCase.accepted),
    })),
    targets: targetPaths.flatMap((path) =>
      ops.flatMap((op) =>
        intensities.map((intensity) => ({
          op,
          path,
          intensity,
          allowed: isTailorTarget(op, path, intensity ?? undefined),
        })),
      ),
    ),
    mergeFields: mergeTexts.flatMap((text) =>
      mergeValues.map((values) => ({ text, values, expected: fillMergeFields(text, values) })),
    ),
    answers: ANSWERS_SAMPLE,
    euCountries: EU_AUTHORIZATION_COUNTRIES,
    kits: kitContexts.map((context) => ({ context, expected: answersForJob(ANSWERS_SAMPLE, context) })),
    starters: STARTER_COVER_LETTER_TEMPLATES,
  };
}
