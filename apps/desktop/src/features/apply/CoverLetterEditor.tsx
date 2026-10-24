/**
 * Cover letter editor (BRIEF §4.4.2, research/apply.md "Cover letter step"; Employment Hero
 * variables, Xero template dropdown, folk "Save as template", Spark "Drafted from…" banner): the
 * letter in a plain text field with a toolbar of Template · Tone · Language, "Draft with AI"
 * (`coverLetterDraft`) or "Use template" (no AI), "Insert field", a word count and "Save as
 * template". Used by the email composer and the external-apply kit (the same session draft).
 *
 * `FieldsToFill` lists the merge fields still without a value (`fillMergeFields` → unresolved)
 * with an input each; they block sending until filled or removed from the text.
 */
import type { CoverLetterTone, MergeField, MergeValues } from "@bfhr/core";
import { BookmarkPlus, FileText, Sparkles, Undo2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsRepository } from "../../data/jobs/repository";
import { useConnectivity } from "../../shared/connectivity";
import { AiBadge, AiDisclosureLine } from "../../shared/ui/AiBadge";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { useToast } from "../../shared/ui/Toast";
import {
  type ApplyDraft,
  type ApplyInput,
  fieldLabel,
  languageName,
  LETTER_LANGUAGES,
  type LetterLanguage,
  letterTemplates,
  MERGE_FIELDS,
  toTemplateText,
  withTemplate,
} from "./model";
import { type TailorErrorKind, tailorErrorKind, tailorErrorSentence } from "./tailor/model";

const messages = defineMessages({
  letter: { id: "apply.letter.label", defaultMessage: "Cover letter" },
  toolbar: { id: "apply.letter.toolbar", defaultMessage: "Cover letter tools" },
  template: { id: "apply.letter.template", defaultMessage: "Template" },
  noTemplate: { id: "apply.letter.noTemplate", defaultMessage: "None: AI writes from scratch" },
  ownTemplates: { id: "apply.letter.ownTemplates", defaultMessage: "Your templates" },
  starterTemplates: { id: "apply.letter.starterTemplates", defaultMessage: "Starter templates" },
  templateOption: { id: "apply.letter.templateOption", defaultMessage: "{title} · {language}" },
  tone: { id: "apply.letter.tone", defaultMessage: "Tone" },
  formal: { id: "apply.letter.tone.formal", defaultMessage: "Formal" },
  warm: { id: "apply.letter.tone.warm", defaultMessage: "Warm" },
  concise: { id: "apply.letter.tone.concise", defaultMessage: "Concise" },
  language: { id: "apply.letter.language", defaultMessage: "Language" },
  draft: { id: "apply.letter.draft", defaultMessage: "Draft with AI" },
  drafting: { id: "apply.letter.drafting", defaultMessage: "Drafting…" },
  useTemplate: { id: "apply.letter.useTemplate", defaultMessage: "Use template" },
  useTemplateHint: {
    id: "apply.letter.useTemplateHint",
    defaultMessage: "Replaces the letter with the template, without AI",
  },
  noTemplateChosen: { id: "apply.letter.noTemplateChosen", defaultMessage: "Choose a template first." },
  noCv: { id: "apply.letter.noCv", defaultMessage: "Choose a CV first; the draft is based on it." },
  offline: { id: "apply.letter.offline", defaultMessage: "Drafting needs an internet connection." },
  drafted: {
    id: "apply.letter.drafted",
    defaultMessage: "Drafted from your CV and this job. Edit anything.",
  },
  droppedSentences: {
    id: "apply.letter.droppedSentences",
    defaultMessage:
      "{count, plural, one {# sentence was left out because your CV or the posting didn't back it up.} other {# sentences were left out because your CV or the posting didn't back them up.}}",
  },
  disclosure: {
    id: "apply.letter.disclosure",
    defaultMessage: "Suggested by Claude. Check names, numbers and dates before you use it.",
  },
  undoDraft: { id: "apply.letter.undoDraft", defaultMessage: "Undo" },
  insertField: { id: "apply.letter.insertField", defaultMessage: "Insert field…" },
  words: { id: "apply.letter.words", defaultMessage: "{count, plural, one {# word} other {# words}}" },
  saveTemplate: { id: "apply.letter.saveTemplate", defaultMessage: "Save as template" },
  templateName: { id: "apply.letter.templateName", defaultMessage: "Template name" },
  templateNameHint: {
    id: "apply.letter.templateNameHint",
    defaultMessage: "The company, role and your details become fields, so the template fits other jobs.",
  },
  saveTemplateConfirm: { id: "apply.letter.saveTemplateConfirm", defaultMessage: "Save template" },
  cancel: { id: "apply.letter.cancel", defaultMessage: "Cancel" },
  nameNeeded: { id: "apply.letter.nameNeeded", defaultMessage: "Give the template a name." },
  templateSaved: { id: "apply.letter.templateSaved", defaultMessage: "Saved “{name}” to your templates" },
  templateFailed: { id: "apply.letter.templateFailed", defaultMessage: "Couldn't save the template. Try again." },
  fieldsTitle: { id: "apply.fields.title", defaultMessage: "Fields to fill" },
  fieldsHint: {
    id: "apply.fields.hint",
    defaultMessage: "These fields have no value yet. Fill them in here, or remove them from the text.",
  },
});

