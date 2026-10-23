import BFHRCore
import Foundation

/// Tracker › Calendar copy (table `TrackerCalendar`).
enum TrackerCalendarStrings {
    static let scopeLabel = LocalizedStringResource.bfhr("calendar.scope.label", default: "Dates to show", table: "TrackerCalendar", comment: "VoiceOver label of the Upcoming / Past picker.")
    static let upcoming = LocalizedStringResource.bfhr("calendar.scope.upcoming", default: "Upcoming", table: "TrackerCalendar")
    static let past = LocalizedStringResource.bfhr("calendar.scope.past", default: "Past", table: "TrackerCalendar")
    static let emptyUpcoming = LocalizedStringResource.bfhr(
        "calendar.empty.upcoming",
        default: "Nothing scheduled. Interviews and reminders you add to an application show up here.",
        table: "TrackerCalendar"
    )
    static let emptyPast = LocalizedStringResource.bfhr("calendar.empty.past", default: "Nothing in the last 90 days.", table: "TrackerCalendar")
    static let reminder = LocalizedStringResource.bfhr("calendar.kind.reminder", default: "Reminder", table: "TrackerCalendar")
    static let followUp = LocalizedStringResource.bfhr("calendar.kind.followUp", default: "Suggested follow-up", table: "TrackerCalendar", comment: "A suggestion, never automatic: 7 days after applying without a reply.")
    static let assessmentDue = LocalizedStringResource.bfhr("calendar.kind.assessment", default: "Assessment due", table: "TrackerCalendar")
    static let replyBy = LocalizedStringResource.bfhr("calendar.kind.replyBy", default: "Reply by", table: "TrackerCalendar")
    static let openApplication = LocalizedStringResource.bfhr("calendar.action.open", default: "Open application", table: "TrackerCalendar")
    static let openHint = LocalizedStringResource.bfhr("calendar.row.hint", default: "Opens the application", table: "TrackerCalendar")

    static func followUpTitle(_ company: String) -> LocalizedStringResource {
        .bfhr("calendar.followUp.title", default: "No reply from \(company) yet. Send a short follow-up?", table: "TrackerCalendar", comment: "%@ = company.")
    }

    static func interviewKind(_ kind: InterviewKind, round: Int) -> LocalizedStringResource {
        .bfhr("calendar.kind.interview", default: "\(kind.label) · round \(round)", table: "TrackerCalendar", comment: "Interview row caption. %1$@ = interview type, %2$lld = round.")
    }
}
