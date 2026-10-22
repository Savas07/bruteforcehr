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
import { applicationLabel } from "../../shared/model/build-blocks";
import {
  calendarDaysFromNow,
  clockTime,
  countLabel,
  relativeTime,
  shortDate,
} from "../../shared/model/format";
import type { CompanyVM, ModelContext, SourceVM, StatusVM, TimeVM, UserData } from "../../shared/model/types";
import { companyVM, sourceVM, statusVM } from "../../shared/model/vocabulary";

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
}

export interface CvEditorModel {
  /** Set only when the user has no CVs at all (archived ones count). */
  readonly firstUse: CvFirstUseVM | null;
  readonly list: CvListVM;
  /** `cvId` param when it names a CV, else the default CV, else the first one; null with no CVs. */
  readonly selectedCvId: string | null;
  readonly editor: CvEditorVM | null;
}

/* ------------------------------------------------------------------------------------------------
 * Copy.
 * ---------------------------------------------------------------------------------------------- */

const FIRST_USE: CvFirstUseVM = {
  title: "No CVs yet",
  body: "Import the CV you already have and we'll make it editable, or start from a blank page.",
  choices: [
    {
      id: "import",
      label: "Import a CV",
      description: "PDF, DOCX, JSON Resume or the LinkedIn ZIP",
      primary: true,
    },
    {
      id: "scratch",
      label: "Start from scratch",
      description: "Build it step by step (about 10 min)",
      primary: false,
    },
  ],
};

type ListSectionKey = Exclude<CvStandardSection, "basics">;

interface ListSectionCopy {
  readonly title: string;
  readonly one: string;
  readonly other: string;
  readonly add: string;
  readonly ghost: CvGhostVM;
  readonly untitled: string;
}

const LIST_SECTIONS: Readonly<Record<ListSectionKey, ListSectionCopy>> = {
  work: {
    title: "Experience",
    one: "role",
    other: "roles",
    add: "Add role",
    ghost: { label: "Add your first role", hint: "Start with the most recent." },
    untitled: "Untitled role",
  },
  projects: {
    title: "Projects",
    one: "project",
    other: "projects",
    add: "Add project",
    ghost: { label: "Add your first project", hint: "Side projects and open source count too." },
    untitled: "Untitled project",
  },
  education: {
    title: "Education",
    one: "entry",
    other: "entries",
    add: "Add education",
    ghost: { label: "Add your education", hint: "Degrees, schools or courses, most recent first." },
    untitled: "Untitled education",
  },
  skills: {
    title: "Skills",
    one: "group",
    other: "groups",
    add: "Add skill group",
    ghost: { label: "Add your skills", hint: "Group them, for example Frontend or Tools." },
    untitled: "Untitled group",
  },
  languages: {
    title: "Languages",
    one: "language",
    other: "languages",
    add: "Add language",
    ghost: { label: "Add a language", hint: "Include how well you speak it." },
    untitled: "Untitled language",
  },
  certificates: {
    title: "Certificates",
    one: "certificate",
    other: "certificates",
    add: "Add certificate",
    ghost: { label: "Add a certificate", hint: "Include who issued it and when." },
    untitled: "Untitled certificate",
  },
  awards: {
    title: "Awards",
    one: "award",
    other: "awards",
    add: "Add award",
    ghost: { label: "Add an award", hint: "Include who gave it and when." },
    untitled: "Untitled award",
  },
  publications: {
    title: "Publications",
    one: "publication",
    other: "publications",
    add: "Add publication",
    ghost: { label: "Add a publication", hint: "Articles, papers or talks with a link." },
    untitled: "Untitled publication",
  },
  volunteer: {
    title: "Volunteering",
    one: "role",
    other: "roles",
    add: "Add volunteer role",
    ghost: { label: "Add volunteer work", hint: "Start with the most recent." },
    untitled: "Untitled role",
  },
  interests: {
    title: "Interests",
    one: "interest",
    other: "interests",
    add: "Add interest",
    ghost: { label: "Add an interest", hint: "Keep it short and specific." },
    untitled: "Untitled interest",
  },
  references: {
    title: "References",
    one: "reference",
    other: "references",
    add: "Add reference",
    ghost: { label: "Add a reference", hint: "Ask the person before you list them." },
    untitled: "Untitled reference",
  },
};

