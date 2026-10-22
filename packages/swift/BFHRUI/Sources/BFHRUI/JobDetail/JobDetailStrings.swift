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

    static func skillAddedToast(_ skill: String) -> LocalizedStringResource {
        .bfhr(
            "jobDetail.toast.skillAdded", default: "\(skill) added to your skills", table: "JobDetail",
            comment: "Toast after I have this on a skill gap. %@ = skill name, e.g. Vue.js. Followed by Undo."
        )
    }
}
