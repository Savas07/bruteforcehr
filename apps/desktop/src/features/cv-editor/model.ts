/**
 * CV editor view-model (`/cvs`, `/cvs/$cvId`): the CV list pane (base CVs with their variants),
 * the selected CV's structured editor (sections in the CV's own order, item cards, ghost rows),
 * its save status, design summary, day-grouped revision history, preview page facts, the
 * applications that pinned it and the original imported file. With no CVs at all it carries
 * the first-use choice (Import a CV / Start from scratch). Copy: research/cv-editor.md "Copy
 * notes", states.md `cv.empty` / `save.*`, decisions.md U6 (photo / date of birth opt-in).
 */
import type {
  Application,
  Cv,
  CvContent,
  CvImportKind,
  CvRevision,
  CvRevisionSource,
  CvStandardSection,
  CvTheme,
} from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import { applicationLabel } from "../../shared/model/build-blocks";
import { calendarDaysFromNow, clockTime, relativeTime, shortDate } from "../../shared/model/format";
import type { CompanyVM, ModelContext, SourceVM, StatusVM, TimeVM, UserData } from "../../shared/model/types";
import { companyVM, sourceVM, statusVM } from "../../shared/model/vocabulary";
import type { CvDraft, CvDraftItem, CvDraftSection } from "./draft";

/**
 * What the CV editor reads. The profile is null until onboarding writes it (the CVs area works
 * without it; "Start from your profile" needs it).
 */
export type CvEditorData = Pick<
  UserData,
  "cvs" | "cvRevisions" | "applications" | "renderedFiles" | "jobs" | "jobMatches"
> & { readonly profile: UserData["profile"] | null };

/* ------------------------------------------------------------------------------------------------
 * View-model types.
 * ---------------------------------------------------------------------------------------------- */

/** `base`: no parent. `language`: variant in another language. `role`: same-language variant. */
export type CvKind = "base" | "language" | "role";

/** One row of the CV list pane (`CvList`). */
export interface CvListRowVM {
  readonly cvId: string;
  readonly title: string;
  readonly kind: CvKind;
  /** Upper-case language code for the icon-only list ("EN", "DE"). */
  readonly languageCode: string;
  /** Kind / language pill: the language in its own language ("English", "Deutsch"), or "Role variant". */
  readonly pill: string;
  readonly isDefault: boolean;
  /** "Default" on the default CV, else null. */
  readonly defaultLabel: string | null;
  /** When the CV last changed; the view prefixes "Edited". */
  readonly lastEdited: TimeVM;
  /** "Used in 14 applications"; null when no application pinned it. */
  readonly usedIn: string | null;
  readonly archived: boolean;
  readonly selected: boolean;
  readonly pendingSync: boolean;
}

/** A base CV with its variants indented beneath (Origin-style grouping). */
export interface CvGroupVM {
  readonly base: CvListRowVM;
  readonly variants: readonly CvListRowVM[];
}

export interface CvListFilterVM {
  readonly id: "all" | "archived";
  readonly label: string;
  readonly count: number;
}

export interface CvListVM {
  /** Active CVs: default first, then most recently edited. */
  readonly groups: readonly CvGroupVM[];
  /** Archived CVs (shown under the "Archived" filter), most recently edited first. */
  readonly archived: readonly CvListRowVM[];
  readonly filters: readonly CvListFilterVM[];
}

/** One of the two equal start options on the empty CV list (`ChoiceCards`). */
export interface CvStartChoiceVM {
  readonly id: "import" | "scratch";
  readonly label: string;
  readonly description: string;
  /** "Import a CV" is the primary choice (states.md CV editor row). */
  readonly primary: boolean;
}

/** No CVs yet: `EmptyState` kind `firstUse` with `ChoiceCards` (states.md `cv.empty`). */
export interface CvFirstUseVM {
  readonly title: string;
  readonly body: string;
  readonly choices: readonly CvStartChoiceVM[];
}

/** `VariantBanner`: "Variant of Base CV — English · Deutsch" + base changes to review. */
export interface CvVariantBannerVM {
  readonly baseCvId: string;
  readonly baseTitle: string;
  readonly text: string;
  /** Null when the base hasn't changed since the variant was made. */
  readonly baseChange: {
    readonly count: number;
    /** "The base changed in 3 places". */
    readonly label: string;
    readonly action: string;
  } | null;
}

/** Toolbar save status (`SyncStatus`, states.md `save.*`). */
export interface CvSaveStatusVM {
  /** `local`: written on this device, waiting to sync ("Saved on this device"). */
  readonly state: "saved" | "local";
  /** "Saved · last week" / "Saved on this device". */
  readonly label: string;
  readonly time: TimeVM;
}

/** Template + theme summary for the toolbar's Template button and the Design tab. */
export interface CvDesignVM {
  readonly templateId: string;
  readonly fontPair: string;
  /** "Classic". */
  readonly templateLabel: string;
  /** User-chosen `#RRGGBB` for the swatch (CV content, not a UI colour). */
  readonly accentColor: string;
  /** "Inter / Source Serif". */
  readonly fontPairLabel: string;
  /** "Comfortable". */
  readonly densityLabel: string;
  /** "A4" / "Letter". */
  readonly paperLabel: string;
  /** "Classic · Inter / Source Serif · Comfortable · A4". */
  readonly summary: string;
}

/** One block inside a list section (`ItemCard`). */
export interface CvItemVM {
  /** `<sectionKey>-<index>`; stable within one revision. */
  readonly id: string;
  readonly index: number;
  /** "Frontend Engineer", "BSc Computer Engineering", "Frontend". */
  readonly title: string;
  /** Employer, school, issuer, … ("Pazarbox"). */
  readonly org: string | null;
  /** "Mar 2022 – Present", "Nov 2024". */
  readonly dates: string | null;
  /** "Pazarbox · Mar 2022 – Present": org · dates, for the card's second line. */
  readonly subtitle: string | null;
  readonly location: string | null;
  /** Short descriptive text: role summary, project description, fluency, skill level. */
  readonly detail: string | null;
  /** The card's preview line: first highlight, else the description. */
  readonly firstBullet: string | null;
  readonly bullets: readonly string[];
  /** Chips for skills / interests ("React", "TypeScript"). */
  readonly keywords: readonly string[];
  readonly url: string | null;
}

/** Empty-section ghost row (`GhostRow`); the component adds the "+" glyph. */
export interface CvGhostVM {
  /** "Add your first role". */
  readonly label: string;
  /** "Start with the most recent." */
  readonly hint: string;
}

export interface CvHeaderVM {
  readonly name: string | null;
  /** "Frontend & Product Engineer". */
  readonly headline: string | null;
  /** "Istanbul, TR". */
  readonly location: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  /** Website without the scheme ("deniz.example.com"). */
  readonly website: string | null;
  readonly links: readonly { readonly label: string; readonly value: string; readonly url: string | null }[];
}

interface CvSectionBaseVM {
  /** `header`, `summary`, a JSON Resume section (`work`, …) or `custom:<id>`. */
  readonly key: string;
  /** DOM id for the jump nav ("cv-section-work"). */
  readonly anchorId: string;
  /** "Experience", "Talks". */
  readonly title: string;
  /** One-line summary for collapsed cards and the jump nav ("Pazarbox, Kuzey Labs and Mavi Yazılım"). */
  readonly summary: string | null;
  /** False when the section has content but isn't in the CV's section order. */
  readonly visible: boolean;
  /** "Not shown on your CV" for hidden sections. */
  readonly hiddenNote: string | null;
  /** Set when the section is empty. */
  readonly ghost: CvGhostVM | null;
  /** Header is pinned first; every other section can move. */
  readonly movable: boolean;
}

export interface CvHeaderSectionVM extends CvSectionBaseVM {
  readonly kind: "header";
  readonly header: CvHeaderVM;
}

export interface CvTextSectionVM extends CvSectionBaseVM {
  readonly kind: "text";
  readonly text: string | null;
}

export interface CvListSectionVM extends CvSectionBaseVM {
  readonly kind: "list";
  readonly items: readonly CvItemVM[];
  /** "3 roles". */
  readonly countLabel: string;
  /** "Add role". */
  readonly addLabel: string;
}

export type CvSectionVM = CvHeaderSectionVM | CvTextSectionVM | CvListSectionVM;

/** One row of the History tab (`RevisionList`). */
export interface CvRevisionVM {
  readonly revisionId: string;
  /** Change sentence ("Added Projects, Certificates and a Talks section"). */
  readonly sentence: string;
  readonly sourceKind: CvRevisionSource;
  /** "You" / "Import" / "AI tailor". */
  readonly source: SourceVM;
  readonly time: TimeVM;
  /** "10:30" within the day group. */
  readonly clock: string;
  /** The CV's current revision. */
  readonly isLatest: boolean;
  /** "Latest" tag on the current revision. */
  readonly latestLabel: string | null;
  /** "Restore this version" on older revisions. */
  readonly restoreLabel: string | null;
  /** Job an `ai_tailor` revision was tailored for. */
  readonly jobId: string | null;
  readonly pendingSync: boolean;
}

