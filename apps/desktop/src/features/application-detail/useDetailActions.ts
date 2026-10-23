/**
 * The detail page's actions on top of `useTrackerActions`: views hand over ids and drafts, this
 * looks the interview or contact up in the live data when the action runs (like the tracker
 * actions do for applications) and adds the Undo toasts the shared hook leaves to the screen
 * (linking contacts, the reminder, the pinned CV, the posting link, `.ics` exports).
 */
import type { Contact, Interview, Job } from "@bfhr/core";
import { CalendarPlus, Link2, Link2Off, Paperclip, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { saveIcsFile } from "../../data/tracker/ics";
import { useTrackerSource } from "../../data/tracker/live";
import { type Lookup, useTrackerRepository } from "../../data/tracker/repository";
import { type TrackerActions, useTrackerActions } from "../../data/tracker/useTrackerActions";
import type { ApplicationPatch, InterviewInput } from "../../data/tracker/writes";
import { openJobUrl } from "../../lib/desktop";
import { useToast } from "../../shared/ui/Toast";
import type { ContactFields, IcsFileVM } from "./model";

const messages = defineMessages({
  undo: { id: "application-detail.actions.undo", defaultMessage: "Undo" },
  contactAdded: { id: "application-detail.actions.contactAdded", defaultMessage: "{name} added to contacts" },
  contactSaved: { id: "application-detail.actions.contactSaved", defaultMessage: "{name} saved" },
  linked: { id: "application-detail.actions.linked", defaultMessage: "{name} linked to {company}" },
  unlinked: {
    id: "application-detail.actions.unlinked",
    defaultMessage: "{name} unlinked from {company}",
    description: "Toast; the contact stays in the address book",
  },
  reminderSet: { id: "application-detail.actions.reminderSet", defaultMessage: "Reminder set · {company}" },
  reminderCleared: {
    id: "application-detail.actions.reminderCleared",
    defaultMessage: "Reminder removed · {company}",
  },
  cvPinned: { id: "application-detail.actions.cvPinned", defaultMessage: "CV recorded · {company}" },
  icsSaved: {
    id: "application-detail.actions.icsSaved",
    defaultMessage: "Calendar file saved to {path}",
    description: "Toast after exporting interviews as .ics; {path} is where the file was saved",
  },
  icsFailed: {
    id: "application-detail.actions.icsFailed",
    defaultMessage: "We couldn't save the calendar file. Try again or pick another folder.",
  },
  openFailed: {
    id: "application-detail.actions.openFailed",
    defaultMessage: "We couldn't open this link",
  },
  emailCopied: { id: "application-detail.actions.emailCopied", defaultMessage: "Email address copied" },
  copyFailed: {
    id: "application-detail.actions.copyFailed",
    defaultMessage: "We couldn't copy the address. Select it and copy it yourself.",
  },
});

export interface DetailActions extends TrackerActions {
  saveInterviewDraft(input: InterviewInput, existingId: string | null): void;
  deleteInterviewById(interviewId: string): void;
  /** A new contact linked to the application, or edits to a linked one (its links stay). */
  saveContactFields(fields: ContactFields, applicationId: string, existingId: string | null): void;
  linkContactById(contactId: string, applicationId: string, linked: boolean): void;
  /** Sets or clears the user's own reminder; Undo restores the previous one. */
  setReminder(applicationId: string, patch: ApplicationPatch, previous: ApplicationPatch): void;
  /** Records the CV used; `previous` null = no Undo (the pins can't change back after applying). */
  pinCv(applicationId: string, patch: ApplicationPatch, previous: ApplicationPatch | null): void;
  /** The native Save dialog; cancelling says nothing, a failure says so calmly. */
  exportIcs(file: IcsFileVM): void;
  /** Posting, meeting and contact links (public https only, checked by the shell). */
  openLink(url: string): void;
  copyEmail(email: string): void;
}

export function useDetailActions(): DetailActions {
  const intl = useIntl();
  const toast = useToast();
  const tracker = useTrackerActions();
  const source = useTrackerSource();

  // Read when the action runs (Undo runs later): the data as it is then.
  const data = () => {
    const state = source.getState();
    return state.status === "ready" ? state.data : null;
  };
  const companyOf = (applicationId: string) =>
    data()?.applications.find((application) => application.id === applicationId)?.company ?? "";
  const findContact = (id: string): Contact | null =>
    data()?.contacts.find((contact) => contact.id === id) ?? null;
  const findInterview = (id: string): Interview | null =>
    data()?.interviews.find((interview) => interview.id === id) ?? null;

  const link = (contactId: string, applicationId: string, linked: boolean, undoable: boolean) => {
    const contact = findContact(contactId);
    if (!contact) return;
    tracker.linkContact(contact, applicationId, linked);
    toast.show({
      message: intl.formatMessage(linked ? messages.linked : messages.unlinked, {
        name: contact.name,
        company: companyOf(applicationId),
      }),
      glyph: linked ? Link2 : Link2Off,
      ...(undoable && {
        action: {
          label: intl.formatMessage(messages.undo),
          run: () => link(contactId, applicationId, !linked, false),
        },
      }),
    });
  };

  const patchWithUndo = (
    applicationId: string,
    patch: ApplicationPatch,
    previous: ApplicationPatch | null,
    message: string,
    glyph: typeof CalendarPlus,
  ) => {
    tracker.updateApplication(applicationId, patch, { quiet: true });
    toast.show({
      message,
      glyph,
      ...(previous
        ? {
            action: {
              label: intl.formatMessage(messages.undo),
              run: () => tracker.updateApplication(applicationId, previous, { quiet: true }),
            },
          }
        : { variant: "info" as const }),
    });
  };

  return {
    ...tracker,

    saveInterviewDraft(input: InterviewInput, existingId: string | null): void {
      tracker.saveInterview(input, existingId === null ? null : findInterview(existingId));
    },

    deleteInterviewById(interviewId: string): void {
      const interview = findInterview(interviewId);
      if (interview) tracker.deleteInterview(interview);
    },

    /** A new contact linked to the application, or edits to a linked one (its links stay). */
    saveContactFields(fields: ContactFields, applicationId: string, existingId: string | null): void {
      const existing = existingId === null ? null : findContact(existingId);
      const optional = (value: string) => (value.trim() === "" ? null : value.trim());
      const name = fields.name.trim();
      tracker.saveContact(
        {
          name,
          email: optional(fields.email),
          role: optional(fields.role),
          company: optional(fields.company),
          notes: fields.notes,
          links: existing?.links ?? [],
          applicationIds: existing?.applicationIds ?? [applicationId],
        },
        existing,
      );
      toast.show({
        variant: "info",
        glyph: UserPlus,
        message: intl.formatMessage(existing ? messages.contactSaved : messages.contactAdded, { name }),
      });
    },

    linkContactById(contactId: string, applicationId: string, linked: boolean): void {
      link(contactId, applicationId, linked, true);
    },

    /** Sets or clears the user's own reminder; Undo restores the previous one. */
    setReminder(applicationId: string, patch: ApplicationPatch, previous: ApplicationPatch): void {
      patchWithUndo(
        applicationId,
        patch,
        previous,
        intl.formatMessage(patch.nextAction == null ? messages.reminderCleared : messages.reminderSet, {
          company: companyOf(applicationId),
        }),
        CalendarPlus,
      );
    },

    /** Records the CV used. Undo only while the pins may still change (before applying). */
    pinCv(applicationId: string, patch: ApplicationPatch, previous: ApplicationPatch | null): void {
      patchWithUndo(
        applicationId,
        patch,
        previous,
        intl.formatMessage(messages.cvPinned, { company: companyOf(applicationId) }),
        Paperclip,
      );
    },

    /** The native Save dialog; cancelling says nothing, a failure says so calmly. */
    exportIcs(file: IcsFileVM): void {
      saveIcsFile(file.fileName, file.content).then(
        (path) => {
          if (path !== null)
            toast.show({
              variant: "info",
              glyph: CalendarPlus,
              message: intl.formatMessage(messages.icsSaved, { path }),
            });
        },
        (error: unknown) => {
          console.error("Saving the .ics file failed", error);
          toast.show({ variant: "info", message: intl.formatMessage(messages.icsFailed) });
        },
      );
    },

    /** Posting, meeting and contact links (public https only, checked by the shell). */
    openLink(url: string): void {
      openJobUrl(url).catch((error: unknown) => {
        console.error("Opening a link failed", error);
        toast.show({ variant: "info", message: intl.formatMessage(messages.openFailed) });
      });
    },

    copyEmail(email: string): void {
      navigator.clipboard.writeText(email).then(
        () => toast.show({ variant: "info", message: intl.formatMessage(messages.emailCopied) }),
        () => toast.show({ variant: "info", message: intl.formatMessage(messages.copyFailed) }),
      );
    },
  };
}

/** The posting link of `jobId` (live, through `watchJob`), or null while loading / without one. */
export function usePostingUrl(jobId: string | null): string | null {
  const repository = useTrackerRepository();
  const [job, setJob] = useState<{ id: string; lookup: Lookup<Job> } | null>(null);
  useEffect(() => {
    if (jobId === null) return;
    return repository.watchJob(jobId, (lookup) => setJob({ id: jobId, lookup }));
  }, [repository, jobId]);
  if (jobId === null || job?.id !== jobId || job.lookup.status !== "ready") return null;
  const value = job.lookup.value;
  return value?.sources[0]?.url ?? value?.applyUrl ?? null;
}
