/**
 * Structured editor (components.md `SectionAccordion` + `SectionJumpNav`, `ItemCard` /
 * `ItemInlineForm`, `BulletListEditor`): sections as accordion cards in the CV's order, items as
 * cards that open into inline forms, one field per bullet. Header is pinned first; every other
 * section and item moves with the ↑ / ↓ buttons or Alt+↑ / Alt+↓. Pending AI suggestions replace
 * the bullet they would change with a `TrackedChange` until the user decides.
 */
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button, IconButton } from "../../shared/ui/Button";
import { GhostRow } from "../../shared/ui/EmptyState";
import {
  insertBullet,
  removeBullet,
  updateBullet,
  updateHeader,
  updateItemField,
  updateSummary,
  type CvDraft,
  type CvDraftItem,
  type CvDraftSection,
  type CvItemField,
} from "./draft";
import type { CvEditorVM, CvItemFieldsVM, CvSectionVM } from "./model";
import { cvDateRange } from "./preview-document";
import { HORIZONTAL_STRIP } from "./strip";
import type { CvSuggestionVM } from "./suggestions";
import { TrackedChange } from "./TrackedChange";

const messages = defineMessages({
  jumpNav: { id: "cv-editor.editor.jumpNav", defaultMessage: "Sections" },
  moveUp: { id: "cv-editor.editor.moveUp", defaultMessage: "Move {name} up" },
  moveDown: { id: "cv-editor.editor.moveDown", defaultMessage: "Move {name} down" },
  name: { id: "cv-editor.field.fullName", defaultMessage: "Full name" },
  headline: { id: "cv-editor.field.headline", defaultMessage: "Headline" },
  email: { id: "cv-editor.field.email", defaultMessage: "Email" },
  phone: { id: "cv-editor.field.phone", defaultMessage: "Phone" },
  website: { id: "cv-editor.field.website", defaultMessage: "Website" },
  dateOfBirth: { id: "cv-editor.field.dateOfBirth", defaultMessage: "Date of birth" },
  location: { id: "cv-editor.field.headerLocation", defaultMessage: "City and country" },
  photo: { id: "cv-editor.field.photo", defaultMessage: "Photo" },
  photoHint: {
    id: "cv-editor.field.photoHint",
    defaultMessage: "A clear, recent portrait. It stays on this CV variant only.",
  },
  summaryHint: {
    id: "cv-editor.field.summaryHint",
    defaultMessage: "2–3 sentences about what you do and what you're looking for.",
  },
  start: { id: "cv-editor.field.start", defaultMessage: "Start" },
  end: { id: "cv-editor.field.end", defaultMessage: "End" },
  month: { id: "cv-editor.field.month", defaultMessage: "{field} month" },
  year: { id: "cv-editor.field.year", defaultMessage: "{field} year" },
  noMonth: { id: "cv-editor.field.noMonth", defaultMessage: "Month" },
  noYear: { id: "cv-editor.field.noYear", defaultMessage: "Year" },
  bullet: { id: "cv-editor.field.bullet", defaultMessage: "{list}, item {number, number}" },
  addBullet: { id: "cv-editor.field.addBullet", defaultMessage: "Add a line" },
  removeBullet: { id: "cv-editor.field.removeBullet", defaultMessage: "Remove line {number, number}" },
  removeItem: { id: "cv-editor.editor.removeItem", defaultMessage: "Remove" },
  collapse: { id: "cv-editor.editor.collapse", defaultMessage: "Done" },
  links: { id: "cv-editor.field.links", defaultMessage: "Links" },
  suggestionHere: {
    id: "cv-editor.editor.suggestionHere",
    defaultMessage: "{count, plural, one {# suggestion} other {# suggestions}}",
    description: "Badge on a collapsed CV entry with pending AI suggestions",
  },
});

/** Year choices for month-year pickers, newest first (CV dates, not a clock reading). */
const YEARS = Array.from({ length: 2036 - 1970 }, (_, index) => String(2035 - index));

