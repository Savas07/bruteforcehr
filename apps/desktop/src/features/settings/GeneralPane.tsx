/**
 * Settings › General: language (this computer's choice, also saved to the profile so pushes to
 * the phone use it), appearance (this computer) and updates (status, check, Stable/Beta channel;
 * src-tauri/src/updater.rs keeps the channel per install).
 */
import { CircleAlert, CircleArrowUp, CircleCheck, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useShellUpdateController } from "../../components/updates/useUpdateController";
import { useUpdates } from "../../components/updates/context";
import { chrome, type UpdateChannel } from "../../lib/desktop";
import {
  type AppearancePreference,
  type LanguagePreference,
  setDevicePreferences,
  useDevicePreferences,
} from "../../lib/preferences";
import { Button } from "../../shared/ui/Button";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { useSaver } from "./save";
import { useSettingsStore } from "./store";
import { SettingsRow, SettingsSection } from "./ui";

const messages = defineMessages({
  languageTitle: { id: "settings.general.languageTitle", defaultMessage: "Language and look" },
  language: { id: "settings.general.language", defaultMessage: "Language" },
  languageHelp: {
    id: "settings.general.languageHelp",
    defaultMessage: "For the app and for notifications on your phone.",
  },
  languageSystem: { id: "settings.general.languageSystem", defaultMessage: "Same as this computer" },
  appearance: { id: "settings.general.appearance", defaultMessage: "Appearance" },
  appearanceHelp: { id: "settings.general.appearanceHelp", defaultMessage: "On this computer." },
  appearanceSystem: { id: "settings.general.appearanceSystem", defaultMessage: "System" },
  appearanceLight: { id: "settings.general.appearanceLight", defaultMessage: "Light" },
  appearanceDark: { id: "settings.general.appearanceDark", defaultMessage: "Dark" },
  updatesTitle: { id: "settings.general.updatesTitle", defaultMessage: "Updates" },
  version: { id: "settings.general.version", defaultMessage: "BruteForceHR {version}" },
  idle: { id: "settings.general.idle", defaultMessage: "We check for updates every few hours." },
  checking: { id: "settings.general.checking", defaultMessage: "Checking for updates…" },
  upToDate: { id: "settings.general.upToDate", defaultMessage: "Up to date" },
  downloading: { id: "settings.general.downloading", defaultMessage: "Downloading {version}…" },
  ready: { id: "settings.general.ready", defaultMessage: "{version} is ready to install" },
  failed: { id: "settings.general.failed", defaultMessage: "The last update check didn't work. Try again later." },
  check: { id: "settings.general.check", defaultMessage: "Check for updates" },
  restart: { id: "settings.general.restart", defaultMessage: "Restart to update" },
  channel: { id: "settings.general.channel", defaultMessage: "Update channel" },
  channelStable: { id: "settings.general.channelStable", defaultMessage: "Stable" },
  channelBeta: { id: "settings.general.channelBeta", defaultMessage: "Beta" },
  channelHelpStable: { id: "settings.general.channelHelpStable", defaultMessage: "Tested versions. Recommended." },
  channelHelpBeta: {
    id: "settings.general.channelHelpBeta",
    defaultMessage: "Get new versions first. They might have rough edges. Please report what you find.",
  },
  channelBackToStable: {
    id: "settings.general.channelBackToStable",
    defaultMessage: "You'll move to the next stable version once it's newer than the beta you have.",
  },
});

const LANGUAGE_NAMES: Readonly<Record<Exclude<LanguagePreference, "system">, string>> = {
  en: "English",
  tr: "Türkçe",
  de: "Deutsch",
};

