/**
 * Settings › Data & privacy copy. The strings are shared with iOS word for word (owner:
 * AccountData's copy contract); TR uses "siz", DE uses "du".
 */
import { defineMessages } from "react-intl";

/** The pane's name in the Settings navigation and its page heading. */
export const dataPrivacyPaneLabel = defineMessages({
  label: { id: "settings.pane.dataPrivacy", defaultMessage: "Data & privacy" },
}).label;

export const exportMessages = defineMessages({
  title: { id: "settings.dataPrivacy.export.title", defaultMessage: "Export everything" },
  description: {
    id: "settings.dataPrivacy.export.description",
    defaultMessage:
      "Download a ZIP with everything BruteForceHR stores for you: readable JSON files and your CV files.",
  },
  includedTitle: { id: "settings.dataPrivacy.export.included.title", defaultMessage: "Included" },
  included1: { id: "settings.dataPrivacy.export.included.1", defaultMessage: "Profile and settings" },
  included2: {
    id: "settings.dataPrivacy.export.included.2",
    defaultMessage: "CVs with every version, cover letters, and the PDF and Word files you created or imported",
  },
  included3: {
    id: "settings.dataPrivacy.export.included.3",
    defaultMessage: "Jobs, matches, saved searches and companies you follow",
  },
  included4: {
    id: "settings.dataPrivacy.export.included.4",
    defaultMessage: "Applications with their full history, interviews and contacts",
  },
  included5: {
    id: "settings.dataPrivacy.export.included.5",
    defaultMessage: "Job emails we stored and your connected mail accounts",
  },
  excludedTitle: { id: "settings.dataPrivacy.export.excluded.title", defaultMessage: "Not included" },
  excluded1: {
    id: "settings.dataPrivacy.export.excluded.1",
    defaultMessage: "Passwords and sign-in tokens we hold for your mail accounts",
  },
  excluded2: {
    id: "settings.dataPrivacy.export.excluded.2",
    defaultMessage: "Emails that weren't about your job search. We never stored them.",
  },
  create: { id: "settings.dataPrivacy.export.create", defaultMessage: "Create export" },
  preparing: {
    id: "settings.dataPrivacy.export.preparing",
    defaultMessage: "Preparing your export… This usually takes under a minute.",
  },
  readyTitle: { id: "settings.dataPrivacy.export.ready.title", defaultMessage: "Export ready" },
  readyMeta: {
    id: "settings.dataPrivacy.export.ready.meta",
    defaultMessage: "{size} · available until {date}",
    description: "{size} is the ZIP's size (14 MB), {date} the local date and time it expires",
  },
  save: {
    id: "settings.dataPrivacy.export.save",
    defaultMessage: "Save…",
    description: "Downloads the ZIP and opens the Save dialog",
  },
  saving: { id: "settings.dataPrivacy.export.saving", defaultMessage: "Downloading…" },
  saved: {
    id: "settings.dataPrivacy.export.saved",
    defaultMessage: "Saved to {fileName}",
    description: "{fileName} is the name the ZIP was saved under",
  },
  retention: {
    id: "settings.dataPrivacy.export.retention",
    defaultMessage: "We delete the file from our servers 7 days after it's created. Making a new export replaces it.",
  },
  errorTooSoon: {
    id: "settings.dataPrivacy.export.error.tooSoon",
    defaultMessage: "You just made an export. You can make another in a couple of minutes.",
  },
  errorDailyLimit: {
    id: "settings.dataPrivacy.export.error.dailyLimit",
    defaultMessage: "You've made 5 exports today. You can make another tomorrow.",
  },
  errorTooLarge: {
    id: "settings.dataPrivacy.export.error.tooLarge",
    defaultMessage: "Your data is too large for one export. Please open an issue on GitHub and we'll help.",
  },
  errorGeneric: {
    id: "settings.dataPrivacy.export.error.generic",
    defaultMessage: "Couldn't create the export. Check your connection and try again.",
  },
  errorDownload: {
    id: "settings.dataPrivacy.export.error.download",
    defaultMessage: "Couldn't download the export. Try again.",
  },
});

