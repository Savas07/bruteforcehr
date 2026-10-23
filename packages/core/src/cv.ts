import { z } from "zod";
import { IdSchema, LanguageTagSchema, Sha256Schema, TimestampSchema } from "./common";

/* ------------------------------------------------------------------------------------------------
 * JSON Resume (https://jsonresume.org/schema, v1.0.0) — the canonical CV content model (§4.5).
 * Every JSON Resume field is optional; URLs inside content stay plain strings so imported data
 * is never rejected for a sloppy link (the importer normalizes, the renderer escapes).
 * ---------------------------------------------------------------------------------------------- */

/** JSON Resume `iso8601` date: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
export const ResumeDateSchema = z
  .string()
  .regex(
    /^[12]\d{3}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/,
    "Expected YYYY, YYYY-MM or YYYY-MM-DD",
  );

const text = z.string().max(20_000);
const shortText = z.string().max(500);
const list = z.array(z.string().max(2_000)).max(100);

export const ResumeLocationSchema = z.object({
  address: shortText.optional(),
  postalCode: shortText.optional(),
  city: shortText.optional(),
  countryCode: shortText.optional(),
  region: shortText.optional(),
});

export const ResumeProfileSchema = z.object({
  network: shortText.optional(),
  username: shortText.optional(),
  url: shortText.optional(),
});

export const ResumeBasicsSchema = z.object({
  name: shortText.optional(),
  label: shortText.optional(),
  image: shortText.optional(),
  email: shortText.optional(),
  phone: shortText.optional(),
  url: shortText.optional(),
  summary: text.optional(),
  location: ResumeLocationSchema.optional(),
  profiles: z.array(ResumeProfileSchema).max(30).optional(),
});

export const ResumeWorkSchema = z.object({
  name: shortText.optional(),
  location: shortText.optional(),
  description: shortText.optional(),
  position: shortText.optional(),
  url: shortText.optional(),
  startDate: ResumeDateSchema.optional(),
  endDate: ResumeDateSchema.optional(),
  summary: text.optional(),
  highlights: list.optional(),
});

export const ResumeVolunteerSchema = z.object({
  organization: shortText.optional(),
  position: shortText.optional(),
  url: shortText.optional(),
  startDate: ResumeDateSchema.optional(),
  endDate: ResumeDateSchema.optional(),
  summary: text.optional(),
  highlights: list.optional(),
});

export const ResumeEducationSchema = z.object({
  institution: shortText.optional(),
  url: shortText.optional(),
  area: shortText.optional(),
  studyType: shortText.optional(),
  startDate: ResumeDateSchema.optional(),
  endDate: ResumeDateSchema.optional(),
  score: shortText.optional(),
  courses: list.optional(),
});

export const ResumeAwardSchema = z.object({
  title: shortText.optional(),
  date: ResumeDateSchema.optional(),
  awarder: shortText.optional(),
  summary: text.optional(),
});

export const ResumeCertificateSchema = z.object({
  name: shortText.optional(),
  date: ResumeDateSchema.optional(),
  url: shortText.optional(),
  issuer: shortText.optional(),
});

export const ResumePublicationSchema = z.object({
  name: shortText.optional(),
  publisher: shortText.optional(),
  releaseDate: ResumeDateSchema.optional(),
  url: shortText.optional(),
  summary: text.optional(),
});

export const ResumeSkillSchema = z.object({
  name: shortText.optional(),
  level: shortText.optional(),
  keywords: list.optional(),
});

export const ResumeLanguageSchema = z.object({
  language: shortText.optional(),
  fluency: shortText.optional(),
});

export const ResumeInterestSchema = z.object({
  name: shortText.optional(),
  keywords: list.optional(),
});

export const ResumeReferenceSchema = z.object({
  name: shortText.optional(),
  reference: text.optional(),
});

export const ResumeProjectSchema = z.object({
  name: shortText.optional(),
  description: text.optional(),
  highlights: list.optional(),
  keywords: list.optional(),
  startDate: ResumeDateSchema.optional(),
  endDate: ResumeDateSchema.optional(),
  url: shortText.optional(),
  roles: list.optional(),
  entity: shortText.optional(),
  type: shortText.optional(),
});

/* ------------------------------------------------------------------------------------------------
 * `meta` extension: template, theme, section order and custom sections.
 * ---------------------------------------------------------------------------------------------- */