export interface EditorOps {
  readonly change: (update: (draft: CvDraft) => CvDraft) => void;
  readonly moveSection: (key: string, delta: -1 | 1) => void;
  readonly moveItem: (sectionKey: string, itemId: string, delta: -1 | 1) => void;
  readonly addItem: (sectionKey: string) => void;
  readonly removeItem: (sectionKey: string, itemId: string) => void;
  readonly toggleSection: (key: string) => void;
  readonly toggleItem: (itemId: string) => void;
  readonly focusBlock: (blockId: string | null) => void;
  readonly useSuggestion: (id: string, then: "done" | "edit") => void;
  readonly keepSuggestion: (id: string) => void;
  readonly fillSuggestion: (id: string, placeholder: string, value: string) => void;
}

/** A textarea that grows with its content (one line per bullet by default). */
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      {...props}
      className={cx(
        "border-line-control bg-surface-base w-full resize-none overflow-hidden rounded-md border px-2 py-1.5 text-callout leading-snug",
        props.className,
      )}
    />
  );
}

const inputClass = "border-line-control bg-surface-base h-8 w-full rounded-md border px-2 text-callout";
const labelClass = "text-fg-secondary text-footnote font-semibold";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function MonthYear({
  label,
  value,
  months,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  months: CvEditorVM["months"];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const [year = "", month = ""] = (value ?? "").split("-");
  const compose = (nextYear: string, nextMonth: string) =>
    onChange(nextYear === "" ? "" : nextMonth === "" ? nextYear : `${nextYear}-${nextMonth}`);
  const selectClass = "border-line-control bg-surface-base h-8 min-w-0 rounded-md border px-1.5 text-callout disabled:text-fg-disabled";
  return (
    <fieldset className="flex min-w-0 flex-col gap-1" disabled={disabled}>
      <legend className={cx(labelClass, "mb-1")}>{label}</legend>
      <div className="flex gap-1.5">
        <select
          aria-label={intl.formatMessage(messages.month, { field: label })}
          value={month}
          onChange={(event) => compose(year, event.target.value)}
          className={cx(selectClass, "flex-[3]")}
        >
          <option value="">{intl.formatMessage(messages.noMonth)}</option>
          {months.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label={intl.formatMessage(messages.year, { field: label })}
          value={year}
          onChange={(event) => compose(event.target.value, month)}
          className={cx(selectClass, "flex-[2]")}
        >
          <option value="">{intl.formatMessage(messages.noYear)}</option>
          {YEARS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

function HeaderForm({ draft, ops }: { draft: CvDraft; ops: EditorOps }) {
  const intl = useIntl();
  const { header } = draft;
  const text = (key: "name" | "headline" | "email" | "phone" | "website" | "location", label: string, type = "text") => (
    <Field label={label}>
      <input
        type={type}
        value={header[key]}
        spellCheck={key === "headline"}
        lang={draft.language}
        onChange={(event) => ops.change((current) => updateHeader(current, { [key]: event.target.value }))}
        className={inputClass}
      />
    </Field>
  );
  return (
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
      {text("name", intl.formatMessage(messages.name))}
      {text("headline", intl.formatMessage(messages.headline))}
      {text("email", intl.formatMessage(messages.email), "email")}
      {text("phone", intl.formatMessage(messages.phone), "tel")}
      {text("website", intl.formatMessage(messages.website), "url")}
      {text("location", intl.formatMessage(messages.location))}
      {header.links.length > 0 && (
        <fieldset className="flex flex-col gap-2 @md:col-span-2">
          <legend className={cx(labelClass, "mb-1")}>{intl.formatMessage(messages.links)}</legend>
          {header.links.map((link, index) => (
            <label key={index} className="flex items-center gap-2">
              <span className="text-fg-secondary w-20 shrink-0 text-footnote">{link.label}</span>
              <input
                type="url"
                value={link.url}
                onChange={(event) =>
                  ops.change((current) =>
                    updateHeader(current, {
                      links: current.header.links.map((candidate, position) =>
                        position === index ? { ...candidate, url: event.target.value } : candidate,
                      ),
                    }),
                  )
                }
                className={inputClass}
              />
            </label>
          ))}
        </fieldset>
      )}
      {draft.showDateOfBirth && (
        <Field label={intl.formatMessage(messages.dateOfBirth)}>
          <input
            type="date"
            value={header.dateOfBirth}
            onChange={(event) => ops.change((current) => updateHeader(current, { dateOfBirth: event.target.value }))}
            className={inputClass}
          />
        </Field>
      )}
      {draft.showPhoto && (
        <Field label={intl.formatMessage(messages.photo)}>
          <input
            type="file"
            accept="image/jpeg,image/png"
            aria-describedby="cv-photo-hint"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) ops.change((current) => updateHeader(current, { photoUrl: URL.createObjectURL(file) }));
            }}
            className="text-callout file:border-line-control file:bg-surface-base file:mr-2 file:rounded-md file:border file:px-2 file:py-1"
          />
          <span id="cv-photo-hint" className="text-fg-tertiary text-caption1">
            {intl.formatMessage(messages.photoHint)}
          </span>
        </Field>
      )}
    </div>
  );
}

function Bullets({
  section,
  item,
  label,
  language,
  pending,
  fills,
  ops,
}: {
  section: CvDraftSection;
  item: CvDraftItem;
  label: string;
  language: string;
  pending: readonly CvSuggestionVM[];
  fills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  ops: EditorOps;
}) {
  const intl = useIntl();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={cx(labelClass, "mb-1")}>{label}</legend>
      <ul className="flex flex-col gap-1.5">
        {item.bullets.map((bullet, index) => {
          const suggestion = pending.find((candidate) => candidate.target.bulletIndex === index);
          return (
            <li key={index} className="flex items-start gap-1.5">
              <span aria-hidden className="text-fg-tertiary mt-2 text-callout">
                •
              </span>
              <div className="min-w-0 flex-1">
                {suggestion ? (
                  <TrackedChange
                    suggestion={suggestion}
                    fills={fills[suggestion.id] ?? {}}
                    onFill={(placeholder, value) => ops.fillSuggestion(suggestion.id, placeholder, value)}
                    onUse={() => ops.useSuggestion(suggestion.id, "done")}
                    onKeep={() => ops.keepSuggestion(suggestion.id)}
                    onEdit={() => ops.useSuggestion(suggestion.id, "edit")}
                  />
                ) : (
                  <AutoTextarea
                    value={bullet}
                    lang={language}
                    spellCheck
                    data-bullet={`${item.id}:${index}`}
                    aria-label={intl.formatMessage(messages.bullet, { list: label, number: index + 1 })}
                    onChange={(event) =>
                      ops.change((current) => updateBullet(current, section.key, item.id, index, event.target.value))
                    }
                  />
                )}
              </div>
              {!suggestion && (
                <IconButton
                  size="sm"
                  icon={X}
                  className="mt-1"
                  label={intl.formatMessage(messages.removeBullet, { number: index + 1 })}
                  onClick={() => ops.change((current) => removeBullet(current, section.key, item.id, index))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        variant="plain"
        icon={Plus}
        shortcut="Mod+Enter"
        className="self-start"
        onClick={() => ops.change((current) => insertBullet(current, section.key, item.id, item.bullets.length - 1))}
      >
        {intl.formatMessage(messages.addBullet)}
      </Button>
    </fieldset>
  );
}

function ItemBlock({
  editor,
  draft,
  section,
  item,
  fields,
  expanded,
  pending,
  fills,
  ops,
}: {
  editor: CvEditorVM;
  draft: CvDraft;
  section: CvDraftSection;
  item: CvDraftItem;
  fields: CvItemFieldsVM;
  expanded: boolean;
  pending: readonly CvSuggestionVM[];
  fills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  ops: EditorOps;
}) {
  const intl = useIntl();
  const title = item.title.trim() || fields.untitled;
  const dates = cvDateRange(item.start, item.end, intl.locale);
  const subtitle = [item.org, dates].filter(Boolean).join(" · ");
  const ongoing = item.start !== null && item.end === null;
  const set = (field: CvItemField, value: string) =>
    ops.change((current) => updateItemField(current, section.key, item.id, field, value));
  return (
    <li
      data-item-id={item.id}
      data-section-key={section.key}
      onFocus={() => ops.focusBlock(item.id)}
      className={cx(
        "border-line-subtle rounded-md border",
        pending.length > 0 && "border-l-accent-solid border-l-[3px]",
      )}
    >
      <div className="flex items-start gap-1 p-1.5">
        <button
          type="button"
          aria-expanded={expanded}
          // The name is the visible text; sr-only commas keep the spoken parts apart.
          onClick={() => ops.toggleItem(item.id)}
          className="hover:bg-surface-hover flex min-w-0 flex-1 items-start gap-1.5 rounded-sm px-1.5 py-1 text-left"
        >
          {expanded ? (
            <ChevronDown aria-hidden className="text-fg-tertiary mt-0.5 size-4 shrink-0" />
          ) : (
            <ChevronRight aria-hidden className="text-fg-tertiary mt-0.5 size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-callout font-semibold">{title}</span>
            {subtitle && (
              <span className="text-fg-secondary block text-footnote">
                <span className="sr-only">, </span>
                {subtitle}
              </span>
            )}
            {!expanded && item.bullets[0] && (
              <span className="text-fg-tertiary mt-0.5 line-clamp-1 text-footnote">
                <span className="sr-only">, </span>
                {item.bullets[0]}
              </span>
            )}
          </span>
          {pending.length > 0 && !expanded && (
            <span className="bg-accent-subtle text-accent-text shrink-0 rounded-sm px-1.5 text-caption1">
              <span className="sr-only">, </span>
              {intl.formatMessage(messages.suggestionHere, { count: pending.length })}
            </span>
          )}
        </button>
        <IconButton
          size="sm"
          icon={ArrowUp}
          label={intl.formatMessage(messages.moveUp, { name: title })}
          shortcut="Alt+ArrowUp"
          onClick={() => ops.moveItem(section.key, item.id, -1)}
        />
        <IconButton
          size="sm"
          icon={ArrowDown}
          label={intl.formatMessage(messages.moveDown, { name: title })}
          shortcut="Alt+ArrowDown"
          onClick={() => ops.moveItem(section.key, item.id, 1)}
        />
      </div>
      {expanded && (
        <div className="@container flex flex-col gap-3 border-t border-line-subtle px-3 pt-3 pb-3">
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <Field label={fields.title}>
              <input
                value={item.title}
                lang={draft.language}
                onChange={(event) => set("title", event.target.value)}
                className={inputClass}
              />
            </Field>
            {fields.org && (
              <Field label={fields.org}>
                <input value={item.org} onChange={(event) => set("org", event.target.value)} className={inputClass} />
              </Field>
            )}
            {fields.dates && (
              <>
                <MonthYear
                  label={intl.formatMessage(messages.start)}
                  value={item.start}
                  months={editor.months}
                  onChange={(value) => set("start", value)}
                />
                <MonthYear
                  label={intl.formatMessage(messages.end)}
                  value={item.end}
                  months={editor.months}
                  disabled={ongoing}
                  onChange={(value) => set("end", value)}
                />
              </>
            )}
            {fields.current && (
              <label className="flex items-center gap-2 text-callout @md:col-span-2">
                <input
                  type="checkbox"
                  checked={ongoing}
                  onChange={(event) => set("end", event.target.checked ? "" : (item.start ?? ""))}
                  className="accent-(--color-accent-solid) size-4"
                />
                {fields.current}
              </label>
            )}
            {fields.location && (
              <Field label={fields.location}>
                <input
                  value={item.location}
                  onChange={(event) => set("location", event.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
            {fields.detail && (
              <Field label={fields.detail} className="@md:col-span-2">
                <AutoTextarea
                  value={item.detail}
                  lang={draft.language}
                  spellCheck
                  onChange={(event) => set("detail", event.target.value)}
                />
              </Field>
            )}
            {fields.keywords && (
              <Field label={fields.keywords} className="@md:col-span-2">
                <AutoTextarea
                  value={item.keywords.join(", ")}
                  lang={draft.language}
                  onChange={(event) =>
                    ops.change((current) => ({
                      ...current,
                      sections: current.sections.map((candidate) =>
                        candidate.key === section.key
                          ? {
                              ...candidate,
                              items: candidate.items.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, keywords: event.target.value.split(/,\s*/u) }
                                  : entry,
                              ),
                            }
                          : candidate,
                      ),
                    }))
                  }
                />
              </Field>
            )}
          </div>
          {fields.bullets && (
            <Bullets
              section={section}
              item={item}
              label={fields.bullets}
              language={draft.language}
              pending={pending}
              fills={fills}
              ops={ops}
            />
          )}
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="plain"
              icon={Trash2}
              onClick={() => ops.removeItem(section.key, item.id)}
            >
              {intl.formatMessage(messages.removeItem)}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => ops.toggleItem(item.id)}>
              {intl.formatMessage(messages.collapse)}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SectionCard({
  editor,
  draft,
  section,
  vm,
  collapsed,
  expandedItems,
  pending,
  fills,
  ops,
}: {
  editor: CvEditorVM;
  draft: CvDraft;
  section: CvDraftSection;
  vm: CvSectionVM;
  collapsed: boolean;
  expandedItems: ReadonlySet<string>;
  pending: readonly CvSuggestionVM[];
  fills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  ops: EditorOps;
}) {
  const intl = useIntl();
  const headingId = `${vm.anchorId}-heading`;
  const summarySuggestion = pending.find((candidate) => candidate.target.itemId === null);
  const fields = editor.itemFields[section.key];
  const sectionPending = pending.filter((candidate) => candidate.target.sectionKey === section.key);
  // Live count (the view-model's label is from load time; items can be added or removed since).
  const count = section.kind === "list" && section.items.length > 0 ? section.items.length : null;
  return (
    <section
      id={vm.anchorId}
      aria-labelledby={headingId}
      data-section-key={section.key}
      className="bg-surface-base border-line-subtle scroll-mt-3 rounded-lg border"
    >
      <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-1.5">
        <h2 id={headingId} className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => ops.toggleSection(section.key)}
            className="hover:bg-surface-hover flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left"
          >
            {collapsed ? (
              <ChevronRight aria-hidden className="text-fg-tertiary size-4 shrink-0" />
            ) : (
              <ChevronDown aria-hidden className="text-fg-tertiary size-4 shrink-0" />
            )}
            <span className="text-headline">{vm.title}</span>
            {count !== null && <span className="text-fg-tertiary text-footnote font-normal tabular-nums">· {count}</span>}
            {vm.hiddenNote && (
              <span className="border-line-subtle text-fg-secondary rounded-sm border px-1.5 text-caption1 font-normal">
                {vm.hiddenNote}
              </span>
            )}
            {collapsed && vm.summary && (
              <span className="text-fg-tertiary min-w-0 truncate text-footnote font-normal">{vm.summary}</span>
            )}
          </button>
        </h2>
        {vm.movable && (
          <>
            <IconButton
              size="sm"
              icon={ArrowUp}
              label={intl.formatMessage(messages.moveUp, { name: vm.title })}
              shortcut="Alt+ArrowUp"
              onClick={() => ops.moveSection(section.key, -1)}
            />
            <IconButton
              size="sm"
              icon={ArrowDown}
              label={intl.formatMessage(messages.moveDown, { name: vm.title })}
              shortcut="Alt+ArrowDown"
              onClick={() => ops.moveSection(section.key, 1)}
            />
          </>
        )}
      </div>
      {!collapsed && (
        <div className="@container px-3 pb-3">
          {section.kind === "header" && <HeaderForm draft={draft} ops={ops} />}
          {section.kind === "text" &&
            (summarySuggestion ? (
              <TrackedChange
                suggestion={summarySuggestion}
                fills={fills[summarySuggestion.id] ?? {}}
                onFill={(placeholder, value) => ops.fillSuggestion(summarySuggestion.id, placeholder, value)}
                onUse={() => ops.useSuggestion(summarySuggestion.id, "done")}
                onKeep={() => ops.keepSuggestion(summarySuggestion.id)}
                onEdit={() => ops.useSuggestion(summarySuggestion.id, "edit")}
              />
            ) : (
              <div onFocus={() => ops.focusBlock("summary")}>
                <AutoTextarea
                  value={draft.summary}
                  lang={draft.language}
                  spellCheck
                  aria-labelledby={headingId}
                  aria-describedby={`${vm.anchorId}-hint`}
                  placeholder={intl.formatMessage(messages.summaryHint)}
                  onChange={(event) => ops.change((current) => updateSummary(current, event.target.value))}
                />
                <p id={`${vm.anchorId}-hint`} className="text-fg-tertiary mt-1 text-caption1">
                  {intl.formatMessage(messages.summaryHint)}
                </p>
              </div>
            ))}
          {section.kind === "list" && fields && vm.kind === "list" && (
            <div className="flex flex-col gap-2">
              {section.items.length === 0 && vm.ghost ? (
                <div>
                  <GhostRow label={vm.ghost.label} onClick={() => ops.addItem(section.key)} />
                  <p className="text-fg-tertiary mt-1 text-caption1">{vm.ghost.hint}</p>
                </div>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {section.items.map((item) => (
                      <ItemBlock
                        key={item.id}
                        editor={editor}
                        draft={draft}
                        section={section}
                        item={item}
                        fields={fields}
                        expanded={expandedItems.has(item.id)}
                        pending={sectionPending.filter((candidate) => candidate.target.itemId === item.id)}
                        fills={fills}
                        ops={ops}
                      />
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="plain"
                    icon={Plus}
                    className="self-start"
                    onClick={() => ops.addItem(section.key)}
                  >
                    {vm.addLabel}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function EditorPane({
  editor,
  draft,
  header,
  collapsedSections,
  expandedItems,
  pending,
  fills,
  ops,
}: {
  editor: CvEditorVM;
  draft: CvDraft;
  /** Title, save status, toolbar and banners. */
  header: ReactNode;
  collapsedSections: ReadonlySet<string>;
  expandedItems: ReadonlySet<string>;
  pending: readonly CvSuggestionVM[];
  fills: Readonly<Record<string, Readonly<Record<string, string>>>>;
  ops: EditorOps;
}) {
  const intl = useIntl();
  const vmByKey = new Map(editor.sections.map((section) => [section.key, section]));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      <nav
        aria-label={intl.formatMessage(messages.jumpNav)}
        className={cx("border-line-subtle flex shrink-0 gap-1 border-b px-4 py-1.5", HORIZONTAL_STRIP)}
      >
        {draft.sections.map((section) => {
          const vm = vmByKey.get(section.key);
          if (!vm) return null;
          return (
            // Buttons, not links: WebKit (WKWebView) leaves links out of the Tab order by default.
            <button
              type="button"
              key={section.key}
              onClick={() => {
                const target = document.getElementById(vm.anchorId);
                target?.scrollIntoView({ block: "start" });
                target?.querySelector<HTMLElement>("h2 button")?.focus({ preventScroll: true });
              }}
              className="text-fg-secondary hover:bg-surface-hover hover:text-fg-primary rounded-md px-2 py-1 text-footnote whitespace-nowrap"
            >
              {vm.title}
            </button>
          );
        })}
      </nav>
      <div className="bg-surface-canvas min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-180 flex-col gap-3 px-4 py-4">
          {draft.sections.map((section) => {
            const vm = vmByKey.get(section.key);
            if (!vm) return null;
            return (
              <SectionCard
                key={section.key}
                editor={editor}
                draft={draft}
                section={section}
                vm={vm}
                collapsed={collapsedSections.has(section.key)}
                expandedItems={expandedItems}
                pending={pending.filter((candidate) => candidate.target.sectionKey === section.key)}
                fills={fills}
                ops={ops}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