const CUSTOM_SECTION: Omit<ListSectionCopy, "title"> = {
  one: "entry",
  other: "entries",
  add: "Add entry",
  ghost: { label: "Add your first entry", hint: "Give it a title, dates and a few bullets." },
  untitled: "Untitled entry",
};

const HEADER_GHOST: CvGhostVM = {
  label: "Add your name and contact details",
  hint: "Name, headline, email and links.",
};
const SUMMARY_GHOST: CvGhostVM = {
  label: "Write a summary",
  hint: "2–3 sentences about what you do and what you're looking for.",
};
const HIDDEN_NOTE = "Not shown on your CV";

const REVISION_SOURCES: Readonly<Record<CvRevisionSource, SourceVM>> = {
  manual: sourceVM("you"),
  import: sourceVM("cv", "Import"),
  ai_tailor: sourceVM("ai", "AI tailor"),
};

const REVISION_FALLBACK_SENTENCES: Readonly<Record<CvRevisionSource, string>> = {
  manual: "Edited",
  import: "Imported",
  ai_tailor: "Tailored for a job",
};

const IMPORT_KIND_LABELS: Readonly<Record<CvImportKind, string>> = {
  pdf: "PDF",
  docx: "DOCX",
  json_resume: "JSON Resume",
  linkedin_zip: "LinkedIn export",
};

const DENSITY_LABELS: Readonly<Record<CvTheme["density"], string>> = {
  compact: "Compact",
  comfortable: "Comfortable",
  spacious: "Spacious",
};

const PAPER: Readonly<
  Record<
    CvTheme["paperSize"],
    { readonly label: string; readonly dimensions: string; readonly aspectRatio: number }
  >
> = {
  a4: { label: "A4", dimensions: "210 × 297 mm", aspectRatio: 210 / 297 },
  letter: { label: "Letter", dimensions: "8.5 × 11 in", aspectRatio: 8.5 / 11 },
};

/** Font pair ids from `@bfhr/cv-render` (M2); unknown ids fall back to the id. */
const FONT_PAIR_LABELS: Readonly<Record<string, string>> = {
  "inter-source-serif": "Inter / Source Serif",
};

/** Markets where U6's photo / date-of-birth toggles apply. */
const PERSONAL_DETAILS_LANGUAGES: Readonly<Record<string, true>> = { de: true, tr: true };

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
  return `${resumeDate(start, ctx)} – ${end === undefined ? "Present" : resumeDate(end, ctx)}`;
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
    return `${countLabel(keywordCount, "skill", "skills", ctx.locale)} in ${countLabel(items.length, "group", "groups", ctx.locale)}`;
  }
  const names = items.map((item) =>
    key === "work" || key === "education" || key === "volunteer" ? (item.org ?? item.title) : item.title,
  );
  return joinList([...new Set(names)], ctx);
}

function listSection(
  key: string,
  title: string,
  copy: Omit<ListSectionCopy, "title">,
  fields: readonly ItemFields[],
  visible: boolean,
  ctx: ModelContext,
): CvListSectionVM {
  const items = fields.map((item, index) => itemVM(key, index, item, copy.untitled, ctx));
  return {
    kind: "list",
    key,
    anchorId: `cv-section-${key.replace(":", "-")}`,
    title,
    summary: items.length > 0 ? listSummary(key, items, ctx) : copy.ghost.label,
    visible,
    hiddenNote: visible ? null : HIDDEN_NOTE,
    ghost: items.length > 0 ? null : copy.ghost,
    movable: true,
    items,
    countLabel: countLabel(items.length, copy.one, copy.other, ctx.locale),
    addLabel: copy.add,
  };
}