/** Standard JSON Resume sections, in default render order. */
export const CV_STANDARD_SECTIONS = [
  "basics",
  "work",
  "projects",
  "education",
  "skills",
  "languages",
  "certificates",
  "awards",
  "publications",
  "volunteer",
  "interests",
  "references",
] as const;
export type CvStandardSection = (typeof CV_STANDARD_SECTIONS)[number];

export const CvDensitySchema = z.enum(["compact", "comfortable", "spacious"]);
export const CvPaperSizeSchema = z.enum(["a4", "letter"]);

export const CvThemeSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #RRGGBB"),
  /** Font pair id from @bfhr/cv-render (M2). */
  fontPair: z.string().min(1).max(60),
  density: CvDensitySchema,
  paperSize: CvPaperSizeSchema,
});
export type CvTheme = z.infer<typeof CvThemeSchema>;

export const CvCustomSectionItemSchema = z.object({
  title: shortText,
  subtitle: shortText.optional(),
  startDate: ResumeDateSchema.optional(),
  endDate: ResumeDateSchema.optional(),
  url: shortText.optional(),
  summary: text.optional(),
  highlights: list.optional(),
});

export const CvCustomSectionSchema = z.object({
  /** Stable id, referenced from `sectionOrder` as `custom:<id>`. */
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(120),
  items: z.array(CvCustomSectionItemSchema).max(100),
});
export type CvCustomSection = z.infer<typeof CvCustomSectionSchema>;

/** A standard section key or `custom:<id>`. */
export const CvSectionKeySchema = z.union([
  z.enum(CV_STANDARD_SECTIONS),
  z.string().regex(/^custom:[a-z0-9-]{1,40}$/),
]);

/**
 * Personal details some markets expect (DE/TR): each is an opt-in per CV variant, off by default
 * (docs/design/decisions.md U6). Absent means both off. The photo itself is JSON Resume
 * `basics.image` (a `users/{uid}/cv-photos/{fileId}` path); cv-render prints it only when
 * `showPhoto` is on.
 */
export const CvPersonalDetailsSchema = z.object({
  showPhoto: z.boolean(),
  showDateOfBirth: z.boolean(),
  /** `YYYY-MM-DD`; printed only when `showDateOfBirth` is on. */
  dateOfBirth: z
    .string()
    .regex(/^[12]\d{3}-[01]\d-[0-3]\d$/, "Expected YYYY-MM-DD")
    .optional(),
});
export type CvPersonalDetails = z.infer<typeof CvPersonalDetailsSchema>;

export const CvMetaSchema = z.object({
  /** Template id from @bfhr/cv-render (M2). */
  template: z.string().min(1).max(60),
  theme: CvThemeSchema,
  /** Render order; sections not listed are hidden. */
  sectionOrder: z.array(CvSectionKeySchema).max(40),
  customSections: z.array(CvCustomSectionSchema).max(20),
  personal: CvPersonalDetailsSchema.optional(),
  /** JSON Resume standard meta fields, kept for lossless JSON export/import. */
  canonical: shortText.optional(),
  version: shortText.optional(),
  lastModified: shortText.optional(),
});
export type CvMeta = z.infer<typeof CvMetaSchema>;

export const CvContentSchema = z
  .object({
    basics: ResumeBasicsSchema.optional(),
    work: z.array(ResumeWorkSchema).max(100).optional(),
    volunteer: z.array(ResumeVolunteerSchema).max(100).optional(),
    education: z.array(ResumeEducationSchema).max(50).optional(),
    awards: z.array(ResumeAwardSchema).max(100).optional(),
    certificates: z.array(ResumeCertificateSchema).max(100).optional(),
    publications: z.array(ResumePublicationSchema).max(100).optional(),
    skills: z.array(ResumeSkillSchema).max(100).optional(),
    languages: z.array(ResumeLanguageSchema).max(30).optional(),
    interests: z.array(ResumeInterestSchema).max(50).optional(),
    references: z.array(ResumeReferenceSchema).max(30).optional(),
    projects: z.array(ResumeProjectSchema).max(100).optional(),
    meta: CvMetaSchema,
  })
  .superRefine((content, ctx) => {
    const customIds = new Set(content.meta.customSections.map((section) => section.id));
    content.meta.sectionOrder.forEach((key, index) => {
      if (key.startsWith("custom:") && !customIds.has(key.slice("custom:".length))) {
        ctx.addIssue({
          code: "custom",
          message: `sectionOrder references unknown custom section "${key}"`,
          path: ["meta", "sectionOrder", index],
        });
      }
    });
  });