/** Revisions of one calendar day: "Today", "Yesterday", "10 Oct". */
export interface CvRevisionGroupVM {
  readonly label: string;
  readonly revisions: readonly CvRevisionVM[];
}

/** Facts the live preview pane needs before `cv-render` runs. */
export interface CvPreviewVM {
  readonly paperSize: CvTheme["paperSize"];
  /** "A4" / "Letter". */
  readonly paperLabel: string;
  /** "210 × 297 mm" / "8.5 × 11 in". */
  readonly dimensions: string;
  /** Page width ÷ height, for the page-shaped skeleton and canvas. */
  readonly aspectRatio: number;
  /** Label of the page-shaped skeleton while rendering. */
  readonly renderingLabel: string;
  /** Default export file name ("Deniz-Aksoy-CV.pdf"). */
  readonly exportFileName: string;
  /** Latest rendered PDF/DOCX of this CV. */
  readonly latestExport: {
    readonly fileId: string;
    readonly fileName: string;
    /** "92 kB". */
    readonly sizeLabel: string;
    readonly createdAt: TimeVM;
    /** Rendered from the current revision (false: the CV changed since). */
    readonly isCurrent: boolean;
  } | null;
}

/** An application that pinned this CV when it was sent. */
export interface CvPinnedApplicationVM {
  readonly applicationId: string;
  /** "Lumenpay · Frontend Engineer, Merchant Dashboard". */
  readonly label: string;
  readonly company: CompanyVM;
  readonly status: StatusVM;
  readonly appliedAt: TimeVM | null;
  /** "Latest version" / "Version from 2 Sept". */
  readonly versionLabel: string;
  readonly usesLatest: boolean;
  readonly pendingSync: boolean;
}

/** `OriginalFileRow`: the imported file kept attached to the CV. */
export interface CvOriginalFileVM {
  readonly fileName: string;
  /** "PDF", "DOCX", "JSON Resume", "LinkedIn export". */
  readonly kindLabel: string;
  readonly storagePath: string;
  readonly uploadedAt: TimeVM;
  /** "Uploaded on 13 Aug". */
  readonly uploadedLabel: string;
}

/** U6: photo and date of birth, each opt-in per variant (German- and Turkish-market CVs). */
export interface CvPersonalDetailsVM {
  readonly photo: { readonly label: string; readonly on: boolean };
  readonly dateOfBirth: { readonly label: string; readonly on: boolean };
  /** Neutral note on market conventions next to the toggles. */
  readonly note: string;
}

/** Field labels of one list section's inline item form; null hides the field. */
export interface CvItemFieldsVM {
  /** Card title of an entry without one: "Untitled role". */
  readonly untitled: string;
  /** "Role", "Degree", "Skill group". */
  readonly title: string;
  /** "Company", "School"; null where the section has no organisation. */
  readonly org: string | null;
  readonly location: string | null;
  /** Start / end month-year pickers. */
  readonly dates: boolean;
  /** "I currently work here"; null where an entry can't be ongoing. */
  readonly current: string | null;
  /** "Team or product", "Level", "Description". */
  readonly detail: string | null;
  /** "Achievements", "Highlights", "Courses". */
  readonly bullets: string | null;
  /** "Skills" (comma-separated). */
  readonly keywords: string | null;
}

/** A job to check the CV against (Check tab): keywords extracted once per job, cached on it. */
export interface CvCheckJobVM {
  readonly jobId: string;
  /** "Tannenbaum Software · Frontend-Entwickler:in (React)". */
  readonly label: string;
  readonly keywords: readonly string[];
}

/** The selected CV in the editor pane. */
export interface CvEditorVM {
  readonly cvId: string;
  readonly title: string;
  readonly kind: CvKind;
  readonly language: { readonly tag: string; readonly label: string };
  readonly isDefault: boolean;
  readonly archivedAt: TimeVM | null;
  /** Optimistic-concurrency version the next write must send. */
  readonly version: number;
  readonly currentRevisionId: string;
  readonly variant: CvVariantBannerVM | null;
  readonly saveStatus: CvSaveStatusVM;
  readonly design: CvDesignVM;
  /** Header (pinned) and Summary first, then the CV's section order, then hidden sections. */
  readonly sections: readonly CvSectionVM[];
  readonly personalDetails: CvPersonalDetailsVM | null;
  /** Newest day first; rows newest first. */
  readonly revisions: readonly CvRevisionGroupVM[];
  /** "3 versions". */
  readonly revisionCountLabel: string;
  readonly preview: CvPreviewVM;
  /** Newest application first. */
  readonly pinnedApplications: readonly CvPinnedApplicationVM[];
  /** "Used in 14 applications" / "Not used in an application yet". */
  readonly pinnedLabel: string;
  readonly originalFile: CvOriginalFileVM | null;
  readonly pendingSync: boolean;
  /** The working copy the form edits and the preview renders. */
  readonly draft: CvDraft;
  /** Item form labels by section key. */
  readonly itemFields: Readonly<Record<string, CvItemFieldsVM>>;
  /** "January" … "December" in the UI language, values "01" … "12". */
  readonly months: readonly { readonly value: string; readonly label: string }[];
  /** Jobs for the Check tab, best match first; `defaultJobId` is the CV's target or latest use. */
  readonly check: { readonly jobs: readonly CvCheckJobVM[]; readonly defaultJobId: string | null };
  /** Theme choices for the Design tab, in display order. */
  readonly designOptions: {
    readonly paper: readonly { readonly value: CvTheme["paperSize"]; readonly label: string }[];
    readonly density: readonly { readonly value: CvTheme["density"]; readonly label: string }[];
  };
  /** The draft of each of this CV's revisions, for Restore (a restore writes a new revision). */
  readonly revisionDrafts: Readonly<Record<string, CvDraft>>;
  /** Each revision's stored content: writes build on it (content.ts `draftToContent`). */
  readonly revisionContents: Readonly<Record<string, CvContent>>;
}

export interface CvEditorModel {
  /** Set only when the user has no CVs at all (archived ones count). */
  readonly firstUse: CvFirstUseVM | null;
  readonly list: CvListVM;
  /** `cvId` param when it names a CV, else the default CV, else the first one; null with no CVs. */
  readonly selectedCvId: string | null;
  readonly editor: CvEditorVM | null;
  /** Every CV's write inputs by id (list actions: rename, archive, duplicate, variant). */
  readonly records: Readonly<Record<string, CvRecordVM>>;
  /** Source of "Start from your profile" (null until onboarding wrote the profile). */
  readonly profile: CvEditorData["profile"];
}

/** What list actions need to write a CV: its version and current content. */
export interface CvRecordVM {
  readonly cvId: string;
  readonly title: string;
  readonly language: string;
  readonly version: number;
  readonly parentCvId: string | null;
  readonly currentRevisionId: string;
  readonly archived: boolean;
  readonly content: CvContent | null;
}

/* ------------------------------------------------------------------------------------------------
 * Copy.
 * ---------------------------------------------------------------------------------------------- */

