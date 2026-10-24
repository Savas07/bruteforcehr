/**
 * The job preferences editor (onboarding-signin.md "Step 2/3 Preferences (desktop)"), shared by
 * onboarding step 2 and Settings › Job preferences: a two-column form (label column 200 px with a
 * one-line helper, controls beside it; they stack when the pane is narrow). Controlled: every edit
 * reports the next draft, the section it touched and whether it is a finished change (`commit`:
 * a token added, a chip toggled, a field left) or typing in progress. Nothing here is required
 * except the name; empty sections mean "no filter" for matching.
 */
import type { LanguageLevel, RemoteType, SalaryPeriod, Seniority } from "@bfhr/core";
import { FileText, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId, useMemo, useState } from "react";
import { defineMessages, type IntlShape, type MessageDescriptor, useIntl } from "react-intl";
import { cx } from "../../../shared/cx";
import { Button, IconButton } from "../../../shared/ui/Button";
import { Chip } from "../../../shared/ui/Chip";
import { SegmentedControl } from "../../../shared/ui/SegmentedControl";
import {
  addLanguage,
  addLocation,
  addRole,
  type AuthorizationAnswer,
  type AuthorizationRegion,
  authorizationAnswer,
  authorizationRegions,
  COUNTRY_CODES,
  defaultPeriod,
  FORM_PERIODS,
  formatAmount,
  type JobPreferencesDraft,
  LANGUAGE_CODES,
  LANGUAGE_LEVELS,
  MAIN_CURRENCIES,
  MAX_LOCATIONS,
  MAX_ROLES,
  newLocation,
  OTHER_CURRENCIES,
  type PreferenceSection,
  QUICK_COUNTRIES,
  QUICK_LANGUAGES,
  roleSuggestions,
  SENIORITY_ORDER,
  sameLocation,
  setAuthorizationAnswer,
  WORKPLACE_ORDER,
} from "./model";

