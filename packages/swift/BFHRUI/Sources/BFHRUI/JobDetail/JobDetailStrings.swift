import Foundation

/// Toast copy the job detail model produces (table "JobDetail"). Undo comes from `Strings.undo`.
enum JobDetailStrings {
    static let savedToast = LocalizedStringResource.bfhr(
        "jobDetail.toast.saved", default: "Saved to your list", table: "JobDetail",
        comment: "Toast after saving a job from its detail. Followed by Undo."
    )

    static let hiddenToast = LocalizedStringResource.bfhr(
        "jobDetail.toast.hidden", default: "Hidden from your feed", table: "JobDetail",
        comment: "Toast after Not for me on a job (decisions.md D19). Followed by Undo."
    )

    static let reasonsSavedToast = LocalizedStringResource.bfhr(
        "jobDetail.toast.reasonsSaved", default: "Thanks. We'll use this to tune your matches.", table: "JobDetail",
        comment: "Toast after Save reason in the Not for me reason sheet. No action."
    )

    static func skillAddedToast(_ skill: String) -> LocalizedStringResource {
        .bfhr(
            "jobDetail.toast.skillAdded", default: "\(skill) added to your skills", table: "JobDetail",
            comment: "Toast after I have this on a skill gap. %@ = skill name, e.g. Vue.js. Followed by Undo."
        )
    }

    static let markedAppliedToast = LocalizedStringResource.bfhr(
        "jobDetail.toast.markedApplied", default: "Marked as Applied", table: "JobDetail",
        comment: "Toast after Yes, I applied on the Did you apply? card. Followed by Undo."
    )

    static let backToSavedToast = LocalizedStringResource.bfhr(
        "jobDetail.toast.backToSaved", default: "Back in Saved", table: "JobDetail",
        comment: "Toast after I'm not applying: the job's application moves back to Saved."
    )

    static let writeFailedToast = LocalizedStringResource.bfhr(
        "jobDetail.toast.writeFailed", default: "A change didn't save. This page shows what's stored.", table: "JobDetail"
    )
}
