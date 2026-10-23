import BFHRCore
import Foundation

/// Copy of the Apply sheet (table "Apply"). Tone: calm, explicit about what leaves the device.
enum ApplyStrings {
    static let loading = LocalizedStringResource.bfhr("apply.loading", default: "Loading", table: "Apply")
    static let errorTitle = LocalizedStringResource.bfhr("apply.error.title", default: "This job isn't in your list anymore", table: "Apply")
    static let writeFailed = LocalizedStringResource.bfhr("apply.toast.writeFailed", default: "A change didn't save. The Tracker shows what's stored.", table: "Apply")
    static let cancel = LocalizedStringResource.bfhr("apply.action.cancel", default: "Cancel", table: "Apply")
    static let back = LocalizedStringResource.bfhr("apply.action.back", default: "Back", table: "Apply")
    static let close = LocalizedStringResource.bfhr("apply.action.close", default: "Close", table: "Apply")

    // CV
    static let cvSection = LocalizedStringResource.bfhr("apply.cv.section", default: "CV", table: "Apply")
    static let noCV = LocalizedStringResource.bfhr("apply.cv.none", default: "No CV yet", table: "Apply")
    static let noCVBody = LocalizedStringResource.bfhr("apply.cv.none.body", default: "Import or create a CV in CVs, then come back to apply.", table: "Apply")
    static let openCVs = LocalizedStringResource.bfhr("apply.cv.open", default: "Open CVs", table: "Apply")

    static func cvDetail(language: String, isDefault: Bool) -> LocalizedStringResource {
        isDefault
            ? .bfhr("apply.cv.detail.default", default: "\(language) · Default", table: "Apply", comment: "%@ = language code, e.g. EN.")
            : .bfhr("apply.cv.detail", default: "\(language)", table: "Apply", comment: "%@ = language code, e.g. EN.")
    }

    // Cover letter
    static let letterSection = LocalizedStringResource.bfhr("apply.letter.section", default: "Cover letter", table: "Apply")
    static let letterNone = LocalizedStringResource.bfhr("apply.letter.none", default: "None", table: "Apply")
    static let letterWrite = LocalizedStringResource.bfhr("apply.letter.write", default: "Write one", table: "Apply")
    static let letterEditorLabel = LocalizedStringResource.bfhr("apply.letter.editor", default: "Cover letter text", table: "Apply")
    static let letterFooter = LocalizedStringResource.bfhr("apply.letter.footer", default: "Sent as a PDF next to your CV. Drafting with AI is on the desktop.", table: "Apply")

    static func letterTitle(_ company: String) -> LocalizedStringResource {
        .bfhr("apply.letter.title", default: "Cover letter · \(company)", table: "Apply", comment: "%@ = company.")
    }

    // Channel
    static let channelSection = LocalizedStringResource.bfhr("apply.channel.section", default: "Send via", table: "Apply")
    static let recruiterAddress = LocalizedStringResource.bfhr("apply.channel.recruiter", default: "A recruiter's email address", table: "Apply")
    static let use = LocalizedStringResource.bfhr("apply.channel.use", default: "Use", table: "Apply")

    static func channelTitle(_ channel: ApplyChannel) -> LocalizedStringResource {
        switch channel {
        case .site(_, nil): .bfhr("apply.channel.companySite", default: "Company site", table: "Apply")
        case .site(_, let board?): .bfhr("apply.channel.board", default: "On \(JobDetailFormat.sourceName(board))", table: "Apply", comment: "%@ = job site, e.g. Remotive.")
        case .email: .bfhr("apply.channel.email", default: "Email", table: "Apply")
        }
    }

    static func channelDetail(_ channel: ApplyChannel) -> LocalizedStringResource {
        switch channel {
        case .site(let url, _): .bfhr("apply.channel.siteDetail", default: "\(url.host() ?? url.absoluteString) · opens here in Safari", table: "Apply", comment: "%@ = web address host.")
        case .email(let address, true): .bfhr("apply.channel.emailPosting", default: "\(address) · from the job posting", table: "Apply", comment: "%@ = email address.")
        case .email(let address, false): .bfhr("apply.channel.emailTyped", default: "\(address) · you entered", table: "Apply", comment: "%@ = email address.")
        }
    }

    static let openSite = LocalizedStringResource.bfhr("apply.action.openSite", default: "Open company site", table: "Apply")
    static let openSiteAgain = LocalizedStringResource.bfhr("apply.action.openSiteAgain", default: "Open company site again", table: "Apply")
    static let reviewEmail = LocalizedStringResource.bfhr("apply.action.reviewEmail", default: "Review email", table: "Apply")

    static func blocker(_ blocker: ApplyBlocker) -> LocalizedStringResource {
        switch blocker {
        case .noCV: .bfhr("apply.blocker.noCV", default: "Add a CV first.", table: "Apply")
        case .pickCV: .bfhr("apply.blocker.pickCV", default: "Pick the CV to send.", table: "Apply")
        case .noRoute: .bfhr("apply.blocker.noRoute", default: "This posting has no link or address. Enter a recruiter's address to apply by email.", table: "Apply")
        case .emptyLetter: .bfhr("apply.blocker.emptyLetter", default: "Write the cover letter, or choose None.", table: "Apply")
        }
    }

