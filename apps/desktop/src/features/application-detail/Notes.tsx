/**
 * The application's free-text notes (`notes`), separate from the dated timeline notes: saved when
 * the field loses focus and with Mod+S, without a toast (the line under the field says it).
 */
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Section, TextArea } from "./fields";

const messages = defineMessages({
  title: { id: "application-detail.notes.title", defaultMessage: "Notes" },
  label: { id: "application-detail.notes.label", defaultMessage: "Notes about this application" },
  placeholder: {
    id: "application-detail.notes.placeholder",
    defaultMessage: "Salary range, team, questions to ask, anything worth keeping",
  },
  saved: { id: "application-detail.notes.saved", defaultMessage: "Saved" },
  waiting: {
    id: "application-detail.notes.waiting",
    defaultMessage: "Saved on this device · waiting to sync",
  },
  unsaved: {
    id: "application-detail.notes.unsaved",
    defaultMessage: "Not saved yet · saves when you leave the field",
  },
  keySave: { id: "application-detail.notes.keySave", defaultMessage: "Save notes" },
});

export function NotesSection({
  text,
  pendingSync,
  group,
  onSave,
}: {
  text: string;
  pendingSync: boolean;
  /** Shortcuts-sheet group of the screen. */
  group: string;
  onSave: (notes: string) => void;
}) {
  const intl = useIntl();
  const statusId = useId();
  // `base` is the saved text the draft started from: a change from elsewhere replaces a clean
  // draft, and our own save is recognised when the saved text catches up with the draft.
  const [state, setState] = useState({ base: text, draft: text });
  if (text !== state.base && (state.draft === state.base || state.draft === text))
    setState({ base: text, draft: state.draft === state.base ? text : state.draft });
  const dirty = state.draft !== text;
  const save = () => {
    if (dirty) onSave(state.draft);
  };
  useKeyBindings([
    {
      id: "applicationDetail.saveNotes",
      keys: "Mod+S",
      label: intl.formatMessage(messages.keySave),
      group,
      run: save,
    },
  ]);
  return (
    <Section title={intl.formatMessage(messages.title)}>
      <TextArea
        rows={5}
        maxLength={20_000}
        value={state.draft}
        aria-label={intl.formatMessage(messages.label)}
        aria-describedby={statusId}
        placeholder={intl.formatMessage(messages.placeholder)}
        onChange={(event) => setState((previous) => ({ ...previous, draft: event.target.value }))}
        onBlur={save}
      />
      <p id={statusId} aria-live="polite" className="text-footnote text-fg-tertiary">
        {dirty
          ? intl.formatMessage(messages.unsaved)
          : text === ""
            ? ""
            : intl.formatMessage(pendingSync ? messages.waiting : messages.saved)}
      </p>
    </Section>
  );
}
