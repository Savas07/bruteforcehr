/**
 * Renders the Codable models of packages/swift/BFHRCore from the zod schemas, so the Swift port
 * cannot drift from the TypeScript source of truth. Nullable fields encode as explicit `null`
 * (ADR 0002: "maybe" scalars are stored as null); `.optional()` fields (JSON Resume content) are
 * omitted when nil.
 */
import { z } from "zod";
import * as core from "../src/index";

/** Firestore documents, in output order, with the path documented on each Swift type. */
const ENTITIES: readonly (readonly [z.ZodType, string])[] = [
  [core.ProfileSchema, "`users/{uid}`; `id` is the uid."],
  [core.CvSchema, "`users/{uid}/cvs/{cvId}`."],
  [core.CvRevisionSchema, "`users/{uid}/cvs/{cvId}/revisions/{revisionId}` (immutable)."],
  [core.RenderedFileSchema, "`users/{uid}/renderedFiles/{fileId}`."],
  [core.CoverLetterSchema, "`users/{uid}/coverLetters/{id}`."],
  [core.JobSchema, "`users/{uid}/jobs/{jobId}` (the server-only `embedding` field is not modelled)."],
  [core.JobMatchSchema, "`users/{uid}/jobMatches/{jobId}`."],
  [core.SavedSearchSchema, "`users/{uid}/savedSearches/{id}`."],
  [core.WatchedCompanySchema, '`users/{uid}/watchlist/{id}` ("Companies you follow").'],
  [core.JobSourceStatusSchema, "`jobSources/{sourceId}` (source health; client read-only)."],
  [core.JobsSearchRequestSchema, "Request of the `jobsSearch` callable."],
  [core.JobsSearchResponseSchema, "Response of the `jobsSearch` and `savedSearchRunNow` callables."],
  [core.SavedSearchRunNowRequestSchema, "Request of the `savedSearchRunNow` callable."],
  [core.JobMatchesRefreshRequestSchema, "Request of the `jobMatchesRefresh` callable."],
  [core.JobMatchesRefreshResponseSchema, "Response of the `jobMatchesRefresh` callable."],
  [core.ApplicationSchema, "`users/{uid}/applications/{id}`."],
  [core.ApplicationEventSchema, "`users/{uid}/applicationEvents/{id}` (append-only)."],
  [core.InterviewSchema, "`users/{uid}/interviews/{id}`."],
  [core.ContactSchema, "`users/{uid}/contacts/{id}`."],
  [core.MailAccountSchema, "`users/{uid}/mailAccounts/{id}` (client read-only)."],
  [core.MailMessageSchema, "`users/{uid}/mailMessages/{id}`."],
  [core.DeviceSchema, "`users/{uid}/devices/{id}`."],
  [core.AppConfigSchema, "`appConfig/{platform}`; `id` is the platform."],
];

/** Swift names that would clash with SwiftUI when both modules are imported. */
const RENAMES: Readonly<Record<string, string>> = { Link: "WebLink" };

/** Names for objects and enums declared inline in a parent schema, keyed `Parent.field`. */
const INLINE_NAMES: Readonly<Record<string, string>> = {
  "Profile.hiddenCompanies": "HiddenCompany",
  "ProfileSettings.quietHours": "QuietHours",
  "Cv.importedFrom": "CvImportedFile",
  "MailAccount.lastError": "MailAccountError",
  "MailBackfill.error": "MailBackfillError",
  "EmailSend.error": "EmailSendError",
  "MailExtraction.dates": "ExtractedDate",
  "JobMatch.skills": "MatchSkills",
  "SavedSearchFilters.salaryMin": "SalaryMinimum",
  "MatchEvidence.from": "MatchEvidenceOrigin",
  "MatchFactor.source": "MatchFactorSource",
  "JobSourceAttribution.minSize": "AttributionMinSize",
  "JobSourceStatus.quota": "JobSourceQuota",
  "JobsSearchResponse.counts": "JobsSearchCounts",
  "SourceRunReport.status": "SourceRunStatus",
};

