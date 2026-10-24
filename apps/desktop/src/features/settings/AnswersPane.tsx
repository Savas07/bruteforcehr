/**
 * Settings › Application answers (BRIEF §4.4.3, research/apply.md "Answers library management";
 * Superhuman snippets list + detail, Plain groups, WRITER tags): `users/{uid}/answers`, the rows
 * the external-apply kit copies. A grouped list on the left (Work authorization, Availability,
 * Compensation, Links, Q&A; each row with its first value and its tags), the selected answer's
 * editor on the right: kind, label, a text per language (EN/TR/DE), the countries it is for and,
 * for salary expectations, the currency. Move up / down orders a kind; Delete has Undo.
 */
import { ANSWER_KINDS, ANSWER_LABEL_MAX, ANSWER_TEXT_MAX, type Answer, type AnswerKind } from "@bfhr/core";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useSearch } from "@tanstack/react-router";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useJobsData } from "../../data/jobs/live";
import { useJobsRepository } from "../../data/jobs/repository";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { useToast } from "../../shared/ui/Toast";
import { answerKindMessages } from "../apply/kit";
import {
  ANSWER_CURRENCIES,
  ANSWER_LANGUAGES,
  type AnswerForm,
  type AnswerFormError,
  answerForm,
  answerInput,
  moveAnswer,
  nextPosition,
  sortedAnswers,
} from "./answers";
import { SettingsSection } from "./ui";

const messages = defineMessages({
  title: { id: "settings.answers.title", defaultMessage: "Answers you give often" },
  description: {
    id: "settings.answers.description",
    defaultMessage:
      "Application forms ask the same questions. Save your answers once; the application kit shows the ones that fit each job's country, currency and language, ready to copy.",
  },
  add: { id: "settings.answers.add", defaultMessage: "Add answer" },
  loading: { id: "settings.answers.loading", defaultMessage: "Loading your answers" },
  errorTitle: { id: "settings.answers.errorTitle", defaultMessage: "We couldn't load your answers" },
  errorBody: { id: "settings.answers.errorBody", defaultMessage: "Nothing changed. Try again in a moment." },
  emptyTitle: { id: "settings.answers.emptyTitle", defaultMessage: "No answers yet" },
  emptyBody: {
    id: "settings.answers.emptyBody",
    defaultMessage: "Start with your notice period, your salary expectation and your LinkedIn or portfolio link.",
  },
  list: { id: "settings.answers.list", defaultMessage: "Your answers" },
  everywhere: { id: "settings.answers.everywhere", defaultMessage: "Any country" },
  newAnswer: { id: "settings.answers.newAnswer", defaultMessage: "New answer" },
  editTitle: { id: "settings.answers.editTitle", defaultMessage: "Edit answer" },
  kind: { id: "settings.answers.kind", defaultMessage: "Group" },
  label: { id: "settings.answers.label", defaultMessage: "Question or label" },
  labelHint: {
    id: "settings.answers.labelHint",
    defaultMessage: "As the form asks it, e.g. “Notice period” or “Why do you want to work here?”",
  },
  values: { id: "settings.answers.values", defaultMessage: "Answer" },
  valuesHint: {
    id: "settings.answers.valuesHint",
    defaultMessage: "Fill in the languages you apply in. The kit uses the job's language, else your app language.",
  },
  countries: { id: "settings.answers.countries", defaultMessage: "Countries" },
  countriesHint: {
    id: "settings.answers.countriesHint",
    defaultMessage: "Country codes such as DE, NL, TR, or EU for the EU, EEA and Switzerland. Leave empty for every country.",
  },
  currency: { id: "settings.answers.currency", defaultMessage: "Currency" },
  anyCurrency: { id: "settings.answers.anyCurrency", defaultMessage: "Any posting" },
  currencyHint: {
    id: "settings.answers.currencyHint",
    defaultMessage: "Shown only for postings in this currency, or with no salary given.",
  },
  save: { id: "settings.answers.save", defaultMessage: "Save answer" },
  cancel: { id: "settings.answers.cancel", defaultMessage: "Cancel" },
  delete: { id: "settings.answers.delete", defaultMessage: "Delete" },
  moveUp: { id: "settings.answers.moveUp", defaultMessage: "Move up" },
  moveDown: { id: "settings.answers.moveDown", defaultMessage: "Move down" },
  first: { id: "settings.answers.first", defaultMessage: "Already first in its group." },
  last: { id: "settings.answers.last", defaultMessage: "Already last in its group." },
  saved: { id: "settings.answers.saved", defaultMessage: "Saved “{label}”" },
  deleted: { id: "settings.answers.deleted", defaultMessage: "Deleted “{label}”" },
  undo: { id: "settings.answers.undo", defaultMessage: "Undo" },
  failed: { id: "settings.answers.failed", defaultMessage: "Couldn't save your answers. Check your connection and try again." },
  errorLabel: { id: "settings.answers.error.label", defaultMessage: "Add the question or label." },
  errorValues: { id: "settings.answers.error.values", defaultMessage: "Write the answer in at least one language." },
  errorCountries: {
    id: "settings.answers.error.countries",
    defaultMessage: "Use two-letter country codes such as DE or TR, or EU, separated by commas.",
  },
  errorTooManyCountries: { id: "settings.answers.error.tooManyCountries", defaultMessage: "Use at most 30 countries." },
});