const messages = defineMessages({
  fromCv: {
    id: "job-preferences.fromCv",
    defaultMessage: "From your CV",
    description: "Tag on a section the imported CV filled in",
  },
  nameTitle: { id: "job-preferences.name.title", defaultMessage: "Your name" },
  nameHelp: { id: "job-preferences.name.help", defaultMessage: "It goes on your CVs and emails." },
  rolesTitle: { id: "job-preferences.roles.title", defaultMessage: "Roles" },
  rolesHelp: { id: "job-preferences.roles.help", defaultMessage: "Job titles you'd apply for. Up to 5." },
  rolesPlaceholder: {
    id: "job-preferences.roles.placeholder",
    defaultMessage: "Type a role and press Enter",
    description: "Placeholder of the role input",
  },
  rolesCount: {
    id: "job-preferences.roles.count",
    defaultMessage: "{count} of {max}",
    description: "How many roles are picked: '2 of 5'",
  },
  rolesFull: {
    id: "job-preferences.roles.full",
    defaultMessage: "That's 5 roles. Remove one to add another.",
  },
  rolesSuggestions: { id: "job-preferences.roles.suggestions", defaultMessage: "Suggestions" },
  remove: {
    id: "job-preferences.remove",
    defaultMessage: "Remove {name}",
    description: "Removes a role, place or language",
  },
  added: {
    id: "job-preferences.added",
    defaultMessage: "Added {name}",
    description: "Announced after a role, place or language was added",
  },
  removed: {
    id: "job-preferences.removed",
    defaultMessage: "Removed {name}",
    description: "Announced after a role, place or language was removed",
  },
  seniorityTitle: { id: "job-preferences.seniority.title", defaultMessage: "Seniority" },
  seniorityHelp: {
    id: "job-preferences.seniority.help",
    defaultMessage: "The level you're aiming for. Pick it again to clear it.",
  },
  whereTitle: { id: "job-preferences.where.title", defaultMessage: "Where" },
  whereHelp: {
    id: "job-preferences.where.help",
    defaultMessage:
      "How and where you'd work. Remote jobs limited to certain countries count when you list one of them here.",
  },
  workplace: { id: "job-preferences.where.workplace", defaultMessage: "Workplace" },
  places: { id: "job-preferences.where.places", defaultMessage: "Places" },
  placesEmpty: {
    id: "job-preferences.where.placesEmpty",
    defaultMessage: "No places yet. Without any, we don't filter by location.",
  },
  relocate: {
    id: "job-preferences.where.relocate",
    defaultMessage: "I'd move here",
    description: "Checkbox on a place: willing to relocate there (vs. living there)",
  },
  quickAdd: { id: "job-preferences.where.quickAdd", defaultMessage: "Quick add" },
  country: { id: "job-preferences.where.country", defaultMessage: "Country" },
  countryPick: { id: "job-preferences.where.countryPick", defaultMessage: "Choose a country" },
  city: { id: "job-preferences.where.city", defaultMessage: "City (optional)" },
  addPlace: { id: "job-preferences.where.add", defaultMessage: "Add place" },
  addPlaceNeedsCountry: {
    id: "job-preferences.where.addNeedsCountry",
    defaultMessage: "Choose a country first.",
  },
  placesFull: {
    id: "job-preferences.where.full",
    defaultMessage: "That's 10 places. Remove one to add another.",
  },
  salaryTitle: { id: "job-preferences.salary.title", defaultMessage: "Salary floor" },
  salaryHelp: {
    id: "job-preferences.salary.help",
    defaultMessage: "Optional. Private: we only use it to hide roles that clearly pay less.",
  },
  amount: { id: "job-preferences.salary.amount", defaultMessage: "Amount" },
  currency: { id: "job-preferences.salary.currency", defaultMessage: "Currency" },
  period: { id: "job-preferences.salary.period", defaultMessage: "Period" },
  perMonth: { id: "job-preferences.salary.perMonth", defaultMessage: "Per month" },
  perYear: { id: "job-preferences.salary.perYear", defaultMessage: "Per year" },
  perDay: { id: "job-preferences.salary.perDay", defaultMessage: "Per day" },
  perHour: { id: "job-preferences.salary.perHour", defaultMessage: "Per hour" },
  salaryClear: { id: "job-preferences.salary.clear", defaultMessage: "Clear" },
  authorizationTitle: { id: "job-preferences.authorization.title", defaultMessage: "Work authorization" },
  authorizationHelp: {
    id: "job-preferences.authorization.help",
    defaultMessage: "This helps us show jobs you can actually take.",
  },
  authorizationEmpty: {
    id: "job-preferences.authorization.empty",
    defaultMessage: "Add a place under Where, and we'll ask whether you can work there.",
  },
  authorizationQuestion: {
    id: "job-preferences.authorization.question",
    defaultMessage: "Can you work in {place} without visa sponsorship?",
  },
  eu: {
    id: "job-preferences.authorization.eu",
    defaultMessage: "the EU / EEA",
    description: "Place name inside 'Can you work in {place} …'",
  },
  yes: { id: "job-preferences.authorization.yes", defaultMessage: "Yes" },
  no: { id: "job-preferences.authorization.no", defaultMessage: "No, I'd need sponsorship" },
  unsure: { id: "job-preferences.authorization.unsure", defaultMessage: "Not sure" },
  languagesTitle: { id: "job-preferences.languages.title", defaultMessage: "Languages" },
  languagesHelp: {
    id: "job-preferences.languages.help",
    defaultMessage: "Languages you can work in, and how well.",
  },
  languagesEmpty: { id: "job-preferences.languages.empty", defaultMessage: "No languages yet." },
  languageLevel: { id: "job-preferences.languages.level", defaultMessage: "{language} level" },
  languageAdd: { id: "job-preferences.languages.add", defaultMessage: "Add another language" },
  languageAddPick: { id: "job-preferences.languages.addPick", defaultMessage: "Add another language…" },
});

