/**
 * Interview rounds (BRIEF §4.6): every round by start time with its kind, title, time in the
 * user's zone and, when it differs, the organiser's, duration, place or meeting link, people and a
 * preview of the prep notes. Add / edit in a dialog (round auto-increments; the time zone defaults
 * to the user's and can be searched), delete with Undo, and export one round or all of them as an
 * `.ics` file through the native Save dialog.
 */
import { Command } from "cmdk";
import {
  CalendarPlus,
  ChevronsUpDown,
  Clock,
  Download,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useMemo, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { controlClass, Field, FormDialog, Section, Select, TextArea, TextInput } from "./fields";
import {
  durationLabel,
  INTERVIEW_KIND_MESSAGES,
  INTERVIEW_KINDS,
  type InterviewDraft,
  interviewInput,
  interviewProblem,
  type InterviewVM,
  type IcsFileVM,
  zoneCity,
} from "./model";
import type { DetailActions } from "./useDetailActions";

const messages = defineMessages({
  title: { id: "application-detail.interviews.title", defaultMessage: "Interview rounds" },
  add: { id: "application-detail.interviews.add", defaultMessage: "Add round" },
  exportAll: { id: "application-detail.interviews.exportAll", defaultMessage: "Export all rounds" },
  exportAllHint: {
    id: "application-detail.interviews.exportAllHint",
    defaultMessage: "Saves every round as one calendar file (.ics)",
  },
  empty: {
    id: "application-detail.interviews.empty",
    defaultMessage:
      "No interviews yet. Add a round when they invite you, to keep times and prep notes together.",
  },
  past: {
    id: "application-detail.interviews.past",
    defaultMessage: "Done",
    description: "Tag on an interview that is over",
  },
  join: { id: "application-detail.interviews.join", defaultMessage: "Open meeting link" },
  prepNotes: { id: "application-detail.interviews.prepNotes", defaultMessage: "Prep notes" },
  edit: { id: "application-detail.interviews.edit", defaultMessage: "Edit {title}" },
  addToCalendar: {
    id: "application-detail.interviews.addToCalendar",
    defaultMessage: "Add to calendar (.ics)",
  },
  delete: { id: "application-detail.interviews.delete", defaultMessage: "Delete {title}" },
  people: { id: "application-detail.interviews.people", defaultMessage: "With" },
  addTitle: { id: "application-detail.interviews.addTitle", defaultMessage: "Add interview round" },
  editTitle: { id: "application-detail.interviews.editTitle", defaultMessage: "Edit interview round" },
  round: { id: "application-detail.interviews.round", defaultMessage: "Round" },
  kind: { id: "application-detail.interviews.kind", defaultMessage: "Kind" },
  name: { id: "application-detail.interviews.name", defaultMessage: "Title" },
  namePlaceholder: {
    id: "application-detail.interviews.namePlaceholder",
    defaultMessage: "{kind}",
    description: "Placeholder of the title field: the kind's name, used when the title stays empty",
  },
  date: { id: "application-detail.interviews.date", defaultMessage: "Date" },
  time: { id: "application-detail.interviews.time", defaultMessage: "Start time" },
  duration: { id: "application-detail.interviews.duration", defaultMessage: "Duration" },
  timeZone: { id: "application-detail.interviews.timeZone", defaultMessage: "Time zone" },
  timeZoneHint: {
    id: "application-detail.interviews.timeZoneHint",
    defaultMessage: "The date and time are in this zone. Use the one from the invitation.",
  },
  timeZoneSearch: { id: "application-detail.interviews.timeZoneSearch", defaultMessage: "Search time zones" },
  timeZoneEmpty: {
    id: "application-detail.interviews.timeZoneEmpty",
    defaultMessage: "No matching time zone.",
  },
  location: { id: "application-detail.interviews.location", defaultMessage: "Location" },
  locationPlaceholder: {
    id: "application-detail.interviews.locationPlaceholder",
    defaultMessage: "Office address, or Phone",
  },
  meetingUrl: { id: "application-detail.interviews.meetingUrl", defaultMessage: "Meeting link" },
  personName: { id: "application-detail.interviews.personName", defaultMessage: "Name" },
  personTitle: { id: "application-detail.interviews.personTitle", defaultMessage: "Their role" },
  personEmail: { id: "application-detail.interviews.personEmail", defaultMessage: "Email" },
  addPerson: { id: "application-detail.interviews.addPerson", defaultMessage: "Add person" },
  removePerson: {
    id: "application-detail.interviews.removePerson",
    defaultMessage: "Remove person {position}",
  },
  personGroup: { id: "application-detail.interviews.personGroup", defaultMessage: "Person {position}" },
  save: { id: "application-detail.interviews.save", defaultMessage: "Save round" },
  problemDate: { id: "application-detail.interviews.problem.date", defaultMessage: "Choose the date." },
  problemTime: { id: "application-detail.interviews.problem.time", defaultMessage: "Choose the start time." },
  problemDuration: {
    id: "application-detail.interviews.problem.duration",
    defaultMessage: "Choose a duration between 5 minutes and 10 hours.",
  },
  problemMeetingUrl: {
    id: "application-detail.interviews.problem.meetingUrl",
    defaultMessage: "Paste the full link, starting with https://",
  },
  problemPersonName: {
    id: "application-detail.interviews.problem.personName",
    defaultMessage: "Add a name for each person, or remove the empty row.",
  },
  problemPersonEmail: {
    id: "application-detail.interviews.problem.personEmail",
    defaultMessage: "One of the email addresses doesn't look right (name@example.com).",
  },
});

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/** The open round editor: a round's id or "new"; `focusPrep` starts in the prep notes ("Prepare for …"). */
export type InterviewEditing = { readonly id: string; readonly focusPrep: boolean } | null;

export function InterviewsSection({
  applicationId,
  interviews,
  newInterview,
  exportAll,
  editing,
  onEditingChange,
  actions,
}: {
  applicationId: string;
  interviews: readonly InterviewVM[];
  newInterview: InterviewDraft;
  exportAll: IcsFileVM | null;
  /** The open editor (the header's next action opens it too), or null. */
  editing: InterviewEditing;
  onEditingChange: (editing: InterviewEditing) => void;
  actions: DetailActions;
}) {
  const intl = useIntl();
  const isNew = editing?.id === "new";
  const editingRound = editing === null || isNew ? null : interviews.find((item) => item.id === editing.id);
  return (
    <Section
      title={intl.formatMessage(messages.title)}
      actions={
        <>
          {exportAll && (
            <Button
              size="sm"
              variant="plain"
              icon={Download}
              hint={intl.formatMessage(messages.exportAllHint)}
              onClick={() => actions.exportIcs(exportAll)}
            >
              {intl.formatMessage(messages.exportAll)}
            </Button>
          )}
          <Button size="sm" variant="plain" icon={Plus} onClick={() => onEditingChange({ id: "new", focusPrep: false })}>
            {intl.formatMessage(messages.add)}
          </Button>
        </>
      }
    >
      {interviews.length === 0 ? (
        <EmptyState kind="subArea" body={intl.formatMessage(messages.empty)} className="px-0 py-0" />
      ) : (
        <ol className="flex flex-col gap-2">
          {interviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              actions={actions}
              onEdit={() => onEditingChange({ id: interview.id, focusPrep: false })}
            />
          ))}
        </ol>
      )}
      {(isNew || editingRound) && (
        <InterviewDialog
          key={editing?.id}
          initial={editingRound?.draft ?? newInterview}
          isNew={isNew}
          focusPrep={editing?.focusPrep ?? false}
          onClose={() => onEditingChange(null)}
          onSave={(draft, kindLabel) => {
            const input = interviewInput(draft, applicationId, kindLabel);
            if (!input) return;
            actions.saveInterviewDraft(input, editingRound?.id ?? null);
            onEditingChange(null);
          }}
        />
      )}
    </Section>
  );
}