/** Swift keywords an enum case name could collide with (escaped with backticks). */
const SWIFT_KEYWORDS: Readonly<Record<string, true>> = {
  case: true,
  default: true,
  enum: true,
  extension: true,
  func: true,
  import: true,
  in: true,
  is: true,
  let: true,
  nil: true,
  protocol: true,
  return: true,
  self: true,
  static: true,
  struct: true,
  switch: true,
  var: true,
};

type FieldKind = "required" | "nullable" | "optional";
interface Field {
  readonly name: string;
  readonly type: string;
  readonly kind: FieldKind;
}
type Declaration =
  | { readonly kind: "enum"; readonly name: string; readonly values: readonly string[] }
  | {
      readonly kind: "struct";
      readonly name: string;
      readonly fields: readonly Field[];
      readonly doc?: string;
    };

function namedSchemas(): Map<z.ZodType, string> {
  const names = new Map<z.ZodType, string>();
  for (const [key, value] of Object.entries(core)) {
    if (!key.endsWith("Schema") || !(value instanceof z.ZodType)) continue;
    if (!(value instanceof z.ZodObject) && !(value instanceof z.ZodEnum)) continue;
    const name = key.slice(0, -"Schema".length);
    names.set(value, RENAMES[name] ?? name);
  }
  return names;
}

function caseName(value: string): string {
  const [first = "", ...rest] = value.split("_");
  const name =
    first.toLowerCase() + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  return SWIFT_KEYWORDS[name] ? `\`${name}\`` : name;
}

class Renderer {
  readonly declarations: Declaration[] = [];
  private readonly names = namedSchemas();
  private readonly emitted = new Set<string>();

  entity(schema: z.ZodType, doc: string, name?: string): void {
    this.object(schema, name ?? this.names.get(schema) ?? "", doc);
  }

  private object(schema: z.ZodType, name: string, doc?: string): string {
    if (!(schema instanceof z.ZodObject)) throw new Error(`${name} is not an object schema`);
    if (this.emitted.has(name)) return name;
    if (name === "") throw new Error("Unnamed object schema");
    this.emitted.add(name);
    const fields = Object.entries(schema.shape as Record<string, z.ZodType>).map(([field, value]) =>
      this.field(name, field, value),
    );
    this.declarations.push(
      doc === undefined ? { kind: "struct", name, fields } : { kind: "struct", name, fields, doc },
    );
    return name;
  }

  private field(parent: string, name: string, schema: z.ZodType): Field {
    // Expand fields (ADR 0002): `.nullable().default(null)` decodes a missing key as nil in Swift.
    // A non-null default can't be expressed by the synthesized Decodable, so it is rejected.
    if (schema instanceof z.ZodDefault) {
      const inner = schema.unwrap() as z.ZodType;
      if (!(inner instanceof z.ZodNullable))
        throw new Error(`${parent}.${name}: Swift supports only .nullable().default(null) expand fields`);
      return this.field(parent, name, inner);
    }
    if (schema instanceof z.ZodNullable)
      return { name, kind: "nullable", type: this.type(parent, name, schema.unwrap() as z.ZodType) };
    if (schema instanceof z.ZodOptional)
      return { name, kind: "optional", type: this.type(parent, name, schema.unwrap() as z.ZodType) };
    return { name, kind: "required", type: this.type(parent, name, schema) };
  }

