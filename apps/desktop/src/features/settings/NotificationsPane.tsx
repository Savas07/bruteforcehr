/**
 * Settings › Notifications (settings-account.md, docs/runbooks/notifications.md): per-category
 * switches (`settings.notifications`, written as a whole object; `settings.notifyRejections` for
 * decisions), quiet hours as one sentence-shaped row with the profile's zone
 * (`settings.quietHours`), and "Show notifications on this computer" (this device only, while the
 * app runs). The same categories decide the phone's pushes.
 */
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from "@bfhr/core";
import { Moon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { defineMessages, type MessageDescriptor, useIntl } from "react-intl";
import {
  notificationPermission,
  type NotificationPermission,
  requestNotificationPermission,
} from "../../lib/notifications";
import { setDevicePreferences, useDevicePreferences } from "../../lib/preferences";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { useSaver } from "./save";
import { type SettingsProfile, useSettingsStore } from "./store";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./ui";

const messages = defineMessages({
  categoriesTitle: { id: "settings.notifications.categories", defaultMessage: "What to notify you about" },
  categoriesDescription: {
    id: "settings.notifications.categoriesDescription",
    defaultMessage: "On your phone and, if you turn it on below, on this computer.",
  },
  on: { id: "settings.switch.on", defaultMessage: "On" },
  off: { id: "settings.switch.off", defaultMessage: "Off" },
  interviews: { id: "settings.notifications.interviews", defaultMessage: "Interview invites" },
  interviewsHelp: {
    id: "settings.notifications.interviewsHelp",
    defaultMessage: "When an employer invites you to talk.",
  },
  offers: { id: "settings.notifications.offers", defaultMessage: "Offers" },
  offersHelp: { id: "settings.notifications.offersHelp", defaultMessage: "When an offer arrives." },
  assessments: { id: "settings.notifications.assessments", defaultMessage: "Assessments" },
  assessmentsHelp: {
    id: "settings.notifications.assessmentsHelp",
    defaultMessage: "Tests and take-home tasks with a deadline.",
  },
  decisions: { id: "settings.notifications.decisions", defaultMessage: "Decisions" },
  decisionsHelp: {
    id: "settings.notifications.decisionsHelp",
    defaultMessage: "A short, quiet note when a company decides not to move forward. You can turn this off.",
  },
  autoApplied: { id: "settings.notifications.autoApplied", defaultMessage: "Automatic updates" },
  autoAppliedHelp: {
    id: "settings.notifications.autoAppliedHelp",
    defaultMessage: "When we move an application because of an email, with Undo in the app.",
  },
  jobAlerts: { id: "settings.notifications.jobAlerts", defaultMessage: "New matches" },
  jobAlertsHelp: {
    id: "settings.notifications.jobAlertsHelp",
    defaultMessage: "Alerts from your saved searches, on your phone.",
  },
  quietTitle: { id: "settings.notifications.quietTitle", defaultMessage: "Quiet hours" },
  quietDescription: {
    id: "settings.notifications.quietDescription",
    defaultMessage: "We won't send notifications during quiet hours. Everything still shows up in the app.",
  },
  quietSwitch: { id: "settings.notifications.quietSwitch", defaultMessage: "Pause notifications at night" },
  quietFrom: { id: "settings.notifications.quietFrom", defaultMessage: "From" },
  quietTo: { id: "settings.notifications.quietTo", defaultMessage: "to" },
  quietSummary: {
    id: "settings.notifications.quietSummary",
    defaultMessage: "Quiet every day from {start} to {end} ({zone}).",
  },
  deviceTitle: { id: "settings.notifications.deviceTitle", defaultMessage: "This computer" },
  deviceSwitch: {
    id: "settings.notifications.deviceSwitch",
    defaultMessage: "Show notifications on this computer",
  },
  deviceHelp: {
    id: "settings.notifications.deviceHelp",
    defaultMessage: "For new job emails, while BruteForceHR is open. Uses the categories above.",
  },
  deviceDenied: {
    id: "settings.notifications.deviceDenied",
    defaultMessage:
      "Notifications are turned off for BruteForceHR in your system settings. Allow them there, then turn this on.",
  },
  deviceUnsupported: {
    id: "settings.notifications.deviceUnsupported",
    defaultMessage: "Notifications need the desktop app.",
  },
});

const CATEGORIES: readonly {
  readonly key: keyof NotificationPreferences | "notifyRejections";
  readonly title: MessageDescriptor;
  readonly help: MessageDescriptor;
}[] = [
  { key: "interviews", title: messages.interviews, help: messages.interviewsHelp },
  { key: "offers", title: messages.offers, help: messages.offersHelp },
  { key: "assessments", title: messages.assessments, help: messages.assessmentsHelp },
  { key: "notifyRejections", title: messages.decisions, help: messages.decisionsHelp },
  { key: "autoApplied", title: messages.autoApplied, help: messages.autoAppliedHelp },
  { key: "jobAlerts", title: messages.jobAlerts, help: messages.jobAlertsHelp },
];

/** Every 30 minutes of the day ("00:00" … "23:30"). */
const CLOCK_TIMES = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 === 0 ? "00" : "30"}`;
});
const DEFAULT_QUIET = { start: "22:00", end: "08:00" } as const;

function SwitchRow({
  title,
  help,
  checked,
  onChange,
  onLabel,
  offLabel,
  disabledReason,
}: {
  title: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel: string;
  offLabel: string;
  disabledReason?: string | null;
}) {
  const id = useId();
  return (
    <SettingsRow
      title={<span id={`${id}-title`}>{title}</span>}
      helper={<span id={`${id}-help`}>{disabledReason ?? help}</span>}
      control={
        <SettingsSwitch
          checked={checked}
          onCheckedChange={onChange}
          labelledBy={`${id}-title`}
          describedBy={`${id}-help`}
          disabledReason={disabledReason ?? null}
          onLabel={onLabel}
          offLabel={offLabel}
        />
      }
    />
  );
}

/** A clock time in the user's locale ("22:00" / "10:00 PM"). */
function clockLabel(clock: string, locale: string): string {
  const [hours = "0", minutes = "0"] = clock.split(":");
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 0, 1, Number(hours), Number(minutes))),
  );
}

export function NotificationsPane({ profile }: { profile: SettingsProfile }) {
  const intl = useIntl();
  const store = useSettingsStore();
  const categories = useSaver();
  const quiet = useSaver();
  const device = useDevicePreferences();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const quietId = useId();
  useEffect(() => {
    void notificationPermission().then(setPermission);
  }, []);
  const onOff = { onLabel: intl.formatMessage(messages.on), offLabel: intl.formatMessage(messages.off) };

  const setCategory = (key: (typeof CATEGORIES)[number]["key"], value: boolean) =>
    categories.save(() =>
      store.updateProfile({
        settings:
          key === "notifyRejections"
            ? { notifyRejections: value }
            : {
                notifications: {
                  ...(profile.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES),
                  [key]: value,
                },
              },
      }),
    );

  const setQuiet = (next: SettingsProfile["quietHours"]) =>
    quiet.save(() => store.updateProfile({ settings: { quietHours: next } }));

  const setDevice = async (on: boolean) => {
    if (!on) {
      setDevicePreferences({ mailNotifications: false });
      return;
    }
    const answer = await requestNotificationPermission();
    setPermission(answer);
    if (answer === "granted") setDevicePreferences({ mailNotifications: true });
  };
  const deviceReason =
    permission === "unsupported"
      ? intl.formatMessage(messages.deviceUnsupported)
      : permission === "denied"
        ? intl.formatMessage(messages.deviceDenied)
        : null;

  const quietHours = profile.quietHours;
  const select = (value: string, label: string, onChange: (value: string) => void) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="bg-surface-base border-line-control text-callout text-fg-primary h-8 rounded-md border px-2"
    >
      {CLOCK_TIMES.map((time) => (
        <option key={time} value={time}>
          {clockLabel(time, intl.locale)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <SettingsSection
        title={intl.formatMessage(messages.categoriesTitle)}
        description={intl.formatMessage(messages.categoriesDescription)}
        actions={categories.status}
      >
        <div className="divide-line-subtle flex flex-col divide-y">
          {CATEGORIES.map((category) => (
            <SwitchRow
              key={category.key}
              title={intl.formatMessage(category.title)}
              help={intl.formatMessage(category.help)}
              checked={
                category.key === "notifyRejections"
                  ? profile.notifyRejections
                  : (profile.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES)[category.key]
              }
              onChange={(value) => setCategory(category.key, value)}
              {...onOff}
            />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection
        title={intl.formatMessage(messages.quietTitle)}
        description={intl.formatMessage(messages.quietDescription)}
        actions={quiet.status}
      >
        <SettingsRow
          title={<span id={`${quietId}-title`}>{intl.formatMessage(messages.quietSwitch)}</span>}
          control={
            <SettingsSwitch
              checked={quietHours !== null}
              onCheckedChange={(on) => setQuiet(on ? DEFAULT_QUIET : null)}
              labelledBy={`${quietId}-title`}
              {...onOff}
            />
          }
        >
          {quietHours !== null && (
            <div className="flex flex-col gap-2">
              <div className="text-callout text-fg-primary flex flex-wrap items-center gap-2">
                <Moon aria-hidden="true" className="text-fg-secondary size-4" strokeWidth={1.75} />
                <span>{intl.formatMessage(messages.quietFrom)}</span>
                {select(quietHours.start, intl.formatMessage(messages.quietFrom), (start) =>
                  setQuiet({ ...quietHours, start }),
                )}
                <span>{intl.formatMessage(messages.quietTo)}</span>
                {select(quietHours.end, intl.formatMessage(messages.quietTo), (end) =>
                  setQuiet({ ...quietHours, end }),
                )}
              </div>
              <p className="text-footnote text-fg-secondary">
                {intl.formatMessage(messages.quietSummary, {
                  start: clockLabel(quietHours.start, intl.locale),
                  end: clockLabel(quietHours.end, intl.locale),
                  zone: profile.timeZone,
                })}
              </p>
            </div>
          )}
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title={intl.formatMessage(messages.deviceTitle)}>
        <SwitchRow
          title={intl.formatMessage(messages.deviceSwitch)}
          help={intl.formatMessage(messages.deviceHelp)}
          checked={device.mailNotifications && permission === "granted"}
          onChange={(on) => void setDevice(on)}
          disabledReason={deviceReason}
          {...onOff}
        />
        {permission === "denied" && device.mailNotifications && (
          <InlineAlert tone="warning" title={intl.formatMessage(messages.deviceDenied)} />
        )}
      </SettingsSection>
    </>
  );
}