export type CvContent = z.infer<typeof CvContentSchema>;

/* ------------------------------------------------------------------------------------------------
 * Firestore entities.
 * ---------------------------------------------------------------------------------------------- */

export const CvImportKindSchema = z.enum(["pdf", "docx", "json_resume", "linkedin_zip"]);
export type CvImportKind = z.infer<typeof CvImportKindSchema>;

/** `users/{uid}/cvs/{cvId}`. `template`/`theme` mirror the current revision's `meta` for list views. */
export const CvSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(120),
  language: LanguageTagSchema,
  /** Base CV this one is a variant of (role or language variant). */
  parentCvId: IdSchema.nullable(),
  currentRevisionId: IdSchema,
  templateId: z.string().min(1).max(60),
  theme: CvThemeSchema,
  isDefault: z.boolean(),
  archivedAt: TimestampSchema.nullable(),
  /** Optimistic concurrency: starts at `CV_INITIAL_VERSION`, +`CV_VERSION_INCREMENT` per update. */
  version: z.int().min(1),
  /** Original imported file (kept attached, §4.5), stored at `users/{uid}/cv-imports/{fileId}`. */
  importedFrom: z
    .object({
      kind: CvImportKindSchema,
      storagePath: z.string().min(1),
      fileName: z.string().min(1).max(255),
    })
    .nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Cv = z.infer<typeof CvSchema>;

export const CvRevisionSourceSchema = z.enum(["manual", "import", "ai_tailor"]);
export type CvRevisionSource = z.infer<typeof CvRevisionSourceSchema>;

/** `users/{uid}/cvs/{cvId}/revisions/{revisionId}` — immutable. `cvId` comes from the path. */
export const CvRevisionSchema = z.object({
  id: IdSchema,
  cvId: IdSchema,
  content: CvContentSchema,
  source: CvRevisionSourceSchema,
  /** Revision this one was derived from (edit, tailor or restore). */
  basedOnRevisionId: IdSchema.nullable(),
  /** Job the revision was tailored for (`ai_tailor`). */
  jobId: IdSchema.nullable(),
  diffSummary: z.string().max(2_000).nullable(),
  createdAt: TimestampSchema,
});
export type CvRevision = z.infer<typeof CvRevisionSchema>;

export const RenderedFileKindSchema = z.enum(["pdf", "docx"]);
export type RenderedFileKind = z.infer<typeof RenderedFileKindSchema>;

/**
 * `users/{uid}/renderedFiles/{fileId}`; bytes at `users/{uid}/rendered/{fileId}` in Storage.
 * Exactly one of `cvRevisionId` / `coverLetterId` is set.
 */
export const RenderedFileSchema = z
  .object({
    id: IdSchema,
    kind: RenderedFileKindSchema,
    cvId: IdSchema.nullable(),
    cvRevisionId: IdSchema.nullable(),
    coverLetterId: IdSchema.nullable(),
    storagePath: z.string().min(1),
    fileName: z.string().min(1).max(255),
    sizeBytes: z.int().positive(),
    sha256: Sha256Schema,
    createdAt: TimestampSchema,
  })
  .superRefine((file, ctx) => {
    if ((file.cvRevisionId === null) === (file.coverLetterId === null)) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one of cvRevisionId or coverLetterId must be set",
        path: ["cvRevisionId"],
      });
    }
    if ((file.cvRevisionId === null) !== (file.cvId === null)) {
      ctx.addIssue({ code: "custom", message: "cvId and cvRevisionId go together", path: ["cvId"] });
    }
  });
export type RenderedFile = z.infer<typeof RenderedFileSchema>;

export const CoverLetterAuthorSchema = z.enum(["user", "ai"]);
export type CoverLetterAuthor = z.infer<typeof CoverLetterAuthorSchema>;

/** `users/{uid}/coverLetters/{id}`. Templates have `isTemplate: true` and no application. */
export const CoverLetterSchema = z.object({
  id: IdSchema,
  applicationId: IdSchema.nullable(),
  jobId: IdSchema.nullable(),
  title: z.string().min(1).max(120),
  language: LanguageTagSchema,
  body: z.string().max(20_000),
  author: CoverLetterAuthorSchema,
  isTemplate: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;
