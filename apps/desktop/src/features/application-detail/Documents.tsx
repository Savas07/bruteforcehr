/**
 * Documents used (BRIEF §4.6, apply.md "After applying"): the CV and revision the application
 * pinned, linking to the CV editor, and the cover letter. The pins record what was sent, so once
 * applied they are read-only (ADR 0002: write-once); before that the user can pick a CV and one
 * of its revisions. Revision dates come from `watchCvRevisions`.
 */
import type { CvRevision } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Lock, Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { type ModelBuilder, useTrackerModel } from "../../data/tracker/model";
import { type Lookup, useTrackerRepository } from "../../data/tracker/repository";
import { Button } from "../../shared/ui/Button";
import { Hint } from "../../shared/ui/Hint";
import { Field, FormDialog, Section, Select } from "./fields";
import { cvRevisionOptions, type CvRevisionOptionVM, type DocumentsVM } from "./model";
import type { DetailActions } from "./useDetailActions";

const messages = defineMessages({
  title: { id: "application-detail.documents.title", defaultMessage: "Documents used" },
  cv: { id: "application-detail.documents.cv", defaultMessage: "CV" },
  coverLetter: { id: "application-detail.documents.coverLetter", defaultMessage: "Cover letter" },
  archived: {
    id: "application-detail.documents.archived",
    defaultMessage: "{title} (archived)",
    description: "A CV that was archived after it was used",
  },
  openCv: { id: "application-detail.documents.openCv", defaultMessage: "Open {title} in CVs" },
  noCv: {
    id: "application-detail.documents.noCv",
    defaultMessage: "No CV recorded. Record the one you sent, so you can see later what they read.",
  },
  noCvLocked: {
    id: "application-detail.documents.noCvLocked",
    defaultMessage: "No CV was recorded when you applied.",
  },
  noLetter: { id: "application-detail.documents.noLetter", defaultMessage: "No cover letter" },
  choose: { id: "application-detail.documents.choose", defaultMessage: "Choose CV" },
  change: { id: "application-detail.documents.change", defaultMessage: "Change CV" },
  dialogTitle: { id: "application-detail.documents.dialogTitle", defaultMessage: "CV for this application" },
  dialogBody: {
    id: "application-detail.documents.dialogBody",
    defaultMessage: "Pick the CV and the version you send. After you apply, it stays as recorded.",
  },
  dialogBodyApplied: {
    id: "application-detail.documents.dialogBodyApplied",
    defaultMessage: "Pick the CV and the version you sent. It can't change once recorded.",
  },
  version: { id: "application-detail.documents.version", defaultMessage: "Version" },
  loadingVersions: {
    id: "application-detail.documents.loadingVersions",
    defaultMessage: "Loading versions…",
  },
  save: { id: "application-detail.documents.save", defaultMessage: "Record CV" },
  pickCv: { id: "application-detail.documents.pickCv", defaultMessage: "Choose a CV first." },
  pickVersion: { id: "application-detail.documents.pickVersion", defaultMessage: "Choose a version first." },
  noCvs: {
    id: "application-detail.documents.noCvs",
    defaultMessage: "You have no CVs yet. Create one in CVs, then record it here.",
  },
});

/** A CV's revisions as picker options (live; none until a CV is chosen). */
function useRevisionOptions(
  cvId: string | null,
  currentRevisionId: string | null,
): readonly CvRevisionOptionVM[] | null {
  const repository = useTrackerRepository();
  const [lookup, setLookup] = useState<{ cvId: string; revisions: Lookup<readonly CvRevision[]> } | null>(
    null,
  );
  useEffect(() => {
    if (cvId === null) return;
    return repository.watchCvRevisions(cvId, (revisions) => setLookup({ cvId, revisions }));
  }, [repository, cvId]);
  // Dates are worded with the app's clock, locale and zone, like every model.
  const build: ModelBuilder<readonly CvRevisionOptionVM[] | null> = useCallback(
    (_data, ctx) =>
      lookup !== null && lookup.cvId === cvId && lookup.revisions.status === "ready"
        ? cvRevisionOptions(lookup.revisions.value ?? [], currentRevisionId, ctx)
        : null,
    [lookup, cvId, currentRevisionId],
  );
  const model = useTrackerModel(build, {});
  return model.status === "ready" ? model.data : null;
}

