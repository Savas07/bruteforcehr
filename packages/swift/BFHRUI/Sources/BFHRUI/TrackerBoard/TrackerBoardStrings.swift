import BFHRCore
import Foundation

/// The Tracker's own copy (table `TrackerBoard`). Status labels, Undo, Move to…, dates and the
/// shared timeline / nudge copy come from `Strings` and the domain labels.
enum TrackerBoardStrings {
    // MARK: Pipeline

    static let loading = LocalizedStringResource.bfhr("tracker.loading", default: "Loading applications", table: "TrackerBoard")
    static let errorTitle = LocalizedStringResource.bfhr("tracker.error.title", default: "We couldn't load your applications", table: "TrackerBoard")
    static let emptyTitle = LocalizedStringResource.bfhr("tracker.empty.title", default: "No applications yet", table: "TrackerBoard")
    static let emptyBody = LocalizedStringResource.bfhr(
        "tracker.empty.body",
        default: "Save a job in Jobs and it shows up here, ready to track.",
        table: "TrackerBoard",
        comment: "Empty Pipeline. Saving a job creates an application in Saved (decisions.md D02)."
    )
    static let findJobs = LocalizedStringResource.bfhr("tracker.empty.findJobs", default: "Find jobs", table: "TrackerBoard", comment: "Empty Pipeline: opens the Jobs tab.")
    static let closedEmpty = LocalizedStringResource.bfhr("tracker.closed.empty", default: "Closed applications will appear here.", table: "TrackerBoard", comment: "Closed scope with no application.")
    static let scopeLabel = LocalizedStringResource.bfhr("tracker.scope.label", default: "Applications to show", table: "TrackerBoard", comment: "VoiceOver label of the Active / Closed / All picker.")
    static let stagesLabel = LocalizedStringResource.bfhr("tracker.strip.label", default: "Stages", table: "TrackerBoard", comment: "VoiceOver label of the stage index strip.")
    static let stageHint = LocalizedStringResource.bfhr("tracker.strip.hint", default: "Shows this stage in the list", table: "TrackerBoard", comment: "VoiceOver hint of a stage strip tab.")
    static let expanded = LocalizedStringResource.bfhr("tracker.section.expanded", default: "Expanded", table: "TrackerBoard", comment: "VoiceOver value of a stage section header.")
    static let collapsed = LocalizedStringResource.bfhr("tracker.section.collapsed", default: "Collapsed", table: "TrackerBoard", comment: "VoiceOver value of a stage section header.")
    static let interview = LocalizedStringResource.bfhr("tracker.row.interview", default: "Interview", table: "TrackerBoard", comment: "Row second line before the interview's day and time.")
    static let autoMoved = LocalizedStringResource.bfhr("tracker.row.autoMoved", default: "Last change came from an email", table: "TrackerBoard", comment: "VoiceOver: the row's envelope badge.")
    static let closeApplication = LocalizedStringResource.bfhr("tracker.action.close", default: "Close…", table: "TrackerBoard", comment: "Row action: opens the outcome sheet (Not selected, Withdrawn, No response, Accepted, Declined).")
    static let closeTitle = LocalizedStringResource.bfhr("tracker.sheet.close.title", default: "Close application", table: "TrackerBoard", comment: "Title of the outcome sheet.")
    static let moveFailed = LocalizedStringResource.bfhr("tracker.toast.moveFailed", default: "That move isn't available from this stage.", table: "TrackerBoard")
    static let dropHint = LocalizedStringResource.bfhr("tracker.drop.hint", default: "Drop on a stage to move it", table: "TrackerBoard", comment: "Drop panel title while dragging an application.")

    static func moveTo(_ status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("tracker.action.advance", default: "Move to \(status.label)", table: "TrackerBoard", comment: "Leading swipe and drop target label. %@ = status.")
    }

    static func noReply(_ days: Int) -> LocalizedStringResource {
        .bfhr("tracker.row.noReply", default: "No reply in \(days) days", table: "TrackerBoard")
    }

