/**
 * Settings › Companies you follow (PRD M4-JOB-2, `users/{uid}/watchlist`): add a company by its
 * careers page, see whether we found its job board and how many jobs are open, pause, edit or
 * remove it (Undo brings it back). Clients write only name, careers URL, enabled and updatedAt;
 * the server resolves the board.
 */
import type { WatchedCompany } from "@bfhr/core";
import { Building2, CircleAlert, CircleCheck, LoaderCircle, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { type FormEvent, useContext, useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { relativeTime } from "../../shared/model/format";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { MenuContent, MenuItem } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { useToast } from "../../shared/ui/Toast";
import { useSaver } from "./save";
import { useListState, useSettingsStore } from "./store";
import { SettingsSection, SettingsSwitch } from "./ui";

const messages = defineMessages({
  title: { id: "settings.companies.title", defaultMessage: "Careers pages" },
  description: {
    id: "settings.companies.description",
    defaultMessage:
      "We check their careers pages with every search and add new openings to Jobs. Works with Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Personio, and careers pages that list their jobs.",
  },
  add: { id: "settings.companies.add", defaultMessage: "Follow a company" },
  name: { id: "settings.companies.name", defaultMessage: "Company" },
  url: { id: "settings.companies.url", defaultMessage: "Careers page" },
  urlHint: { id: "settings.companies.urlHint", defaultMessage: "For example https://jobs.lever.co/acme" },
  save: { id: "settings.companies.save", defaultMessage: "Follow" },
  saveEdit: { id: "settings.companies.saveEdit", defaultMessage: "Save" },
  cancel: { id: "settings.companies.cancel", defaultMessage: "Cancel" },
  nameMissing: { id: "settings.companies.nameMissing", defaultMessage: "Enter the company's name." },
  urlInvalid: {
    id: "settings.companies.urlInvalid",
    defaultMessage: "Enter the full address of the careers page, starting with https://.",
  },
  duplicate: { id: "settings.companies.duplicate", defaultMessage: "You already follow this careers page." },
  pending: { id: "settings.companies.pending", defaultMessage: "Looking for open jobs…" },
  ok: {
    id: "settings.companies.ok",
    defaultMessage: "{count, plural, =0 {No open jobs} one {# open job} other {# open jobs}} · checked {time}",
  },
  okNoTime: { id: "settings.companies.okNoTime", defaultMessage: "{count, plural, =0 {No open jobs} one {# open job} other {# open jobs}}" },
  notFound: {
    id: "settings.companies.notFound",
    defaultMessage: "We couldn't find job listings on this page. Try the page that lists the jobs.",
  },
  error: { id: "settings.companies.error", defaultMessage: "The page didn't answer. We'll try again with the next search." },
  paused: { id: "settings.companies.paused", defaultMessage: "Paused" },
  following: { id: "settings.companies.following", defaultMessage: "Following" },
  more: { id: "settings.companies.more", defaultMessage: "More actions for {company}" },
  edit: { id: "settings.companies.edit", defaultMessage: "Edit" },
  remove: { id: "settings.companies.remove", defaultMessage: "Stop following" },
  removed: { id: "settings.companies.removed", defaultMessage: "Stopped following {company}" },
  undo: { id: "settings.companies.undo", defaultMessage: "Undo" },
  emptyTitle: { id: "settings.companies.emptyTitle", defaultMessage: "Follow the companies you'd love to work for" },
  emptyBody: {
    id: "settings.companies.emptyBody",
    defaultMessage: "Add a careers page and new openings show up in Jobs without searching.",
  },
  loading: { id: "settings.companies.loading", defaultMessage: "Loading the companies you follow" },
  errorTitle: { id: "settings.companies.errorTitle", defaultMessage: "We couldn't load the companies you follow" },
  errorBody: { id: "settings.companies.errorBody", defaultMessage: "Nothing was lost. Try again in a moment." },
});

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary h-8 w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";

function validUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Add or edit form. */
function CompanyForm({
  initial,
  existing,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; careersUrl: string };
  existing: readonly WatchedCompany[];
  submitLabel: string;
  onSubmit: (value: { name: string; careersUrl: string }) => void;
  onCancel: () => void;
}) {
  const intl = useIntl();
  const id = useId();
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.careersUrl);
  const [attempted, setAttempted] = useState(false);
  const nameError = attempted && name.trim() === "" ? intl.formatMessage(messages.nameMissing) : null;
  const duplicate = existing.some(
    (company) => company.careersUrl.toLowerCase() === url.trim().toLowerCase() && company.careersUrl !== initial.careersUrl,
  );
  const urlError =
    attempted && !validUrl(url)
      ? intl.formatMessage(messages.urlInvalid)
      : attempted && duplicate
        ? intl.formatMessage(messages.duplicate)
        : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (name.trim() === "" || !validUrl(url) || duplicate) return;
    onSubmit({ name: name.trim(), careersUrl: url.trim() });
  };
  return (
    <form noValidate onSubmit={submit} className="border-line-subtle grid grid-cols-1 gap-3 rounded-lg border p-4 min-[640px]:grid-cols-[1fr_2fr]">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.name)}
        </label>
        <input
          id={`${id}-name`}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError !== null || undefined}
          aria-describedby={nameError ? `${id}-name-message` : undefined}
          className={controlClass}
        />
        {nameError && (
          <p id={`${id}-name-message`} className="text-danger-text text-footnote">
            {nameError}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={`${id}-url`} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.url)}
        </label>
        <input
          id={`${id}-url`}
          type="url"
          spellCheck={false}
          value={url}
          placeholder="https://"
          onChange={(event) => setUrl(event.target.value)}
          aria-invalid={urlError !== null || undefined}
          aria-describedby={`${id}-url-message`}
          className={controlClass}
        />
        <p id={`${id}-url-message`} className={urlError ? "text-danger-text text-footnote" : "text-fg-tertiary text-footnote"}>
          {urlError ?? intl.formatMessage(messages.urlHint)}
        </p>
      </div>
      <div className="flex justify-end gap-2 min-[640px]:col-span-2">
        <Button variant="plain" onClick={onCancel}>
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CompanyRow({ company, all }: { company: WatchedCompany; all: readonly WatchedCompany[] }) {
  const intl = useIntl();
  const store = useSettingsStore();
  const toast = useToast();
  const saver = useSaver();
  const environment = useContext(ModelEnvironmentContext);
  const [editing, setEditing] = useState(false);
  const titleId = useId();
  const ctx = {
    intl,
    locale: intl.locale,
    now: environment.now(),
    timeZone: environment.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  if (editing)
    return (
      <li className="py-2">
        <CompanyForm
          initial={company}
          existing={all}
          submitLabel={intl.formatMessage(messages.saveEdit)}
          onCancel={() => setEditing(false)}
          onSubmit={(value) => {
            setEditing(false);
            saver.save(() => store.updateCompany(company.id, value));
          }}
        />
      </li>
    );
  let status;
  if (company.status === "pending")
    status = (
      <>
        <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
        {intl.formatMessage(messages.pending)}
      </>
    );
  else if (company.status === "ok")
    status = (
      <>
        <CircleCheck aria-hidden="true" className="text-success-text size-3.5 shrink-0" strokeWidth={1.75} />
        {company.lastFetchedAt
          ? intl.formatMessage(messages.ok, {
              count: company.openJobs ?? 0,
              time: relativeTime(company.lastFetchedAt, ctx).label,
            })
          : intl.formatMessage(messages.okNoTime, { count: company.openJobs ?? 0 })}
      </>
    );
  else
    status = (
      <>
        <CircleAlert aria-hidden="true" className="text-warning-text size-3.5 shrink-0" strokeWidth={1.75} />
        {intl.formatMessage(company.status === "not_found" ? messages.notFound : messages.error)}
      </>
    );
  const remove = () => {
    void store.removeCompany(company.id).catch(() => undefined);
    toast.show({
      message: intl.formatMessage(messages.removed, { company: company.name }),
      glyph: Trash2,
      action: { label: intl.formatMessage(messages.undo), run: () => void store.restoreCompany(company).catch(() => undefined) },
    });
  };
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <Building2 aria-hidden="true" className="text-fg-secondary mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <div className="flex min-w-60 flex-1 flex-col gap-0.5">
        <p id={titleId} className="text-body text-fg-primary">
          {company.name}
        </p>
        <p className="text-footnote text-fg-tertiary break-all">{company.careersUrl}</p>
        <p className="text-footnote text-fg-secondary flex items-center gap-1.5">{status}</p>
        {saver.status}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <SettingsSwitch
          checked={company.enabled}
          onCheckedChange={(enabled) => saver.save(() => store.updateCompany(company.id, { enabled }))}
          labelledBy={titleId}
          onLabel={intl.formatMessage(messages.following)}
          offLabel={intl.formatMessage(messages.paused)}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <IconButton icon={MoreHorizontal} label={intl.formatMessage(messages.more, { company: company.name })} />
          </DropdownMenu.Trigger>
          <MenuContent align="end" aria-label={intl.formatMessage(messages.more, { company: company.name })}>
            <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>
              {intl.formatMessage(messages.edit)}
            </MenuItem>
            <MenuItem icon={Trash2} destructive onSelect={remove}>
              {intl.formatMessage(messages.remove)}
            </MenuItem>
          </MenuContent>
        </DropdownMenu.Root>
      </div>
    </li>
  );
}