const messages = defineMessages({
  firstUseTitle: { id: "cv-editor.firstUse.title", defaultMessage: "No CVs yet" },
  firstUseBody: {
    id: "cv-editor.firstUse.body",
    defaultMessage: "Import the CV you already have and we'll make it editable, or start from a blank page.",
  },
  firstUseImport: { id: "cv-editor.firstUse.import", defaultMessage: "Import a CV" },
  firstUseImportDescription: {
    id: "cv-editor.firstUse.importDescription",
    defaultMessage: "PDF, DOCX, JSON Resume or the LinkedIn ZIP",
  },
  firstUseScratch: { id: "cv-editor.firstUse.scratch", defaultMessage: "Start from scratch" },
  firstUseScratchDescription: {
    id: "cv-editor.firstUse.scratchDescription",
    defaultMessage: "Build it step by step (about 10 min)",
  },
  roleVariant: {
    id: "cv-editor.list.roleVariant",
    defaultMessage: "Role variant",
    description: "Pill on a same-language variant of a base CV (language variants show the language)",
  },
  defaultCv: {
    id: "cv-editor.list.default",
    defaultMessage: "Default",
    description: "Tag on the default CV",
  },
  filterAll: { id: "cv-editor.list.filterAll", defaultMessage: "All" },
  filterArchived: { id: "cv-editor.list.filterArchived", defaultMessage: "Archived" },
  usedIn: {
    id: "cv-editor.usedIn",
    defaultMessage: "Used in {count, plural, one {# application} other {# applications}}",
  },
  notUsed: { id: "cv-editor.pinned.notUsed", defaultMessage: "Not used in an application yet" },
  variantText: {
    id: "cv-editor.variant.text",
    defaultMessage: "Variant of {base} · {language}",
    description:
      "{base}: the base CV's title; {language}: the variant's language in its own language ('Deutsch')",
  },
  baseChanged: {
    id: "cv-editor.variant.baseChanged",
    defaultMessage: "The base changed in {count, plural, one {# place} other {# places}}",
    description: "Sections of the base CV that changed since the variant was made",
  },
  baseChangeReview: { id: "cv-editor.variant.review", defaultMessage: "Review" },
  saved: {
    id: "cv-editor.save.saved",
    defaultMessage: "Saved · {relative}",
    description: "{relative}: relative time of the last save ('last week')",
  },
  savedLocal: { id: "cv-editor.save.local", defaultMessage: "Saved on this device" },
  designSummary: {
    id: "cv-editor.design.summary",
    defaultMessage: "{template} · {fontPair} · {density} · {paper}",
    description: "Template button summary: 'Classic · Inter / Source Serif · Comfortable · A4'",
  },
  paperDimensions: {
    id: "cv-editor.design.paperDimensions",
    defaultMessage: "{width, number} × {height, number} {unit, select, mm {mm} other {in}}",
    description: "Page size: '210 × 297 mm' (A4), '8.5 × 11 in' (Letter; unit 'in' = inches)",
  },
  headerTitle: {
    id: "cv-editor.section.header.title",
    defaultMessage: "Header",
    description: "CV section with the name, headline and contact details",
  },
  headerGhostLabel: {
    id: "cv-editor.section.header.ghostLabel",
    defaultMessage: "Add your name and contact details",
  },
  headerGhostHint: {
    id: "cv-editor.section.header.ghostHint",
    defaultMessage: "Name, headline, email and links.",
  },
  summaryTitle: {
    id: "cv-editor.section.summary.title",
    defaultMessage: "Summary",
    description: "CV section",
  },
  summaryGhostLabel: { id: "cv-editor.section.summary.ghostLabel", defaultMessage: "Write a summary" },
  summaryGhostHint: {
    id: "cv-editor.section.summary.ghostHint",
    defaultMessage: "2–3 sentences about what you do and what you're looking for.",
  },
  hiddenNote: { id: "cv-editor.section.hiddenNote", defaultMessage: "Not shown on your CV" },
  linkFallback: {
    id: "cv-editor.header.linkFallback",
    defaultMessage: "Link",
    description: "Label of a profile link without a network name",
  },
  dateRange: {
    id: "cv-editor.item.dateRange",
    defaultMessage: "{start} – {end}",
    description: "Dates of a CV entry: 'Feb 2020 – Feb 2022'",
  },
  dateRangeOngoing: {
    id: "cv-editor.item.dateRangeOngoing",
    defaultMessage: "{start} – Present",
    description: "Dates of a CV entry that hasn't ended: 'Mar 2022 – Present'",
  },
  skillsSummary: {
    id: "cv-editor.section.skills.summary",
    defaultMessage:
      "{skills, plural, one {# skill} other {# skills}} in {groups, plural, one {# group} other {# groups}}",
  },
  sourceImport: {
    id: "cv-editor.revision.source.import",
    defaultMessage: "Import",
    description: "Source of a CV revision created by importing a file",
  },
  sourceAiTailor: {
    id: "cv-editor.revision.source.aiTailor",
    defaultMessage: "AI tailor",
    description: "Source of a CV revision tailored to a job by AI",
  },
  revisionLatest: { id: "cv-editor.revision.latest", defaultMessage: "Latest" },
  revisionRestore: { id: "cv-editor.revision.restore", defaultMessage: "Restore this version" },
  revisionToday: { id: "cv-editor.revision.today", defaultMessage: "Today" },
  revisionYesterday: { id: "cv-editor.revision.yesterday", defaultMessage: "Yesterday" },
  revisionCount: {
    id: "cv-editor.revision.count",
    defaultMessage: "{count, plural, one {# version} other {# versions}}",
  },
  pinnedLatest: { id: "cv-editor.pinned.latestVersion", defaultMessage: "Latest version" },
  pinnedVersionFrom: {
    id: "cv-editor.pinned.versionFrom",
    defaultMessage: "Version from {date}",
    description: "{date}: short date the pinned revision was saved ('2 Sept')",
  },
  pinnedEarlier: { id: "cv-editor.pinned.earlierVersion", defaultMessage: "Earlier version" },
  uploadedOn: {
    id: "cv-editor.originalFile.uploadedOn",
    defaultMessage: "Uploaded on {date}",
    description: "{date}: short date ('13 Aug')",
  },
  renderingPreview: { id: "cv-editor.preview.rendering", defaultMessage: "Rendering preview…" },
  exportFileWord: {
    id: "cv-editor.preview.exportFileWord",
    defaultMessage: "CV",
    description: "Last part of the default export file name 'Deniz-Aksoy-CV.pdf'; one word, no spaces",
  },
  photo: { id: "cv-editor.personalDetails.photo", defaultMessage: "Photo" },
  dateOfBirth: { id: "cv-editor.personalDetails.dateOfBirth", defaultMessage: "Date of birth" },
  personalDetailsNote: {
    id: "cv-editor.personalDetails.note",
    defaultMessage:
      "German and Turkish employers may expect a photo and date of birth. UK and US employers usually don't.",
  },
});

type ListSectionKey = Exclude<CvStandardSection, "basics">;

interface ListSectionMessages {
  /** ICU plural over `{count}`: "3 roles". */
  readonly count: MessageDescriptor;
  readonly add: MessageDescriptor;
  readonly ghostLabel: MessageDescriptor;
  readonly ghostHint: MessageDescriptor;
  readonly untitled: MessageDescriptor;
}

interface StandardSectionMessages extends ListSectionMessages {
  readonly title: MessageDescriptor;
}