  private type(parent: string, field: string, schema: z.ZodType): string {
    // String formats (`z.email()`, `z.url()`) are not ZodString subclasses; their def type is "string".
    if (schema.def.type === "string" || schema instanceof z.ZodLiteral) return "String";
    if (schema instanceof z.ZodNumber) return schema.isInt ? "Int" : "Double";
    if (schema instanceof z.ZodBoolean) return "Bool";
    if (schema instanceof z.ZodDate) return "Date";
    if (schema instanceof z.ZodArray) return `[${this.type(parent, field, schema.element as z.ZodType)}]`;
    if (schema instanceof z.ZodRecord)
      return `[String: ${this.type(parent, field, schema.valueType as z.ZodType)}]`;
    if (schema instanceof z.ZodUnion) {
      // e.g. a standard CV section or `custom:<id>`, a country code or `EU`: open string vocabularies.
      const options = schema.options as readonly z.ZodType[];
      const stringy = options.every(
        (option) => option instanceof z.ZodEnum || this.type(parent, field, option) === "String",
      );
      if (stringy) return "String";
      throw new Error(`${parent}.${field}: unions map to Swift only when every option is a string`);
    }
    const name = this.names.get(schema) ?? INLINE_NAMES[`${parent}.${field}`];
    if (name === undefined) throw new Error(`${parent}.${field}: add a Swift name to INLINE_NAMES`);
    if (schema instanceof z.ZodEnum) {
      if (!this.emitted.has(name)) {
        this.emitted.add(name);
        this.declarations.push({ kind: "enum", name, values: schema.options.map(String) });
      }
      return name;
    }
    return this.object(schema, name);
  }
}

function renderEnum(name: string, values: readonly string[]): string {
  const cases = values.map((value) => {
    const swiftName = caseName(value);
    return swiftName === value ? `    case ${value}` : `    case ${swiftName} = "${value}"`;
  });
  return [`public enum ${name}: String, Codable, Hashable, Sendable, CaseIterable {`, ...cases, "}"].join(
    "\n",
  );
}

function renderStruct(name: string, fields: readonly Field[], doc: string | undefined): string {
  const declared = (field: Field) => (field.kind === "required" ? field.type : `${field.type}?`);
  const identifiable = fields.some((field) => field.name === "id" && field.kind === "required");
  const conformances = ["Codable", "Hashable", "Sendable", ...(identifiable ? ["Identifiable"] : [])].join(
    ", ",
  );
  const parameters = fields.map(
    (field) => `${field.name}: ${declared(field)}${field.kind === "optional" ? " = nil" : ""}`,
  );
  return [
    ...(doc === undefined ? [] : [`/// ${doc}`]),
    `public struct ${name}: ${conformances} {`,
    ...fields.map((field) => `    public var ${field.name}: ${declared(field)}`),
    "",
    "    public init(",
    parameters.map((parameter) => `        ${parameter}`).join(",\n"),
    "    ) {",
    ...fields.map((field) => `        self.${field.name} = ${field.name}`),
    "    }",
    "",
    "    public func encode(to encoder: any Encoder) throws {",
    "        var container = encoder.container(keyedBy: CodingKeys.self)",
    ...fields.map(
      (field) =>
        `        try container.${field.kind === "optional" ? "encodeIfPresent" : "encode"}(${field.name}, forKey: .${field.name})`,
    ),
    "    }",
    "}",
  ].join("\n");
}

/** Contents of `packages/swift/BFHRCore/Sources/BFHRCore/Models.swift`. */
export function renderSwiftModels(): string {
  const renderer = new Renderer();
  for (const [schema, doc] of ENTITIES) renderer.entity(schema, doc);
  const { id: _id, ...draftShape } = core.ApplicationEventSchema.shape;
  renderer.entity(
    z.object(draftShape),
    "An application event before it has a document id.",
    "ApplicationEventDraft",
  );

  const enums = renderer.declarations.filter((declaration) => declaration.kind === "enum");
  const structs = renderer.declarations.filter((declaration) => declaration.kind === "struct");
  return [
    "// Generated by `pnpm --filter @bfhr/core conformance` (packages/core/scripts/swift-models.ts) from the",
    "// zod schemas in packages/core/src. Do not edit: change the schema and regenerate. Field docs live",
    "// on the TypeScript schemas.",
    "",
    "import Foundation",
    "",
    ...enums.map((declaration) => `${renderEnum(declaration.name, declaration.values)}\n`),
    ...structs.map(
      (declaration) => `${renderStruct(declaration.name, declaration.fields, declaration.doc)}\n`,
    ),
  ].join("\n");
}
