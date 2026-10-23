/**
 * Import review (research/cv-editor.md "Import review", components.md `ImportReview` /
 * `ConfidenceField`): "Did we read your CV correctly?". The extracted CV as editable fields grouped
 * by section; low-confidence fields carry "Needs a look" (amber dot + text + reason, never colour
 * alone) until the user edits them or says they look right. A summary counts them, "Next field to
 * check" jumps between them and a chip shows only those. The user never has to fix anything to
 * create the CV (proceed-or-fix).
 */
import type { CvImportKind } from "@bfhr/core";
import { ArrowDown, Check, FileText } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { defineMessages, useIntl, type MessageDescriptor } from "react-intl";
import { cx } from "../../../shared/cx";
import { useKeyBindings } from "../../../shared/keyboard/useKeyBindings";
import { AiDisclosureLine } from "../../../shared/ui/AiBadge";
import { Button } from "../../../shared/ui/Button";
import { Chip } from "../../../shared/ui/Chip";
import { ConfidenceTag, type ConfidenceState } from "../../../shared/ui/ConfidenceTag";
import { InlineAlert } from "../../../shared/ui/InlineAlert";
import { CV_LANGUAGES, type CvLanguage } from "@bfhr/cv-render";
import {
  parseImportWarning,
  reviewFieldProblem,
  type ReviewField,
  type ReviewFieldKey,
  type ReviewFieldProblem,
  type ReviewItem,
  type ReviewModel,
  type ReviewSectionKey,
} from "./model";