function InterviewCard({
  interview,
  actions,
  onEdit,
}: {
  interview: InterviewVM;
  actions: DetailActions;
  onEdit: () => void;
}) {
  const intl = useIntl();
  const titleId = useId();
  return (
    <li
      aria-labelledby={titleId}
      className={cx(
        "border-line-subtle flex flex-col gap-2 rounded-lg border px-3 py-2.5",
        interview.past && "bg-surface-sunken/50",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-footnote text-fg-secondary flex flex-wrap items-center gap-x-2">
            <span>
              {interview.roundLabel} · {interview.kindLabel}
            </span>
            {interview.past && (
              <span className="border-line-control text-fg-secondary text-caption1 rounded-xs border px-1.5 font-medium">
                {intl.formatMessage(messages.past)}
              </span>
            )}
            {interview.pendingSync && <SyncGlyph />}
          </p>
          <h3 id={titleId} className="text-callout text-fg-primary font-semibold text-pretty">
            {interview.title}
          </h3>
        </div>
        <span className="flex shrink-0 gap-0.5">
          <IconButton
            icon={CalendarPlus}
            size="sm"
            label={intl.formatMessage(messages.addToCalendar)}
            aria-describedby={titleId}
            onClick={() => actions.exportIcs(interview.ics)}
          />
          <IconButton
            icon={Pencil}
            size="sm"
            label={intl.formatMessage(messages.edit, { title: interview.title })}
            onClick={onEdit}
          />
          <IconButton
            icon={Trash2}
            size="sm"
            label={intl.formatMessage(messages.delete, { title: interview.title })}
            onClick={() => actions.deleteInterviewById(interview.id)}
          />
        </span>
      </div>
      <ul className="text-callout text-fg-primary flex flex-col gap-1">
        <li className="flex items-start gap-2">
          <Clock aria-hidden="true" className="text-fg-secondary mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span className="flex flex-col">
            <span>
              <time dateTime={interview.when.iso} title={interview.when.absolute} className="tabular-nums">
                {interview.when.label}
              </time>
              <span className="text-fg-secondary"> · {interview.duration}</span>
            </span>
            {interview.organiserTime !== null && (
              <span className="text-fg-secondary text-footnote tabular-nums">{interview.organiserTime}</span>
            )}
          </span>
        </li>
        {interview.location !== null && (
          <li className="flex items-start gap-2">
            <MapPin
              aria-hidden="true"
              className="text-fg-secondary mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            <span className="text-pretty">{interview.location}</span>
          </li>
        )}
        {interview.meetingUrl !== null && (
          <li className="flex items-start gap-2">
            <Video
              aria-hidden="true"
              className="text-fg-secondary mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            <button
              type="button"
              title={interview.meetingUrl}
              className="text-accent-text min-h-6 rounded-xs text-start hover:underline"
              onClick={() => actions.openLink(interview.meetingUrl ?? "")}
            >
              {intl.formatMessage(messages.join)}
            </button>
          </li>
        )}
        {interview.people.length > 0 && (
          <li className="flex items-start gap-2">
            <Users
              aria-hidden="true"
              className="text-fg-secondary mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            <span className="sr-only">{intl.formatMessage(messages.people)}</span>
            <span className="text-pretty">
              {interview.people.map((person, index) => (
                <span key={`${person.name}-${index}`}>
                  {index > 0 && ", "}
                  {person.name}
                  {person.title !== null && <span className="text-fg-secondary"> ({person.title})</span>}
                </span>
              ))}
            </span>
          </li>
        )}
      </ul>
      {interview.prepNotes.trim() !== "" && (
        <div className="bg-surface-sunken rounded-md px-3 py-2">
          <p className="text-footnote text-fg-secondary font-medium">
            {intl.formatMessage(messages.prepNotes)}
          </p>
          <p className="text-callout text-fg-primary line-clamp-3 text-pretty whitespace-pre-line">
            {interview.prepNotes}
          </p>
        </div>
      )}
    </li>
  );
}

const PROBLEM_MESSAGES = {
  date: messages.problemDate,
  time: messages.problemTime,
  duration: messages.problemDuration,
  meetingUrl: messages.problemMeetingUrl,
  personName: messages.problemPersonName,
  personEmail: messages.problemPersonEmail,
} as const;

function InterviewDialog({
  initial,
  isNew,
  focusPrep,
  onClose,
  onSave,
}: {
  initial: InterviewDraft;
  isNew: boolean;
  /** Opened from "Prepare for …": the prep notes get the focus. */
  focusPrep: boolean;
  onClose: () => void;
  onSave: (draft: InterviewDraft, kindLabel: string) => void;
}) {
  const intl = useIntl();
  const [draft, setDraft] = useState(initial);
  const update = (patch: Partial<InterviewDraft>) => setDraft((previous) => ({ ...previous, ...patch }));
  const problem = interviewProblem(draft);
  const kindLabel = intl.formatMessage(INTERVIEW_KIND_MESSAGES[draft.kind]);
  const durations = DURATIONS.includes(draft.durationMinutes)
    ? DURATIONS
    : [...DURATIONS, draft.durationMinutes].toSorted((a, b) => a - b);
  const setPerson = (index: number, patch: Partial<InterviewDraft["people"][number]>) =>
    update({ people: draft.people.map((person, at) => (at === index ? { ...person, ...patch } : person)) });

  return (
    <FormDialog
      open
      wide
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={intl.formatMessage(isNew ? messages.addTitle : messages.editTitle)}
      submitLabel={intl.formatMessage(messages.save)}
      submitDisabledReason={problem === null ? null : intl.formatMessage(PROBLEM_MESSAGES[problem])}
      onSubmit={() => onSave(draft, kindLabel)}
    >
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
        <Field label={intl.formatMessage(messages.round)}>
          <Select value={draft.round} onChange={(event) => update({ round: Number(event.target.value) })}>
            {Array.from({ length: 20 }, (_, index) => index + 1).map((round) => (
              <option key={round} value={round}>
                {round}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={intl.formatMessage(messages.kind)}>
          <Select
            value={draft.kind}
            onChange={(event) =>
              update({ kind: INTERVIEW_KINDS.find((kind) => kind === event.target.value) ?? draft.kind })
            }
          >
            {INTERVIEW_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {intl.formatMessage(INTERVIEW_KIND_MESSAGES[kind])}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={intl.formatMessage(messages.name)} optional>
        <TextInput
          value={draft.title}
          maxLength={200}
          placeholder={intl.formatMessage(messages.namePlaceholder, { kind: kindLabel })}
          onChange={(event) => update({ title: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={intl.formatMessage(messages.date)}
          problem={problem === "date" ? intl.formatMessage(messages.problemDate) : null}
        >
          <TextInput
            type="date"
            value={draft.date}
            required
            onChange={(event) => update({ date: event.target.value })}
          />
        </Field>
        <Field
          label={intl.formatMessage(messages.time)}
          problem={problem === "time" ? intl.formatMessage(messages.problemTime) : null}
        >
          <TextInput
            type="time"
            value={draft.time}
            required
            onChange={(event) => update({ time: event.target.value })}
          />
        </Field>
        <Field label={intl.formatMessage(messages.duration)}>
          <Select
            value={draft.durationMinutes}
            onChange={(event) => update({ durationMinutes: Number(event.target.value) })}
          >
            {durations.map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes, intl)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <TimeZoneField value={draft.timeZone} onChange={(timeZone) => update({ timeZone })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={intl.formatMessage(messages.location)} optional>
          <TextInput
            value={draft.location}
            maxLength={300}
            placeholder={intl.formatMessage(messages.locationPlaceholder)}
            onChange={(event) => update({ location: event.target.value })}
          />
        </Field>
        <Field
          label={intl.formatMessage(messages.meetingUrl)}
          optional
          problem={problem === "meetingUrl" ? intl.formatMessage(messages.problemMeetingUrl) : null}
        >
          <TextInput
            type="url"
            value={draft.meetingUrl}
            placeholder="https://"
            onChange={(event) => update({ meetingUrl: event.target.value })}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-footnote text-fg-secondary mb-1">
          {intl.formatMessage(messages.people)}
        </legend>
        {draft.people.map((person, index) => (
          <div
            key={index}
            role="group"
            aria-label={intl.formatMessage(messages.personGroup, { position: index + 1 })}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2"
          >
            <TextInput
              aria-label={intl.formatMessage(messages.personName)}
              placeholder={intl.formatMessage(messages.personName)}
              value={person.name}
              onChange={(event) => setPerson(index, { name: event.target.value })}
            />
            <TextInput
              aria-label={intl.formatMessage(messages.personTitle)}
              placeholder={intl.formatMessage(messages.personTitle)}
              value={person.title}
              onChange={(event) => setPerson(index, { title: event.target.value })}
            />
            <TextInput
              type="email"
              aria-label={intl.formatMessage(messages.personEmail)}
              placeholder={intl.formatMessage(messages.personEmail)}
              value={person.email}
              onChange={(event) => setPerson(index, { email: event.target.value })}
            />
            <IconButton
              icon={X}
              size="sm"
              label={intl.formatMessage(messages.removePerson, { position: index + 1 })}
              onClick={() => update({ people: draft.people.filter((_, at) => at !== index) })}
            />
          </div>
        ))}
        {(problem === "personName" || problem === "personEmail") && (
          <p className="text-footnote text-danger-text">{intl.formatMessage(PROBLEM_MESSAGES[problem])}</p>
        )}
        {draft.people.length < 20 && (
          <Button
            size="sm"
            variant="plain"
            icon={Plus}
            className="self-start"
            onClick={() =>
              update({ people: [...draft.people, { name: "", title: "", email: "", contactId: null }] })
            }
          >
            {intl.formatMessage(messages.addPerson)}
          </Button>
        )}
      </fieldset>
      <Field label={intl.formatMessage(messages.prepNotes)} optional>
        <TextArea
          rows={focusPrep ? 8 : 4}
          autoFocus={focusPrep}
          value={draft.prepNotes}
          onChange={(event) => update({ prepNotes: event.target.value })}
        />
      </Field>
    </FormDialog>
  );
}

/** Every IANA zone the engine knows, read once. */
let zones: readonly string[] | null = null;
function allTimeZones(): readonly string[] {
  zones ??= Intl.supportedValuesOf("timeZone");
  return zones;
}

/** A combobox over the IANA zones: "Istanbul · Europe/Istanbul", searchable by city or region. */
function TimeZoneField({ value, onChange }: { value: string; onChange: (timeZone: string) => void }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const hintId = useId();
  const options = useMemo(() => {
    const list = allTimeZones();
    return list.includes(value) ? list : [value, ...list];
  }, [value]);
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-footnote text-fg-secondary">
        {intl.formatMessage(messages.timeZone)}
      </span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={labelId}
            aria-describedby={hintId}
            className={cx(controlClass, "flex h-8 items-center gap-2 text-start")}
          >
            <span className="min-w-0 flex-1 truncate">
              {zoneCity(value)} <span className="text-fg-secondary">· {value}</span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="text-fg-secondary size-4 shrink-0"
              strokeWidth={1.75}
            />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className="bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) flex w-(--radix-popover-trigger-width) min-w-72 flex-col overflow-hidden rounded-lg border"
          >
            <Command label={intl.formatMessage(messages.timeZoneSearch)} loop defaultValue={value}>
              <div className="border-line-subtle flex items-center gap-2 border-b px-3">
                <Search aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
                <Command.Input
                  autoFocus
                  aria-label={intl.formatMessage(messages.timeZoneSearch)}
                  placeholder={intl.formatMessage(messages.timeZoneSearch)}
                  className="placeholder:text-fg-tertiary text-callout h-10 flex-1 bg-transparent outline-none"
                />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1.5">
                <Command.Empty className="text-fg-secondary text-callout px-2 py-4 text-center">
                  {intl.formatMessage(messages.timeZoneEmpty)}
                </Command.Empty>
                {options.map((zone) => (
                  <Command.Item
                    key={zone}
                    value={zone}
                    keywords={[zoneCity(zone)]}
                    onSelect={() => {
                      onChange(zone);
                      setOpen(false);
                    }}
                    className="text-callout data-[selected=true]:bg-surface-hover flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {zoneCity(zone)} <span className="text-fg-secondary">· {zone}</span>
                    </span>
                    {zone === value && <span className="bg-accent-solid size-1.5 shrink-0 rounded-full" />}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <p id={hintId} className="text-footnote text-fg-tertiary">
        {intl.formatMessage(messages.timeZoneHint)}
      </p>
    </div>
  );
}
