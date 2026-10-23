/**
 * Reminders (BRIEF §4.6 "Reminders"): the user's own reminder for this application
 * (`nextAction` + `nextActionAt`, listed on Today under Deadlines), set, changed or removed with
 * Undo; and the device-wide interview prep reminders (`useInterviewReminderSetting`), with what
 * they do and what to change when the OS blocks notifications.
 */
import { BellRing } from "lucide-react";
import { Switch } from "radix-ui";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useInterviewReminderSetting } from "../../data/tracker/InterviewReminders";
import { chrome } from "../../lib/desktop";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { RelativeTimeChip } from "../../shared/ui/RelativeTimeChip";
import { Field, Section, TextInput } from "./fields";
import {
  type ApplicationDetailVM,
  type ReminderDraft,
  reminderPatch,
  reminderProblem,
  type ReminderVM,
} from "./model";
import type { DetailActions } from "./useDetailActions";

const messages = defineMessages({
  title: { id: "application-detail.reminders.title", defaultMessage: "Reminders" },
  yours: { id: "application-detail.reminders.yours", defaultMessage: "Your reminder" },
  none: {
    id: "application-detail.reminders.none",
    defaultMessage: "No reminder for this application. Set one to see it on Today under Deadlines.",
  },
  due: {
    id: "application-detail.reminders.due",
    defaultMessage: "Due",
    description: "Before a time: 'Due in 6 days'",
  },
  wasDue: {
    id: "application-detail.reminders.wasDue",
    defaultMessage: "Was due",
    description: "Before a past time: 'Was due 2 days ago'",
  },
  set: { id: "application-detail.reminders.set", defaultMessage: "Set a reminder" },
  change: { id: "application-detail.reminders.change", defaultMessage: "Change" },
  remove: { id: "application-detail.reminders.remove", defaultMessage: "Remove" },
  what: { id: "application-detail.reminders.what", defaultMessage: "What to do" },
  whatPlaceholder: {
    id: "application-detail.reminders.whatPlaceholder",
    defaultMessage: "Send the portfolio link, reply to the offer…",
  },
  date: { id: "application-detail.reminders.date", defaultMessage: "Date" },
  time: { id: "application-detail.reminders.time", defaultMessage: "Time" },
  timeHint: {
    id: "application-detail.reminders.timeHint",
    defaultMessage: "Without a time, it's 09:00.",
    description: "Under the reminder's time field",
  },
  save: { id: "application-detail.reminders.save", defaultMessage: "Save reminder" },
  cancel: { id: "application-detail.reminders.cancel", defaultMessage: "Cancel" },
  noText: { id: "application-detail.reminders.noText", defaultMessage: "Write what to do first." },
  badDate: { id: "application-detail.reminders.badDate", defaultMessage: "Choose a valid date." },
  editorLabel: { id: "application-detail.reminders.editorLabel", defaultMessage: "Edit reminder" },
  prepTitle: {
    id: "application-detail.reminders.prepTitle",
    defaultMessage: "Interview prep reminders on this computer",
  },
  prepBody: {
    id: "application-detail.reminders.prepBody",
    defaultMessage:
      "A notification the evening before at {evening} and {lead, plural, =60 {an hour} other {# minutes}} before each interview, never between {quietStart} and {quietEnd}. Applies to all your applications.",
  },
  deniedTitle: {
    id: "application-detail.reminders.deniedTitle",
    defaultMessage: "Notifications are turned off for BruteForceHR",
  },
  deniedMac: {
    id: "application-detail.reminders.deniedMac",
    defaultMessage:
      "Turn them on in System Settings › Notifications › BruteForceHR, then switch this on again.",
  },
  deniedWindows: {
    id: "application-detail.reminders.deniedWindows",
    defaultMessage:
      "Turn them on in Settings › System › Notifications › BruteForceHR, then switch this on again.",
  },
  unsupported: {
    id: "application-detail.reminders.unsupported",
    defaultMessage: "Notifications need the BruteForceHR desktop app.",
  },
});

export function RemindersSection({
  detail,
  editing,
  onEditingChange,
  actions,
}: {
  detail: ApplicationDetailVM;
  /** The reminder editor is open (the header's "Set a reminder" opens it too). */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  actions: DetailActions;
}) {
  const intl = useIntl();
  const { reminder, applicationId } = detail;
  return (
    <Section title={intl.formatMessage(messages.title)}>
      <div className="flex flex-col gap-2">
        <h3 className="text-footnote text-fg-secondary font-medium">{intl.formatMessage(messages.yours)}</h3>
        {editing ? (
          <ReminderEditor
            initial={reminder.draft}
            onCancel={() => onEditingChange(false)}
            onSave={(draft) => {
              onEditingChange(false);
              actions.setReminder(applicationId, reminderPatch(draft, detail.timeZone), reminder.restore);
            }}
          />
        ) : (
          <ReminderLine
            reminder={reminder}
            onEdit={() => onEditingChange(true)}
            onRemove={() =>
              actions.setReminder(applicationId, { nextAction: null, nextActionAt: null }, reminder.restore)
            }
          />
        )}
      </div>
      <PrepRemindersToggle rules={detail.reminderRules} />
    </Section>
  );
}