const TONES: readonly CoverLetterTone[] = ["formal", "warm", "concise"];

/** Letter text the AI or a template replaced, for Undo. */
interface DraftBanner {
  readonly previous: string;
  readonly droppedSentences: number;
}

export function CoverLetterEditor({
  input,
  draft,
  values,
  revision,
  aiEnabled,
  onChange,
}: {
  readonly input: ApplyInput;
  readonly draft: ApplyDraft;
  readonly values: MergeValues;
  /** The CV version the AI draft is based on; null while none is chosen or loaded. */
  readonly revision: { readonly cvId: string; readonly revisionId: string } | null;
  readonly aiEnabled: boolean;
  readonly onChange: (patch: Partial<ApplyDraft>) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const repository = useJobsRepository();
  const online = useConnectivity().status !== "offline";
  const ids = { letter: useId(), template: useId(), language: useId(), insert: useId(), name: useId() };
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [banner, setBanner] = useState<DraftBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TailorErrorKind | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const templates = letterTemplates(input.coverLetters);
  const own = templates.filter((template) => !template.starter);
  const starters = templates.filter((template) => template.starter);
  const template = templates.find((candidate) => candidate.id === draft.letterTemplateId) ?? null;
  const words = draft.letter.trim() === "" ? 0 : draft.letter.trim().split(/\s+/u).length;

  const draftReason = !aiEnabled
    ? tailorErrorSentence("aiDisabled", intl)
    : revision === null
      ? intl.formatMessage(messages.noCv)
      : !online
        ? intl.formatMessage(messages.offline)
        : null;

  const draftWithAi = async () => {
    if (draftReason !== null || revision === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await repository.draftCoverLetter({
        cvId: revision.cvId,
        revisionId: revision.revisionId,
        jobId: input.job.id,
        tone: draft.letterTone,
        language: draft.letterLanguage,
        ...(draft.letterTemplateId !== null && { templateId: draft.letterTemplateId }),
      });
      setBanner({ previous: draft.letter, droppedSentences: response.droppedSentences });
      onChange({ letter: response.body, letterAuthor: "ai" });
    } catch (caught) {
      console.error("coverLetterDraft failed", caught);
      setError(tailorErrorKind(caught, online));
    } finally {
      setBusy(false);
    }
  };

  const insertField = (field: MergeField) => {
    const area = textRef.current;
    const token = `{${field}}`;
    const start = area?.selectionStart ?? draft.letter.length;
    const end = area?.selectionEnd ?? start;
    onChange({ letter: `${draft.letter.slice(0, start)}${token}${draft.letter.slice(end)}` });
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const saveTemplate = () => {
    const name = naming?.trim() ?? "";
    if (name === "") {
      setNameError(true);
      return;
    }
    const write = repository.saveCoverLetterTemplate({
      title: name.slice(0, 120),
      language: draft.letterLanguage,
      body: toTemplateText(draft.letter, values),
    });
    write.done.catch(() => toast.show({ variant: "info", message: intl.formatMessage(messages.templateFailed) }));
    onChange({ letterTemplateId: write.ids.coverLetterId });
    toast.show({ variant: "info", message: intl.formatMessage(messages.templateSaved, { name }) });
    setNaming(null);
  };

  const selectClass =
    "bg-surface-base border-line-control text-callout h-8 min-w-0 rounded-md border px-2";
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={intl.formatMessage(messages.toolbar)} className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.template} className="text-footnote text-fg-secondary font-medium">
            {intl.formatMessage(messages.template)}
          </label>
          <select
            id={ids.template}
            value={draft.letterTemplateId ?? ""}
            onChange={(event) => onChange({ letterTemplateId: event.target.value === "" ? null : event.target.value })}
            className={`${selectClass} max-w-64`}
          >
            <option value="">{intl.formatMessage(messages.noTemplate)}</option>
            {own.length > 0 && (
              <optgroup label={intl.formatMessage(messages.ownTemplates)}>
                {own.map((option) => (
                  <option key={option.id} value={option.id}>
                    {intl.formatMessage(messages.templateOption, {
                      title: option.title,
                      language: languageName(option.language, intl.locale),
                    })}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={intl.formatMessage(messages.starterTemplates)}>
              {starters.map((option) => (
                <option key={option.id} value={option.id}>
                  {intl.formatMessage(messages.templateOption, {
                    title: option.title,
                    language: languageName(option.language, intl.locale),
                  })}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-footnote text-fg-secondary font-medium" aria-hidden="true">
            {intl.formatMessage(messages.tone)}
          </span>
          <SegmentedControl
            size="sm"
            label={intl.formatMessage(messages.tone)}
            value={draft.letterTone}
            onValueChange={(letterTone) => onChange({ letterTone })}
            options={TONES.map((tone) => ({ value: tone, label: intl.formatMessage(messages[tone]) }))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.language} className="text-footnote text-fg-secondary font-medium">
            {intl.formatMessage(messages.language)}
          </label>
          <select
            id={ids.language}
            value={draft.letterLanguage}
            onChange={(event) => onChange({ letterLanguage: event.target.value as LetterLanguage })}
            className={selectClass}
          >
            {LETTER_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {languageName(language, intl.locale)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={Sparkles}
          loading={busy}
          loadingLabel={intl.formatMessage(messages.drafting)}
          disabledReason={draftReason}
          onClick={() => void draftWithAi()}
        >
          {intl.formatMessage(messages.draft)}
        </Button>
        <Button
          variant="plain"
          icon={FileText}
          hint={intl.formatMessage(messages.useTemplateHint)}
          disabledReason={template ? null : intl.formatMessage(messages.noTemplateChosen)}
          onClick={() => {
            if (!template) return;
            setBanner(null);
            onChange(withTemplate(draft, template, values));
          }}
        >
          {intl.formatMessage(messages.useTemplate)}
        </Button>
      </div>
      {error && (
        <InlineAlert tone={error === "aiDisabled" || error === "dailyCap" ? "info" : "error"} fromAction title={tailorErrorSentence(error, intl)} />
      )}
      {banner && draft.letterAuthor === "ai" && (
        <div className="bg-info-subtle flex flex-col gap-1.5 rounded-md p-3">
          <div className="flex flex-wrap items-center gap-2">
            <AiBadge />
            <p className="text-callout min-w-0 flex-1">{intl.formatMessage(messages.drafted)}</p>
            <Button
              size="sm"
              variant="plain"
              icon={Undo2}
              onClick={() => {
                onChange({ letter: banner.previous, letterAuthor: "user" });
                setBanner(null);
              }}
            >
              {intl.formatMessage(messages.undoDraft)}
            </Button>
          </div>
          {banner.droppedSentences > 0 && (
            <p className="text-fg-secondary text-footnote">
              {intl.formatMessage(messages.droppedSentences, { count: banner.droppedSentences })}
            </p>
          )}
          <AiDisclosureLine text={intl.formatMessage(messages.disclosure)} />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={ids.letter} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.letter)}
        </label>
        <textarea
          ref={textRef}
          id={ids.letter}
          rows={12}
          value={draft.letter}
          onChange={(event) => onChange({ letter: event.target.value })}
          className="bg-surface-base border-line-control text-callout text-fg-primary w-full min-w-0 resize-y rounded-md border px-2 py-1.5 leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={ids.insert} className="sr-only">
            {intl.formatMessage(messages.insertField)}
          </label>
          <select
            id={ids.insert}
            value=""
            onChange={(event) => {
              const field = MERGE_FIELDS.find((candidate) => candidate === event.target.value);
              if (field) insertField(field);
            }}
            className={`${selectClass} h-7 text-footnote`}
          >
            <option value="">{intl.formatMessage(messages.insertField)}</option>
            {MERGE_FIELDS.map((field) => (
              <option key={field} value={field}>
                {fieldLabel(field, intl)} · {`{${field}}`}
              </option>
            ))}
          </select>
          <span className="text-fg-tertiary text-footnote tabular-nums">{intl.formatMessage(messages.words, { count: words })}</span>
          <span className="flex-1" />
          {naming === null && (
            <Button size="sm" variant="plain" icon={BookmarkPlus} onClick={() => setNaming("")}>
              {intl.formatMessage(messages.saveTemplate)}
            </Button>
          )}
        </div>
      </div>
      {naming !== null && (
        <form
          className="border-line-subtle flex flex-col gap-2 rounded-md border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveTemplate();
          }}
        >
          <label htmlFor={ids.name} className="text-footnote text-fg-secondary font-medium">
            {intl.formatMessage(messages.templateName)}
          </label>
          <input
            id={ids.name}
            // The form opens on request: the name is the next thing to type.
            autoFocus
            value={naming}
            maxLength={120}
            aria-invalid={nameError || undefined}
            aria-describedby={`${ids.name}-hint`}
            onChange={(event) => {
              setNaming(event.target.value);
              setNameError(false);
            }}
            className="bg-surface-base border-line-control text-callout h-8 rounded-md border px-2 aria-invalid:border-danger-solid"
          />
          <p id={`${ids.name}-hint`} className="text-fg-tertiary text-footnote">
            {nameError ? intl.formatMessage(messages.nameNeeded) : intl.formatMessage(messages.templateNameHint)}
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="secondary">
              {intl.formatMessage(messages.saveTemplateConfirm)}
            </Button>
            <Button size="sm" variant="plain" onClick={() => setNaming(null)}>
              {intl.formatMessage(messages.cancel)}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Merge fields still without a value, each with an input (their values fill every `{token}`). */
export function FieldsToFill({
  fields,
  draft,
  onChange,
}: {
  readonly fields: readonly MergeField[];
  readonly draft: Pick<ApplyDraft, "fieldValues">;
  readonly onChange: (patch: Partial<ApplyDraft>) => void;
}) {
  const intl = useIntl();
  const baseId = useId();
  // Keep a field listed while the user types its value (it resolves with the first character).
  const typed = Object.keys(draft.fieldValues) as MergeField[];
  const shown = MERGE_FIELDS.filter((field) => fields.includes(field) || typed.includes(field));
  if (shown.length === 0) return null;
  return (
    <fieldset className="border-line-subtle flex flex-col gap-2 rounded-md border p-3">
      <legend className="text-footnote text-fg-secondary px-1 font-medium">{intl.formatMessage(messages.fieldsTitle)}</legend>
      <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.fieldsHint)}</p>
      {shown.map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <label htmlFor={`${baseId}-${field}`} className="text-footnote text-fg-secondary font-medium">
            {fieldLabel(field, intl)} <span className="text-fg-tertiary font-normal">{`{${field}}`}</span>
          </label>
          <input
            id={`${baseId}-${field}`}
            value={draft.fieldValues[field] ?? ""}
            aria-invalid={fields.includes(field) || undefined}
            onChange={(event) => onChange({ fieldValues: { ...draft.fieldValues, [field]: event.target.value } })}
            className="bg-surface-base border-line-control text-callout h-8 rounded-md border px-2"
          />
        </div>
      ))}
    </fieldset>
  );
}