export function GeneralPane() {
  const intl = useIntl();
  const store = useSettingsStore();
  const device = useDevicePreferences();
  const languageSaver = useSaver();
  const channelSaver = useSaver();
  const updates = useUpdates();
  const controller = useShellUpdateController();
  const id = useId();
  const [movedToStable, setMovedToStable] = useState(false);
  const { status, channel } = updates.snapshot;

  const setLanguage = (language: LanguagePreference) => {
    setDevicePreferences({ language });
    if (language !== "system") languageSaver.save(() => store.updateProfile({ uiLanguage: language }));
  };
  const setChannel = (next: UpdateChannel) => {
    setMovedToStable(channel === "beta" && next === "stable");
    channelSaver.save(() => store.setUpdateChannel(next));
  };

  let statusIcon = <CircleCheck aria-hidden="true" className="text-success-text size-4 shrink-0" strokeWidth={1.75} />;
  let statusText = intl.formatMessage(messages.idle);
  if (status.state === "checking") {
    statusIcon = <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />;
    statusText = intl.formatMessage(messages.checking);
  } else if (status.state === "up-to-date") statusText = intl.formatMessage(messages.upToDate);
  else if (status.state === "downloading") {
    statusIcon = <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />;
    statusText = intl.formatMessage(messages.downloading, { version: status.version });
  } else if (status.state === "ready") {
    statusIcon = <CircleArrowUp aria-hidden="true" className="text-accent-text size-4 shrink-0" strokeWidth={1.75} />;
    statusText = intl.formatMessage(messages.ready, { version: status.version });
  } else if (status.state === "failed") {
    statusIcon = <CircleAlert aria-hidden="true" className="text-warning-text size-4 shrink-0" strokeWidth={1.75} />;
    statusText = intl.formatMessage(messages.failed);
  }

  return (
    <>
      <SettingsSection title={intl.formatMessage(messages.languageTitle)} actions={languageSaver.status}>
        <SettingsRow
          title={intl.formatMessage(messages.language)}
          labelFor={`${id}-language`}
          helper={intl.formatMessage(messages.languageHelp)}
          control={
            <select
              id={`${id}-language`}
              value={device.language}
              onChange={(event) => setLanguage(event.target.value as LanguagePreference)}
              className="bg-surface-base border-line-control text-callout text-fg-primary h-8 rounded-md border px-2"
            >
              <option value="system">{intl.formatMessage(messages.languageSystem)}</option>
              {(["en", "tr", "de"] as const).map((language) => (
                <option key={language} value={language} lang={language}>
                  {LANGUAGE_NAMES[language]}
                </option>
              ))}
            </select>
          }
        />
        <SettingsRow
          title={intl.formatMessage(messages.appearance)}
          helper={intl.formatMessage(messages.appearanceHelp)}
          control={
            <SegmentedControl<AppearancePreference>
              label={intl.formatMessage(messages.appearance)}
              value={device.appearance}
              onValueChange={(appearance) => setDevicePreferences({ appearance })}
              options={[
                { value: "system", label: intl.formatMessage(messages.appearanceSystem) },
                { value: "light", label: intl.formatMessage(messages.appearanceLight) },
                { value: "dark", label: intl.formatMessage(messages.appearanceDark) },
              ]}
            />
          }
        />
      </SettingsSection>
      <SettingsSection title={intl.formatMessage(messages.updatesTitle)} actions={channelSaver.status}>
        <div className="border-line-subtle flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <div className="flex min-w-60 flex-1 flex-col gap-1">
            <p className="text-body text-fg-primary">{intl.formatMessage(messages.version, { version: chrome.version })}</p>
            <p role="status" className="text-footnote text-fg-secondary flex items-center gap-1.5">
              {statusIcon}
              {statusText}
            </p>
          </div>
          {status.state === "ready" && controller ? (
            <Button variant="primary" onClick={controller.requestRestart}>
              {intl.formatMessage(messages.restart)}
            </Button>
          ) : (
            <Button
              loading={status.state === "checking"}
              loadingLabel={intl.formatMessage(messages.checking)}
              onClick={() => (controller ? controller.checkNow() : updates.check())}
            >
              {intl.formatMessage(messages.check)}
            </Button>
          )}
        </div>
        <SettingsRow
          title={intl.formatMessage(messages.channel)}
          helper={intl.formatMessage(
            movedToStable
              ? messages.channelBackToStable
              : channel === "beta"
                ? messages.channelHelpBeta
                : messages.channelHelpStable,
          )}
          control={
            <SegmentedControl<UpdateChannel>
              label={intl.formatMessage(messages.channel)}
              value={channel}
              onValueChange={setChannel}
              options={[
                { value: "stable", label: intl.formatMessage(messages.channelStable) },
                { value: "beta", label: intl.formatMessage(messages.channelBeta) },
              ]}
            />
          }
        />
      </SettingsSection>
    </>
  );
}