function ReminderLine({
  reminder,
  onEdit,
  onRemove,
}: {
  reminder: ReminderVM;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const intl = useIntl();
  if (reminder.label === null)
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="text-callout text-fg-secondary">{intl.formatMessage(messages.none)}</p>
        <Button size="sm" icon={BellRing} onClick={onEdit}>
          {intl.formatMessage(messages.set)}
        </Button>
      </div>
    );
  return (
    <div className="bg-surface-sunken flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-callout text-fg-primary text-pretty">{reminder.label}</p>
        {reminder.due && (
          <RelativeTimeChip
            time={reminder.due}
            prefix={intl.formatMessage(reminder.overdue ? messages.wasDue : messages.due)}
          />
        )}
      </div>
      <span className="flex gap-1">
        <Button size="sm" variant="plain" onClick={onEdit}>
          {intl.formatMessage(messages.change)}
        </Button>
        <Button size="sm" variant="plain" onClick={onRemove}>
          {intl.formatMessage(messages.remove)}
        </Button>
      </span>
    </div>
  );
}

function ReminderEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: ReminderDraft;
  onCancel: () => void;
  onSave: (draft: ReminderDraft) => void;
}) {
  const intl = useIntl();
  const [draft, setDraft] = useState(initial);
  const problem = reminderProblem(draft);
  return (
    <form
      aria-label={intl.formatMessage(messages.editorLabel)}
      className="border-line-subtle flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem === null) onSave(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <Field label={intl.formatMessage(messages.what)}>
        <TextInput
          autoFocus
          maxLength={200}
          value={draft.text}
          placeholder={intl.formatMessage(messages.whatPlaceholder)}
          onChange={(event) => setDraft({ ...draft, text: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={intl.formatMessage(messages.date)}
          optional
          problem={problem === "badDate" ? intl.formatMessage(messages.badDate) : null}
        >
          <TextInput
            type="date"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </Field>
        <Field
          label={intl.formatMessage(messages.time)}
          optional
          hint={intl.formatMessage(messages.timeHint)}
        >
          <TextInput
            type="time"
            value={draft.time}
            onChange={(event) => setDraft({ ...draft, time: event.target.value })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button
          size="sm"
          type="submit"
          variant="primary"
          disabledReason={
            problem === "noText"
              ? intl.formatMessage(messages.noText)
              : problem === "badDate"
                ? intl.formatMessage(messages.badDate)
                : null
          }
        >
          {intl.formatMessage(messages.save)}
        </Button>
      </div>
    </form>
  );
}

function PrepRemindersToggle({ rules }: { rules: ApplicationDetailVM["reminderRules"] }) {
  const intl = useIntl();
  const setting = useInterviewReminderSetting();
  const labelId = useId();
  const bodyId = useId();
  const unavailable = setting.permission === "unsupported" || setting.permission === "denied";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={labelId} className="text-callout text-fg-primary font-medium">
            {intl.formatMessage(messages.prepTitle)}
          </h3>
          <p id={bodyId} className="text-footnote text-fg-secondary text-pretty">
            {intl.formatMessage(messages.prepBody, {
              evening: rules.evening,
              lead: rules.leadMinutes,
              quietStart: rules.quietStart,
              quietEnd: rules.quietEnd,
            })}
          </p>
        </div>
        <Switch.Root
          aria-labelledby={labelId}
          aria-describedby={bodyId}
          checked={setting.enabled}
          disabled={unavailable || setting.permission === "unknown"}
          onCheckedChange={(checked) => {
            if (checked) void setting.enable();
            else setting.disable();
          }}
          className="data-[state=checked]:bg-accent-solid bg-line-control relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-default items-center rounded-full transition-colors duration-(--bfhr-duration-fast) disabled:opacity-60"
        >
          <Switch.Thumb className="bg-surface-base shadow-raised block size-4 translate-x-0.5 rounded-full transition-transform duration-(--bfhr-duration-fast) data-[state=checked]:translate-x-[18px]" />
        </Switch.Root>
      </div>
      {setting.permission === "denied" && (
        <InlineAlert tone="warning" title={intl.formatMessage(messages.deniedTitle)}>
          {intl.formatMessage(chrome.platform === "macos" ? messages.deniedMac : messages.deniedWindows)}
        </InlineAlert>
      )}
      {setting.permission === "unsupported" && (
        <p className="text-footnote text-fg-tertiary">{intl.formatMessage(messages.unsupported)}</p>
      )}
    </div>
  );
}