const messages = defineMessages({
  summaryFlagged: {
    id: "cv-editor.import.review.summaryFlagged",
    defaultMessage:
      "We read {filled, plural, one {# field} other {# fields}}. {flagged, plural, one {# needs a quick look} other {# need a quick look}}. You can fix them now or later.",
    description: "Import review summary when some fields have low confidence",
  },
  summaryClear: {
    id: "cv-editor.import.review.summaryClear",
    defaultMessage:
      "We read {filled, plural, one {# field} other {# fields}}. Nothing looked uncertain, but give it a quick read before you create the CV.",
    description: "Import review summary when no field has low confidence",
  },
  remaining: {
    id: "cv-editor.import.review.remaining",
    defaultMessage: "{count, plural, one {# field left to check} other {# fields left to check}}",
    description: "Live count of low-confidence fields the user hasn't edited or confirmed yet",
  },
  allChecked: {
    id: "cv-editor.import.review.allChecked",
    defaultMessage: "You've checked every flagged field.",
    description: "Shown once every low-confidence field was edited or confirmed",
  },
  nextField: {
    id: "cv-editor.import.review.nextField",
    defaultMessage: "Next field to check",
    description: "Moves focus to the next low-confidence field",
  },
  flaggedOnly: {
    id: "cv-editor.import.review.flaggedOnly",
    defaultMessage: "Show only fields to check",
    description: "Filter chip: hide fields that weren't flagged",
  },
  sectionsNav: {
    id: "cv-editor.import.review.sectionsNav",
    defaultMessage: "Sections",
    description: "Accessible name of the section jump list in the import review",
  },
  sectionToCheck: {
    id: "cv-editor.import.review.sectionToCheck",
    defaultMessage: "{count, plural, one {# to check} other {# to check}}",
    description: "Count of fields to check in one section (jump list and section heading)",
  },
  warningsTitle: {
    id: "cv-editor.import.review.warningsTitle",
    defaultMessage: "Notes from reading your file",
    description: "Heading of the importer's warnings",
  },
  originalKept: {
    id: "cv-editor.import.review.originalKept",
    defaultMessage: "{kind} · Kept attached to this CV",
    description: "Under the original file name in the import review",
  },
  aiDisclosure: {
    id: "cv-editor.import.review.aiDisclosure",
    defaultMessage: "Read by Claude. Check names, numbers and dates before you create the CV.",
    description: "AI disclosure under an import read by the model",
  },
  detailsHeading: {
    id: "cv-editor.import.review.detailsHeading",
    defaultMessage: "About this CV",
    description: "Group with the new CV's title and language",
  },
  title: {
    id: "cv-editor.import.review.title",
    defaultMessage: "CV name",
    description: "Label of the new CV's title",
  },
  titleHint: {
    id: "cv-editor.import.review.titleHint",
    defaultMessage: "Only you see this name, in your CV list.",
    description: "Hint under the CV name field",
  },
  language: {
    id: "cv-editor.import.review.language",
    defaultMessage: "Written in",
    description: "Label of the CV language select",
  },
  entry: {
    id: "cv-editor.import.review.entry",
    defaultMessage: "Entry {number, number}",
    description: "Fallback heading of an imported item with no title yet",
  },
  looksRight: {
    id: "cv-editor.import.review.looksRight",
    defaultMessage: "Looks right",
    description: "Confirms a low-confidence field without changing it",
  },
  reasonDate: {
    id: "cv-editor.import.review.reasonDate",
    defaultMessage: "We weren't sure about this date.",
    description: "Why a date field is flagged",
  },
  reasonList: {
    id: "cv-editor.import.review.reasonList",
    defaultMessage: "We weren't sure we split these correctly.",
    description: "Why a list field (bullets, keywords) is flagged",
  },
  reasonText: {
    id: "cv-editor.import.review.reasonText",
    defaultMessage: "We weren't sure we read this correctly.",
    description: "Why a text field is flagged",
  },
  hintDate: {
    id: "cv-editor.import.review.hintDate",
    defaultMessage: "Year, or year and month: 2022 or 2022-03. Leave the end date empty if it's ongoing.",
    description: "Hint under a date field",
  },
  hintLines: {
    id: "cv-editor.import.review.hintLines",
    defaultMessage: "One per line.",
    description: "Hint under a list field edited one entry per line",
  },
  hintCommas: {
    id: "cv-editor.import.review.hintCommas",
    defaultMessage: "Separate with commas.",
    description: "Hint under a list field edited as comma-separated values",
  },
  invalidDate: {
    id: "cv-editor.import.review.invalidDate",
    defaultMessage: "Use a year (2022), a year and month (2022-03) or a full date (2022-03-14).",
    description: "Error under a date field that isn't a valid date",
  },
  tooLong: {
    id: "cv-editor.import.review.tooLong",
    defaultMessage: "This is too long for a CV field. Shorten it a little.",
    description: "Error under a field over its length limit",
  },
  tooMany: {
    id: "cv-editor.import.review.tooMany",
    defaultMessage: "Keep it to 100 entries or fewer.",
    description: "Error under a list field with too many entries",
  },
  titleMissing: {
    id: "cv-editor.import.review.titleMissing",
    defaultMessage: "Give the CV a name first.",
    description: "Why Create CV is disabled: empty title",
  },
  fixFields: {
    id: "cv-editor.import.review.fixFields",
    defaultMessage:
      "{count, plural, one {Fix the field marked below first.} other {Fix the # fields marked below first.}}",
    description: "Why Create CV is disabled: fields with invalid values",
  },
  create: {
    id: "cv-editor.import.review.create",
    defaultMessage: "Create CV",
    description: "Primary action",
  },
  creating: {
    id: "cv-editor.import.review.creating",
    defaultMessage: "Creating…",
    description: "Create CV button while saving",
  },
  createFailed: {
    id: "cv-editor.import.review.createFailed",
    defaultMessage: "Couldn't create the CV",
    description: "Error title when saving the imported CV failed",
  },
  createFailedBody: {
    id: "cv-editor.import.review.createFailedBody",
    defaultMessage: "Your edits are still here. Try again in a moment.",
    description: "Error body when saving the imported CV failed",
  },
  tryAgain: {
    id: "cv-editor.import.review.tryAgain",
    defaultMessage: "Try again",
    description: "Retry Create CV",
  },
  tryAnother: {
    id: "cv-editor.import.review.tryAnother",
    defaultMessage: "Try another file",
    description: "Leaves the review to pick a different file",
  },
  keysGroup: {
    id: "cv-editor.import.review.keysGroup",
    defaultMessage: "CV import",
    description: "Shortcuts sheet group",
  },
});