export function DocumentsSection({
  applicationId,
  documents,
  applied,
  actions,
}: {
  applicationId: string;
  documents: DocumentsVM;
  /** The application has been sent (pins set now stay). */
  applied: boolean;
  actions: DetailActions;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { cv, coverLetter, lockedReason } = documents;
  const pinnedOptions = useRevisionOptions(cv?.id ?? null, null);
  const pinnedRevision = pinnedOptions?.find((option) => option.id === cv?.revisionId)?.label ?? null;
  const cvName = cv
    ? cv.archived
      ? intl.formatMessage(messages.archived, { title: cv.title })
      : cv.title
    : null;

  return (
    <Section
      title={intl.formatMessage(messages.title)}
      actions={
        lockedReason === null && documents.cvChoices.length > 0 ? (
          <Button size="sm" variant="plain" onClick={() => setEditing(true)}>
            {intl.formatMessage(cv ? messages.change : messages.choose)}
          </Button>
        ) : undefined
      }
    >
      <dl className="flex flex-col gap-3">
        <div className="flex flex-col">
          <dt className="text-footnote text-fg-secondary flex items-center gap-1.5">
            <FileText aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
            {intl.formatMessage(messages.cv)}
          </dt>
          <dd className="text-callout ps-5.5">
            {cv && cvName ? (
              <>
                <Hint label={intl.formatMessage(messages.openCv, { title: cv.title })}>
                  <button
                    type="button"
                    className="text-accent-text min-h-6 rounded-xs text-start text-pretty hover:underline"
                    onClick={() => void navigate({ to: "/cvs/$cvId", params: { cvId: cv.id } })}
                  >
                    {cvName}
                  </button>
                </Hint>
                {pinnedRevision !== null && (
                  <span className="text-fg-secondary text-footnote block">{pinnedRevision}</span>
                )}
              </>
            ) : (
              <span className="text-fg-secondary">
                {intl.formatMessage(lockedReason === null ? messages.noCv : messages.noCvLocked)}
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-footnote text-fg-secondary flex items-center gap-1.5">
            <Mail aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
            {intl.formatMessage(messages.coverLetter)}
          </dt>
          <dd className={coverLetter ? "text-callout ps-5.5" : "text-callout text-fg-secondary ps-5.5"}>
            {coverLetter?.title ?? intl.formatMessage(messages.noLetter)}
          </dd>
        </div>
      </dl>
      {lockedReason !== null && (
        <p className="text-fg-secondary text-footnote flex items-start gap-1.5">
          <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
          {lockedReason}
        </p>
      )}
      {lockedReason === null && documents.cvChoices.length === 0 && cv === null && (
        <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.noCvs)}</p>
      )}
      {editing && (
        <PinDialog
          documents={documents}
          applied={applied}
          onClose={() => setEditing(false)}
          onSave={(cvId, cvRevisionId) => {
            setEditing(false);
            actions.pinCv(
              applicationId,
              { cvId, cvRevisionId },
              // Before applying the previous pin can come back; after, the rules keep the new one.
              applied ? null : { cvId: cv?.id ?? null, cvRevisionId: cv?.revisionId ?? null },
            );
          }}
        />
      )}
    </Section>
  );
}

function PinDialog({
  documents,
  applied,
  onClose,
  onSave,
}: {
  documents: DocumentsVM;
  applied: boolean;
  onClose: () => void;
  onSave: (cvId: string, cvRevisionId: string) => void;
}) {
  const intl = useIntl();
  const [cvId, setCvId] = useState(documents.cv?.id ?? documents.cvChoices[0]?.id ?? "");
  const choice = documents.cvChoices.find((candidate) => candidate.id === cvId) ?? null;
  const options = useRevisionOptions(choice?.id ?? null, choice?.currentRevisionId ?? null);
  const [picked, setPicked] = useState<{ cvId: string; revisionId: string } | null>(
    documents.cv?.revisionId ? { cvId: documents.cv.id, revisionId: documents.cv.revisionId } : null,
  );
  // The version follows the CV: its pinned or latest revision until the user picks another.
  const revisionId = picked?.cvId === cvId ? picked.revisionId : (choice?.currentRevisionId ?? "");
  const disabledReason =
    choice === null
      ? intl.formatMessage(messages.pickCv)
      : revisionId === ""
        ? intl.formatMessage(messages.pickVersion)
        : null;
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={intl.formatMessage(messages.dialogTitle)}
      description={intl.formatMessage(applied ? messages.dialogBodyApplied : messages.dialogBody)}
      submitLabel={intl.formatMessage(messages.save)}
      submitDisabledReason={disabledReason}
      onSubmit={() => onSave(cvId, revisionId)}
    >
      <Field label={intl.formatMessage(messages.cv)}>
        <Select value={cvId} onChange={(event) => setCvId(event.target.value)}>
          {documents.cvChoices.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={intl.formatMessage(messages.version)}
        hint={options === null ? intl.formatMessage(messages.loadingVersions) : null}
      >
        <Select
          value={revisionId}
          disabled={options === null}
          onChange={(event) => setPicked({ cvId, revisionId: event.target.value })}
        >
          {(options ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </FormDialog>
  );
}