const LIST_SECTIONS: Readonly<Record<ListSectionKey, StandardSectionMessages>> = {
  work: defineMessages({
    title: { id: "cv-editor.section.work.title", defaultMessage: "Experience" },
    count: {
      id: "cv-editor.section.work.count",
      defaultMessage: "{count, plural, one {# role} other {# roles}}",
    },
    add: { id: "cv-editor.section.work.add", defaultMessage: "Add role" },
    ghostLabel: { id: "cv-editor.section.work.ghostLabel", defaultMessage: "Add your first role" },
    ghostHint: { id: "cv-editor.section.work.ghostHint", defaultMessage: "Start with the most recent." },
    untitled: { id: "cv-editor.section.work.untitled", defaultMessage: "Untitled role" },
  }),
  projects: defineMessages({
    title: { id: "cv-editor.section.projects.title", defaultMessage: "Projects" },
    count: {
      id: "cv-editor.section.projects.count",
      defaultMessage: "{count, plural, one {# project} other {# projects}}",
    },
    add: { id: "cv-editor.section.projects.add", defaultMessage: "Add project" },
    ghostLabel: { id: "cv-editor.section.projects.ghostLabel", defaultMessage: "Add your first project" },
    ghostHint: {
      id: "cv-editor.section.projects.ghostHint",
      defaultMessage: "Side projects and open source count too.",
    },
    untitled: { id: "cv-editor.section.projects.untitled", defaultMessage: "Untitled project" },
  }),
  education: defineMessages({
    title: { id: "cv-editor.section.education.title", defaultMessage: "Education" },
    count: {
      id: "cv-editor.section.education.count",
      defaultMessage: "{count, plural, one {# entry} other {# entries}}",
    },
    add: { id: "cv-editor.section.education.add", defaultMessage: "Add education" },
    ghostLabel: { id: "cv-editor.section.education.ghostLabel", defaultMessage: "Add your education" },
    ghostHint: {
      id: "cv-editor.section.education.ghostHint",
      defaultMessage: "Degrees, schools or courses, most recent first.",
    },
    untitled: { id: "cv-editor.section.education.untitled", defaultMessage: "Untitled education" },
  }),
  skills: defineMessages({
    title: { id: "cv-editor.section.skills.title", defaultMessage: "Skills" },
    count: {
      id: "cv-editor.section.skills.count",
      defaultMessage: "{count, plural, one {# group} other {# groups}}",
    },
    add: { id: "cv-editor.section.skills.add", defaultMessage: "Add skill group" },
    ghostLabel: { id: "cv-editor.section.skills.ghostLabel", defaultMessage: "Add your skills" },
    ghostHint: {
      id: "cv-editor.section.skills.ghostHint",
      defaultMessage: "Group them, for example Frontend or Tools.",
    },
    untitled: { id: "cv-editor.section.skills.untitled", defaultMessage: "Untitled group" },
  }),
  languages: defineMessages({
    title: { id: "cv-editor.section.languages.title", defaultMessage: "Languages" },
    count: {
      id: "cv-editor.section.languages.count",
      defaultMessage: "{count, plural, one {# language} other {# languages}}",
    },
    add: { id: "cv-editor.section.languages.add", defaultMessage: "Add language" },
    ghostLabel: { id: "cv-editor.section.languages.ghostLabel", defaultMessage: "Add a language" },
    ghostHint: {
      id: "cv-editor.section.languages.ghostHint",
      defaultMessage: "Include how well you speak it.",
    },
    untitled: { id: "cv-editor.section.languages.untitled", defaultMessage: "Untitled language" },
  }),
  certificates: defineMessages({
    title: { id: "cv-editor.section.certificates.title", defaultMessage: "Certificates" },
    count: {
      id: "cv-editor.section.certificates.count",
      defaultMessage: "{count, plural, one {# certificate} other {# certificates}}",
    },
    add: { id: "cv-editor.section.certificates.add", defaultMessage: "Add certificate" },
    ghostLabel: { id: "cv-editor.section.certificates.ghostLabel", defaultMessage: "Add a certificate" },
    ghostHint: {
      id: "cv-editor.section.certificates.ghostHint",
      defaultMessage: "Include who issued it and when.",
    },
    untitled: { id: "cv-editor.section.certificates.untitled", defaultMessage: "Untitled certificate" },
  }),
  awards: defineMessages({
    title: { id: "cv-editor.section.awards.title", defaultMessage: "Awards" },
    count: {
      id: "cv-editor.section.awards.count",
      defaultMessage: "{count, plural, one {# award} other {# awards}}",
    },
    add: { id: "cv-editor.section.awards.add", defaultMessage: "Add award" },
    ghostLabel: { id: "cv-editor.section.awards.ghostLabel", defaultMessage: "Add an award" },
    ghostHint: { id: "cv-editor.section.awards.ghostHint", defaultMessage: "Include who gave it and when." },
    untitled: { id: "cv-editor.section.awards.untitled", defaultMessage: "Untitled award" },
  }),
  publications: defineMessages({
    title: { id: "cv-editor.section.publications.title", defaultMessage: "Publications" },
    count: {
      id: "cv-editor.section.publications.count",
      defaultMessage: "{count, plural, one {# publication} other {# publications}}",
    },
    add: { id: "cv-editor.section.publications.add", defaultMessage: "Add publication" },
    ghostLabel: { id: "cv-editor.section.publications.ghostLabel", defaultMessage: "Add a publication" },
    ghostHint: {
      id: "cv-editor.section.publications.ghostHint",
      defaultMessage: "Articles, papers or talks with a link.",
    },
    untitled: { id: "cv-editor.section.publications.untitled", defaultMessage: "Untitled publication" },
  }),
  volunteer: defineMessages({
    title: { id: "cv-editor.section.volunteer.title", defaultMessage: "Volunteering" },
    count: {
      id: "cv-editor.section.volunteer.count",
      defaultMessage: "{count, plural, one {# role} other {# roles}}",
    },
    add: { id: "cv-editor.section.volunteer.add", defaultMessage: "Add volunteer role" },
    ghostLabel: { id: "cv-editor.section.volunteer.ghostLabel", defaultMessage: "Add volunteer work" },
    ghostHint: { id: "cv-editor.section.volunteer.ghostHint", defaultMessage: "Start with the most recent." },
    untitled: { id: "cv-editor.section.volunteer.untitled", defaultMessage: "Untitled role" },
  }),
  interests: defineMessages({
    title: { id: "cv-editor.section.interests.title", defaultMessage: "Interests" },
    count: {
      id: "cv-editor.section.interests.count",
      defaultMessage: "{count, plural, one {# interest} other {# interests}}",
    },
    add: { id: "cv-editor.section.interests.add", defaultMessage: "Add interest" },
    ghostLabel: { id: "cv-editor.section.interests.ghostLabel", defaultMessage: "Add an interest" },
    ghostHint: { id: "cv-editor.section.interests.ghostHint", defaultMessage: "Keep it short and specific." },
    untitled: { id: "cv-editor.section.interests.untitled", defaultMessage: "Untitled interest" },
  }),
  references: defineMessages({
    title: { id: "cv-editor.section.references.title", defaultMessage: "References" },
    count: {
      id: "cv-editor.section.references.count",
      defaultMessage: "{count, plural, one {# reference} other {# references}}",
    },
    add: { id: "cv-editor.section.references.add", defaultMessage: "Add reference" },
    ghostLabel: { id: "cv-editor.section.references.ghostLabel", defaultMessage: "Add a reference" },
    ghostHint: {
      id: "cv-editor.section.references.ghostHint",
      defaultMessage: "Ask the person before you list them.",
    },
    untitled: { id: "cv-editor.section.references.untitled", defaultMessage: "Untitled reference" },
  }),
};

/** User-defined sections (`meta.customSections`) carry their own title. */
const CUSTOM_SECTION: ListSectionMessages = defineMessages({
  count: {
    id: "cv-editor.section.custom.count",
    defaultMessage: "{count, plural, one {# entry} other {# entries}}",
  },
  add: { id: "cv-editor.section.custom.add", defaultMessage: "Add entry" },
  ghostLabel: { id: "cv-editor.section.custom.ghostLabel", defaultMessage: "Add your first entry" },
  ghostHint: {
    id: "cv-editor.section.custom.ghostHint",
    defaultMessage: "Give it a title, dates and a few bullets.",
  },
  untitled: { id: "cv-editor.section.custom.untitled", defaultMessage: "Untitled entry" },
});

const REVISION_FALLBACK_MESSAGES: Readonly<Record<CvRevisionSource, MessageDescriptor>> = defineMessages({
  manual: { id: "cv-editor.revision.fallback.manual", defaultMessage: "Edited" },
  import: { id: "cv-editor.revision.fallback.import", defaultMessage: "Imported" },
  ai_tailor: { id: "cv-editor.revision.fallback.aiTailor", defaultMessage: "Tailored for a job" },
});

const IMPORT_KIND_MESSAGES: Readonly<Record<CvImportKind, MessageDescriptor>> = defineMessages({
  pdf: { id: "cv-editor.importKind.pdf", defaultMessage: "PDF" },
  docx: { id: "cv-editor.importKind.docx", defaultMessage: "DOCX" },
  json_resume: { id: "cv-editor.importKind.jsonResume", defaultMessage: "JSON Resume" },
  linkedin_zip: { id: "cv-editor.importKind.linkedinZip", defaultMessage: "LinkedIn export" },
});

const DENSITY_MESSAGES: Readonly<Record<CvTheme["density"], MessageDescriptor>> = defineMessages({
  compact: { id: "cv-editor.design.density.compact", defaultMessage: "Compact" },
  comfortable: { id: "cv-editor.design.density.comfortable", defaultMessage: "Comfortable" },
  spacious: { id: "cv-editor.design.density.spacious", defaultMessage: "Spacious" },
});

const PAPER_MESSAGES: Readonly<Record<CvTheme["paperSize"], MessageDescriptor>> = defineMessages({
  a4: { id: "cv-editor.design.paper.a4", defaultMessage: "A4" },
  letter: {
    id: "cv-editor.design.paper.letter",
    defaultMessage: "Letter",
    description: "US Letter paper size",
  },
});

const PAPER: Readonly<
  Record<
    CvTheme["paperSize"],
    { readonly width: number; readonly height: number; readonly unit: "mm" | "in" }
  >
> = {
  a4: { width: 210, height: 297, unit: "mm" },
  letter: { width: 8.5, height: 11, unit: "in" },
};

/** Template ids from `@bfhr/cv-render` (M2); unknown ids fall back to the title-cased id. */
const TEMPLATE_MESSAGES: Readonly<Record<string, MessageDescriptor>> = defineMessages({
  classic: {
    id: "cv-editor.design.template.classic",
    defaultMessage: "Classic",
    description: "CV template name",
  },
});

const FIELD_MESSAGES = defineMessages({
  role: { id: "cv-editor.field.role", defaultMessage: "Role" },
  company: { id: "cv-editor.field.company", defaultMessage: "Company" },
  location: { id: "cv-editor.field.location", defaultMessage: "Location" },
  current: { id: "cv-editor.field.current", defaultMessage: "I currently work here" },
  team: { id: "cv-editor.field.team", defaultMessage: "Team or product" },
  achievements: { id: "cv-editor.field.achievements", defaultMessage: "Achievements" },
  project: { id: "cv-editor.field.project", defaultMessage: "Project" },
  description: { id: "cv-editor.field.description", defaultMessage: "Description" },
  highlights: { id: "cv-editor.field.highlights", defaultMessage: "Highlights" },
  degree: { id: "cv-editor.field.degree", defaultMessage: "Degree and subject" },
  school: { id: "cv-editor.field.school", defaultMessage: "School" },
  studying: { id: "cv-editor.field.studying", defaultMessage: "I'm studying here now" },
  grade: { id: "cv-editor.field.grade", defaultMessage: "Grade" },
  courses: { id: "cv-editor.field.courses", defaultMessage: "Courses" },
  group: { id: "cv-editor.field.group", defaultMessage: "Group name" },
  skills: { id: "cv-editor.field.skills", defaultMessage: "Skills, separated by commas" },
  language: { id: "cv-editor.field.language", defaultMessage: "Language" },
  level: { id: "cv-editor.field.level", defaultMessage: "Level" },
  certificate: { id: "cv-editor.field.certificate", defaultMessage: "Certificate" },
  issuer: { id: "cv-editor.field.issuer", defaultMessage: "Issued by" },
  title: { id: "cv-editor.field.title", defaultMessage: "Title" },
  organisation: { id: "cv-editor.field.organisation", defaultMessage: "Organisation" },
  subtitle: { id: "cv-editor.field.subtitle", defaultMessage: "Where" },
  interest: { id: "cv-editor.field.interest", defaultMessage: "Interest" },
  name: { id: "cv-editor.field.name", defaultMessage: "Name" },
  reference: { id: "cv-editor.field.reference", defaultMessage: "What they said" },
});