const languageMessages = defineMessages({
  en: { id: "settings.answers.language.en", defaultMessage: "English" },
  tr: { id: "settings.answers.language.tr", defaultMessage: "Turkish" },
  de: { id: "settings.answers.language.de", defaultMessage: "German" },
});

const errorMessages: Readonly<Record<AnswerFormError, (typeof messages)[keyof typeof messages]>> = {
  label: messages.errorLabel,
  values: messages.errorValues,
  countries: messages.errorCountries,
  tooManyCountries: messages.errorTooManyCountries,
};

/** `null`: nothing selected; `"new"`: the form for a new answer. */
type Selection = string | "new" | null;

export function AnswersPane() {
  const intl = useIntl();
  const jobs = useJobsData();
  // `?answer=<id>` opens that answer (links from the kit, critique captures).
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const [selected, setSelected] = useState<Selection>(typeof search["answer"] === "string" ? search["answer"] : null);
  const add = (
    <Button icon={Plus} onClick={() => setSelected("new")}>
      {intl.formatMessage(messages.add)}
    </Button>
  );
  if (jobs.status === "loading")
    return (
      <SkeletonRegion
        loading
        label={intl.formatMessage(messages.loading)}
        skeleton={<SkeletonBlock className="mt-4 h-64 w-full rounded-lg" />}
      >
        {null}
      </SkeletonRegion>
    );
  if (jobs.status === "error")
    return (
      <PaneError
        title={intl.formatMessage(messages.errorTitle)}
        body={intl.formatMessage(messages.errorBody)}
        onRetry={jobs.retry}
      />
    );
  const answers = sortedAnswers(jobs.data.answers);
  const current = answers.find((answer) => answer.id === selected) ?? null;
  const editing = selected === "new" || current !== null;
  return (
    <SettingsSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      actions={add}
    >
      {answers.length === 0 && !editing ? (
        <EmptyState
          kind="subArea"
          title={intl.formatMessage(messages.emptyTitle)}
          body={intl.formatMessage(messages.emptyBody)}
          primary={{ label: intl.formatMessage(messages.add), onClick: () => setSelected("new") }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <AnswerList answers={answers} selectedId={current?.id ?? null} onSelect={setSelected} />
          {editing ? (
            <AnswerEditor
              key={current?.id ?? "new"}
              answer={current}
              answers={answers}
              onDone={(id) => setSelected(id)}
            />
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}

function AnswerList({
  answers,
  selectedId,
  onSelect,
}: {
  answers: readonly Answer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const intl = useIntl();
  const listId = useId();
  return (
    <nav aria-labelledby={listId} className="flex min-w-0 flex-col gap-3">
      <h3 id={listId} className="sr-only">
        {intl.formatMessage(messages.list)}
      </h3>
      {ANSWER_KINDS.map((kind) => {
        const rows = answers.filter((answer) => answer.kind === kind);
        if (rows.length === 0) return null;
        return (
          <div key={kind} className="flex flex-col gap-1">
            <h4 className="text-footnote text-fg-secondary font-semibold">{intl.formatMessage(answerKindMessages[kind])}</h4>
            <ul className="flex flex-col gap-1">
              {rows.map((answer) => {
                const tags = [
                  ...(answer.countries.length === 0 ? [intl.formatMessage(messages.everywhere)] : answer.countries),
                  ...(answer.currency ? [answer.currency] : []),
                  answer.values.map((value) => value.language.toUpperCase()).join("/"),
                ];
                return (
                  <li key={answer.id}>
                    <button
                      type="button"
                      aria-current={answer.id === selectedId || undefined}
                      onClick={() => onSelect(answer.id)}
                      className={cx(
                        "hover:bg-surface-hover flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left",
                        answer.id === selectedId && "bg-surface-selected",
                      )}
                    >
                      <span className="text-callout w-full truncate font-medium">{answer.label}</span>
                      <span className="text-fg-secondary text-footnote line-clamp-1 w-full">{answer.values[0]?.text}</span>
                      <span className="text-fg-tertiary text-caption1">{tags.join(" · ")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function AnswerEditor({
  answer,
  answers,
  onDone,
}: {
  answer: Answer | null;
  answers: readonly Answer[];
  onDone: (id: string | null) => void;
}) {
  const intl = useIntl();
  const toast = useToast();
  const repository = useJobsRepository();
  const [form, setForm] = useState<AnswerForm>(() => answerForm(answer));
  const [error, setError] = useState<AnswerFormError | null>(null);
  const ids = { title: useId(), kind: useId(), label: useId(), countries: useId(), currency: useId(), values: useId(), error: useId() };
  const set = (patch: Partial<AnswerForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const failed = () => toast.show({ variant: "info", message: intl.formatMessage(messages.failed) });

  const save = () => {
    const position =
      answer && answer.kind === form.kind ? answer.position : nextPosition(answers, form.kind);
    const result = answerInput(form, answer, position);
    if ("error" in result) {
      setError(result.error);
      document.getElementById(result.error === "label" ? ids.label : result.error === "values" ? `${ids.values}-en` : ids.countries)?.focus();
      return;
    }
    const write = repository.saveAnswer(result.input, answer);
    write.done.catch(failed);
    toast.show({ variant: "info", message: intl.formatMessage(messages.saved, { label: result.input.label }) });
    onDone(write.ids.answerId);
  };

  const remove = () => {
    if (!answer) return;
    repository.deleteAnswer(answer.id).done.catch(failed);
    onDone(null);
    toast.show({
      message: intl.formatMessage(messages.deleted, { label: answer.label }),
      action: { label: intl.formatMessage(messages.undo), run: () => void repository.restoreAnswer(answer).done.catch(failed) },
    });
  };

  const move = (step: -1 | 1) => {
    if (!answer) return;
    const positions = moveAnswer(answers, answer.id, step);
    if (positions.length > 0) repository.reorderAnswers(positions).done.catch(failed);
  };
  const siblings = answer ? answers.filter((candidate) => candidate.kind === answer.kind) : [];
  const index = answer ? siblings.findIndex((candidate) => candidate.id === answer.id) : -1;

  const input = "bg-surface-base border-line-control text-callout h-8 w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid";
  return (
    <form
      aria-labelledby={ids.title}
      className="border-line-subtle flex min-w-0 flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={ids.title} className="text-headline min-w-0 flex-1">
          {intl.formatMessage(answer ? messages.editTitle : messages.newAnswer)}
        </h3>
        {answer && (
          <>
            <Button
              size="sm"
              variant="plain"
              icon={ArrowUp}
              disabledReason={index <= 0 ? intl.formatMessage(messages.first) : null}
              onClick={() => move(-1)}
            >
              {intl.formatMessage(messages.moveUp)}
            </Button>
            <Button
              size="sm"
              variant="plain"
              icon={ArrowDown}
              disabledReason={index >= siblings.length - 1 ? intl.formatMessage(messages.last) : null}
              onClick={() => move(1)}
            >
              {intl.formatMessage(messages.moveDown)}
            </Button>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.kind} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.kind)}
        </label>
        <select
          id={ids.kind}
          value={form.kind}
          onChange={(event) => set({ kind: event.target.value as AnswerKind })}
          className={input}
        >
          {ANSWER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {intl.formatMessage(answerKindMessages[kind])}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.label} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.label)}
        </label>
        <input
          id={ids.label}
          value={form.label}
          maxLength={ANSWER_LABEL_MAX}
          aria-invalid={error === "label" || undefined}
          aria-describedby={`${ids.label}-hint${error === "label" ? ` ${ids.error}` : ""}`}
          onChange={(event) => set({ label: event.target.value })}
          className={input}
        />
        <p id={`${ids.label}-hint`} className="text-fg-tertiary text-footnote">
          {intl.formatMessage(messages.labelHint)}
        </p>
      </div>
      <fieldset className="flex flex-col gap-2" aria-describedby={`${ids.values}-hint`}>
        <legend className="text-footnote text-fg-secondary mb-1 font-medium">{intl.formatMessage(messages.values)}</legend>
        <p id={`${ids.values}-hint`} className="text-fg-tertiary text-footnote -mt-1">
          {intl.formatMessage(messages.valuesHint)}
        </p>
        {ANSWER_LANGUAGES.map((language) => (
          <div key={language} className="flex flex-col gap-1">
            <label htmlFor={`${ids.values}-${language}`} className="text-footnote text-fg-secondary">
              {intl.formatMessage(languageMessages[language])}
            </label>
            <textarea
              id={`${ids.values}-${language}`}
              lang={language}
              rows={form.kind === "qa" ? 4 : 2}
              value={form.values[language]}
              maxLength={ANSWER_TEXT_MAX}
              aria-invalid={error === "values" || undefined}
              onChange={(event) => set({ values: { ...form.values, [language]: event.target.value } })}
              className="bg-surface-base border-line-control text-callout w-full min-w-0 resize-y rounded-md border px-2 py-1.5 leading-relaxed aria-invalid:border-danger-solid"
            />
          </div>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.countries} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.countries)}
        </label>
        <input
          id={ids.countries}
          value={form.countries}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error === "countries" || error === "tooManyCountries" || undefined}
          aria-describedby={`${ids.countries}-hint`}
          onChange={(event) => set({ countries: event.target.value })}
          className={input}
        />
        <p id={`${ids.countries}-hint`} className="text-fg-tertiary text-footnote">
          {intl.formatMessage(messages.countriesHint)}
        </p>
      </div>
      {form.kind === "salary_expectation" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.currency} className="text-footnote text-fg-secondary font-medium">
            {intl.formatMessage(messages.currency)}
          </label>
          <select
            id={ids.currency}
            value={form.currency}
            aria-describedby={`${ids.currency}-hint`}
            onChange={(event) => set({ currency: event.target.value })}
            className={input}
          >
            <option value="">{intl.formatMessage(messages.anyCurrency)}</option>
            {ANSWER_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <p id={`${ids.currency}-hint`} className="text-fg-tertiary text-footnote">
            {intl.formatMessage(messages.currencyHint)}
          </p>
        </div>
      )}
      <p id={ids.error} role="alert" className="text-danger-text text-footnote empty:hidden">
        {error ? intl.formatMessage(errorMessages[error]) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary">
          {intl.formatMessage(messages.save)}
        </Button>
        <Button
          onClick={() => {
            if (!answer) {
              onDone(null);
              return;
            }
            setForm(answerForm(answer));
            setError(null);
          }}
        >
          {intl.formatMessage(messages.cancel)}
        </Button>
        <span className="flex-1" />
        {answer && (
          <Button variant="destructive" icon={Trash2} onClick={remove}>
            {intl.formatMessage(messages.delete)}
          </Button>
        )}
      </div>
    </form>
  );
}