const SENIORITY_MESSAGES: Readonly<Record<Seniority, MessageDescriptor>> = defineMessages({
  intern: { id: "job-preferences.seniority.intern", defaultMessage: "Intern" },
  junior: { id: "job-preferences.seniority.junior", defaultMessage: "Junior" },
  mid: { id: "job-preferences.seniority.mid", defaultMessage: "Mid-level" },
  senior: { id: "job-preferences.seniority.senior", defaultMessage: "Senior" },
  lead: { id: "job-preferences.seniority.lead", defaultMessage: "Lead" },
  staff: { id: "job-preferences.seniority.staff", defaultMessage: "Staff" },
  principal: { id: "job-preferences.seniority.principal", defaultMessage: "Principal" },
  manager: { id: "job-preferences.seniority.manager", defaultMessage: "Manager" },
  director: { id: "job-preferences.seniority.director", defaultMessage: "Director+" },
});

const WORKPLACE_MESSAGES: Readonly<Record<RemoteType, MessageDescriptor>> = defineMessages({
  remote: { id: "job-preferences.workplace.remote", defaultMessage: "Remote" },
  hybrid: { id: "job-preferences.workplace.hybrid", defaultMessage: "Hybrid" },
  onsite: { id: "job-preferences.workplace.onsite", defaultMessage: "On-site" },
});

const LEVEL_MESSAGES: Readonly<Record<LanguageLevel, MessageDescriptor>> = defineMessages({
  native: { id: "job-preferences.level.native", defaultMessage: "Native" },
  C2: { id: "job-preferences.level.c2", defaultMessage: "C2 · Proficient" },
  C1: { id: "job-preferences.level.c1", defaultMessage: "C1 · Advanced" },
  B2: { id: "job-preferences.level.b2", defaultMessage: "B2 · Upper intermediate" },
  B1: { id: "job-preferences.level.b1", defaultMessage: "B1 · Intermediate" },
  A2: { id: "job-preferences.level.a2", defaultMessage: "A2 · Elementary" },
  A1: { id: "job-preferences.level.a1", defaultMessage: "A1 · Beginner" },
});

const PERIOD_MESSAGES: Readonly<Record<SalaryPeriod, MessageDescriptor>> = {
  month: messages.perMonth,
  year: messages.perYear,
  day: messages.perDay,
  hour: messages.perHour,
};

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary h-8 min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";

/** Place, language and currency names in the UI language, plus the sorted picker lists. */
interface Names {
  readonly country: (code: string) => string;
  readonly language: (code: string) => string;
  readonly currency: (code: string) => string;
  readonly region: (region: AuthorizationRegion) => string;
  readonly countries: readonly string[];
  readonly languageList: readonly string[];
}

function useNames(intl: IntlShape): Names {
  return useMemo((): Names => {
    const regions = new Intl.DisplayNames([intl.locale], { type: "region" });
    const languages = new Intl.DisplayNames([intl.locale], { type: "language" });
    const currencies = new Intl.DisplayNames([intl.locale], { type: "currency" });
    const collator = new Intl.Collator(intl.locale);
    const country = (code: string) => regions.of(code) ?? code;
    const language = (code: string) => languages.of(code) ?? code;
    return {
      country,
      language,
      currency: (code: string) => currencies.of(code) ?? code,
      region: (region: AuthorizationRegion) =>
        region === "EU" ? intl.formatMessage(messages.eu) : country(region),
      countries: [...COUNTRY_CODES].sort((a, b) => collator.compare(country(a), country(b))),
      languageList: [...LANGUAGE_CODES].sort((a, b) => collator.compare(language(a), language(b))),
    };
  }, [intl]);
}

export type PreferenceChange = (
  next: JobPreferencesDraft,
  section: PreferenceSection,
  commit: boolean,
) => void;

export interface JobPreferencesFormProps {
  readonly draft: JobPreferencesDraft;
  readonly onChange: PreferenceChange;
  /** Onboarding shows the name section only when no CV gave one; Settings always shows it. */
  readonly showName: boolean;
  /** The name field's error (empty name on Continue or on leaving the field). */
  readonly nameError?: string | null;
  /** Sections the imported CV filled in and the user hasn't edited ("From your CV"). */
  readonly fromCv?: ReadonlySet<PreferenceSection>;
  /** Role suggestions offered first (the CV's titles). */
  readonly ownRoles?: readonly string[];
  /** Save feedback, shown in the section that changed last (Settings). */
  readonly status?: { readonly section: PreferenceSection; readonly node: ReactNode } | null;
}