function headerVM(basics: CvContent["basics"]): CvHeaderVM {
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
      label: present(profile.network) ?? "Link",
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
  const header = headerVM(content.basics);
  const summaryText = present(content.basics?.summary);
  const sections: CvSectionVM[] = [
    {
      kind: "header",
      key: "header",
      anchorId: "cv-section-header",
      title: "Header",
      summary: joinPresent([header.name, header.headline], " · ") ?? HEADER_GHOST.label,
      visible: basicsVisible,
      hiddenNote: basicsVisible ? null : HIDDEN_NOTE,
      ghost: header.name ? null : HEADER_GHOST,
      movable: false,
      header,
    },
    {
      kind: "text",
      key: "summary",
      anchorId: "cv-section-summary",
      title: "Summary",
      summary: summaryText ? firstSentence(summaryText) : SUMMARY_GHOST.label,
      visible: basicsVisible,
      hiddenNote: basicsVisible ? null : HIDDEN_NOTE,
      ghost: summaryText ? null : SUMMARY_GHOST,
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
      sections.push(listSection(key, copy.title, copy, standardItems(key, content, ctx) ?? [], true, ctx));
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
      sections.push(listSection(key, copy.title, copy, fields, false, ctx));
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
    pill: kind === "role" ? "Role variant" : languageName(cv.language),
    isDefault: cv.isDefault,
    defaultLabel: cv.isDefault ? "Default" : null,
    lastEdited: relativeTime(cv.updatedAt, ctx),
    usedIn:
      usedCount > 0 ? `Used in ${countLabel(usedCount, "application", "applications", ctx.locale)}` : null,
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

function selectCvId(data: Pick<UserData, "cvs" | "profile">, cvId: string | undefined): string | null {
  if (cvId !== undefined && data.cvs.some((cv) => cv.id === cvId)) return cvId;
  const groups = activeGroups(data.cvs);
  const flat = groups.flatMap((group) => [group.base, ...group.variants]);
  const profileDefault = flat.find((cv) => cv.id === data.profile.defaultCvId);
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
    text: `Variant of ${parent.title} · ${languageName(cv.language)}`,
    baseChange:
      count > 0
        ? {
            count,
            label: `The base changed in ${countLabel(count, "place", "places", ctx.locale)}`,
            action: "Review",
          }
        : null,
  };
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
      sentence: present(revision.diffSummary ?? undefined) ?? REVISION_FALLBACK_SENTENCES[revision.source],
      sourceKind: revision.source,
      source: REVISION_SOURCES[revision.source],
      time: relativeTime(revision.createdAt, ctx),
      clock: clockTime(revision.createdAt, ctx),
      isLatest,
      latestLabel: isLatest ? "Latest" : null,
      restoreLabel: isLatest ? null : "Restore this version",
      jobId: revision.jobId,
      pendingSync: ctx.pendingWrites.has(revision.id),
    };
    const last = groups.at(-1);
    if (last?.day === day) last.revisions.push(row);
    else {
      const label = day === 0 ? "Today" : day === -1 ? "Yesterday" : shortDate(revision.createdAt, ctx);
      groups.push({ label, day, revisions: [row] });
    }
  }
  return groups.map(({ label, revisions: rows }) => ({ label, revisions: rows }));
}

