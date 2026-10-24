import Foundation

/// Copy of Settings › Data & privacy (table "DataPrivacy"): the shared EN / TR (siz) / DE (du)
/// copy for both platforms, with the iOS verbs ("Save to Files", "Share").
enum DataPrivacyStrings {
    // MARK: Page

    static let title = LocalizedStringResource.bfhr(
        "dataPrivacy.title", default: "Data & privacy", table: "DataPrivacy",
        comment: "Navigation title of the Settings page with export and account deletion."
    )

    // MARK: Export everything

    static let exportTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.export.title", default: "Export everything", table: "DataPrivacy",
        comment: "Section header: download all your data as a ZIP."
    )
    static let exportDescription = LocalizedStringResource.bfhr(
        "dataPrivacy.export.description", default: "Download a ZIP with everything BruteForceHR stores for you: readable JSON files and your CV files.", table: "DataPrivacy",
        comment: "First line of the export section. BruteForceHR is the app name."
    )
    static let includedTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.export.included.title", default: "Included", table: "DataPrivacy",
        comment: "Section header: what the export contains."
    )
    static let included1 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.included.1", default: "Profile and settings", table: "DataPrivacy",
        comment: "Item of the Included list."
    )
    static let included2 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.included.2", default: "CVs with every version, cover letters, and the PDF and Word files you created or imported", table: "DataPrivacy",
        comment: "Item of the Included list."
    )
    static let included3 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.included.3", default: "Jobs, matches, saved searches and companies you follow", table: "DataPrivacy",
        comment: "Item of the Included list."
    )
    static let included4 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.included.4", default: "Applications with their full history, interviews and contacts", table: "DataPrivacy",
        comment: "Item of the Included list."
    )
    static let included5 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.included.5", default: "Job emails we stored and your connected mail accounts", table: "DataPrivacy",
        comment: "Item of the Included list."
    )
    static let excludedTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.export.excluded.title", default: "Not included", table: "DataPrivacy",
        comment: "Section header: what the export leaves out."
    )
    static let excluded1 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.excluded.1", default: "Passwords and sign-in tokens we hold for your mail accounts", table: "DataPrivacy",
        comment: "Item of the Not included list."
    )
    static let excluded2 = LocalizedStringResource.bfhr(
        "dataPrivacy.export.excluded.2", default: "Emails that weren't about your job search. We never stored them.", table: "DataPrivacy",
        comment: "Item of the Not included list."
    )
    static let create = LocalizedStringResource.bfhr(
        "dataPrivacy.export.create", default: "Create export", table: "DataPrivacy",
        comment: "Button: builds the ZIP on the server."
    )
    static let preparing = LocalizedStringResource.bfhr(
        "dataPrivacy.export.preparing", default: "Preparing your export… This usually takes under a minute.", table: "DataPrivacy",
        comment: "Shown in place of the button while the ZIP is built."
    )
    static let readyTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.export.ready.title", default: "Export ready", table: "DataPrivacy",
        comment: "Title of the card when the ZIP is ready."
    )
    static func readyMeta(_ size: String, date: String) -> LocalizedStringResource {
        .bfhr(
            "dataPrivacy.export.ready.meta", default: "\(size) · available until \(date)", table: "DataPrivacy",
            comment: "Under Export ready. %1$@ = file size (14 MB), %2$@ = date and time the file is deleted from the server."
        )
    }

    static let save = LocalizedStringResource.bfhr(
        "dataPrivacy.export.save", default: "Save to Files", table: "DataPrivacy",
        comment: "Button: saves the ZIP with the system file picker. Files is Apple's app name (Dateien, Dosyalar)."
    )
    static let share = LocalizedStringResource.bfhr(
        "dataPrivacy.export.share", default: "Share", table: "DataPrivacy",
        comment: "Button: opens the share sheet with the ZIP."
    )
    static let saving = LocalizedStringResource.bfhr(
        "dataPrivacy.export.saving", default: "Downloading…", table: "DataPrivacy",
        comment: "Shown while the ZIP downloads to the iPhone."
    )
    static func saved(_ fileName: String) -> LocalizedStringResource {
        .bfhr(
            "dataPrivacy.export.saved", default: "Saved to \(fileName)", table: "DataPrivacy",
            comment: "Confirmation after Save to Files. %@ = the saved file name."
        )
    }

    static let retention = LocalizedStringResource.bfhr(
        "dataPrivacy.export.retention", default: "We delete the file from our servers 7 days after it's created. Making a new export replaces it.", table: "DataPrivacy",
        comment: "Footer of the export section."
    )
    static let errorTooSoon = LocalizedStringResource.bfhr(
        "dataPrivacy.export.error.tooSoon", default: "You just made an export. You can make another in a couple of minutes.", table: "DataPrivacy",
        comment: "Export refused: less than two minutes since the last one."
    )
    static let errorDailyLimit = LocalizedStringResource.bfhr(
        "dataPrivacy.export.error.dailyLimit", default: "You've made 5 exports today. You can make another tomorrow.", table: "DataPrivacy",
        comment: "Export refused: daily limit reached."
    )
    static let errorTooLarge = LocalizedStringResource.bfhr(
        "dataPrivacy.export.error.tooLarge", default: "Your data is too large for one export. Please open an issue on GitHub and we'll help.", table: "DataPrivacy",
        comment: "Export refused: more than 300 MB. Support is GitHub issues only."
    )
    static let errorGeneric = LocalizedStringResource.bfhr(
        "dataPrivacy.export.error.generic", default: "Couldn't create the export. Check your connection and try again.", table: "DataPrivacy",
        comment: "Export failed for another reason."
    )
    static let errorDownload = LocalizedStringResource.bfhr(
        "dataPrivacy.export.error.download", default: "Couldn't download the export. Try again.", table: "DataPrivacy",
        comment: "The ZIP exists but the download to the iPhone failed."
    )
    static let retry = LocalizedStringResource.bfhr(
        "dataPrivacy.common.retry", default: "Try again", table: "DataPrivacy",
        comment: "Button: repeats a failed request."
    )
    static let openGitHub = LocalizedStringResource.bfhr(
        "dataPrivacy.common.openGitHub", default: "Open GitHub", table: "DataPrivacy",
        comment: "Button under the too-large export error: opens a new issue on the app's public GitHub repository (support is GitHub issues only). GitHub is a product name."
    )
    static let offline = LocalizedStringResource.bfhr(
        "dataPrivacy.common.offline", default: "Needs a connection", table: "DataPrivacy",
        comment: "Why Create export / Delete account are disabled while offline."
    )

    // MARK: Delete account

    static let deleteTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.title", default: "Delete account", table: "DataPrivacy",
        comment: "Section header and title of the deletion screen."
    )
    static let deleteDescription = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.description", default: "Permanently delete your account and everything stored with it.", table: "DataPrivacy",
        comment: "Footer under the Delete account row."
    )
    static let deleteOpen = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.open", default: "Delete account…", table: "DataPrivacy",
        comment: "Row that opens the deletion screen."
    )
    static let dialogTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.dialog.title", default: "Delete your account?", table: "DataPrivacy",
        comment: "Heading of the deletion screen."
    )
    static let dialogLead = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.dialog.lead", default: "This permanently deletes:", table: "DataPrivacy",
        comment: "Introduces the list of what is deleted."
    )
    static let item1 = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.item.1", default: "Your profile, CVs with every version, PDFs and cover letters", table: "DataPrivacy",
        comment: "Item of the deletion list."
    )
    static let item2 = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.item.2", default: "Applications, interviews, contacts and their history", table: "DataPrivacy",
        comment: "Item of the deletion list."
    )
    static let item3 = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.item.3", default: "Saved jobs, searches and companies you follow", table: "DataPrivacy",
        comment: "Item of the deletion list."
    )
    static let item4 = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.item.4", default: "Stored job emails", table: "DataPrivacy",
        comment: "Item of the deletion list."
    )
    static let item5 = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.item.5", default: "Connected mail accounts. We also remove our access at Google, Microsoft or your mail provider.", table: "DataPrivacy",
        comment: "Item of the deletion list."
    )
    static let item6 = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.item.6", default: "Your devices and notification settings", table: "DataPrivacy",
        comment: "Item of the deletion list."
    )
    static let irreversible = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.irreversible", default: "This can't be undone.", table: "DataPrivacy",
        comment: "Under the deletion list."
    )
    static let exportFirst = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.exportFirst", default: "Export my data first", table: "DataPrivacy",
        comment: "Button: back to Export everything."
    )
    static func confirmLabel(_ word: String) -> LocalizedStringResource {
        .bfhr(
            "dataPrivacy.delete.confirm.label", default: "To confirm, type **\(word)**", table: "DataPrivacy",
            comment: "Label above the confirmation field. %@ = the confirm word (delete.confirm.word), in bold (keep the asterisks)."
        )
    }

    static let confirmWord = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.confirm.word", default: "DELETE", table: "DataPrivacy",
        comment: "The word to type to confirm. Upper case; any case is accepted."
    )
    static let keep = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.keep", default: "Keep my account", table: "DataPrivacy",
        comment: "Safe button of the deletion screen (first)."
    )
    static let submit = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.submit", default: "Delete everything", table: "DataPrivacy",
        comment: "Destructive button; enabled once the word matches."
    )
    static let reauthTitle = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.reauth.title", default: "Confirm it's you", table: "DataPrivacy",
        comment: "Header of the re-authentication step."
    )
    static func reauthBody(_ email: String) -> LocalizedStringResource {
        .bfhr(
            "dataPrivacy.delete.reauth.body", default: "For your security, we'll email a sign-in link to **\(email)**. Open it on this device, then finish here.", table: "DataPrivacy",
            comment: "Why a link is needed. %@ = the signed-in email address, in bold (keep the asterisks)."
        )
    }

    static let reauthSend = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.reauth.send", default: "Send link", table: "DataPrivacy",
        comment: "Button: emails the sign-in link."
    )
    static func reauthSent(_ email: String) -> LocalizedStringResource {
        .bfhr(
            "dataPrivacy.delete.reauth.sent", default: "Link sent to **\(email)**. Open it on this device to continue.", table: "DataPrivacy",
            comment: "After Send link. %@ = the email address, in bold (keep the asterisks)."
        )
    }

    static let reauthDone = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.reauth.done", default: "You're signed in again. You can now delete your account.", table: "DataPrivacy",
        comment: "After the link was opened."
    )
    static let progress = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.progress", default: "Deleting your account…", table: "DataPrivacy",
        comment: "Destructive button label while deleting."
    )
    static let done = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.done", default: "Your account and all its data were deleted.", table: "DataPrivacy",
        comment: "Calm notice on the welcome screen after the deletion, shown once."
    )
    static let errorDelete = LocalizedStringResource.bfhr(
        "dataPrivacy.delete.error.generic", default: "Deletion didn't finish. Try again; it continues where it stopped.", table: "DataPrivacy",
        comment: "Deletion failed part-way; Delete everything resumes."
    )
}