function itemFieldsVM(key: string, intl: IntlShape): Omit<CvItemFieldsVM, "untitled"> {
  const t = (descriptor: MessageDescriptor) => intl.formatMessage(descriptor);
  const m = FIELD_MESSAGES;
  const none = { org: null, location: null, dates: false, current: null, detail: null, bullets: null, keywords: null };
  switch (key) {
    case "work":
    case "volunteer":
      return {
        title: t(m.role),
        org: t(key === "work" ? m.company : m.organisation),
        location: t(m.location),
        dates: true,
        current: t(m.current),
        detail: t(m.team),
        bullets: t(m.achievements),
        keywords: null,
      };
    case "projects":
      return { ...none, title: t(m.project), dates: true, current: null, detail: t(m.description), bullets: t(m.highlights) };
    case "education":
      return {
        ...none,
        title: t(m.degree),
        org: t(m.school),
        dates: true,
        current: t(m.studying),
        detail: t(m.grade),
        bullets: t(m.courses),
      };
    case "skills":
      return { ...none, title: t(m.group), keywords: t(m.skills) };
    case "interests":
      return { ...none, title: t(m.interest), keywords: t(m.skills) };
    case "languages":
      return { ...none, title: t(m.language), detail: t(m.level) };
    case "references":
      return { ...none, title: t(m.name), detail: t(m.reference) };
    case "certificates":
    case "awards":
    case "publications":
      return { ...none, title: t(key === "certificates" ? m.certificate : m.title), org: t(m.issuer), dates: true };
    default:
      return { ...none, title: t(m.title), org: t(m.subtitle), dates: true, detail: t(m.description), bullets: t(m.highlights) };
  }
}

/** Font pair ids from `@bfhr/cv-render` (M2); unknown ids fall back to the id. Font names stay as-is. */
const FONT_PAIR_LABELS: Readonly<Record<string, string>> = {
  "inter-source-serif": "Inter / Source Serif",
};

/** Markets where U6's photo / date-of-birth toggles apply. */
const PERSONAL_DETAILS_LANGUAGES: Readonly<Record<string, true>> = { de: true, tr: true };

function firstUseVM(intl: IntlShape): CvFirstUseVM {
  return {
    title: intl.formatMessage(messages.firstUseTitle),
    body: intl.formatMessage(messages.firstUseBody),
    choices: [
      {
        id: "import",
        label: intl.formatMessage(messages.firstUseImport),
        description: intl.formatMessage(messages.firstUseImportDescription),
        primary: true,
      },
      {
        id: "scratch",
        label: intl.formatMessage(messages.firstUseScratch),
        description: intl.formatMessage(messages.firstUseScratchDescription),
        primary: false,
      },
    ],
  };
}

function ghostVM(label: MessageDescriptor, hint: MessageDescriptor, intl: IntlShape): CvGhostVM {
  return { label: intl.formatMessage(label), hint: intl.formatMessage(hint) };
}

/* ------------------------------------------------------------------------------------------------
 * Formatting helpers (CV-only; ctx.locale, never the ambient locale).
 * ---------------------------------------------------------------------------------------------- */

