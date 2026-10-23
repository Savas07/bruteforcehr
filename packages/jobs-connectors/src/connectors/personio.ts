import { type EmploymentType, decodeEntities } from "@bfhr/core";
import { z } from "zod";
import { parseDate } from "../listing";
import { type BoardConnector, type Listing, SourceError } from "../types";

const PositionSchema = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().min(1),
  subcompany: z.string().nullish(),
  office: z.string().nullish(),
  additionalOffices: z.array(z.string()),
  department: z.string().nullish(),
  recruitingCategory: z.string().nullish(),
  jobDescriptions: z.array(z.object({ name: z.string().nullish(), value: z.string().nullish() })),
  employmentType: z.string().nullish(),
  schedule: z.string().nullish(),
  keywords: z.string().nullish(),
  createdAt: z.string().nullish(),
});

/** `employmentType` values that decide on their own; otherwise `schedule` does. */
const EMPLOYMENT_TYPES: Readonly<Record<string, EmploymentType>> = {
  intern: "internship",
  trainee: "internship",
  freelance: "contract",
  working_student: "part_time",
};

const SCHEDULES: Readonly<Record<string, EmploymentType>> = {
  "full-time": "full_time",
  "part-time": "part_time",
};

/** Text of an XML fragment: CDATA sections verbatim, other text entity-decoded. */
function xmlText(fragment: string): string {
  const cdata = [...fragment.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)];
  return (cdata.length > 0 ? cdata.map((match) => match[1] ?? "").join("") : decodeEntities(fragment)).trim();
}

/** Contents of every `<tag>…</tag>` in `xml` (no nesting of the same tag in Personio's feed). */
function elements(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => match[1] ?? "");
}

/**
 * Personio recruiting XML feed (keyless): `GET https://{company}.jobs.personio.de/xml`, every
 * published position with its description blocks. Parsed with a small tag reader (flat schema).
 */
export const personio: BoardConnector = {
  id: "personio",
  ats: "personio",
  label: "Personio",
  kind: "keyless",
  markets: ["remote", "TR", "DE", "NL", "GB", "US"],
  attribution: { label: "Personio", url: "https://www.personio.com", minSize: null },
  async list(board, context): Promise<Listing[]> {
    const origin = `https://${encodeURIComponent(board.boardToken)}.jobs.personio.de`;
    const response = await context.http.getText(`${origin}/xml`, {
      headers: { Accept: "application/xml, text/xml" },
    });
    if (!/<workzag-jobs[\s>]/.test(response.body))
      throw new SourceError("invalid_response", "not a Personio feed");
    return elements(response.body, "position").map((block) => {
      // Description blocks hold <name> and additional offices <office>, so single fields are read
      // from the position without those lists.
      const head = block.replace(/<(jobDescriptions|additionalOffices)>[\s\S]*?<\/\1>/g, "");
      const field = (tag: string) => {
        const [value] = elements(head, tag);
        return value === undefined ? null : xmlText(value);
      };
      const parsed = PositionSchema.safeParse({
        id: field("id"),
        name: field("name"),
        subcompany: field("subcompany"),
        office: field("office"),
        additionalOffices: elements(elements(block, "additionalOffices")[0] ?? "", "office").map(xmlText),
        department: field("department"),
        recruitingCategory: field("recruitingCategory"),
        jobDescriptions: elements(block, "jobDescription").map((description) => {
          const [name] = elements(description, "name");
          const [value] = elements(description, "value");
          return {
            name: name === undefined ? null : xmlText(name),
            value: value === undefined ? null : xmlText(value),
          };
        }),
        employmentType: field("employmentType"),
        schedule: field("schedule"),
        keywords: field("keywords"),
        createdAt: field("createdAt"),
      });
      if (!parsed.success) throw new SourceError("invalid_response", "unexpected Personio position");
      const position = parsed.data;
      const url = `${origin}/job/${position.id}`;
      return {
        source: "personio",
        sourceId: `${board.boardToken}:${position.id}`,
        url,
        applyUrl: url,
        isDirectFromEmployer: true,
        title: position.name,
        // Subcompanies may carry an internal number ("ottonova Holding AG - 9680").
        company: position.subcompany?.replace(/\s+-\s+\d+$/, "") || board.boardToken,
        locations: [
          ...new Set(
            [position.office ?? "", ...position.additionalOffices].filter((office) => office !== ""),
          ),
        ],
        employmentType:
          EMPLOYMENT_TYPES[position.employmentType ?? ""] ?? SCHEDULES[position.schedule ?? ""] ?? null,
        description: position.jobDescriptions
          .filter((description) => (description.value ?? "") !== "")
          .map((description) => `<h3>${description.name ?? ""}</h3>${description.value ?? ""}`)
          .join("\n"),
        postedAt: parseDate(position.createdAt),
        tags: [position.department, position.recruitingCategory, ...(position.keywords ?? "").split(",")]
          .map((tag) => (tag ?? "").trim())
          .filter((tag) => tag !== ""),
      };
    });
  },
};