    // Kit
    static let kitIntro = LocalizedStringResource.bfhr("apply.kit.intro", default: "Fill in the form on the company site. Your files are here if it asks for them.", table: "Apply")
    static let inProgress = LocalizedStringResource.bfhr("apply.kit.inProgress", default: "In progress. Come back here when you've sent it.", table: "Apply")
    static let filesSection = LocalizedStringResource.bfhr("apply.files.section", default: "Your files", table: "Apply")
    static let filesFooter = LocalizedStringResource.bfhr("apply.files.footer", default: "Use Share › Save to Files so the form's file picker can find your files.", table: "Apply")
    static let preparingFiles = LocalizedStringResource.bfhr("apply.files.preparing", default: "Making your PDFs…", table: "Apply")
    static let filesFailed = LocalizedStringResource.bfhr("apply.files.failed", default: "We couldn't make the PDFs", table: "Apply")
    static let filesUnavailable = LocalizedStringResource.bfhr("apply.files.unavailable", default: "PDFs can't be made in this build.", table: "Apply")
    static let copyLetter = LocalizedStringResource.bfhr("apply.files.copyLetter", default: "Copy cover letter text", table: "Apply")
    static let letterCopied = LocalizedStringResource.bfhr("apply.toast.letterCopied", default: "Cover letter copied", table: "Apply")

    static func shareFile(_ name: String) -> LocalizedStringResource {
        .bfhr("apply.files.share", default: "Share \(name)", table: "Apply", comment: "%@ = file name.")
    }

    // Email
    static let from = LocalizedStringResource.bfhr("apply.email.from", default: "From", table: "Apply")
    static let fromMailApp = LocalizedStringResource.bfhr("apply.email.fromMailApp", default: "Your Mail app", table: "Apply")
    static let to = LocalizedStringResource.bfhr("apply.email.to", default: "To", table: "Apply")
    static let subject = LocalizedStringResource.bfhr("apply.email.subject", default: "Subject", table: "Apply")
    static let message = LocalizedStringResource.bfhr("apply.email.message", default: "Message", table: "Apply")
    static let attachments = LocalizedStringResource.bfhr("apply.email.attachments", default: "Attachments", table: "Apply")
    static let accountFooter = LocalizedStringResource.bfhr("apply.email.accountFooter", default: "Sent from your connected account. You can undo for 10 seconds after Send.", table: "Apply")
    static let mailAppFooter = LocalizedStringResource.bfhr("apply.email.mailAppFooter", default: "Opens in Mail with your files attached. Connect an email account in Settings to send from here.", table: "Apply")
    static let openInMail = LocalizedStringResource.bfhr("apply.email.openInMail", default: "Open in Mail", table: "Apply")
    static let offlineSend = LocalizedStringResource.bfhr("apply.email.offline", default: "You're offline. Your draft stays here.", table: "Apply")

    static func sendTo(_ address: String) -> LocalizedStringResource {
        .bfhr("apply.email.sendTo", default: "Send to \(address)", table: "Apply", comment: "%@ = recipient address.")
    }

    static func emailSubject(role: String) -> LocalizedStringResource {
        .bfhr("apply.email.defaultSubject", default: "Application: \(role)", table: "Apply", comment: "%@ = job title.")
    }

    /// The draft's first text; it names the cover letter only when one goes with it.
    static func emailBody(role: String, company: String, name: String, withLetter: Bool) -> LocalizedStringResource {
        if withLetter {
            .bfhr(
                "apply.email.defaultBodyWithLetter",
                default: "Hello,\n\nI'd like to apply for the \(role) role at \(company). My CV and cover letter are attached.\n\nKind regards,\n\(name)",
                table: "Apply",
                comment: "Default email body. %1$@ = job title, %2$@ = company, %3$@ = the user's name (may be empty). With a cover letter attached."
            )
        } else {
            .bfhr(
                "apply.email.defaultBody",
                default: "Hello,\n\nI'd like to apply for the \(role) role at \(company). My CV is attached.\n\nKind regards,\n\(name)",
                table: "Apply",
                comment: "Default email body. %1$@ = job title, %2$@ = company, %3$@ = the user's name (may be empty). Without a cover letter."
            )
        }
    }

    static func sendError(_ error: ApplySendError) -> LocalizedStringResource {
        switch error {
        case .offline: .bfhr("apply.send.offline", default: "You're offline. Your draft stays here.", table: "Apply")
        case .dailyCap: .bfhr("apply.send.dailyCap", default: "You've reached today's sending limit. It resets tomorrow.", table: "Apply")
        case .accountUnavailable: .bfhr("apply.send.account", default: "This account can't send right now. Reconnect it in Settings, or open the email in Mail.", table: "Apply")
        case .attachmentsTooLarge: .bfhr("apply.send.tooLarge", default: "The attachments are too large for this account.", table: "Apply")
        case .alreadySent: .bfhr("apply.send.alreadySent", default: "It was already sent.", table: "Apply")
        case .failed: .bfhr("apply.send.failed", default: "It didn't send. Your draft stays here; try again.", table: "Apply")
        }
    }

    static func sending(to address: String, seconds: Int) -> LocalizedStringResource {
        .bfhr("apply.toast.sending", default: "Sending to \(address) in \(seconds) s", table: "Apply", comment: "%1$@ = address, %2$lld = seconds. Followed by Undo.")
    }

    // Toasts
    static func markedApplied(_ company: String) -> LocalizedStringResource {
        .bfhr("apply.toast.applied", default: "\(company) · marked as Applied", table: "Apply", comment: "%@ = company. Followed by Undo.")
    }

    static func backToSaved(_ company: String) -> LocalizedStringResource {
        .bfhr("apply.toast.backToSaved", default: "\(company) · back in Saved", table: "Apply", comment: "%@ = company.")
    }
}
