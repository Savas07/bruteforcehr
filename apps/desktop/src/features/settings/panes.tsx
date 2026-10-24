/**
 * The Settings panes in nav order (`/settings/$pane`). The shell renders each `label` as the page
 * `<h1>` and in the nav; a pane renders only its sections (`SettingsSection`). Data & privacy
 * (AccountData) joins as the last entry.
 */
import { Bell, Building2, Mail, Radar, Settings2, Sparkles, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { AiPane } from "./AiPane";
import { CompaniesPane } from "./CompaniesPane";
import { GeneralPane } from "./GeneralPane";
import { JobSourcesPane } from "./JobSourcesPane";
import { MailAccountsPane } from "./MailAccountsPane";
import { NotificationsPane } from "./NotificationsPane";
import { type SettingsProfile, useSettingsProfile } from "./store";

export interface SettingsPaneEntry {
  readonly id: string;
  readonly label: MessageDescriptor;
  readonly icon: LucideIcon;
  readonly Pane: ComponentType;
}

const labels = defineMessages({
  mailAccounts: { id: "settings.pane.mailAccounts", defaultMessage: "Mail accounts" },
  notifications: { id: "settings.pane.notifications", defaultMessage: "Notifications" },
  jobSources: { id: "settings.pane.jobSources", defaultMessage: "Job sources" },
  companies: { id: "settings.pane.companies", defaultMessage: "Companies you follow" },
  ai: { id: "settings.pane.ai", defaultMessage: "AI" },
  general: { id: "settings.pane.general", defaultMessage: "General" },
});

const profileMessages = defineMessages({
  loading: { id: "settings.profile.loading", defaultMessage: "Loading your settings" },
  errorTitle: { id: "settings.profile.errorTitle", defaultMessage: "We couldn't load your settings" },
  errorBody: { id: "settings.profile.errorBody", defaultMessage: "Nothing changed. Try again in a moment." },
});

/** A pane that edits profile settings: loading and error states around it. */
function withProfile(Pane: ComponentType<{ profile: SettingsProfile }>): ComponentType {
  return function ProfilePane() {
    const intl = useIntl();
    const state = useSettingsProfile();
    if (state.status === "loading")
      return (
        <SkeletonRegion
          loading
          label={intl.formatMessage(profileMessages.loading)}
          skeleton={<SkeletonBlock className="mt-4 h-48 w-full rounded-lg" />}
        >
          {null}
        </SkeletonRegion>
      );
    if (state.status === "error")
      return (
        <PaneError
          title={intl.formatMessage(profileMessages.errorTitle)}
          body={intl.formatMessage(profileMessages.errorBody)}
          onRetry={state.retry}
        />
      );
    return <Pane profile={state.profile} />;
  };
}

export const settingsPanes: readonly SettingsPaneEntry[] = [
  { id: "mail-accounts", label: labels.mailAccounts, icon: Mail, Pane: MailAccountsPane },
  { id: "notifications", label: labels.notifications, icon: Bell, Pane: withProfile(NotificationsPane) },
  { id: "job-sources", label: labels.jobSources, icon: Radar, Pane: JobSourcesPane },
  { id: "companies", label: labels.companies, icon: Building2, Pane: CompaniesPane },
  { id: "ai", label: labels.ai, icon: Sparkles, Pane: withProfile(AiPane) },
  { id: "general", label: labels.general, icon: Settings2, Pane: GeneralPane },
];
