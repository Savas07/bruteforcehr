/**
 * "Log an application" (BRIEF §4.6 manual add): company and role, then the optional details —
 * link, location, status (default Applied) with the applied date, channel, CV and version, notes.
 * Enter or Mod+Enter adds it through `useTrackerActions().createApplications` (the toast offers
 * Undo; writes queue locally while offline); "Add and open" also opens its page. Esc, Cancel or a
 * click outside close it, asking first when something was entered.
 */
import type { ApplicationStatus, Channel, CvRevision } from "@bfhr/core";
import { CloudOff } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import { type ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { ModelEnvironmentContext, useTrackerModel } from "../../data/tracker/model";
import { useTrackerRepository } from "../../data/tracker/repository";
import { useTrackerActions } from "../../data/tracker/useTrackerActions";
import { newApplication } from "../../data/tracker/writes";
import { useConnectivity } from "../../shared/connectivity";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import type { ModelContext, ScreenData } from "../../shared/model/types";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { Keycaps } from "../../shared/ui/Keycaps";
import { SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { useUnsavedChanges } from "../../shared/unsavedChanges";
import {
  type AddApplicationModel,
  appliedDateProblem,
  appliedInstant,
  buildAddApplicationModel,
  findDuplicate,
  isValidLink,
} from "./model";
import type { AddApplicationOptions } from "./request";

const messages = defineMessages({
  title: { id: "application-add.dialog.title", defaultMessage: "Log an application", description: "Dialog title" },
  description: {
    id: "application-add.dialog.description",
    defaultMessage: "Add an application you sent or are planning. You can change everything later.",
  },
  company: { id: "application-add.dialog.company", defaultMessage: "Company", description: "Field label" },
  role: { id: "application-add.dialog.role", defaultMessage: "Role", description: "Field label" },
  linkName: {
    id: "application-add.dialog.linkName",
    defaultMessage: "Link to the posting",
    description: "The link field's name in the error summary",
  },
  rolePlaceholder: {
    id: "application-add.dialog.rolePlaceholder",
    defaultMessage: "e.g. Frontend Engineer",
    description: "Placeholder of the Role field",
  },
  link: {
    id: "application-add.dialog.link",
    defaultMessage: "Link to the posting <optional>(optional)</optional>",
    description: "Field label; the tag marks the optional hint",
  },
  location: {
    id: "application-add.dialog.location",
    defaultMessage: "Location <optional>(optional)</optional>",
    description: "Field label; the tag marks the optional hint",
  },
  status: { id: "application-add.dialog.status", defaultMessage: "Status", description: "Field label" },
  appliedOn: { id: "application-add.dialog.appliedOn", defaultMessage: "Applied on", description: "Field label" },
  channel: {
    id: "application-add.dialog.channel",
    defaultMessage: "Sent via <optional>(optional)</optional>",
    description: "Field label: how the application was sent; the tag marks the optional hint",
  },
  channelNone: { id: "application-add.dialog.channelNone", defaultMessage: "Not sure", description: "Channel option" },
  cv: {
    id: "application-add.dialog.cv",
    defaultMessage: "CV <optional>(optional)</optional>",
    description: "Field label; the tag marks the optional hint",
  },
  cvNone: { id: "application-add.dialog.cvNone", defaultMessage: "None", description: "CV option: no CV" },
  noCvs: {
    id: "application-add.dialog.noCvs",
    defaultMessage: "No CVs yet. Once you add one in CVs, you can link it from the application's page.",
  },
  revision: { id: "application-add.dialog.revision", defaultMessage: "Version", description: "Field label: CV version" },
  notes: {
    id: "application-add.dialog.notes",
    defaultMessage: "Notes <optional>(optional)</optional>",
    description: "Field label; the tag marks the optional hint",
  },
  cancel: { id: "application-add.dialog.cancel", defaultMessage: "Cancel", description: "Button" },
  addAndOpen: {
    id: "application-add.dialog.addAndOpen",
    defaultMessage: "Add and open",
    description: "Secondary button: adds the application, then opens its page",
  },
  add: { id: "application-add.dialog.add", defaultMessage: "Add application", description: "Primary button" },
  openDuplicate: {
    id: "application-add.dialog.openDuplicate",
    defaultMessage: "Open it",
    description: "Opens the application that has the same company and role",
  },
  keysHint: {
    id: "application-add.dialog.keysHint",
    defaultMessage: "<keys></keys> to add",
    description: "Footer hint; the tag shows the shortcut keycaps (⌘↩ / Ctrl Enter)",
  },
  offline: {
    id: "application-add.dialog.offline",
    defaultMessage: "You're offline. It's saved on this device and syncs when you're back online.",
  },
  loading: { id: "application-add.dialog.loading", defaultMessage: "Loading your tracker" },
  loadingReason: {
    id: "application-add.dialog.loadingReason",
    defaultMessage: "Your tracker is still loading.",
    description: "Why the add buttons are disabled",
  },
  loadFailed: { id: "application-add.dialog.loadFailed", defaultMessage: "We couldn't load your tracker" },
  loadFailedBody: {
    id: "application-add.dialog.loadFailedBody",
    defaultMessage: "Your applications are safe. Try again in a moment.",
  },
  loadFailedReason: {
    id: "application-add.dialog.loadFailedReason",
    defaultMessage: "Your tracker couldn't load. Try again first.",
    description: "Why the add buttons are disabled",
  },
  tryAgain: { id: "application-add.dialog.tryAgain", defaultMessage: "Try again", description: "Button" },
  companyMissing: { id: "application-add.dialog.companyMissing", defaultMessage: "Enter the company's name." },
  roleMissing: {
    id: "application-add.dialog.roleMissing",
    defaultMessage: "Enter the role, for example “Frontend Engineer”.",
  },
  linkInvalid: {
    id: "application-add.dialog.linkInvalid",
    defaultMessage: "Enter the full address, starting with https://",
  },
  dateMissing: { id: "application-add.dialog.dateMissing", defaultMessage: "Enter the day you applied." },
  dateFuture: {
    id: "application-add.dialog.dateFuture",
    defaultMessage: "Pick today or an earlier day.",
    description: "The applied date can't be in the future",
  },
  summary: {
    id: "application-add.dialog.summary",
    defaultMessage: "{count, plural, one {# field needs a look} other {# fields need a look}}",
    description: "Error summary above the form",
  },
  discardTitle: { id: "application-add.dialog.discardTitle", defaultMessage: "Discard this application?" },
  discardBody: {
    id: "application-add.dialog.discardBody",
    defaultMessage: "What you've entered here won't be saved.",
  },
  keepEditing: { id: "application-add.dialog.keepEditing", defaultMessage: "Keep editing", description: "Button" },
  discard: { id: "application-add.dialog.discard", defaultMessage: "Discard", description: "Button" },
  unsavedLabel: {
    id: "application-add.dialog.unsavedLabel",
    defaultMessage: "New application",
    description: "Names this dialog in “Save your changes before restarting?”",
  },
});

interface Draft {
  readonly company: string;
  readonly role: string;
  readonly link: string;
  readonly location: string;
  readonly status: ApplicationStatus;
  /** `YYYY-MM-DD`; "" until the model gives today. */
  readonly appliedOn: string;
  readonly channel: Channel | "";
  readonly cvId: string;
  readonly revisionId: string;
  readonly notes: string;
}

type FieldKey = "company" | "role" | "link" | "appliedOn";
const FIELD_ORDER: readonly FieldKey[] = ["company", "role", "link", "appliedOn"];
/** What the error summary calls each field (the labels without their "(optional)" hint). */
const SUMMARY_NAMES: Readonly<Record<FieldKey, MessageDescriptor>> = {
  company: messages.company,
  role: messages.role,
  link: messages.linkName,
  appliedOn: messages.appliedOn,
};

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";
const fieldClass = `${controlClass} h-8`;

const optionalTag = { optional: (chunks: ReactNode[]) => <span className="text-fg-tertiary font-normal">{chunks}</span> };

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-footnote text-fg-secondary font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-message`} className="text-danger-text text-footnote">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-message`} className="text-fg-tertiary text-footnote">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** The form's shape: label bar + control outline per field (outlines stay visible on the elevated dialog surface in dark mode, where `skeleton.base` equals it). */
const SKELETON_FIELDS: readonly ("half" | "full" | "notes")[] = [
  "half",
  "half",
  "full",
  "half",
  "half",
  "half",
  "half",
  "half",
  "notes",
];

function FormSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-x-3 gap-y-4">
      {SKELETON_FIELDS.map((shape, index) => (
        <div key={index} className={cx("flex flex-col gap-2", shape !== "half" && "col-span-2", index === 7 && "col-start-1")}>
          <SkeletonBlock className="h-3 w-20" />
          <div
            className={cx(
              "bg-surface-base border-line-subtle w-full rounded-md border motion-safe:animate-pulse",
              shape === "notes" ? "h-16" : "h-8",
            )}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The dialog for one add. Mounted per open (fresh draft each time); `onClose(id)` gets the id of
 * the application to open next ("Add and open", or "Open it" on the duplicate note), else null.
 */
export function AddApplicationDialog({
  initial,
  onClose,
}: {
  readonly initial: AddApplicationOptions;
  readonly onClose: (openApplicationId: string | null) => void;
}) {
  const intl = useIntl();
  const environment = useContext(ModelEnvironmentContext);
  const repository = useTrackerRepository();
  const actions = useTrackerActions();
  const connectivity = useConnectivity();
  const baseId = useId();
  const id = (field: string) => `${baseId}-${field}`;
  const contentRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});

  const blank: Draft = {
    company: initial.company ?? "",
    role: initial.role ?? "",
    link: "",
    location: "",
    status: initial.status ?? "applied",
    appliedOn: "",
    channel: "",
    cvId: "",
    revisionId: "",
    notes: "",
  };
  const [draft, setDraft] = useState<Draft>(blank);
  const [start] = useState(blank);
  const [attempted, setAttempted] = useState(false);
  const [linkTouched, setLinkTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const edit = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  // The picked CV's versions, newest first (not part of the live tracker data).
  const [revisions, setRevisions] = useState<{ readonly cvId: string; readonly list: readonly CvRevision[] } | null>(
    null,
  );
  useEffect(() => {
    const cvId = draft.cvId;
    if (cvId === "") return;
    return repository.watchCvRevisions(cvId, (lookup) => {
      if (lookup.status === "ready") setRevisions({ cvId, list: lookup.value ?? [] });
    });
  }, [repository, draft.cvId]);
  const build = useCallback(
    (data: ScreenData, ctx: ModelContext) =>
      buildAddApplicationModel(
        revisions === null
          ? data
          : {
              ...data,
              cvRevisions: [
                ...data.cvRevisions.filter((revision) => revision.cvId !== revisions.cvId),
                ...revisions.list,
              ],
            },
        ctx,
      ),
    [revisions],
  );
  const loadable = useTrackerModel(build, {});
  const model: AddApplicationModel | null = loadable.status === "ready" ? loadable.data : null;
  const appliedOn = draft.appliedOn === "" ? (model?.today ?? "") : draft.appliedOn;
  const dated = model?.datedStatuses.includes(draft.status) ?? true;
  const cvOptions = useMemo(() => model?.cvGroups.flatMap((group) => group.options) ?? [], [model]);
  const pickedCv = cvOptions.find((option) => option.id === draft.cvId) ?? null;
  const duplicate = model ? findDuplicate(model, draft.company, draft.role) : null;

  const problems: Partial<Record<FieldKey, string>> = {};
  if (draft.company.trim() === "") problems.company = intl.formatMessage(messages.companyMissing);
  if (draft.role.trim() === "") problems.role = intl.formatMessage(messages.roleMissing);
  if (!isValidLink(draft.link)) problems.link = intl.formatMessage(messages.linkInvalid);
  const dateProblem = model && dated ? appliedDateProblem(model, appliedOn) : null;
  if (dateProblem)
    problems.appliedOn = intl.formatMessage(dateProblem === "future" ? messages.dateFuture : messages.dateMissing);
  const invalid = FIELD_ORDER.filter((field) => problems[field] !== undefined);
  const shown = (field: FieldKey): string | undefined =>
    attempted || (field === "link" && linkTouched) ? problems[field] : undefined;

  const dirty = (Object.keys(start) as (keyof Draft)[]).some((key) => draft[key] !== start[key]);
  const notReadyReason =
    loadable.status === "loading"
      ? intl.formatMessage(messages.loadingReason)
      : loadable.status === "error"
        ? intl.formatMessage(messages.loadFailedReason)
        : null;

  /** Adds the application; false (and points at the first problem) when the form isn't ready. */
  const submit = (open: boolean): boolean => {
    if (!model) return false;
    if (invalid.length > 0) {
      setAttempted(true);
      const [first] = invalid;
      if (first) fieldRefs.current[first]?.focus();
      return false;
    }
    const now = environment.now();
    const appliedAt = dated ? appliedInstant(model, appliedOn, now) : null;
    const [created] = actions.createApplications([
      {
        application: newApplication(
          {
            company: draft.company,
            role: draft.role,
            status: draft.status,
            location: draft.location,
            channel: draft.channel === "" ? null : draft.channel,
            appliedAt,
            cvId: pickedCv?.id ?? null,
            cvRevisionId: pickedCv ? draft.revisionId || pickedCv.currentRevisionId : null,
            notes: draft.notes.trim(),
          },
          now,
        ),
        link: draft.link.trim() || null,
        // A past applied day dates the timeline's first row too.
        ...(appliedAt && appliedAt !== now ? { occurredAt: appliedAt } : {}),
      },
    ]);
    onClose(open ? (created ?? null) : null);
    return true;
  };

  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onClose(null);
  };

  useKeyBindings([
    {
      id: "application-add.submit",
      keys: "Mod+Enter",
      label: intl.formatMessage(messages.add),
      group: "General",
      inOverlays: true,
      enabled: !confirming && model !== null,
      run: () => void submit(false),
    },
  ]);

  useUnsavedChanges(
    dirty
      ? {
          label: intl.formatMessage(messages.unsavedLabel),
          save: () => (submit(false) ? Promise.resolve() : Promise.reject(new Error("The application isn't complete"))),
        }
      : null,
  );

  // Focus the first empty required field: on open, or as soon as the form replaces the skeleton.
  const firstField: FieldKey = start.company !== "" && start.role === "" ? "role" : "company";
  const focusedFirst = useRef(false);

  const describedBy = (field: string, has: boolean) => (has ? `${id(field)}-message` : undefined);
  const label = (message: (typeof messages)[keyof typeof messages]) => intl.formatMessage(message, optionalTag);

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          ref={contentRef}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (fieldRefs.current[firstField] ?? contentRef.current)?.focus();
          }}
          className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg outline-none"
        >
          <div className="px-5 pt-5 pb-3">
            <Dialog.Title className="font-display text-title3">{intl.formatMessage(messages.title)}</Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">
              {intl.formatMessage(messages.description)}
            </Dialog.Description>
          </div>
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              submit(false);
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-4">
              {loadable.status === "error" ? (
                <InlineAlert
                  tone="error"
                  title={intl.formatMessage(messages.loadFailed)}
                  action={{ label: intl.formatMessage(messages.tryAgain), onClick: loadable.retry }}
                >
                  {intl.formatMessage(messages.loadFailedBody)}
                </InlineAlert>
              ) : (
                <SkeletonRegion
                  loading={model === null}
                  label={intl.formatMessage(messages.loading)}
                  skeleton={<FormSkeleton />}
                >
                  {model && (
                    <div className="flex flex-col gap-4">
                      {attempted && invalid.length > 1 && (
                        <InlineAlert
                          tone="error"
                          fromAction
                          title={intl.formatMessage(messages.summary, { count: invalid.length })}
                        >
                          <ul className="flex flex-col gap-0.5">
                            {invalid.map((field) => (
                              <li key={field}>
                                <button
                                  type="button"
                                  className="text-fg-primary underline underline-offset-2"
                                  onClick={() => fieldRefs.current[field]?.focus()}
                                >
                                  {intl.formatMessage(SUMMARY_NAMES[field])}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </InlineAlert>
                      )}
                      <div
                        className="grid grid-cols-2 gap-x-3 gap-y-4"
                        ref={(node) => {
                          if (!node || focusedFirst.current) return;
                          focusedFirst.current = true;
                          fieldRefs.current[firstField]?.focus();
                        }}
                      >
                        <Field id={id("company")} label={intl.formatMessage(messages.company)} error={shown("company")}>
                          <input
                            id={id("company")}
                            ref={(node) => {
                              fieldRefs.current.company = node;
                            }}
                            aria-required="true"
                            aria-invalid={shown("company") ? true : undefined}
                            aria-describedby={describedBy("company", shown("company") !== undefined)}
                            autoComplete="organization"
                            maxLength={200}
                            value={draft.company}
                            onChange={(event) => edit({ company: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field id={id("role")} label={intl.formatMessage(messages.role)} error={shown("role")}>
                          <input
                            id={id("role")}
                            ref={(node) => {
                              fieldRefs.current.role = node;
                            }}
                            aria-required="true"
                            aria-invalid={shown("role") ? true : undefined}
                            aria-describedby={describedBy("role", shown("role") !== undefined)}
                            autoComplete="off"
                            maxLength={200}
                            placeholder={intl.formatMessage(messages.rolePlaceholder)}
                            value={draft.role}
                            onChange={(event) => edit({ role: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        {duplicate && (
                          <InlineAlert
                            tone="info"
                            className="col-span-2"
                            title={duplicate.note}
                            action={{
                              label: intl.formatMessage(messages.openDuplicate),
                              onClick: () => onClose(duplicate.applicationId),
                            }}
                          />
                        )}
                        <Field id={id("link")} label={label(messages.link)} error={shown("link")} className="col-span-2">
                          <input
                            id={id("link")}
                            ref={(node) => {
                              fieldRefs.current.link = node;
                            }}
                            type="url"
                            inputMode="url"
                            aria-invalid={shown("link") ? true : undefined}
                            aria-describedby={describedBy("link", shown("link") !== undefined)}
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={2000}
                            placeholder="https://"
                            value={draft.link}
                            onChange={(event) => edit({ link: event.target.value })}
                            onBlur={() => setLinkTouched(draft.link.trim() !== "")}
                            className={fieldClass}
                          />
                        </Field>
                        <Field id={id("status")} label={intl.formatMessage(messages.status)}>
                          <select
                            id={id("status")}
                            value={draft.status}
                            onChange={(event) => edit({ status: event.target.value as ApplicationStatus })}
                            className={fieldClass}
                          >
                            {model.statusGroups.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </Field>
                        {dated && (
                          <Field id={id("appliedOn")} label={intl.formatMessage(messages.appliedOn)} error={shown("appliedOn")}>
                            <input
                              id={id("appliedOn")}
                              ref={(node) => {
                                fieldRefs.current.appliedOn = node;
                              }}
                              type="date"
                              max={model.today}
                              aria-invalid={shown("appliedOn") ? true : undefined}
                              aria-describedby={describedBy("appliedOn", shown("appliedOn") !== undefined)}
                              value={appliedOn}
                              onChange={(event) => edit({ appliedOn: event.target.value })}
                              className={fieldClass}
                            />
                          </Field>
                        )}
                        <Field id={id("channel")} label={label(messages.channel)} className="col-start-1">
                          <select
                            id={id("channel")}
                            value={draft.channel}
                            onChange={(event) => edit({ channel: event.target.value as Channel | "" })}
                            className={fieldClass}
                          >
                            <option value="">{intl.formatMessage(messages.channelNone)}</option>
                            {model.channels.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field id={id("location")} label={label(messages.location)}>
                          <input
                            id={id("location")}
                            autoComplete="off"
                            maxLength={200}
                            value={draft.location}
                            onChange={(event) => edit({ location: event.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        {model.cvGroups.length === 0 ? (
                          <div className="col-span-2 flex flex-col gap-1">
                            <span className="text-footnote text-fg-secondary font-medium">{label(messages.cv)}</span>
                            <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.noCvs)}</p>
                          </div>
                        ) : (
                          <>
                            <Field id={id("cv")} label={label(messages.cv)} className="col-start-1">
                              <select
                                id={id("cv")}
                                value={draft.cvId}
                                onChange={(event) => {
                                  const cv = cvOptions.find((option) => option.id === event.target.value);
                                  edit({ cvId: cv?.id ?? "", revisionId: cv?.currentRevisionId ?? "" });
                                }}
                                className={fieldClass}
                              >
                                <option value="">{intl.formatMessage(messages.cvNone)}</option>
                                {model.cvGroups.map((group) => (
                                  <optgroup key={group.label} label={group.label}>
                                    {group.options.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </Field>
                            {pickedCv && (
                              <Field id={id("revision")} label={intl.formatMessage(messages.revision)}>
                                <select
                                  id={id("revision")}
                                  value={draft.revisionId}
                                  onChange={(event) => edit({ revisionId: event.target.value })}
                                  className={fieldClass}
                                >
                                  {pickedCv.revisions.map((revision) => (
                                    <option key={revision.id} value={revision.id}>
                                      {revision.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            )}
                          </>
                        )}
                        <Field id={id("notes")} label={label(messages.notes)} className="col-span-2">
                          <textarea
                            id={id("notes")}
                            rows={3}
                            maxLength={20_000}
                            value={draft.notes}
                            onChange={(event) => edit({ notes: event.target.value })}
                            className={`${controlClass} resize-none py-1.5`}
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                </SkeletonRegion>
              )}
            </div>
            <div className="border-line-subtle flex flex-wrap items-center gap-x-2 gap-y-2 border-t px-5 py-3">
              {connectivity.status === "offline" && model && (
                <p className="text-fg-secondary text-footnote flex basis-full items-center gap-1.5">
                  <CloudOff aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {intl.formatMessage(messages.offline)}
                </p>
              )}
              {connectivity.status !== "offline" && model && (
                <p className="text-fg-secondary text-footnote flex flex-1 items-center gap-1.5 whitespace-nowrap">
                  {intl.formatMessage(messages.keysHint, { keys: () => <Keycaps keys="Mod+Enter" /> })}
                </p>
              )}
              <div className="ml-auto flex shrink-0 gap-2">
                <Button variant="plain" onClick={requestClose} shortcut="Escape">
                  {intl.formatMessage(messages.cancel)}
                </Button>
                <Button disabledReason={notReadyReason} onClick={() => void submit(true)}>
                  {intl.formatMessage(messages.addAndOpen)}
                </Button>
                <Button type="submit" variant="primary" disabledReason={notReadyReason} shortcut="Mod+Enter">
                  {intl.formatMessage(messages.add)}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
      <AlertDialog.Root open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
          <AlertDialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg px-6 py-5">
            <AlertDialog.Title className="font-display text-title3">
              {intl.formatMessage(messages.discardTitle)}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-fg-secondary text-callout">
              {intl.formatMessage(messages.discardBody)}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2 pt-2">
              <AlertDialog.Cancel asChild>
                <Button>{intl.formatMessage(messages.keepEditing)}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="destructive" onClick={() => onClose(null)}>
                  {intl.formatMessage(messages.discard)}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Dialog.Root>
  );
}