function designVM(cv: Cv): CvDesignVM {
  const templateLabel = cv.templateId
    .split(/[-_]/u)
    .map((word) => word.charAt(0).toLocaleUpperCase("en") + word.slice(1))
    .join(" ");
  const fontPairLabel = FONT_PAIR_LABELS[cv.theme.fontPair] ?? cv.theme.fontPair;
  const densityLabel = DENSITY_LABELS[cv.theme.density];
  const paperLabel = PAPER[cv.theme.paperSize].label;
  return {
    templateId: cv.templateId,
    templateLabel,
    accentColor: cv.theme.accentColor,
    fontPairLabel,
    densityLabel,
    paperLabel,
    summary: [templateLabel, fontPairLabel, densityLabel, paperLabel].join(" · "),
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
    paperLabel: paper.label,
    dimensions: paper.dimensions,
    aspectRatio: paper.aspectRatio,
    renderingLabel: "Rendering preview…",
    exportFileName: `${[...nameParts, "CV"].join("-")}.pdf`,
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
      status: statusVM(application.status),
      appliedAt: application.appliedAt ? relativeTime(application.appliedAt, ctx) : null,
      versionLabel: usesLatest
        ? "Latest version"
        : revision
          ? `Version from ${shortDate(revision.createdAt, ctx)}`
          : "Earlier version",
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
    kindLabel: IMPORT_KIND_LABELS[cv.importedFrom.kind],
    storagePath: cv.importedFrom.storagePath,
    uploadedAt: relativeTime(importedAt, ctx),
    uploadedLabel: `Uploaded on ${shortDate(importedAt, ctx)}`,
  };
}

function personalDetailsVM(cv: Cv, content: CvContent): CvPersonalDetailsVM | null {
  if (!PERSONAL_DETAILS_LANGUAGES[cv.language.split("-")[0] ?? cv.language]) return null;
  return {
    photo: { label: "Photo", on: Boolean(present(content.basics?.image)) },
    // JSON Resume has no date-of-birth field yet, so it is off until the variant turns it on.
    dateOfBirth: { label: "Date of birth", on: false },
    note: "German and Turkish employers may expect a photo and date of birth. UK and US employers usually don't.",
  };
}

function editorVM(cv: Cv, byId: ReadonlyMap<string, Cv>, data: UserData, ctx: ModelContext): CvEditorVM {
  const revisionsById = new Map(data.cvRevisions.map((revision) => [revision.id, revision]));
  const content: CvContent = revisionsById.get(cv.currentRevisionId)?.content ?? {
    meta: { template: cv.templateId, theme: cv.theme, sectionOrder: [], customSections: [] },
  };
  const pinned = pinnedApplicationVMs(cv, data, ctx);
  const ownRevisionCount = data.cvRevisions.filter((revision) => revision.cvId === cv.id).length;
  const pendingSync = ctx.pendingWrites.has(cv.id) || ctx.pendingWrites.has(cv.currentRevisionId);
  const updatedAt = relativeTime(cv.updatedAt, ctx);
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
      ? { state: "local", label: "Saved on this device", time: updatedAt }
      : { state: "saved", label: `Saved · ${updatedAt.label}`, time: updatedAt },
    design: designVM(cv),
    sections: sectionVMs(content, ctx),
    personalDetails: personalDetailsVM(cv, content),
    revisions: revisionGroupVMs(cv, data.cvRevisions, ctx),
    revisionCountLabel: countLabel(ownRevisionCount, "version", "versions", ctx.locale),
    preview: previewVM(cv, content, data, ctx),
    pinnedApplications: pinned,
    pinnedLabel:
      pinned.length > 0
        ? `Used in ${countLabel(pinned.length, "application", "applications", ctx.locale)}`
        : "Not used in an application yet",
    originalFile: originalFileVM(cv, data.cvRevisions, ctx),
    pendingSync,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Builder.
 * ---------------------------------------------------------------------------------------------- */

export function buildCvEditorModel(
  data: UserData,
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
    firstUse: data.cvs.length === 0 ? FIRST_USE : null,
    list: {
      groups: activeGroups(data.cvs).map((group) => ({
        base: row(group.base),
        variants: group.variants.map(row),
      })),
      archived: archived.map(row),
      filters: [
        { id: "all", label: "All", count: activeCount },
        { id: "archived", label: "Archived", count: archived.length },
      ],
    },
    selectedCvId,
    editor: selected ? editorVM(selected, byId, data, ctx) : null,
  };
}