const SECTION_TITLES: Readonly<Record<ReviewSectionKey, MessageDescriptor>> = defineMessages({
  basics: { id: "cv-editor.import.section.basics", defaultMessage: "Header" },
  summary: { id: "cv-editor.import.section.summary", defaultMessage: "Summary" },
  profiles: { id: "cv-editor.import.section.profiles", defaultMessage: "Profiles" },
  work: { id: "cv-editor.import.section.work", defaultMessage: "Experience" },
  projects: { id: "cv-editor.import.section.projects", defaultMessage: "Projects" },
  education: { id: "cv-editor.import.section.education", defaultMessage: "Education" },
  skills: { id: "cv-editor.import.section.skills", defaultMessage: "Skills" },
  languages: { id: "cv-editor.import.section.languages", defaultMessage: "Languages" },
  certificates: { id: "cv-editor.import.section.certificates", defaultMessage: "Certificates" },
  awards: { id: "cv-editor.import.section.awards", defaultMessage: "Awards" },
  publications: { id: "cv-editor.import.section.publications", defaultMessage: "Publications" },
  volunteer: { id: "cv-editor.import.section.volunteer", defaultMessage: "Volunteering" },
  interests: { id: "cv-editor.import.section.interests", defaultMessage: "Interests" },
  references: { id: "cv-editor.import.section.references", defaultMessage: "References" },
});

const FIELD_LABELS: Readonly<Record<ReviewFieldKey, MessageDescriptor>> = defineMessages({
  name: { id: "cv-editor.import.field.name", defaultMessage: "Name" },
  headline: { id: "cv-editor.import.field.headline", defaultMessage: "Headline" },
  email: { id: "cv-editor.import.field.email", defaultMessage: "Email" },
  phone: { id: "cv-editor.import.field.phone", defaultMessage: "Phone" },
  website: { id: "cv-editor.import.field.website", defaultMessage: "Website" },
  city: { id: "cv-editor.import.field.city", defaultMessage: "City" },
  region: { id: "cv-editor.import.field.region", defaultMessage: "Region" },
  countryCode: { id: "cv-editor.import.field.countryCode", defaultMessage: "Country" },
  summary: { id: "cv-editor.import.field.summary", defaultMessage: "Summary" },
  network: { id: "cv-editor.import.field.network", defaultMessage: "Network" },
  username: { id: "cv-editor.import.field.username", defaultMessage: "Username" },
  url: { id: "cv-editor.import.field.url", defaultMessage: "Link" },
  position: { id: "cv-editor.import.field.position", defaultMessage: "Role" },
  organization: { id: "cv-editor.import.field.organization", defaultMessage: "Organization" },
  location: { id: "cv-editor.import.field.location", defaultMessage: "Location" },
  description: { id: "cv-editor.import.field.description", defaultMessage: "Description" },
  startDate: { id: "cv-editor.import.field.startDate", defaultMessage: "Start" },
  endDate: { id: "cv-editor.import.field.endDate", defaultMessage: "End" },
  highlights: { id: "cv-editor.import.field.highlights", defaultMessage: "Bullets" },
  institution: { id: "cv-editor.import.field.institution", defaultMessage: "School" },
  area: { id: "cv-editor.import.field.area", defaultMessage: "Field of study" },
  studyType: { id: "cv-editor.import.field.studyType", defaultMessage: "Degree" },
  score: { id: "cv-editor.import.field.score", defaultMessage: "Grade" },
  courses: { id: "cv-editor.import.field.courses", defaultMessage: "Courses" },
  level: { id: "cv-editor.import.field.level", defaultMessage: "Level" },
  keywords: { id: "cv-editor.import.field.keywords", defaultMessage: "Keywords" },
  language: { id: "cv-editor.import.field.language", defaultMessage: "Language" },
  fluency: { id: "cv-editor.import.field.fluency", defaultMessage: "Fluency" },
  issuer: { id: "cv-editor.import.field.issuer", defaultMessage: "Issued by" },
  date: { id: "cv-editor.import.field.date", defaultMessage: "Date" },
  title: { id: "cv-editor.import.field.title", defaultMessage: "Title" },
  awarder: { id: "cv-editor.import.field.awarder", defaultMessage: "Awarded by" },
  publisher: { id: "cv-editor.import.field.publisher", defaultMessage: "Publisher" },
  releaseDate: { id: "cv-editor.import.field.releaseDate", defaultMessage: "Published" },
  reference: { id: "cv-editor.import.field.reference", defaultMessage: "Reference" },
  roles: { id: "cv-editor.import.field.roles", defaultMessage: "Your roles" },
});