export function JobPreferencesForm({
  draft,
  onChange,
  showName,
  nameError = null,
  fromCv,
  ownRoles = [],
  status = null,
}: JobPreferencesFormProps) {
  const intl = useIntl();
  const names = useNames(intl);
  const id = useId();
  const [announcement, setAnnouncement] = useState("");
  const section = (key: PreferenceSection) => ({
    fromCv: fromCv?.has(key) ?? false,
    status: status?.section === key ? status.node : null,
  });
  const change = (next: Partial<JobPreferencesDraft>, key: PreferenceSection, commit = true) =>
    onChange({ ...draft, ...next }, key, commit);

  return (
    <div className="flex flex-col">
      {/* One polite region for "Added …" / "Removed …", so token changes are heard. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {showName && (
        <PreferenceSectionRow
          title={intl.formatMessage(messages.nameTitle)}
          helper={intl.formatMessage(messages.nameHelp)}
          labelFor={`${id}-name`}
          {...section("name")}
        >
          <input
            id={`${id}-name`}
            autoComplete="name"
            maxLength={200}
            value={draft.fullName}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${id}-name-error` : undefined}
            onChange={(event) => change({ fullName: event.target.value }, "name", false)}
            onBlur={() => change({}, "name")}
            className={cx(controlClass, "w-full max-w-90")}
          />
          {nameError && (
            <p id={`${id}-name-error`} className="text-danger-text text-footnote">
              {nameError}
            </p>
          )}
        </PreferenceSectionRow>
      )}
      <RolesSection
        roles={draft.targetRoles}
        ownRoles={ownRoles}
        onRoles={(targetRoles, name, added) => {
          change({ targetRoles }, "roles");
          setAnnouncement(intl.formatMessage(added ? messages.added : messages.removed, { name }));
        }}
        {...section("roles")}
      />
      <PreferenceSectionRow
        title={intl.formatMessage(messages.seniorityTitle)}
        helper={intl.formatMessage(messages.seniorityHelp)}
        groupLabel
        {...section("seniority")}
      >
        <div className="flex flex-wrap gap-2">
          {SENIORITY_ORDER.map((level) => (
            <Chip
              key={level}
              selected={draft.seniority === level}
              onSelectedChange={(selected) => change({ seniority: selected ? level : null }, "seniority")}
            >
              {intl.formatMessage(SENIORITY_MESSAGES[level])}
            </Chip>
          ))}
        </div>
      </PreferenceSectionRow>
      <WhereSection
        draft={draft}
        names={names}
        onChange={(next, announce) => {
          change(next, "where");
          if (announce) setAnnouncement(announce);
        }}
        {...section("where")}
      />
      <SalarySection
        draft={draft}
        names={names}
        onChange={(next, commit) => change(next, "salary", commit)}
        {...section("salary")}
      />
      <PreferenceSectionRow
        title={intl.formatMessage(messages.authorizationTitle)}
        helper={intl.formatMessage(messages.authorizationHelp)}
        groupLabel
        {...section("authorization")}
      >
        <AuthorizationQuestions
          draft={draft}
          names={names}
          onChange={(workAuthorization) => change({ workAuthorization }, "authorization")}
        />
      </PreferenceSectionRow>
      <LanguagesSection
        draft={draft}
        names={names}
        onChange={(languages, announce) => {
          change({ languages }, "languages");
          if (announce) setAnnouncement(announce);
        }}
        {...section("languages")}
      />
    </div>
  );
}

/**
 * One section: its title (`<h2>`), helper and tags in the 200 px label column, the controls
 * beside. `labelFor` ties the title to a single control; `groupLabel` makes the controls a group
 * named by the title.
 */
function PreferenceSectionRow({
  title,
  helper,
  labelFor,
  groupLabel = false,
  fromCv,
  status,
  children,
}: {
  readonly title: string;
  readonly helper: string;
  readonly labelFor?: string | undefined;
  readonly groupLabel?: boolean;
  readonly fromCv: boolean;
  readonly status: ReactNode;
  readonly children: ReactNode;
}) {
  const intl = useIntl();
  const headingId = useId();
  const helperId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="border-line-subtle flex flex-wrap gap-x-6 gap-y-3 border-b py-5 first:pt-0 last:border-b-0"
    >
      <div className="flex w-50 shrink-0 flex-col gap-1">
        <h2 id={headingId} className="text-headline text-fg-primary">
          {labelFor === undefined ? title : <label htmlFor={labelFor}>{title}</label>}
        </h2>
        <p id={helperId} className="text-footnote text-fg-secondary">
          {helper}
        </p>
        {fromCv && (
          <span className="text-footnote text-accent-text bg-accent-subtle inline-flex items-center gap-1 self-start rounded-sm px-1.5 py-0.5">
            <FileText aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            {intl.formatMessage(messages.fromCv)}
          </span>
        )}
        {status}
      </div>
      <div
        role={groupLabel ? "group" : undefined}
        aria-labelledby={groupLabel ? headingId : undefined}
        aria-describedby={groupLabel ? helperId : undefined}
        className="flex min-w-72 flex-1 flex-col gap-3"
      >
        {children}
      </div>
    </section>
  );
}

/** A removable token: the name and a ✕ button named "Remove {name}". */
function Token({
  name,
  onRemove,
  children,
}: {
  readonly name: string;
  readonly onRemove: () => void;
  readonly children?: ReactNode;
}) {
  const intl = useIntl();
  return (
    <li className="bg-surface-sunken text-callout text-fg-primary flex min-h-8 items-center gap-2 rounded-md py-0.5 ps-2.5 pe-0.5">
      <span className="min-w-0 flex-1 break-words">{name}</span>
      {children}
      <IconButton
        icon={X}
        size="sm"
        label={intl.formatMessage(messages.remove, { name })}
        onClick={onRemove}
      />
    </li>
  );
}

function RolesSection({
  roles,
  ownRoles,
  onRoles,
  fromCv,
  status,
}: {
  readonly roles: readonly string[];
  readonly ownRoles: readonly string[];
  readonly onRoles: (roles: readonly string[], name: string, added: boolean) => void;
  readonly fromCv: boolean;
  readonly status: ReactNode;
}) {
  const intl = useIntl();
  const id = useId();
  const [typed, setTyped] = useState("");
  const suggestions = roleSuggestions(typed, roles, ownRoles);
  const full = roles.length >= MAX_ROLES;
  const add = (role: string) => {
    const next = addRole(roles, role);
    if (next !== roles) onRoles(next, next.at(-1) ?? role, true);
    setTyped("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && typed.trim() !== "") {
      event.preventDefault();
      add(typed);
    } else if (event.key === "Backspace" && typed === "" && roles.length > 0) {
      const last = roles.at(-1) ?? "";
      onRoles(roles.slice(0, -1), last, false);
    }
  };
  return (
    <PreferenceSectionRow
      title={intl.formatMessage(messages.rolesTitle)}
      helper={intl.formatMessage(messages.rolesHelp)}
      labelFor={full ? undefined : `${id}-input`}
      fromCv={fromCv}
      status={status}
    >
      {roles.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {roles.map((role) => (
            <Token
              key={role}
              name={role}
              onRemove={() =>
                onRoles(
                  roles.filter((candidate) => candidate !== role),
                  role,
                  false,
                )
              }
            />
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.rolesFull)}</p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            id={`${id}-input`}
            aria-describedby={`${id}-count`}
            autoComplete="off"
            maxLength={120}
            placeholder={intl.formatMessage(messages.rolesPlaceholder)}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={onKeyDown}
            className={cx(controlClass, "flex-1")}
          />
          <span id={`${id}-count`} className="text-footnote text-fg-secondary shrink-0 tabular-nums">
            {intl.formatMessage(messages.rolesCount, { count: roles.length, max: MAX_ROLES })}
          </span>
        </div>
      )}
      {!full && suggestions.length > 0 && (
        <div
          role="group"
          aria-label={intl.formatMessage(messages.rolesSuggestions)}
          className="flex flex-wrap gap-2"
        >
          {suggestions.map((role) => (
            <Chip key={role} selected={false} onSelectedChange={() => add(role)}>
              {role}
            </Chip>
          ))}
        </div>
      )}
    </PreferenceSectionRow>
  );
}

function WhereSection({
  draft,
  names,
  onChange,
  fromCv,
  status,
}: {
  readonly draft: JobPreferencesDraft;
  readonly names: Names;
  readonly onChange: (next: Partial<JobPreferencesDraft>, announce?: string) => void;
  readonly fromCv: boolean;
  readonly status: ReactNode;
}) {
  const intl = useIntl();
  const id = useId();
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const { locations, remotePreferences } = draft;
  const full = locations.length >= MAX_LOCATIONS;
  const placeName = (location: (typeof locations)[number]) => {
    const countryName = location.countryCode === null ? null : names.country(location.countryCode);
    if (location.city === null) return countryName ?? location.label;
    return countryName === null ? location.city : `${location.city}, ${countryName}`;
  };
  const add = (countryCode: string, cityName: string) => {
    const location = newLocation(countryCode, cityName, false, names.country);
    const next = addLocation(locations, location);
    if (next !== locations)
      onChange({ locations: next }, intl.formatMessage(messages.added, { name: placeName(location) }));
  };
  const quick = QUICK_COUNTRIES.filter(
    (code) => !locations.some((location) => sameLocation(location, { countryCode: code, city: null })),
  );
  return (
    <PreferenceSectionRow
      title={intl.formatMessage(messages.whereTitle)}
      helper={intl.formatMessage(messages.whereHelp)}
      fromCv={fromCv}
      status={status}
    >
      <div role="group" aria-labelledby={`${id}-workplace`} className="flex flex-col gap-2">
        <h3 id={`${id}-workplace`} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.workplace)}
        </h3>
        <div className="flex flex-wrap gap-2">
          {WORKPLACE_ORDER.map((type) => (
            <Chip
              key={type}
              selected={remotePreferences.includes(type)}
              onSelectedChange={(selected) =>
                onChange({
                  remotePreferences: selected
                    ? WORKPLACE_ORDER.filter(
                        (candidate) => candidate === type || remotePreferences.includes(candidate),
                      )
                    : remotePreferences.filter((candidate) => candidate !== type),
                })
              }
            >
              {intl.formatMessage(WORKPLACE_MESSAGES[type])}
            </Chip>
          ))}
        </div>
      </div>
      <div role="group" aria-labelledby={`${id}-places`} className="flex flex-col gap-2">
        <h3 id={`${id}-places`} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.places)}
        </h3>
        {locations.length === 0 ? (
          <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.placesEmpty)}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {locations.map((location, index) => {
              const name = placeName(location);
              return (
                <Token
                  key={`${location.countryCode ?? ""}-${location.city ?? ""}-${index}`}
                  name={name}
                  onRemove={() =>
                    onChange(
                      { locations: locations.filter((_, other) => other !== index) },
                      intl.formatMessage(messages.removed, { name }),
                    )
                  }
                >
                  <label className="text-footnote text-fg-secondary flex shrink-0 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={location.relocation}
                      onChange={(event) =>
                        onChange({
                          locations: locations.map((entry, other) =>
                            other === index ? { ...entry, relocation: event.target.checked } : entry,
                          ),
                        })
                      }
                      className="accent-(--bfhr-color-accent-solid) size-4"
                    />
                    <span>
                      {intl.formatMessage(messages.relocate)}
                      <span className="sr-only">{`: ${name}`}</span>
                    </span>
                  </label>
                </Token>
              );
            })}
          </ul>
        )}
        {full ? (
          <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.placesFull)}</p>
        ) : (
          <>
            {quick.length > 0 && (
              <div
                role="group"
                aria-label={intl.formatMessage(messages.quickAdd)}
                className="flex flex-wrap gap-2"
              >
                {quick.map((code) => (
                  <Chip key={code} selected={false} onSelectedChange={() => add(code, "")}>
                    {names.country(code)}
                  </Chip>
                ))}
              </div>
            )}
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (country === "") return;
                add(country, city);
                setCountry("");
                setCity("");
              }}
            >
              <select
                aria-label={intl.formatMessage(messages.country)}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className={cx(controlClass, "w-44")}
              >
                <option value="">{intl.formatMessage(messages.countryPick)}</option>
                {names.countries.map((code) => (
                  <option key={code} value={code}>
                    {names.country(code)}
                  </option>
                ))}
              </select>
              <input
                aria-label={intl.formatMessage(messages.city)}
                placeholder={intl.formatMessage(messages.city)}
                autoComplete="address-level2"
                maxLength={80}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className={cx(controlClass, "w-36 flex-1")}
              />
              <Button
                type="submit"
                disabledReason={country === "" ? intl.formatMessage(messages.addPlaceNeedsCountry) : null}
              >
                {intl.formatMessage(messages.addPlace)}
              </Button>
            </form>
          </>
        )}
      </div>
    </PreferenceSectionRow>
  );
}