export function CompaniesPane() {
  const intl = useIntl();
  const store = useSettingsStore();
  const state = useListState(store.watchlist);
  const saver = useSaver();
  const [adding, setAdding] = useState(false);
  const addButton = (
    <Button icon={Plus} onClick={() => setAdding(true)}>
      {intl.formatMessage(messages.add)}
    </Button>
  );
  let body;
  if (state.status === "loading")
    body = (
      <SkeletonRegion loading label={intl.formatMessage(messages.loading)} skeleton={<SkeletonBlock className="h-24 w-full rounded-lg" />}>
        {null}
      </SkeletonRegion>
    );
  else if (state.status === "error")
    body = <PaneError title={intl.formatMessage(messages.errorTitle)} body={intl.formatMessage(messages.errorBody)} onRetry={state.retry} />;
  else {
    const companies = state.items.toSorted((a, b) => a.name.localeCompare(b.name, intl.locale));
    body = (
      <>
        {adding && (
          <CompanyForm
            initial={{ name: "", careersUrl: "" }}
            existing={companies}
            submitLabel={intl.formatMessage(messages.save)}
            onCancel={() => setAdding(false)}
            onSubmit={(value) => {
              setAdding(false);
              saver.save(() => store.addCompany(value));
            }}
          />
        )}
        {saver.status}
        {companies.length === 0 && !adding ? (
          <EmptyState
            kind="firstUse"
            glyph={Building2}
            title={intl.formatMessage(messages.emptyTitle)}
            body={intl.formatMessage(messages.emptyBody)}
            primary={{ label: intl.formatMessage(messages.add), onClick: () => setAdding(true) }}
          />
        ) : (
          <ul className="divide-line-subtle flex flex-col divide-y">
            {companies.map((company) => (
              <CompanyRow key={company.id} company={company} all={companies} />
            ))}
          </ul>
        )}
      </>
    );
  }
  return (
    <SettingsSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      {...(!adding && state.status === "ready" && state.items.length > 0 && { actions: addButton })}
    >
      {body}
    </SettingsSection>
  );
}
