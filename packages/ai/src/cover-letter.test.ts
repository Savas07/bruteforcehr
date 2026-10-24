import type { CvContent } from "@bfhr/core";
import { describe, expect, it } from "vitest";
import { type CoverLetterInput, draftCoverLetter, isFirstPerson } from "./cover-letter";
import { memoryLedger, scriptedProvider } from "./test-helpers";

const content: CvContent = {
  basics: {
    name: "Deniz Arslan",
    email: "deniz@example.com",
    summary: "Backend engineer building payment services in Go.",
  },
  work: [
    {
      name: "Paynova",
      position: "Senior Backend Engineer",
      startDate: "2021-03",
      highlights: ["Built a ledger service in Go handling 2M transactions a day.", "Mentored 3 engineers."],
    },
  ],
  skills: [{ name: "Languages", keywords: ["Go", "PostgreSQL"] }],
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

const input: CoverLetterInput = {
  content,
  cvLanguage: "en",
  job: {
    title: "Payments Platform Engineer",
    company: "Ledgerly",
    skills: ["go", "kafka"],
    description:
      "Ledgerly processes payments for 4,000 merchants across Europe. You build services in Go and Kafka.",
  },
  tone: "warm",
  language: "en",
  template: null,
  mergeValues: { name: "Deniz Arslan", email: "deniz@example.com" },
};

const sentence = (text: string, about: "candidate" | "company" | "other") => ({ text, about });

describe("isFirstPerson", () => {
  it("detects the first person in each letter language", () => {
    expect(isFirstPerson("I built a ledger.", "en")).toBe(true);
    expect(isFirstPerson("The team builds ledgers.", "en")).toBe(false);
    expect(isFirstPerson("Ich habe ein Ledger gebaut.", "de")).toBe(true);
    expect(isFirstPerson("Das Team baut Ledger.", "de")).toBe(false);
    expect(isFirstPerson("Go ile bir ledger servisi geliştirdim.", "tr")).toBe(true);
    expect(isFirstPerson("Ekibiniz ödeme sistemleri geliştiriyor.", "tr")).toBe(false);
  });
});

describe("draftCoverLetter", () => {
  it("checks each sentence against its side and fills the merge fields", async () => {
    const provider = scriptedProvider([
      {
        subject: "Application: {role}",
        greeting: "Dear Hiring Team,",
        paragraphs: [
          {
            sentences: [
              sentence("I'd like to join {company} as {role}.", "candidate"),
              sentence("{company} processes payments for 4,000 merchants across Europe.", "company"),
            ],
          },
          {
            sentences: [
              sentence(
                "At Paynova I built a ledger service in Go handling 2M transactions a day.",
                "candidate",
              ),
              // Kafka is the job's, not the CV's: removed even though it is labelled "company".
              sentence("I have run Kafka clusters in production.", "company"),
              // A company fact the posting doesn't state.
              sentence("Ledgerly won the Fintech Award.", "company"),
              // An invented number becomes a placeholder.
              sentence("I mentored 3 engineers and cut costs by 25%.", "candidate"),
            ],
          },
        ],
        closing: "Kind regards,",
      },
    ]);
    const result = await draftCoverLetter(input, { provider, ledger: memoryLedger().ledger });
    expect(result.subject).toBe("Application: Payments Platform Engineer");
    expect(result.body).toBe(
      [
        "Dear Hiring Team,",
        "I'd like to join Ledgerly as Payments Platform Engineer. Ledgerly processes payments for 4,000 merchants across Europe.",
        "At Paynova I built a ledger service in Go handling 2M transactions a day. I mentored 3 engineers and cut costs by [X%].",
        "Kind regards,\nDeniz Arslan",
      ].join("\n\n"),
    );
    expect(result.placeholders).toEqual(["[X%]"]);
    expect(result.unresolvedFields).toEqual([]);
    expect(result.droppedSentences).toBe(2);
    expect(result.dropReasons).toEqual({ ungrounded: 1, job_term: 1 });
    expect(result.droppedTerms).toEqual(expect.arrayContaining(["Kafka", "Fintech"]));
    expect(provider.requests).toHaveLength(1);
  });

  it("keeps a template's lines and unresolved fields, and retries when most sentences fail", async () => {
    const template =
      "Dear {hiring_manager},\n\nI'm applying for the {role} position at {company}. [Why]\n\nKind regards,\n{name}";
    const bad = {
      subject: "Application",
      greeting: "Dear {hiring_manager},",
      paragraphs: [
        {
          sentences: [
            sentence("I'm a certified AWS architect.", "candidate"),
            sentence("I know Kafka.", "candidate"),
          ],
        },
      ],
      closing: "Kind regards,",
    };
    const good = {
      ...bad,
      paragraphs: [
        {
          sentences: [
            sentence("I'm applying for the {role} position at {company}.", "candidate"),
            sentence("I build payment services in Go.", "candidate"),
          ],
        },
      ],
    };
    const provider = scriptedProvider([bad, good]);
    const result = await draftCoverLetter(
      { ...input, template, mergeValues: { name: "Deniz Arslan" } },
      { provider, ledger: memoryLedger().ledger },
    );
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]?.user).toContain('"AWS"');
    expect(
      result.body.startsWith(
        "Dear {hiring_manager},\n\nI'm applying for the Payments Platform Engineer position at Ledgerly.",
      ),
    ).toBe(true);
    expect(result.unresolvedFields).toEqual(["hiring_manager"]);
    expect(result.droppedSentences).toBe(2);
  });
});
