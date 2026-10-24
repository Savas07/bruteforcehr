/**
 * Settings › Job preferences: the onboarding preferences editor (`JobPreferencesForm`) on the
 * saved profile. Changes autosave per section when they are finished (a token added, a chip
 * toggled, a field left), with the quiet "Saved" next to the section that changed.
 */
import { useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useSaver } from "../save";
import { type SettingsProfile, useSettingsStore } from "../store";
import { JobPreferencesForm, type PreferenceChange } from "./JobPreferencesForm";
import { draftFromProfile, type PreferenceSection, sectionPatch, validName } from "./model";

const messages = defineMessages({
  intro: {
    id: "settings.jobPreferences.intro",
    defaultMessage:
      "We use these to score jobs and to decide which new ones are worth an alert. Changes save as you go.",
  },
  nameMissing: {
    id: "settings.jobPreferences.nameMissing",
    defaultMessage: "Enter your name. We kept the one you had.",
  },
});

export function JobPreferencesPane({ profile }: { readonly profile: SettingsProfile }) {
  const intl = useIntl();
  const store = useSettingsStore();
  const saver = useSaver();
  const [draft, setDraft] = useState(() =>
    draftFromProfile({ fullName: profile.fullName, ...profile.preferences }, intl.locale),
  );
  const [lastSection, setLastSection] = useState<PreferenceSection | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const onChange: PreferenceChange = (next, section, commit) => {
    setDraft(next);
    if (!commit) return;
    setLastSection(section);
    if (section !== "name") {
      saver.save(() => store.updateProfile({ preferences: sectionPatch(section, next) }));
      return;
    }
    const name = validName(next.fullName);
    if (name === null) {
      setNameError(intl.formatMessage(messages.nameMissing));
      return;
    }
    setNameError(null);
    if (name !== profile.fullName) saver.save(() => store.updateProfile({ fullName: name }));
  };

  return (
    <div className="flex flex-col gap-4 pt-2">
      <p className="text-callout text-fg-secondary max-w-160">{intl.formatMessage(messages.intro)}</p>
      <JobPreferencesForm
        draft={draft}
        onChange={onChange}
        showName
        nameError={nameError}
        status={lastSection === null ? null : { section: lastSection, node: saver.status }}
      />
    </div>
  );
}