    static func daysShort(_ days: Int) -> LocalizedStringResource {
        .bfhr("tracker.row.daysShort", default: "\(days) d", table: "TrackerBoard", comment: "Days in the current stage, trailing on a row. %lld = days.")
    }

    static func daysInStage(_ days: Int) -> LocalizedStringResource {
        .bfhr("tracker.row.daysInStage", default: "Days in this stage: \(days)", table: "TrackerBoard", comment: "VoiceOver for the trailing day count. %lld = days.")
    }

    // MARK: Toasts

    static func suggestionDismissed(_ company: String) -> LocalizedStringResource {
        .bfhr(
            "tracker.toast.suggestionDismissed",
            default: "\(company) · suggestion dismissed",
            table: "TrackerBoard",
            comment: "Toast after Not needed / Keep waiting on a follow-up or no-response suggestion. %@ = company."
        )
    }

    static func markedNotSelected(_ company: String) -> LocalizedStringResource {
        .bfhr(
            "tracker.toast.notSelected",
            default: "\(company) · marked as not selected. Your notes stay here.",
            table: "TrackerBoard",
            comment: "Toast after moving to Not selected. Calm, never \"rejected\". %@ = company."
        )
    }

    // MARK: Detail

    static let actions = LocalizedStringResource.bfhr("tracker.detail.actions", default: "Actions", table: "TrackerBoard", comment: "Toolbar menu of the Application detail.")
    static let progress = LocalizedStringResource.bfhr("tracker.detail.progress", default: "Progress", table: "TrackerBoard")
    static let activity = LocalizedStringResource.bfhr("tracker.detail.activity", default: "Activity", table: "TrackerBoard", comment: "Timeline section title.")
    static let interviews = LocalizedStringResource.bfhr("tracker.detail.interviews", default: "Interviews", table: "TrackerBoard")
    static let details = LocalizedStringResource.bfhr("tracker.detail.details", default: "Details", table: "TrackerBoard")
    static let contacts = LocalizedStringResource.bfhr("tracker.detail.contacts", default: "Contacts", table: "TrackerBoard")
    static let suggestion = LocalizedStringResource.bfhr("tracker.detail.suggestion", default: "Suggestion", table: "TrackerBoard", comment: "Section title above a no-response suggestion.")
    static let nextStep = LocalizedStringResource.bfhr("tracker.detail.nextStep", default: "Next step", table: "TrackerBoard")
    static let foundOn = LocalizedStringResource.bfhr("tracker.detail.foundOn", default: "Found on", table: "TrackerBoard", comment: "Where the job came from (Greenhouse, LinkedIn…).")
    static let notFoundTitle = LocalizedStringResource.bfhr("tracker.detail.notFound", default: "This application isn't here any more", table: "TrackerBoard")

    static func lastMoved(_ day: String) -> LocalizedStringResource {
        .bfhr("tracker.detail.lastMoved", default: "Last moved: \(day)", table: "TrackerBoard", comment: "Under the status pill. %@ = relative day (Today, 19 Oct).")
    }

    static func progressStep(_ status: ApplicationStatus, step: Int, of total: Int) -> LocalizedStringResource {
        .bfhr(
            "tracker.detail.progressStep",
            default: "\(status.label), stage \(step) of \(total)",
            table: "TrackerBoard",
            comment: "Progress strip caption. %1$@ = status, %2$lld = step, %3$lld = number of steps."
        )
    }

    static func nextStage(_ status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("tracker.detail.nextStage", default: "Next: \(status.label)", table: "TrackerBoard", comment: "Progress strip: the following stage. %@ = status.")
    }

    static func round(_ number: Int) -> LocalizedStringResource {
        .bfhr("tracker.detail.round", default: "Round \(number)", table: "TrackerBoard", comment: "Interview round. %lld = round number.")
    }

    static func emailContact(_ name: String) -> LocalizedStringResource {
        .bfhr("tracker.detail.emailContact", default: "Email \(name)", table: "TrackerBoard", comment: "VoiceOver label of a contact's email link. %@ = contact name.")
    }
}
