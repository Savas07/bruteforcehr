import BFHRCore
import Foundation

/// Strings the Mail review model produces (table "MailReview"). Copy: mail-review.md "Copy notes".
enum MailReviewStrings {
    static func confirmedMoved(_ company: String, to status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr(
            "mailReview.toast.confirmedMoved",
            default: "Confirmed: \(company) moved to \(status.label)",
            table: "MailReview",
            comment: "Toast after confirming a review-queue email that moved the application. %1$@ = company, %2$@ = status label."
        )
    }

    static func confirmedLinked(_ company: String) -> LocalizedStringResource {
        .bfhr(
            "mailReview.toast.confirmedLinked",
            default: "Confirmed: email linked to \(company)",
            table: "MailReview",
            comment: "Toast after confirming a review-queue email that didn't change the status. %@ = company."
        )
    }

    static let notJobMail = LocalizedStringResource.bfhr(
        "mailReview.toast.notJobMail",
        default: "Marked as not job mail",
        table: "MailReview",
        comment: "Toast after Not job mail (decisions.md D19). The email leaves every Mail list."
    )
}

/// Strings the Mail tab's views show (table "MailReview"). Copy: mail-review.md and states.md
/// copy notes, reworked with skill://ux-copy (TR siz, DE du).
enum MailViewStrings {
    // States
    static let loading = LocalizedStringResource.bfhr("mail.loading", default: "Loading job mail", table: "MailReview")
    static let errorTitle = LocalizedStringResource.bfhr("mail.error.title", default: "We couldn't load your job mail", table: "MailReview")
    static let connectTitle = LocalizedStringResource.bfhr("mail.connect.title", default: "Connect your email", table: "MailReview")
    static let connectBody = LocalizedStringResource.bfhr("mail.connect.body", default: "We'll find replies about your applications. When we're not sure what an email means, we'll ask you first.", table: "MailReview")
    static let connectAction = LocalizedStringResource.bfhr("mail.connect.action", default: "Connect email", table: "MailReview")
    static let offlineFootnote = LocalizedStringResource.bfhr("mail.offlineFootnote", default: "New emails will appear when you're back online.", table: "MailReview")

    // Account scope (title menu) and sync line
    static let allAccounts = LocalizedStringResource.bfhr("mail.scope.allAccounts", default: "All accounts", table: "MailReview")
    static let scopeMenu = LocalizedStringResource.bfhr("mail.scope.menu", default: "Show email from", table: "MailReview", comment: "Title menu heading: pick all accounts or one address.")
    static let notCheckedYet = LocalizedStringResource.bfhr("mail.sync.never", default: "Not checked yet", table: "MailReview")

    static func checked(_ relative: String) -> LocalizedStringResource {
        .bfhr("mail.sync.checked", default: "Checked \(relative)", table: "MailReview", comment: "Sync line. %@ = relative time from the system formatter, e.g. \"6 min. ago\".")
    }


    static func needsSignIn(_ address: String) -> LocalizedStringResource {
        .bfhr("mail.scope.needsSignIn", default: "\(address) · Needs sign-in", table: "MailReview", comment: "Title menu row for an account that needs re-auth. %@ = address.")
    }

    // Account health
    static let reconnectBody = LocalizedStringResource.bfhr("mail.reconnect.body", default: "We can't check this inbox until you sign in again.", table: "MailReview")
    static let reconnectAction = LocalizedStringResource.bfhr("mail.reconnect.action", default: "Reconnect", table: "MailReview")

    static func reconnect(_ address: String) -> LocalizedStringResource {
        .bfhr("mail.reconnect.title", default: "Reconnect \(address)", table: "MailReview")
    }

    // Chips
    static let chipFilters = LocalizedStringResource.bfhr("mail.chip.group", default: "Show", table: "MailReview", comment: "Accessibility label of the chip row.")
    static let chipUpdates = LocalizedStringResource.bfhr("mail.chip.updates", default: "Updates", table: "MailReview")
    static let chipAll = LocalizedStringResource.bfhr("mail.chip.all", default: "All job mail", table: "MailReview")
    static let chipCategory = LocalizedStringResource.bfhr("mail.chip.category", default: "Category", table: "MailReview")
    static let allCategories = LocalizedStringResource.bfhr("mail.category.all", default: "All categories", table: "MailReview")

    static let chipToReviewPlain = LocalizedStringResource.bfhr("mail.chip.toReviewPlain", default: "To review", table: "MailReview", comment: "The To review chip while the count isn't known yet (loading, error).")

    static func chipToReview(_ count: Int) -> LocalizedStringResource {
        .bfhr("mail.chip.toReview", default: "To review (\(count))", table: "MailReview")
    }

    // To review
    static let queueHeader = LocalizedStringResource.bfhr("mail.queue.header", default: "We weren't sure about these", table: "MailReview", comment: "Section header over the review queue.")
    static let queueFooter = LocalizedStringResource.bfhr("mail.queue.footer", default: "Nothing changes until you confirm. Swipe right to confirm, or tap to check the details.", table: "MailReview")
    static let queueEmptyTitle = LocalizedStringResource.bfhr("mail.queueEmpty.title", default: "Nothing to review", table: "MailReview")
    static let queueEmptyBody = LocalizedStringResource.bfhr("mail.queueEmpty.body", default: "When we're not sure what an email means, we'll ask you here.", table: "MailReview")
    static let seeRecentUpdates = LocalizedStringResource.bfhr("mail.queueEmpty.action", default: "See recent updates", table: "MailReview")
    static let review = LocalizedStringResource.bfhr("mail.action.review", default: "Review…", table: "MailReview", comment: "Opens the review sheet.")
    static let reviewLater = LocalizedStringResource.bfhr("mail.action.reviewLater", default: "Review later", table: "MailReview")