function SalarySection({
  draft,
  names,
  onChange,
  fromCv,
  status,
}: {
  readonly draft: JobPreferencesDraft;
  readonly names: Names;
  readonly onChange: (next: Partial<JobPreferencesDraft>, commit: boolean) => void;
  readonly fromCv: boolean;
  readonly status: ReactNode;
}) {
  const intl = useIntl();
  const id = useId();
  const { salary } = draft;
  const periods: readonly SalaryPeriod[] = (FORM_PERIODS as readonly SalaryPeriod[]).includes(salary.period)
    ? FORM_PERIODS
    : [...FORM_PERIODS, salary.period];
  const currencies = [...MAIN_CURRENCIES, ...OTHER_CURRENCIES] as readonly string[];
  return (
    <PreferenceSectionRow
      title={intl.formatMessage(messages.salaryTitle)}
      helper={intl.formatMessage(messages.salaryHelp)}
      groupLabel
      fromCv={fromCv}
      status={status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${id}-amount`}
          aria-label={intl.formatMessage(messages.amount)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={16}
          value={salary.amount}
          onChange={(event) =>
            onChange({ salary: { ...salary, amount: event.target.value.replace(/[^\d.,\s']/g, "") } }, false)
          }
          onBlur={() =>
            onChange({ salary: { ...salary, amount: formatAmount(salary.amount, intl.locale) } }, true)
          }
          className={cx(controlClass, "w-32 text-end tabular-nums")}
        />
        <select
          aria-label={intl.formatMessage(messages.currency)}
          value={salary.currency}
          onChange={(event) => {
            const currency = event.target.value;
            onChange(
              {
                salary: {
                  ...salary,
                  currency,
                  period: salary.amount.trim() === "" ? defaultPeriod(currency) : salary.period,
                },
              },
              true,
            );
          }}
          className={cx(controlClass, "w-48")}
        >
          {(currencies.includes(salary.currency) ? currencies : [salary.currency, ...currencies]).map(
            (code) => (
              <option key={code} value={code}>
                {`${code} · ${names.currency(code)}`}
              </option>
            ),
          )}
        </select>
        <SegmentedControl<SalaryPeriod>
          label={intl.formatMessage(messages.period)}
          value={salary.period}
          onValueChange={(period) => onChange({ salary: { ...salary, period } }, true)}
          options={periods.map((period) => ({
            value: period,
            label: intl.formatMessage(PERIOD_MESSAGES[period]),
          }))}
        />
        {salary.amount !== "" && (
          <Button variant="plain" onClick={() => onChange({ salary: { ...salary, amount: "" } }, true)}>
            {intl.formatMessage(messages.salaryClear)}
          </Button>
        )}
      </div>
    </PreferenceSectionRow>
  );
}

const ANSWERS: readonly { value: AuthorizationAnswer; label: MessageDescriptor }[] = [
  { value: "yes", label: messages.yes },
  { value: "no", label: messages.no },
  { value: "unsure", label: messages.unsure },
];

function AuthorizationQuestions({
  draft,
  names,
  onChange,
}: {
  readonly draft: JobPreferencesDraft;
  readonly names: Names;
  readonly onChange: (entries: JobPreferencesDraft["workAuthorization"]) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const regions = authorizationRegions(draft.locations, draft.workAuthorization);
  if (regions.length === 0)
    return (
      <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.authorizationEmpty)}</p>
    );
  return (
    <div className="flex flex-col gap-4">
      {regions.map((region) => {
        const answer = authorizationAnswer(draft.workAuthorization, region);
        return (
          <fieldset key={region} className="flex flex-col gap-2">
            <legend className="text-callout text-fg-primary mb-2">
              {intl.formatMessage(messages.authorizationQuestion, { place: names.region(region) })}
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {ANSWERS.map((option) => (
                <label key={option.value} className="text-callout text-fg-primary flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`${id}-${region}`}
                    value={option.value}
                    checked={answer === option.value}
                    onChange={() =>
                      onChange(setAuthorizationAnswer(draft.workAuthorization, region, option.value))
                    }
                    className="accent-(--bfhr-color-accent-solid) size-4"
                  />
                  {intl.formatMessage(option.label)}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function LanguagesSection({
  draft,
  names,
  onChange,
  fromCv,
  status,
}: {
  readonly draft: JobPreferencesDraft;
  readonly names: Names;
  readonly onChange: (languages: JobPreferencesDraft["languages"], announce?: string) => void;
  readonly fromCv: boolean;
  readonly status: ReactNode;
}) {
  const intl = useIntl();
  const { languages } = draft;
  const has = (code: string) => languages.some((entry) => entry.language.split("-")[0] === code);
  const add = (code: string) => {
    const next = addLanguage(languages, code);
    if (next !== languages)
      onChange(next, intl.formatMessage(messages.added, { name: names.language(code) }));
  };
  return (
    <PreferenceSectionRow
      title={intl.formatMessage(messages.languagesTitle)}
      helper={intl.formatMessage(messages.languagesHelp)}
      groupLabel
      fromCv={fromCv}
      status={status}
    >
      {languages.length === 0 ? (
        <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.languagesEmpty)}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {languages.map((entry) => {
            const name = names.language(entry.language);
            return (
              <Token
                key={entry.language}
                name={name}
                onRemove={() =>
                  onChange(
                    languages.filter((other) => other.language !== entry.language),
                    intl.formatMessage(messages.removed, { name }),
                  )
                }
              >
                <select
                  aria-label={intl.formatMessage(messages.languageLevel, { language: name })}
                  value={entry.level}
                  onChange={(event) =>
                    onChange(
                      languages.map((other) =>
                        other.language === entry.language
                          ? { ...other, level: event.target.value as LanguageLevel }
                          : other,
                      ),
                    )
                  }
                  className={cx(controlClass, "h-7 w-52")}
                >
                  {LANGUAGE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {intl.formatMessage(LEVEL_MESSAGES[level])}
                    </option>
                  ))}
                </select>
              </Token>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_LANGUAGES.filter((code) => !has(code)).map((code) => (
          <Chip key={code} selected={false} onSelectedChange={() => add(code)}>
            {names.language(code)}
          </Chip>
        ))}
        <select
          aria-label={intl.formatMessage(messages.languageAdd)}
          value=""
          onChange={(event) => {
            if (event.target.value !== "") add(event.target.value);
          }}
          className={cx(controlClass, "w-52")}
        >
          <option value="">{intl.formatMessage(messages.languageAddPick)}</option>
          {names.languageList
            .filter((code) => !has(code))
            .map((code) => (
              <option key={code} value={code}>
                {names.language(code)}
              </option>
            ))}
        </select>
      </div>
    </PreferenceSectionRow>
  );
}
