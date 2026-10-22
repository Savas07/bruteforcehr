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
