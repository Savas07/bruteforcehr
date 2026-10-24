/**
 * Settings › AI (settings-account.md, ADR 0010 / 0012): "Use AI features" (`Profile.aiEnabled`)
 * and "Allow sending email text to AI" (`settings.aiMailTextAllowed`, off by default; needs AI
 * on). Each says plainly what it powers and what happens when it's off.
 */
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useSaver } from "./save";
import { type SettingsProfile, useSettingsStore } from "./store";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./ui";

const messages = defineMessages({
  title: { id: "settings.ai.title", defaultMessage: "Anthropic Claude" },
  description: {
    id: "settings.ai.description",
    defaultMessage: "AI runs on our server with Anthropic Claude, and only for the features you turn on here.",
  },
  on: { id: "settings.ai.on", defaultMessage: "On" },
  off: { id: "settings.ai.off", defaultMessage: "Off" },
  master: { id: "settings.ai.master", defaultMessage: "Use AI features" },
  masterHelp: {
    id: "settings.ai.masterHelp",
    defaultMessage: "Reading imported CVs, suggesting CV wording, and explaining job matches. Off: you do these yourself.",
  },
  mailText: { id: "settings.ai.mailText", defaultMessage: "Allow sending email text to AI" },
  mailTextHelpOn: {
    id: "settings.ai.mailTextHelpOn",
    defaultMessage: "Job emails are sorted by Claude, so fewer of them ask for your review.",
  },
  mailTextHelpOff: {
    id: "settings.ai.mailTextHelpOff",
    defaultMessage: "When off, we sort with rules only, so more emails will ask for your review.",
  },
  mailTextNeedsAi: {
    id: "settings.ai.mailTextNeedsAi",
    defaultMessage: "Turn on AI features first. Until then we sort emails with rules only.",
  },
});

export function AiPane({ profile }: { profile: SettingsProfile }) {
  const intl = useIntl();
  const store = useSettingsStore();
  const saver = useSaver();
  const id = useId();
  const onOff = { onLabel: intl.formatMessage(messages.on), offLabel: intl.formatMessage(messages.off) };
  const mailHelp = !profile.aiEnabled
    ? intl.formatMessage(messages.mailTextNeedsAi)
    : intl.formatMessage(profile.aiMailTextAllowed ? messages.mailTextHelpOn : messages.mailTextHelpOff);
  return (
    <SettingsSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      actions={saver.status}
    >
      <div className="divide-line-subtle flex flex-col divide-y">
        <SettingsRow
          title={<span id={`${id}-master`}>{intl.formatMessage(messages.master)}</span>}
          helper={<span id={`${id}-master-help`}>{intl.formatMessage(messages.masterHelp)}</span>}
          control={
            <SettingsSwitch
              checked={profile.aiEnabled}
              onCheckedChange={(aiEnabled) => saver.save(() => store.updateProfile({ aiEnabled }))}
              labelledBy={`${id}-master`}
              describedBy={`${id}-master-help`}
              {...onOff}
            />
          }
        />
        <SettingsRow
          title={<span id={`${id}-mail`}>{intl.formatMessage(messages.mailText)}</span>}
          helper={<span id={`${id}-mail-help`}>{mailHelp}</span>}
          control={
            <SettingsSwitch
              checked={profile.aiEnabled && profile.aiMailTextAllowed}
              onCheckedChange={(aiMailTextAllowed) =>
                saver.save(() => store.updateProfile({ settings: { aiMailTextAllowed } }))
              }
              labelledBy={`${id}-mail`}
              describedBy={`${id}-mail-help`}
              disabledReason={profile.aiEnabled ? null : mailHelp}
              {...onOff}
            />
          }
        />
      </div>
    </SettingsSection>
  );
}