    static func receivedIn(_ address: String) -> LocalizedStringResource {
        .bfhr("mail.row.account", default: "To \(address)", table: "MailReview", comment: "Which connected inbox the email arrived in. %@ = address.")
    }

    // Updates
    static let updatesHeader = LocalizedStringResource.bfhr("mail.updates.header", default: "Changed automatically", table: "MailReview")
    static let updatesFooter = LocalizedStringResource.bfhr("mail.updates.footer", default: "Changes we made from your email in the last 14 days. Undo puts the email back in To review.", table: "MailReview")
    static let updatesEmpty = LocalizedStringResource.bfhr("mail.updates.empty", default: "No automatic changes in the last 14 days.", table: "MailReview")
    static let markAllSeen = LocalizedStringResource.bfhr("mail.updates.markAllSeen", default: "Mark all as seen", table: "MailReview")
    static let more = LocalizedStringResource.bfhr("mail.toolbar.more", default: "More", table: "MailReview")

    // All job mail
    static let allEmpty = LocalizedStringResource.bfhr("mail.all.empty", default: "No job mail yet. Replies about your applications will show up here.", table: "MailReview")
    static let categoryEmpty = LocalizedStringResource.bfhr("mail.all.categoryEmpty", default: "No emails in this category", table: "MailReview")
    static let showAllCategories = LocalizedStringResource.bfhr("mail.all.showAllCategories", default: "Show all categories", table: "MailReview")
    static let jobAlertsTitle = LocalizedStringResource.bfhr("mail.jobAlerts.title", default: "Job alerts", table: "MailReview")
    static let jobAlertsDetail = LocalizedStringResource.bfhr("mail.jobAlerts.detail", default: "New postings from these emails go to Jobs.", table: "MailReview")

    static func jobAlerts(_ count: Int) -> LocalizedStringResource {
        .bfhr("mail.jobAlerts", default: "\(count) emails", table: "MailReview", comment: "Job-alert bundle row count.")
    }

    static func reviewState(_ state: ReviewState) -> LocalizedStringResource? {
        switch state {
        case .pending: .bfhr("mail.state.pending", default: "To review", table: "MailReview")
        case .autoApplied: .bfhr("mail.state.autoApplied", default: "Applied automatically", table: "MailReview")
        case .confirmed: .bfhr("mail.state.confirmed", default: "Confirmed", table: "MailReview")
        case .corrected: .bfhr("mail.state.corrected", default: "Corrected", table: "MailReview")
        case .notRequired, .dismissed: nil
        }
    }

    /// The Category ▾ menu's names (plural folders), not the classification sentence.
    static func categoryName(_ category: MailCategory) -> LocalizedStringResource {
        switch category {
        case .applicationReceived: .bfhr("mail.category.applicationReceived", default: "Confirmations", table: "MailReview")
        case .interviewInvite: .bfhr("mail.category.interviewInvite", default: "Interviews", table: "MailReview")
        case .assessment: .bfhr("mail.category.assessment", default: "Assessments", table: "MailReview")
        case .offer: .bfhr("mail.category.offer", default: "Offers", table: "MailReview")
        case .rejection: .bfhr("mail.category.rejection", default: "Decisions", table: "MailReview")
        case .recruiterOutreach: .bfhr("mail.category.recruiterOutreach", default: "Recruiters", table: "MailReview")
        case .infoRequest: .bfhr("mail.category.infoRequest", default: "Info requests", table: "MailReview")
        case .jobAlert: .bfhr("mail.category.jobAlert", default: "Job alerts", table: "MailReview")
        case .otherJob: .bfhr("mail.category.otherJob", default: "Other", table: "MailReview")
        case .notJob: .bfhr("mail.category.notJob", default: "Not job mail", table: "MailReview")
        }
    }

    // Review sheet + Change…
    static let sheetTitle = LocalizedStringResource.bfhr("mail.sheet.title", default: "Review email", table: "MailReview")
    static let changeTitle = LocalizedStringResource.bfhr("mail.change.title", default: "Change", table: "MailReview")
    static let changeFooter = LocalizedStringResource.bfhr("mail.change.footer", default: "Your corrections help us sort future emails.", table: "MailReview")
    static let selectCategory = LocalizedStringResource.bfhr("mail.change.selectCategory", default: "Select a category", table: "MailReview")
    static let selectApplication = LocalizedStringResource.bfhr("mail.change.selectApplication", default: "Link to application…", table: "MailReview")
    static let statusNeedsApplication = LocalizedStringResource.bfhr("mail.change.statusNeedsApplication", default: "Link an application first to change its status.", table: "MailReview")
    static let searchApplications = LocalizedStringResource.bfhr("mail.change.search", default: "Company or role", table: "MailReview", comment: "Search prompt in the application picker.")
    static let noMatchingApplications = LocalizedStringResource.bfhr("mail.change.noMatches", default: "No applications match", table: "MailReview")

    // Errors
    static let actionFailed = LocalizedStringResource.bfhr("mail.toast.actionFailed", default: "That change didn't go through. Try again.", table: "MailReview")
}