/** JSON Resume date ("2022-03", "2015", "2024-11-02") → "Mar 2022" / "2015" in the UI locale. */
function resumeDate(value: string, ctx: ModelContext): string {
  const [year = 0, month] = value.split("-").map(Number);
  if (month === undefined) return new Intl.NumberFormat(ctx.locale, { useGrouping: false }).format(year);
  return new Intl.DateTimeFormat(ctx.locale, { timeZone: "UTC", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** "Mar 2022 – Present", "Feb 2020 – Feb 2022", "Apr 2025". */
function dateRange(start: string | undefined, end: string | undefined, ctx: ModelContext): string | null {
  if (start === undefined) return end === undefined ? null : resumeDate(end, ctx);
  return end === undefined
    ? ctx.intl.formatMessage(messages.dateRangeOngoing, { start: resumeDate(start, ctx) })
    : ctx.intl.formatMessage(messages.dateRange, {
        start: resumeDate(start, ctx),
        end: resumeDate(end, ctx),
      });
}

/** "Pazarbox, Kuzey Labs and Mavi Yazılım". */
function joinList(values: readonly string[], ctx: ModelContext): string | null {
  if (values.length === 0) return null;
  return new Intl.ListFormat(ctx.locale, { style: "long", type: "conjunction" }).format(values);
}

/** The language in its own language, as the copy notes ask: "English", "Deutsch", "Türkçe". */
function languageName(tag: string): string {
  const name = new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag;
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(?:\s|$)/u.exec(text.trim());
  return match?.[1] ?? text.trim();
}

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function joinPresent(parts: readonly (string | null | undefined)[], separator: string): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(separator) : null;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
}

/* ------------------------------------------------------------------------------------------------
 * Sections.
 * ---------------------------------------------------------------------------------------------- */

interface ItemFields {
  readonly title: string | undefined;
  readonly org?: string | undefined;
  readonly start?: string | undefined;
  readonly end?: string | undefined;
  readonly location?: string | undefined;
  readonly detail?: string | undefined;
  readonly bullets?: readonly string[] | undefined;
  readonly keywords?: readonly string[] | undefined;
  readonly url?: string | undefined;
}

function itemVM(
  key: string,
  index: number,
  fields: ItemFields,
  untitled: string,
  ctx: ModelContext,
): CvItemVM {
  const org = present(fields.org);
  const dates = dateRange(fields.start, fields.end, ctx);
  const detail = present(fields.detail);
  const bullets = (fields.bullets ?? []).filter((bullet) => bullet.trim() !== "");
  return {
    id: `${key}-${index}`,
    index,
    title: present(fields.title) ?? org ?? untitled,
    org,
    dates,
    subtitle: joinPresent([org, dates], " · "),
    location: present(fields.location),
    detail,
    firstBullet: bullets[0] ?? detail,
    bullets,
    keywords: fields.keywords ?? [],
    url: present(fields.url),
  };
}

/** Item fields per JSON Resume section; `null` when the content has no such array. */
function standardItems(
  key: ListSectionKey,
  content: CvContent,
  ctx: ModelContext,
): readonly ItemFields[] | null {
  switch (key) {
    case "work":
      return (
        content.work?.map((item) => ({
          title: item.position,
          org: item.name,
          start: item.startDate,
          end: item.endDate,
          location: item.location,
          detail: item.summary ?? item.description,
          bullets: item.highlights,
          url: item.url,
        })) ?? null
      );
    case "projects":
      return (
        content.projects?.map((item) => ({
          title: item.name,
          org: item.entity,
          start: item.startDate,
          end: item.endDate,
          detail: item.description ?? joinList(item.roles ?? [], ctx) ?? undefined,
          bullets: item.highlights,
          keywords: item.keywords,
          url: item.url,
        })) ?? null
      );
    case "education":
      return (
        content.education?.map((item) => ({
          title: joinPresent([item.studyType, item.area], " ") ?? undefined,
          org: item.institution,
          start: item.startDate,
          end: item.endDate,
          detail: item.score,
          bullets: item.courses,
          url: item.url,
        })) ?? null
      );
    case "skills":
      return (
        content.skills?.map((item) => ({ title: item.name, detail: item.level, keywords: item.keywords })) ??
        null
      );
    case "languages":
      return content.languages?.map((item) => ({ title: item.language, detail: item.fluency })) ?? null;
    case "certificates":
      return (
        content.certificates?.map((item) => ({
          title: item.name,
          org: item.issuer,
          start: undefined,
          end: item.date,
          url: item.url,
        })) ?? null
      );
    case "awards":
      return (
        content.awards?.map((item) => ({
          title: item.title,
          org: item.awarder,
          end: item.date,
          detail: item.summary,
        })) ?? null
      );
    case "publications":
      return (
        content.publications?.map((item) => ({
          title: item.name,
          org: item.publisher,
          end: item.releaseDate,
          detail: item.summary,
          url: item.url,
        })) ?? null
      );
    case "volunteer":
      return (
        content.volunteer?.map((item) => ({
          title: item.position,
          org: item.organization,
          start: item.startDate,
          end: item.endDate,
          detail: item.summary,
          bullets: item.highlights,
          url: item.url,
        })) ?? null
      );
    case "interests":
      return content.interests?.map((item) => ({ title: item.name, keywords: item.keywords })) ?? null;
    case "references":
      return content.references?.map((item) => ({ title: item.name, detail: item.reference })) ?? null;
  }
}

/** One-line summary of a list section for collapsed cards. */
function listSummary(key: string, items: readonly CvItemVM[], ctx: ModelContext): string | null {
  if (key === "skills") {
    const keywordCount = items.reduce((total, item) => total + item.keywords.length, 0);
    return ctx.intl.formatMessage(messages.skillsSummary, { skills: keywordCount, groups: items.length });
  }
  const names = items.map((item) =>
    key === "work" || key === "education" || key === "volunteer" ? (item.org ?? item.title) : item.title,
  );
  return joinList([...new Set(names)], ctx);
}

function listSection(
  key: string,
  title: string,
  copy: ListSectionMessages,
  fields: readonly ItemFields[],
  visible: boolean,
  ctx: ModelContext,
): CvListSectionVM {
  const untitled = ctx.intl.formatMessage(copy.untitled);
  const items = fields.map((item, index) => itemVM(key, index, item, untitled, ctx));
  const ghost = items.length > 0 ? null : ghostVM(copy.ghostLabel, copy.ghostHint, ctx.intl);
  return {
    kind: "list",
    key,
    anchorId: `cv-section-${key.replace(":", "-")}`,
    title,
    summary: ghost ? ghost.label : listSummary(key, items, ctx),
    visible,
    hiddenNote: visible ? null : ctx.intl.formatMessage(messages.hiddenNote),
    ghost,
    movable: true,
    items,
    countLabel: ctx.intl.formatMessage(copy.count, { count: items.length }),
    addLabel: ctx.intl.formatMessage(copy.add),
  };
}

function headerVM(basics: CvContent["basics"], ctx: ModelContext): CvHeaderVM {
  return {
    name: present(basics?.name),
    headline: present(basics?.label),
    location: joinPresent(
      [basics?.location?.city, basics?.location?.region, basics?.location?.countryCode],
      ", ",
    ),
    email: present(basics?.email),
    phone: present(basics?.phone),
    website: basics?.url ? displayUrl(basics.url) : null,
    links: (basics?.profiles ?? []).map((profile) => ({
      label: present(profile.network) ?? ctx.intl.formatMessage(messages.linkFallback),
      value: present(profile.username) ?? (profile.url ? displayUrl(profile.url) : ""),
      url: present(profile.url),
    })),
  };
}

function isListSectionKey(key: string): key is ListSectionKey {
  return key in LIST_SECTIONS;
}

function sectionVMs(content: CvContent, ctx: ModelContext): CvSectionVM[] {
  const order = content.meta.sectionOrder;
  const basicsVisible = order.includes("basics");
  const header = headerVM(content.basics, ctx);
  const summaryText = present(content.basics?.summary);
  const headerGhost = ghostVM(messages.headerGhostLabel, messages.headerGhostHint, ctx.intl);
  const summaryGhost = ghostVM(messages.summaryGhostLabel, messages.summaryGhostHint, ctx.intl);
  const basicsHiddenNote = basicsVisible ? null : ctx.intl.formatMessage(messages.hiddenNote);
  const sections: CvSectionVM[] = [
    {
      kind: "header",
      key: "header",
      anchorId: "cv-section-header",
      title: ctx.intl.formatMessage(messages.headerTitle),
      summary: joinPresent([header.name, header.headline], " · ") ?? headerGhost.label,
      visible: basicsVisible,
      hiddenNote: basicsHiddenNote,
      ghost: header.name ? null : headerGhost,
      movable: false,
      header,
    },
    {
      kind: "text",
      key: "summary",
      anchorId: "cv-section-summary",
      title: ctx.intl.formatMessage(messages.summaryTitle),
      summary: summaryText ? firstSentence(summaryText) : summaryGhost.label,
      visible: basicsVisible,
      hiddenNote: basicsHiddenNote,
      ghost: summaryText ? null : summaryGhost,
      movable: true,
      text: summaryText,
    },
  ];

  const customSections = content.meta.customSections.map((custom) => {
    const key = `custom:${custom.id}`;
    const fields = custom.items.map((item) => ({
      title: item.title,
      org: item.subtitle,
      // Custom entries (talks, courses) with one date are a point in time, not "– Present".
      start: item.endDate === undefined ? undefined : item.startDate,
      end: item.endDate ?? item.startDate,
      detail: item.summary,
      bullets: item.highlights,
      url: item.url,
    }));
    return listSection(key, custom.title, CUSTOM_SECTION, fields, order.includes(key), ctx);
  });

  const listed = new Set<string>();
  for (const key of order) {
    if (key === "basics") continue;
    listed.add(key);
    if (isListSectionKey(key)) {
      const copy = LIST_SECTIONS[key];
      const title = ctx.intl.formatMessage(copy.title);
      sections.push(listSection(key, title, copy, standardItems(key, content, ctx) ?? [], true, ctx));
    } else {
      const custom = customSections.find((section) => section.key === key);
      if (custom) sections.push(custom);
    }
  }

  // Sections with content that the order leaves out: hidden on the CV, still editable.
  for (const key of Object.keys(LIST_SECTIONS)) {
    if (!isListSectionKey(key) || listed.has(key)) continue;
    const fields = standardItems(key, content, ctx);
    if (fields && fields.length > 0) {
      const copy = LIST_SECTIONS[key];
      sections.push(listSection(key, ctx.intl.formatMessage(copy.title), copy, fields, false, ctx));
    }
  }
  sections.push(...customSections.filter((section) => !section.visible));
  return sections;
}

/* ------------------------------------------------------------------------------------------------
 * CV-level pieces.
 * ---------------------------------------------------------------------------------------------- */

function cvKind(cv: Cv, byId: ReadonlyMap<string, Cv>): CvKind {
  if (cv.parentCvId === null) return "base";
  const parent = byId.get(cv.parentCvId);
  return parent && parent.language !== cv.language ? "language" : "role";
}

function pinnedApplications(cv: Cv, applications: readonly Application[]): Application[] {
  return applications
    .filter((application) => application.cvId === cv.id && application.cvRevisionId !== null)
    .sort(
      (a, b) =>
        (b.appliedAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
          (a.appliedAt?.getTime() ?? Number.NEGATIVE_INFINITY) || a.id.localeCompare(b.id),
    );
}

function listRowVM(
  cv: Cv,
  byId: ReadonlyMap<string, Cv>,
  data: Pick<UserData, "applications">,
  selectedCvId: string | null,
  ctx: ModelContext,
): CvListRowVM {
  const kind = cvKind(cv, byId);
  const usedCount = pinnedApplications(cv, data.applications).length;
  return {
    cvId: cv.id,
    title: cv.title,
    kind,
    languageCode: (cv.language.split("-")[0] ?? cv.language).toLocaleUpperCase("en"),
    pill: kind === "role" ? ctx.intl.formatMessage(messages.roleVariant) : languageName(cv.language),
    isDefault: cv.isDefault,
    defaultLabel: cv.isDefault ? ctx.intl.formatMessage(messages.defaultCv) : null,
    lastEdited: relativeTime(cv.updatedAt, ctx),
    usedIn: usedCount > 0 ? ctx.intl.formatMessage(messages.usedIn, { count: usedCount }) : null,
    archived: cv.archivedAt !== null,
    selected: cv.id === selectedCvId,
    pendingSync: ctx.pendingWrites.has(cv.id),
  };
}

const byRecentEdit = (a: Cv, b: Cv): number =>
  b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id);

/** Active base CVs (default first, then most recent), each with its active variants. */
function activeGroups(cvs: readonly Cv[]): { readonly base: Cv; readonly variants: Cv[] }[] {
  const active = cvs.filter((cv) => cv.archivedAt === null);
  const activeIds = new Set(active.map((cv) => cv.id));
  // A variant whose base is archived or missing heads its own group.
  const heads = active
    .filter((cv) => cv.parentCvId === null || !activeIds.has(cv.parentCvId))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || byRecentEdit(a, b));
  return heads.map((base) => ({
    base,
    variants: active.filter((cv) => cv.parentCvId === base.id).sort(byRecentEdit),
  }));
}

function selectCvId(data: Pick<CvEditorData, "cvs" | "profile">, cvId: string | undefined): string | null {
  if (cvId !== undefined && data.cvs.some((cv) => cv.id === cvId)) return cvId;
  const groups = activeGroups(data.cvs);
  const flat = groups.flatMap((group) => [group.base, ...group.variants]);
  const profileDefault = flat.find((cv) => cv.id === data.profile?.defaultCvId);
  const first =
    profileDefault ?? flat.find((cv) => cv.isDefault) ?? flat[0] ?? [...data.cvs].sort(byRecentEdit)[0];
  return first?.id ?? null;
}

/** The base revision a variant was derived from: walk its revisions back to the parent's. */
function derivedFromBaseRevision(
  cv: Cv,
  parent: Cv,
  revisionsById: ReadonlyMap<string, CvRevision>,
): CvRevision | null {
  const seen = new Set<string>();
  let current = revisionsById.get(cv.currentRevisionId);
  while (current && !seen.has(current.id)) {
    if (current.cvId === parent.id) return current;
    seen.add(current.id);
    current = current.basedOnRevisionId === null ? undefined : revisionsById.get(current.basedOnRevisionId);
  }
  return null;
}

/** Sections (standard + custom) whose content differs between two base revisions. */
function changedSectionCount(before: CvContent, after: CvContent): number {
  const standard = (["basics", ...Object.keys(LIST_SECTIONS)] as const).filter(
    (key) => JSON.stringify(before[key as keyof CvContent]) !== JSON.stringify(after[key as keyof CvContent]),
  ).length;
  const customIds = new Set(
    [...before.meta.customSections, ...after.meta.customSections].map((section) => section.id),
  );
  const custom = [...customIds].filter(
    (id) =>
      JSON.stringify(before.meta.customSections.find((section) => section.id === id)) !==
      JSON.stringify(after.meta.customSections.find((section) => section.id === id)),
  ).length;
  return standard + custom;
}

function variantBannerVM(
  cv: Cv,
  byId: ReadonlyMap<string, Cv>,
  revisionsById: ReadonlyMap<string, CvRevision>,
  ctx: ModelContext,
): CvVariantBannerVM | null {
  if (cv.parentCvId === null) return null;
  const parent = byId.get(cv.parentCvId);
  if (!parent) return null;
  const derivedFrom = derivedFromBaseRevision(cv, parent, revisionsById);
  const baseNow = revisionsById.get(parent.currentRevisionId);
  const count =
    derivedFrom && baseNow && derivedFrom.id !== baseNow.id
      ? changedSectionCount(derivedFrom.content, baseNow.content)
      : 0;
  return {
    baseCvId: parent.id,
    baseTitle: parent.title,
    text: ctx.intl.formatMessage(messages.variantText, {
      base: parent.title,
      language: languageName(cv.language),
    }),
    baseChange:
      count > 0
        ? {
            count,
            label: ctx.intl.formatMessage(messages.baseChanged, { count }),
            action: ctx.intl.formatMessage(messages.baseChangeReview),
          }
        : null,
  };
}

function revisionSourceVM(source: CvRevisionSource, intl: IntlShape): SourceVM {
  switch (source) {
    case "manual":
      return sourceVM("you", intl);
    case "import":
      return sourceVM("cv", intl, intl.formatMessage(messages.sourceImport));
    case "ai_tailor":
      return sourceVM("ai", intl, intl.formatMessage(messages.sourceAiTailor));
  }
}

function revisionGroupVMs(cv: Cv, revisions: readonly CvRevision[], ctx: ModelContext): CvRevisionGroupVM[] {
  const own = revisions
    .filter((revision) => revision.cvId === cv.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const groups: { label: string; day: number; revisions: CvRevisionVM[] }[] = [];
  for (const revision of own) {
    const day = calendarDaysFromNow(revision.createdAt, ctx);
    const isLatest = revision.id === cv.currentRevisionId;
    const row: CvRevisionVM = {
      revisionId: revision.id,
      sentence:
        present(revision.diffSummary ?? undefined) ??
        ctx.intl.formatMessage(REVISION_FALLBACK_MESSAGES[revision.source]),
      sourceKind: revision.source,
      source: revisionSourceVM(revision.source, ctx.intl),
      time: relativeTime(revision.createdAt, ctx),
      clock: clockTime(revision.createdAt, ctx),
      isLatest,
      latestLabel: isLatest ? ctx.intl.formatMessage(messages.revisionLatest) : null,
      restoreLabel: isLatest ? null : ctx.intl.formatMessage(messages.revisionRestore),
      jobId: revision.jobId,
      pendingSync: ctx.pendingWrites.has(revision.id),
    };
    const last = groups.at(-1);
    if (last?.day === day) last.revisions.push(row);
    else {
      const label =
        day === 0
          ? ctx.intl.formatMessage(messages.revisionToday)
          : day === -1
            ? ctx.intl.formatMessage(messages.revisionYesterday)
            : shortDate(revision.createdAt, ctx);
      groups.push({ label, day, revisions: [row] });
    }
  }
  return groups.map(({ label, revisions: rows }) => ({ label, revisions: rows }));
}

function designVM(cv: Cv, ctx: ModelContext): CvDesignVM {
  const templateMessage = TEMPLATE_MESSAGES[cv.templateId];
  const templateLabel = templateMessage
    ? ctx.intl.formatMessage(templateMessage)
    : cv.templateId
        .split(/[-_]/u)
        .map((word) => word.charAt(0).toLocaleUpperCase("en") + word.slice(1))
        .join(" ");
  const fontPairLabel = FONT_PAIR_LABELS[cv.theme.fontPair] ?? cv.theme.fontPair;
  const densityLabel = ctx.intl.formatMessage(DENSITY_MESSAGES[cv.theme.density]);
  const paperLabel = ctx.intl.formatMessage(PAPER_MESSAGES[cv.theme.paperSize]);
  return {
    templateId: cv.templateId,
    fontPair: cv.theme.fontPair,
    templateLabel,
    accentColor: cv.theme.accentColor,
    fontPairLabel,
    densityLabel,
    paperLabel,
    summary: ctx.intl.formatMessage(messages.designSummary, {
      template: templateLabel,
      fontPair: fontPairLabel,
      density: densityLabel,
      paper: paperLabel,
    }),
  };
}

function previewVM(
  cv: Cv,
  content: CvContent,
  data: Pick<UserData, "renderedFiles">,
  ctx: ModelContext,
): CvPreviewVM {
  const paper = PAPER[cv.theme.paperSize];
  const nameParts = (content.basics?.name ?? "").trim().split(/\s+/u).filter(Boolean);
  const latest = data.renderedFiles
    .filter((file) => file.cvId === cv.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    paperSize: cv.theme.paperSize,
    paperLabel: ctx.intl.formatMessage(PAPER_MESSAGES[cv.theme.paperSize]),
    dimensions: ctx.intl.formatMessage(messages.paperDimensions, paper),
    aspectRatio: paper.width / paper.height,
    renderingLabel: ctx.intl.formatMessage(messages.renderingPreview),
    exportFileName: `${[...nameParts, ctx.intl.formatMessage(messages.exportFileWord)].join("-")}.pdf`,
    latestExport: latest
      ? {
          fileId: latest.id,
          fileName: latest.fileName,
          sizeLabel: new Intl.NumberFormat(ctx.locale, {
            style: "unit",
            unit: "kilobyte",
            unitDisplay: "short",
            maximumFractionDigits: 0,
          }).format(latest.sizeBytes / 1000),
          createdAt: relativeTime(latest.createdAt, ctx),
          isCurrent: latest.cvRevisionId === cv.currentRevisionId,
        }
      : null,
  };
}

function pinnedApplicationVMs(
  cv: Cv,
  data: Pick<UserData, "applications" | "cvRevisions">,
  ctx: ModelContext,
): CvPinnedApplicationVM[] {
  return pinnedApplications(cv, data.applications).map((application) => {
    const usesLatest = application.cvRevisionId === cv.currentRevisionId;
    const revision = data.cvRevisions.find((candidate) => candidate.id === application.cvRevisionId);
    return {
      applicationId: application.id,
      label: applicationLabel(application),
      company: companyVM(application.company, application.companyDomain),
      status: statusVM(application.status, ctx.intl),
      appliedAt: application.appliedAt ? relativeTime(application.appliedAt, ctx) : null,
      versionLabel: usesLatest
        ? ctx.intl.formatMessage(messages.pinnedLatest)
        : revision
          ? ctx.intl.formatMessage(messages.pinnedVersionFrom, { date: shortDate(revision.createdAt, ctx) })
          : ctx.intl.formatMessage(messages.pinnedEarlier),
      usesLatest,
      pendingSync: ctx.pendingWrites.has(application.id),
    };
  });
}

function originalFileVM(
  cv: Cv,
  revisions: readonly CvRevision[],
  ctx: ModelContext,
): CvOriginalFileVM | null {
  if (!cv.importedFrom) return null;
  const importedAt =
    revisions
      .filter((revision) => revision.cvId === cv.id && revision.source === "import")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt ?? cv.createdAt;
  return {
    fileName: cv.importedFrom.fileName,
    kindLabel: ctx.intl.formatMessage(IMPORT_KIND_MESSAGES[cv.importedFrom.kind]),
    storagePath: cv.importedFrom.storagePath,
    uploadedAt: relativeTime(importedAt, ctx),
    uploadedLabel: ctx.intl.formatMessage(messages.uploadedOn, { date: shortDate(importedAt, ctx) }),
  };
}

function personalDetailsVM(cv: Cv, content: CvContent, ctx: ModelContext): CvPersonalDetailsVM | null {
  if (!PERSONAL_DETAILS_LANGUAGES[cv.language.split("-")[0] ?? cv.language]) return null;
  return {
    photo: { label: ctx.intl.formatMessage(messages.photo), on: Boolean(present(content.basics?.image)) },
    // JSON Resume has no date-of-birth field yet, so it is off until the variant turns it on.
    dateOfBirth: { label: ctx.intl.formatMessage(messages.dateOfBirth), on: false },
    note: ctx.intl.formatMessage(messages.personalDetailsNote),
  };
}

function draftItem(id: string, fields: ItemFields): CvDraftItem {
  return {
    id,
    title: fields.title ?? "",
    org: fields.org ?? "",
    location: fields.location ?? "",
    start: fields.start ?? null,
    end: fields.end ?? null,
    detail: fields.detail ?? "",
    bullets: fields.bullets ?? [],
    keywords: fields.keywords ?? [],
    url: fields.url ?? "",
  };
}

/** The editable working copy, in the editor's section order (`sections`). */
function draftVM(cv: Cv, content: CvContent, sections: readonly CvSectionVM[], ctx: ModelContext): CvDraft {
  const basics = content.basics;
  const draftSections = sections.map((section): CvDraftSection => {
    if (section.kind !== "list") {
      return { key: section.key, kind: section.kind, visible: section.visible, customTitle: null, items: [] };
    }
    const custom = section.key.startsWith("custom:")
      ? content.meta.customSections.find((candidate) => `custom:${candidate.id}` === section.key)
      : undefined;
    const fields: readonly ItemFields[] = custom
      ? custom.items.map((item) => ({
          title: item.title,
          org: item.subtitle,
          // One date is a point in time (a talk), not "– Present".
          start: item.endDate === undefined ? undefined : item.startDate,
          end: item.endDate ?? item.startDate,
          detail: item.summary,
          bullets: item.highlights,
          url: item.url,
        }))
      : isListSectionKey(section.key)
        ? (standardItems(section.key, content, ctx) ?? [])
        : [];
    return {
      key: section.key,
      kind: "list",
      visible: section.visible,
      customTitle: custom?.title ?? null,
      items: fields.map((item, index) => draftItem(`${section.key}-${index}`, item)),
    };
  });
  return {
    cvId: cv.id,
    language: cv.language,
    header: {
      name: basics?.name ?? "",
      headline: basics?.label ?? "",
      email: basics?.email ?? "",
      phone: basics?.phone ?? "",
      website: basics?.url ?? "",
      location: joinPresent([basics?.location?.city, basics?.location?.region, basics?.location?.countryCode], ", ") ?? "",
      links: (basics?.profiles ?? []).map((profile) => ({
        label: present(profile.network) ?? ctx.intl.formatMessage(messages.linkFallback),
        url: profile.url ?? "",
      })),
      dateOfBirth: "",
      photoUrl: basics?.image ?? "",
    },
    summary: basics?.summary ?? "",
    sections: draftSections,
    paperSize: content.meta.theme.paperSize,
    density: content.meta.theme.density,
    accentColor: content.meta.theme.accentColor,
    showPhoto: Boolean(present(basics?.image)),
    showDateOfBirth: false,
  };
}

function monthOptions(ctx: ModelContext): { readonly value: string; readonly label: string }[] {
  const format = new Intl.DateTimeFormat(ctx.locale, { timeZone: "UTC", month: "long" });
  return Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, "0"),
    label: format.format(new Date(Date.UTC(2000, index, 1))),
  }));
}