const IMPORT_KIND_LABELS: Readonly<Record<CvImportKind, MessageDescriptor>> = defineMessages({
  pdf: { id: "cv-editor.import.kind.pdf", defaultMessage: "PDF" },
  docx: { id: "cv-editor.import.kind.docx", defaultMessage: "Word document" },
  json_resume: { id: "cv-editor.import.kind.jsonResume", defaultMessage: "JSON Resume" },
  linkedin_zip: { id: "cv-editor.import.kind.linkedinZip", defaultMessage: "LinkedIn export" },
});

const PROBLEM_MESSAGES: Readonly<Record<ReviewFieldProblem, MessageDescriptor>> = {
  invalidDate: messages.invalidDate,
  tooLong: messages.tooLong,
  tooMany: messages.tooMany,
};

/** The importer's notes (`CV_IMPORT_WARNING_CODES`) in words; `{place}` is "Experience · Engineer · Acme · Role". */
const WARNING_MESSAGES = defineMessages({
  droppedUngrounded: {
    id: "cv-editor.import.warning.droppedUngrounded",
    defaultMessage: "{place}: we left out a value we couldn't find in your file.",
    description: "Import note: a value the model returned wasn't in the source, so it was removed",
  },
  dateMonthDropped: {
    id: "cv-editor.import.warning.dateMonthDropped",
    defaultMessage: "{place}: your file gives only the year here, so we kept just the year.",
    description: "Import note: a date's month wasn't in the source",
  },
  droppedInvalidDate: {
    id: "cv-editor.import.warning.droppedInvalidDate",
    defaultMessage: "{place}: we couldn't read this date, so it's empty for now.",
    description: "Import note: a date wasn't valid and was removed",
  },
  droppedInvalid: {
    id: "cv-editor.import.warning.droppedInvalid",
    defaultMessage: "{place}: a value didn't fit this field, so we left it out.",
    description: "Import note: a value was the wrong type or too long and was removed",
  },
  placeUnknown: {
    id: "cv-editor.import.warning.placeUnknown",
    defaultMessage: "One field",
    description: "{place} of an import note whose field we can't name",
  },
  sourceTruncated: {
    id: "cv-editor.import.warning.sourceTruncated",
    defaultMessage:
      "Your file was longer than we can read at once, so its end wasn't imported. Check that your last sections are complete.",
    description: "Import note: the source was cut at the import limit",
  },
  unmappedSection: {
    id: "cv-editor.import.warning.unmappedSection",
    defaultMessage:
      "We didn't know where “{heading}” belongs, so it isn't in the CV. Add it by hand if you need it.",
    description: "Import note: a section of the file had no place in the CV; {heading} is its heading",
  },
  unmappedSectionUnnamed: {
    id: "cv-editor.import.warning.unmappedSectionUnnamed",
    defaultMessage:
      "One part of your file didn't fit a CV section, so it isn't in the CV. Add it by hand if you need it.",
    description: "Import note: a section of the file had no place in the CV, heading unknown",
  },
  linkedinMissing: {
    id: "cv-editor.import.warning.linkedinMissing",
    defaultMessage: "Your LinkedIn export had no {file}, so that part is empty.",
    description: "Import note: a CSV file was missing from the LinkedIn export; {file} is e.g. Positions.csv",
  },
  linkedinMissingUnnamed: {
    id: "cv-editor.import.warning.linkedinMissingUnnamed",
    defaultMessage: "Part of your LinkedIn export was missing, so some sections may be empty.",
    description: "Import note: a file was missing from the LinkedIn export, name unknown",
  },
  unknown: {
    id: "cv-editor.import.warning.unknown",
    defaultMessage:
      "We noticed something unusual while reading your file. Give the fields below a quick look.",
    description: "Import note with a code this version doesn't know",
  },
});