export const commonMessages = defineMessages({
  retry: { id: "settings.dataPrivacy.common.retry", defaultMessage: "Try again" },
  offline: { id: "settings.dataPrivacy.common.offline", defaultMessage: "Needs a connection" },
  openGitHub: {
    id: "settings.dataPrivacy.common.openGitHub",
    defaultMessage: "Open GitHub",
    description: "Opens the GitHub issues page in the browser (export too large)",
  },
});

export const deleteMessages = defineMessages({
  title: { id: "settings.dataPrivacy.delete.title", defaultMessage: "Delete account" },
  description: {
    id: "settings.dataPrivacy.delete.description",
    defaultMessage: "Permanently delete your account and everything stored with it.",
  },
  open: { id: "settings.dataPrivacy.delete.open", defaultMessage: "Delete account…" },
  dialogTitle: { id: "settings.dataPrivacy.delete.dialog.title", defaultMessage: "Delete your account?" },
  dialogLead: { id: "settings.dataPrivacy.delete.dialog.lead", defaultMessage: "This permanently deletes:" },
  item1: {
    id: "settings.dataPrivacy.delete.item.1",
    defaultMessage: "Your profile, CVs with every version, PDFs and cover letters",
  },
  item2: {
    id: "settings.dataPrivacy.delete.item.2",
    defaultMessage: "Applications, interviews, contacts and their history",
  },
  item3: {
    id: "settings.dataPrivacy.delete.item.3",
    defaultMessage: "Saved jobs, searches and companies you follow",
  },
  item4: { id: "settings.dataPrivacy.delete.item.4", defaultMessage: "Stored job emails" },
  item5: {
    id: "settings.dataPrivacy.delete.item.5",
    defaultMessage:
      "Connected mail accounts. We also remove our access at Google, Microsoft or your mail provider.",
  },
  item6: { id: "settings.dataPrivacy.delete.item.6", defaultMessage: "Your devices and notification settings" },
  irreversible: { id: "settings.dataPrivacy.delete.irreversible", defaultMessage: "This can't be undone." },
  exportFirst: { id: "settings.dataPrivacy.delete.exportFirst", defaultMessage: "Export my data first" },
  confirmLabel: {
    id: "settings.dataPrivacy.delete.confirm.label",
    defaultMessage: "To confirm, type {word}",
    description: "{word} is delete.confirm.word (DELETE / SİL / LÖSCHEN)",
  },
  confirmWord: {
    id: "settings.dataPrivacy.delete.confirm.word",
    defaultMessage: "DELETE",
    description: "The word to type; matching ignores case (and Turkish dotted/dotless i)",
  },
  keep: { id: "settings.dataPrivacy.delete.keep", defaultMessage: "Keep my account" },
  submit: { id: "settings.dataPrivacy.delete.submit", defaultMessage: "Delete everything" },
  reauthTitle: { id: "settings.dataPrivacy.delete.reauth.title", defaultMessage: "Confirm it's you" },
  reauthBody: {
    id: "settings.dataPrivacy.delete.reauth.body",
    defaultMessage:
      "For your security, we'll email a sign-in link to {email}. Open it on this device, then finish here.",
  },
  reauthSend: { id: "settings.dataPrivacy.delete.reauth.send", defaultMessage: "Send link" },
  reauthSent: {
    id: "settings.dataPrivacy.delete.reauth.sent",
    defaultMessage: "Link sent to {email}. Open it on this device to continue.",
  },
  reauthDone: {
    id: "settings.dataPrivacy.delete.reauth.done",
    defaultMessage: "You're signed in again. You can now delete your account.",
  },
  progress: { id: "settings.dataPrivacy.delete.progress", defaultMessage: "Deleting your account…" },
  errorGeneric: {
    id: "settings.dataPrivacy.delete.error.generic",
    defaultMessage: "Deletion didn't finish. Try again; it continues where it stopped.",
  },
});