/** Jobs for the Check tab: the CV's tailoring target or latest use first, then the best matches. */
function checkVM(cv: Cv, data: CvEditorData): CvEditorVM["check"] {
  const tailoredFor = data.cvRevisions
    .filter((revision) => revision.cvId === cv.id && revision.jobId !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.jobId;
  const usedFor = pinnedApplications(cv, data.applications).find((application) => application.jobId !== null)?.jobId;
  const ranked = [...data.jobMatches].sort((a, b) => b.score - a.score).map((match) => match.id);
  const ids = [...new Set([tailoredFor, usedFor, ...ranked].filter((id): id is string => typeof id === "string"))];
  const jobsById = new Map(data.jobs.map((job) => [job.id, job]));
  const jobs = ids
    .flatMap((id) => {
      const job = jobsById.get(id);
      return job && job.skills.length > 0
        ? [{ jobId: job.id, label: `${job.company} · ${job.title}`, keywords: job.skills }]
        : [];
    })
    .slice(0, 8);
  return { jobs, defaultJobId: jobs[0]?.jobId ?? null };
}

function editorVM(cv: Cv, byId: ReadonlyMap<string, Cv>, data: CvEditorData, ctx: ModelContext): CvEditorVM {
  const revisionsById = new Map(data.cvRevisions.map((revision) => [revision.id, revision]));
  const content: CvContent = revisionsById.get(cv.currentRevisionId)?.content ?? {
    meta: { template: cv.templateId, theme: cv.theme, sectionOrder: [], customSections: [] },
  };
  const pinned = pinnedApplicationVMs(cv, data, ctx);
  const ownRevisionCount = data.cvRevisions.filter((revision) => revision.cvId === cv.id).length;
  const pendingSync = ctx.pendingWrites.has(cv.id) || ctx.pendingWrites.has(cv.currentRevisionId);
  const updatedAt = relativeTime(cv.updatedAt, ctx);
  const sections = sectionVMs(content, ctx);
  return {
    cvId: cv.id,
    title: cv.title,
    kind: cvKind(cv, byId),
    language: { tag: cv.language, label: languageName(cv.language) },
    isDefault: cv.isDefault,
    archivedAt: cv.archivedAt ? relativeTime(cv.archivedAt, ctx) : null,
    version: cv.version,
    currentRevisionId: cv.currentRevisionId,
    variant: variantBannerVM(cv, byId, revisionsById, ctx),
    saveStatus: pendingSync
      ? { state: "local", label: ctx.intl.formatMessage(messages.savedLocal), time: updatedAt }
      : {
          state: "saved",
          label: ctx.intl.formatMessage(messages.saved, { relative: updatedAt.label }),
          time: updatedAt,
        },
    design: designVM(cv, ctx),
    sections,
    personalDetails: personalDetailsVM(cv, content, ctx),
    revisions: revisionGroupVMs(cv, data.cvRevisions, ctx),
    revisionCountLabel: ctx.intl.formatMessage(messages.revisionCount, { count: ownRevisionCount }),
    preview: previewVM(cv, content, data, ctx),
    pinnedApplications: pinned,
    pinnedLabel:
      pinned.length > 0
        ? ctx.intl.formatMessage(messages.usedIn, { count: pinned.length })
        : ctx.intl.formatMessage(messages.notUsed),
    originalFile: originalFileVM(cv, data.cvRevisions, ctx),
    pendingSync,
    draft: draftVM(cv, content, sections, ctx),
    itemFields: Object.fromEntries(
      sections
        .filter((section) => section.kind === "list")
        .map((section) => [
          section.key,
          {
            ...itemFieldsVM(section.key, ctx.intl),
            untitled: ctx.intl.formatMessage(
              (isListSectionKey(section.key) ? LIST_SECTIONS[section.key] : CUSTOM_SECTION).untitled,
            ),
          },
        ]),
    ),
    months: monthOptions(ctx),
    check: checkVM(cv, data),
    designOptions: {
      paper: (["a4", "letter"] as const).map((value) => ({
        value,
        label: ctx.intl.formatMessage(PAPER_MESSAGES[value]),
      })),
      density: (["compact", "comfortable", "spacious"] as const).map((value) => ({
        value,
        label: ctx.intl.formatMessage(DENSITY_MESSAGES[value]),
      })),
    },
    revisionContents: Object.fromEntries(
      data.cvRevisions.filter((revision) => revision.cvId === cv.id).map((revision) => [revision.id, revision.content]),
    ),
    revisionDrafts: Object.fromEntries(
      data.cvRevisions
        .filter((revision) => revision.cvId === cv.id)
        .map((revision) => [revision.id, draftVM(cv, revision.content, sectionVMs(revision.content, ctx), ctx)]),
    ),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Builder.
 * ---------------------------------------------------------------------------------------------- */

export function buildCvEditorModel(
  data: CvEditorData,
  ctx: ModelContext,
  params: Readonly<Record<string, string | undefined>>,
): CvEditorModel {
  const byId = new Map(data.cvs.map((cv) => [cv.id, cv]));
  const selectedCvId = selectCvId(data, params.cvId);
  const row = (cv: Cv): CvListRowVM => listRowVM(cv, byId, data, selectedCvId, ctx);
  const archived = data.cvs.filter((cv) => cv.archivedAt !== null).sort(byRecentEdit);
  const activeCount = data.cvs.length - archived.length;
  const selected = selectedCvId === null ? undefined : byId.get(selectedCvId);
  return {
    firstUse: data.cvs.length === 0 ? firstUseVM(ctx.intl) : null,
    list: {
      groups: activeGroups(data.cvs).map((group) => ({
        base: row(group.base),
        variants: group.variants.map(row),
      })),
      archived: archived.map(row),
      filters: [
        { id: "all", label: ctx.intl.formatMessage(messages.filterAll), count: activeCount },
        { id: "archived", label: ctx.intl.formatMessage(messages.filterArchived), count: archived.length },
      ],
    },
    selectedCvId,
    editor: selected ? editorVM(selected, byId, data, ctx) : null,
    records: Object.fromEntries(
      data.cvs.map((cv) => [
        cv.id,
        {
          cvId: cv.id,
          title: cv.title,
          language: cv.language,
          version: cv.version,
          parentCvId: cv.parentCvId,
          currentRevisionId: cv.currentRevisionId,
          archived: cv.archivedAt !== null,
          content: data.cvRevisions.find((revision) => revision.id === cv.currentRevisionId)?.content ?? null,
        },
      ]),
    ),
    profile: data.profile,
  };
}