const inputClass =
  "border-line-control bg-surface-base text-callout w-full rounded-md border px-2 aria-invalid:border-danger-solid";
const labelClass = "text-fg-secondary text-footnote font-semibold";

/** What the review hands back: the user's title, language and field values by pointer. */
export interface ImportReviewResult {
  readonly title: string;
  readonly language: CvLanguage;
  readonly values: Readonly<Record<string, string>>;
}

export interface ImportReviewProps {
  readonly review: ReviewModel;
  readonly warnings: readonly string[];
  readonly fileName: string;
  readonly kind: CvImportKind;
  /** The file was read by the model (not a JSON Resume / LinkedIn export): shows the AI disclosure. */
  readonly aiAssisted: boolean;
  readonly defaultTitle: string;
  readonly defaultLanguage: CvLanguage;
  /** Creates the CV; a rejection keeps the review open with "Couldn't create the CV". */
  readonly onCreate: (result: ImportReviewResult) => Promise<void>;
  readonly onTryAnotherFile: () => void;
}

export function ImportReview({
  review,
  warnings,
  fileName,
  kind,
  aiAssisted,
  defaultTitle,
  defaultLanguage,
  onCreate,
  onTryAnotherFile,
}: ImportReviewProps) {
  const intl = useIntl();
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(review.fields.map((field) => [field.pointer, field.value])),
  );
  const [confirmed, setConfirmed] = useState<Readonly<Record<string, true>>>({});
  const [title, setTitle] = useState(defaultTitle);
  const [language, setLanguage] = useState<CvLanguage>(defaultLanguage);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  const fieldIndex = useMemo(
    () => Object.fromEntries(review.fields.map((field, index) => [field.pointer, index])),
    [review.fields],
  );
  const domId = (pointer: string) => `${baseId}-field-${fieldIndex[pointer] ?? 0}`;
  const valueOf = (field: ReviewField) => values[field.pointer] ?? field.value;
  const stateOf = (field: ReviewField): ConfidenceState | null => {
    if (!field.flagged) return null;
    if (valueOf(field) !== field.value) return "edited";
    return confirmed[field.pointer] ? "confirmed" : "flagged";
  };

  const remaining = review.flagged.filter((field) => stateOf(field) === "flagged");
  const problems = review.fields.filter((field) => reviewFieldProblem(field, valueOf(field)) !== null);
  const languageNames = useMemo(
    () => new Intl.DisplayNames([intl.locale], { type: "language" }),
    [intl.locale],
  );

  const disabledReason =
    title.trim() === ""
      ? intl.formatMessage(messages.titleMissing)
      : problems.length > 0
        ? intl.formatMessage(messages.fixFields, { count: problems.length })
        : null;

  const create = async () => {
    if (disabledReason !== null || creating) return;
    setCreating(true);
    setCreateFailed(false);
    try {
      await onCreate({ title: title.trim(), language, values });
    } catch {
      setCreateFailed(true);
      setCreating(false);
    }
  };

  useKeyBindings([
    {
      id: "cv-editor.import.create",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.create),
      group: intl.formatMessage(messages.keysGroup),
      inOverlays: true,
      run: () => void create(),
    },
  ]);

  const focusField = (field: ReviewField) => {
    const element = document.getElementById(domId(field.pointer));
    element?.scrollIntoView({ block: "center" });
    element?.focus({ preventScroll: true });
  };

  /** The first unchecked flagged field after the focused one, wrapping around. */
  const nextField = () => {
    const active = document.activeElement;
    const currentIndex = review.fields.findIndex((field) => active?.id === domId(field.pointer));
    const next = remaining.find((field) => (fieldIndex[field.pointer] ?? 0) > currentIndex) ?? remaining[0];
    if (next) focusField(next);
  };

  const sectionRemaining = (items: ReviewModel["sections"][number]["items"]) =>
    items.reduce((sum, item) => sum + item.fields.filter((field) => stateOf(field) === "flagged").length, 0);

  /** "Engineer · Acme" from the item's current values, or "Entry 2" while they're empty. */
  const itemHeading = (item: ReviewItem, index: number) =>
    item.headingPointers
      .map((pointer) => values[pointer]?.trim() ?? "")
      .filter((part) => part !== "")
      .join(" · ") || intl.formatMessage(messages.entry, { number: index + 1 });

  const warningText = (warning: string): string => {
    const { code, place, detail } = parseImportWarning(warning);
    const where = () => {
      if (place === null) return intl.formatMessage(WARNING_MESSAGES.placeUnknown);
      const item =
        place.index === null
          ? undefined
          : review.sections
              .find((section) => section.key === place.section)
              ?.items.find((candidate) => candidate.index === place.index);
      return [
        intl.formatMessage(SECTION_TITLES[place.section]),
        place.index === null
          ? null
          : item
            ? itemHeading(item, place.index)
            : intl.formatMessage(messages.entry, { number: place.index + 1 }),
        // The summary's only field is the summary itself.
        place.field === null || place.section === "summary"
          ? null
          : intl.formatMessage(FIELD_LABELS[place.field]),
      ]
        .filter((part) => part !== null)
        .join(" · ");
    };
    switch (code) {
      case "dropped_ungrounded":
        return intl.formatMessage(WARNING_MESSAGES.droppedUngrounded, { place: where() });
      case "date_month_dropped":
        return intl.formatMessage(WARNING_MESSAGES.dateMonthDropped, { place: where() });
      case "dropped_invalid_date":
        return intl.formatMessage(WARNING_MESSAGES.droppedInvalidDate, { place: where() });
      case "dropped_invalid":
        return intl.formatMessage(WARNING_MESSAGES.droppedInvalid, { place: where() });
      case "source_truncated":
        return intl.formatMessage(WARNING_MESSAGES.sourceTruncated);
      case "unmapped_section":
        return detail === null
          ? intl.formatMessage(WARNING_MESSAGES.unmappedSectionUnnamed)
          : intl.formatMessage(WARNING_MESSAGES.unmappedSection, { heading: detail });
      case "linkedin_missing":
        return detail === null
          ? intl.formatMessage(WARNING_MESSAGES.linkedinMissingUnnamed)
          : intl.formatMessage(WARNING_MESSAGES.linkedinMissing, { file: detail });
      case null:
        return intl.formatMessage(WARNING_MESSAGES.unknown);
    }
  };
  // Several dropped values in one field read as one note.
  const notes = [...new Set(warnings.map(warningText))];

  const visibleSections = review.sections
    .map((section) => ({
      section,
      items: flaggedOnly
        ? section.items
            .map((item) => ({ ...item, fields: item.fields.filter((field) => field.flagged) }))
            .filter((item) => item.fields.length > 0)
        : section.items,
    }))
    .filter(({ items }) => items.length > 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={intl.formatMessage(messages.sectionsNav)}
          className="border-line-subtle hidden w-44 shrink-0 overflow-y-auto border-r px-3 py-4 md:block"
        >
          <ul className="flex flex-col gap-0.5">
            {review.sections.map((section) => {
              const left = sectionRemaining(section.items);
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => {
                      const heading = document.getElementById(`${baseId}-section-${section.key}`);
                      heading?.scrollIntoView({ block: "start" });
                      heading?.focus({ preventScroll: true });
                    }}
                    className="text-fg-primary hover:bg-surface-hover flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-callout"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {intl.formatMessage(SECTION_TITLES[section.key])}
                    </span>
                    {left > 0 && (
                      <span className="text-warning-text inline-flex items-center gap-1 text-caption1">
                        <span aria-hidden="true" className="bg-warning-solid size-2 rounded-full" />
                        {intl.formatMessage(messages.sectionToCheck, { count: left })}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
          <div className="bg-surface-sunken flex flex-col gap-3 rounded-md p-3">
            <p className="text-callout">
              {review.flagged.length > 0
                ? intl.formatMessage(messages.summaryFlagged, {
                    filled: review.filledCount,
                    flagged: review.flagged.length,
                  })
                : intl.formatMessage(messages.summaryClear, { filled: review.filledCount })}
            </p>
            {review.flagged.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <p role="status" className="text-fg-secondary flex-1 text-footnote">
                  {remaining.length > 0
                    ? intl.formatMessage(messages.remaining, { count: remaining.length })
                    : intl.formatMessage(messages.allChecked)}
                </p>
                <Chip selected={flaggedOnly} onSelectedChange={setFlaggedOnly}>
                  {intl.formatMessage(messages.flaggedOnly)}
                </Chip>
                <Button
                  size="sm"
                  icon={ArrowDown}
                  disabledReason={remaining.length === 0 ? intl.formatMessage(messages.allChecked) : null}
                  onClick={nextField}
                >
                  {intl.formatMessage(messages.nextField)}
                </Button>
              </div>
            )}
            {aiAssisted && <AiDisclosureLine text={intl.formatMessage(messages.aiDisclosure)} />}
          </div>

          {notes.length > 0 && (
            <InlineAlert tone="info" title={intl.formatMessage(messages.warningsTitle)}>
              <ul className="list-disc pl-4">
                {notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </InlineAlert>
          )}

          <section aria-labelledby={`${baseId}-details`} className="flex flex-col gap-3">
            <h3 id={`${baseId}-details`} className="text-headline">
              {intl.formatMessage(messages.detailsHeading)}
            </h3>
            <div className="border-line-subtle flex items-center gap-3 rounded-md border px-3 py-2">
              <FileText aria-hidden="true" className="text-fg-secondary size-5 shrink-0" strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-callout truncate font-medium">{fileName}</p>
                <p className="text-fg-secondary text-footnote">
                  {intl.formatMessage(messages.originalKept, {
                    kind: intl.formatMessage(IMPORT_KIND_LABELS[kind]),
                  })}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${baseId}-title`} className={labelClass}>
                  {intl.formatMessage(messages.title)}
                </label>
                <input
                  id={`${baseId}-title`}
                  value={title}
                  maxLength={120}
                  required
                  aria-invalid={title.trim() === "" || undefined}
                  aria-describedby={`${baseId}-title-hint`}
                  onChange={(event) => setTitle(event.target.value)}
                  className={cx(inputClass, "h-8")}
                />
                <span id={`${baseId}-title-hint`} className="text-fg-tertiary text-caption1">
                  {intl.formatMessage(title.trim() === "" ? messages.titleMissing : messages.titleHint)}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`${baseId}-language`} className={labelClass}>
                  {intl.formatMessage(messages.language)}
                </label>
                <select
                  id={`${baseId}-language`}
                  value={language}
                  onChange={(event) =>
                    setLanguage(
                      CV_LANGUAGES.find((option) => option === event.target.value) ?? defaultLanguage,
                    )
                  }
                  className={cx(inputClass, "h-8")}
                >
                  {CV_LANGUAGES.map((option) => (
                    <option key={option} value={option}>
                      {languageNames.of(option) ?? option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {visibleSections.map(({ section, items }) => {
            const left = sectionRemaining(section.items);
            const sectionTitle = intl.formatMessage(SECTION_TITLES[section.key]);
            return (
              <section
                key={section.key}
                aria-labelledby={`${baseId}-section-${section.key}`}
                className="flex flex-col gap-3"
              >
                <h3
                  id={`${baseId}-section-${section.key}`}
                  tabIndex={-1}
                  className="text-headline flex items-center gap-2"
                >
                  {sectionTitle}
                  {left > 0 && (
                    <span className="text-warning-text inline-flex items-center gap-1 text-caption1 font-normal">
                      <span aria-hidden="true" className="bg-warning-solid size-2 rounded-full" />
                      {intl.formatMessage(messages.sectionToCheck, { count: left })}
                    </span>
                  )}
                </h3>
                {items.map((item) => {
                  const fieldsGrid = (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {item.fields.map((field) => (
                        <ReviewFieldRow
                          key={field.pointer}
                          id={domId(field.pointer)}
                          field={field}
                          value={valueOf(field)}
                          state={stateOf(field)}
                          onChange={(value) =>
                            setValues((current) => ({ ...current, [field.pointer]: value }))
                          }
                          onConfirm={() => setConfirmed((current) => ({ ...current, [field.pointer]: true }))}
                        />
                      ))}
                    </div>
                  );
                  if (item.index === null) return <div key={item.pointer}>{fieldsGrid}</div>;
                  const heading = itemHeading(item, item.index);
                  return (
                    <fieldset
                      key={item.pointer}
                      className="border-line-subtle flex min-w-0 flex-col gap-3 rounded-md border px-3 pt-1 pb-3"
                    >
                      <legend className="text-callout px-1 font-semibold">{heading}</legend>
                      {fieldsGrid}
                    </fieldset>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      <div className="border-line-subtle flex flex-col gap-3 border-t px-6 py-4">
        {createFailed && (
          <InlineAlert
            tone="error"
            fromAction
            title={intl.formatMessage(messages.createFailed)}
            action={{ label: intl.formatMessage(messages.tryAgain), onClick: () => void create() }}
          >
            {intl.formatMessage(messages.createFailedBody)}
          </InlineAlert>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" className="mr-auto" onClick={onTryAnotherFile}>
            {intl.formatMessage(messages.tryAnother)}
          </Button>
          <Button
            onClick={() => void create()}
            variant="primary"
            shortcut="Mod+Enter"
            loading={creating}
            loadingLabel={intl.formatMessage(messages.creating)}
            disabledReason={disabledReason}
          >
            {intl.formatMessage(messages.create)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewFieldRow({
  id,
  field,
  value,
  state,
  onChange,
  onConfirm,
}: {
  id: string;
  field: ReviewField;
  value: string;
  state: ConfidenceState | null;
  onChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const intl = useIntl();
  const problem = reviewFieldProblem(field, value);
  const tagId = `${id}-tag`;
  const hintId = `${id}-hint`;
  const problemId = `${id}-problem`;
  const hint =
    field.kind === "date"
      ? messages.hintDate
      : field.kind === "lines"
        ? messages.hintLines
        : field.kind === "commas"
          ? messages.hintCommas
          : null;
  const reason =
    field.kind === "date"
      ? messages.reasonDate
      : field.kind === "lines" || field.kind === "commas"
        ? messages.reasonList
        : messages.reasonText;
  const describedBy =
    [state && tagId, problem && problemId, hint && hintId].filter(Boolean).join(" ") || undefined;
  const wide = field.kind === "longText" || field.kind === "lines";
  const common = {
    id,
    value,
    "aria-invalid": problem !== null || undefined,
    "aria-describedby": describedBy,
  } as const;

  return (
    <div
      className={cx(
        "flex min-w-0 flex-col gap-1",
        wide && "sm:col-span-2",
        state === "flagged" &&
          "border-warning-solid bg-warning-subtle/50 -mx-2 rounded-md border-l-2 px-2 py-1.5",
      )}
    >
      <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={id} className={labelClass}>
          {intl.formatMessage(FIELD_LABELS[field.key])}
        </label>
        {state && (
          <span id={tagId}>
            <ConfidenceTag
              state={state}
              reason={state === "flagged" ? intl.formatMessage(reason) : undefined}
            />
          </span>
        )}
      </div>
      {field.kind === "longText" || field.kind === "lines" ? (
        <textarea
          {...common}
          rows={Math.min(10, Math.max(3, value.split("\n").length + 1))}
          onChange={(event) => onChange(event.target.value)}
          className={cx(inputClass, "py-1.5")}
        />
      ) : (
        <input
          {...common}
          type={field.key === "email" ? "email" : "text"}
          inputMode={field.kind === "date" ? "numeric" : undefined}
          placeholder={field.kind === "date" ? "2022-03" : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cx(inputClass, "h-8")}
        />
      )}
      {problem && (
        <p id={problemId} className="text-danger-text text-footnote">
          {intl.formatMessage(PROBLEM_MESSAGES[problem])}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-fg-tertiary text-caption1">
          {intl.formatMessage(hint)}
        </p>
      )}
      {state === "flagged" && (
        <Button size="sm" variant="plain" icon={Check} className="self-start" onClick={onConfirm}>
          {intl.formatMessage(messages.looksRight)}
        </Button>
      )}
    </div>
  );
}
