import BFHRCore
import Foundation

/// Copy for the Tracker's M3 editing: the Application detail's reminder, notes, interviews,
/// contacts and documents, the editors, notifications and the Pipeline's Add (table
/// `TrackerBoard`).
extension TrackerBoardStrings {
    // MARK: Toolbar and empty Pipeline

    static let add = LocalizedStringResource.bfhr("tracker.add", default: "Log an application", table: "TrackerBoard", comment: "Toolbar + button and empty-state action: opens the Log an application sheet.")
    static let emptyBodyLog = LocalizedStringResource.bfhr(
        "tracker.empty.bodyLog",
        default: "Add an application you've already sent, or save a job from Jobs.",
        table: "TrackerBoard",
        comment: "Empty Pipeline body (M3, with Log an application)."
    )
    static let csvOnDesktop = LocalizedStringResource.bfhr(
        "tracker.empty.csvOnDesktop",
        default: "Have a spreadsheet of applications? Import it in the desktop app.",
        table: "TrackerBoard",
        comment: "Empty Pipeline footnote: CSV import is desktop-only in v1."
    )
    static let insights = LocalizedStringResource.bfhr("tracker.insights", default: "Insights", table: "TrackerBoard", comment: "Toolbar button: opens Insights over the Tracker.")
    static let clearFilter = LocalizedStringResource.bfhr("tracker.filter.clear", default: "Show all applications", table: "TrackerBoard", comment: "VoiceOver label of the ✕ on the Insights filter chip.")

    static func fromInsights(_ label: String) -> LocalizedStringResource {
        .bfhr("tracker.filter.fromInsights", default: "From Insights: \(label)", table: "TrackerBoard", comment: "Pipeline filter chip after an Insights drill-down. %@ = what was drilled into.")
    }
    static func logged(_ company: String, status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("tracker.toast.logged", default: "\(company) · added to \(status.label)", table: "TrackerBoard", comment: "Toast after Log an application. %1$@ = company, %2$@ = status.")
    }

    static func deleted(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.deleted", default: "\(company) · deleted", table: "TrackerBoard", comment: "Toast after deleting an application. %@ = company.")
    }

    // MARK: Detail sections

    static let reminder = LocalizedStringResource.bfhr("tracker.detail.reminder", default: "Reminder", table: "TrackerBoard", comment: "Detail section title.")
    static let notes = LocalizedStringResource.bfhr("tracker.detail.notes", default: "Notes", table: "TrackerBoard", comment: "Detail section title.")
    static let documents = LocalizedStringResource.bfhr("tracker.detail.documents", default: "Documents", table: "TrackerBoard", comment: "Detail section title: CV and cover letter used.")
    static let noDocuments = LocalizedStringResource.bfhr(
        "tracker.detail.noDocuments",
        default: "The CV and cover letter you apply with from BruteForceHR are kept here.",
        table: "TrackerBoard",
        comment: "Documents section of a logged application with none attached."
    )
    static let notesPlaceholder = LocalizedStringResource.bfhr("tracker.detail.notesPlaceholder", default: "Salary range, who referred you, anything to remember", table: "TrackerBoard", comment: "Notes field placeholder.")
    static let notesLabel = LocalizedStringResource.bfhr("tracker.detail.notesLabel", default: "Notes for this application", table: "TrackerBoard", comment: "VoiceOver label of the notes field.")
    static let setReminder = LocalizedStringResource.bfhr("tracker.detail.setReminder", default: "Set a reminder", table: "TrackerBoard")
    static let editReminder = LocalizedStringResource.bfhr("tracker.detail.editReminder", default: "Edit reminder", table: "TrackerBoard")
    static let reminderDone = LocalizedStringResource.bfhr("tracker.detail.reminderDone", default: "Done", table: "TrackerBoard", comment: "Clears a reminder that was handled.")
    static let overdue = LocalizedStringResource.bfhr("tracker.detail.overdue", default: "Overdue", table: "TrackerBoard", comment: "A reminder whose time has passed. Neutral, never red.")
    static let addInterview = LocalizedStringResource.bfhr("tracker.detail.addInterview", default: "Add interview", table: "TrackerBoard")
    static let addContact = LocalizedStringResource.bfhr("tracker.detail.addContact", default: "Add contact", table: "TrackerBoard")
    static let addToCalendar = LocalizedStringResource.bfhr("tracker.detail.addToCalendar", default: "Add to Calendar (.ics)", table: "TrackerBoard", comment: "Shares the interview as an .ics file.")
    static let remindMe = LocalizedStringResource.bfhr("tracker.detail.remindMe", default: "Prep reminder", table: "TrackerBoard", comment: "Menu: when to be reminded before an interview.")
    static let noPrepReminder = LocalizedStringResource.bfhr("tracker.prep.none", default: "No reminder", table: "TrackerBoard")
    static let sourceManual = LocalizedStringResource.bfhr("tracker.detail.sourceManual", default: "Logged by you", table: "TrackerBoard", comment: "Found on: an application added with Log an application.")
    static let edit = LocalizedStringResource.bfhr("tracker.detail.edit", default: "Edit", table: "TrackerBoard")
    static let remove = LocalizedStringResource.bfhr("tracker.detail.remove", default: "Remove", table: "TrackerBoard")
    static let deleteApplication = LocalizedStringResource.bfhr("tracker.detail.delete", default: "Delete application", table: "TrackerBoard")
    static let deleteMessage = LocalizedStringResource.bfhr(
        "tracker.detail.deleteMessage",
        default: "Its history, interviews and notes are deleted too. This can't be undone.",
        table: "TrackerBoard",
        comment: "Confirmation of Delete application."
    )
    static let joinCall = LocalizedStringResource.bfhr("tracker.detail.join", default: "Join call", table: "TrackerBoard", comment: "Opens the interview's meeting link.")
    static let setFollowUpReminder = LocalizedStringResource.bfhr("tracker.detail.followUpReminder", default: "Remind me to follow up", table: "TrackerBoard", comment: "Primary action of the follow-up suggestion card.")
    static let openCV = LocalizedStringResource.bfhr("tracker.detail.openCV", default: "Opens the CV", table: "TrackerBoard", comment: "VoiceOver hint of the CV row.")
    static let pastRound = LocalizedStringResource.bfhr("tracker.detail.pastRound", default: "Done", table: "TrackerBoard", comment: "Tag on an interview round that has ended.")

    static func prepAt(_ lead: InterviewPrepLead) -> LocalizedStringResource {
        .bfhr("tracker.detail.prepAt", default: "Reminder \(lead.label)", table: "TrackerBoard", comment: "Interview row: the prep reminder set. %@ = 1 hour before / 1 day before.")
    }

    // MARK: Toasts

    static func reminderSet(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.reminderSet", default: "\(company) · reminder set", table: "TrackerBoard", comment: "%@ = company.")
    }

    static func reminderCleared(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.reminderCleared", default: "\(company) · reminder cleared", table: "TrackerBoard", comment: "%@ = company.")
    }

    static func interviewAdded(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.interviewAdded", default: "\(company) · interview added", table: "TrackerBoard", comment: "%@ = company.")
    }

    static func interviewSaved(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.interviewSaved", default: "\(company) · interview saved", table: "TrackerBoard", comment: "%@ = company.")
    }

    static func interviewRemoved(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.interviewRemoved", default: "\(company) · interview removed", table: "TrackerBoard", comment: "%@ = company.")
    }

    static func contactAdded(_ name: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.contactAdded", default: "\(name) · added", table: "TrackerBoard", comment: "%@ = contact name.")
    }

    static func contactSaved(_ name: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.contactSaved", default: "\(name) · saved", table: "TrackerBoard", comment: "%@ = contact name.")
    }

    static func contactRemoved(_ name: String) -> LocalizedStringResource {
        .bfhr("tracker.toast.contactRemoved", default: "\(name) · removed from this application", table: "TrackerBoard", comment: "%@ = contact name.")
    }

    static let saveFailed = LocalizedStringResource.bfhr(
        "tracker.toast.saveFailed",
        default: "That change couldn't be saved, so it's back as it was.",
        table: "TrackerBoard",
        comment: "Toast when the server refused a write; the listener restored the server's state."
    )

    // MARK: Reminder sheet

    static let reminderTitle = LocalizedStringResource.bfhr("tracker.reminder.title", default: "Reminder", table: "TrackerBoard", comment: "Reminder sheet title.")
    static let reminderWhat = LocalizedStringResource.bfhr("tracker.reminder.what", default: "What to do", table: "TrackerBoard", comment: "Reminder text field label.")
    static let reminderWhen = LocalizedStringResource.bfhr("tracker.reminder.when", default: "When", table: "TrackerBoard", comment: "Reminder date picker label.")
    static let reminderNotify = LocalizedStringResource.bfhr(
        "tracker.reminder.notify",
        default: "You'll get a notification on this iPhone at that time.",
        table: "TrackerBoard"
    )
    static let notificationsOff = LocalizedStringResource.bfhr(
        "tracker.reminder.notificationsOff",
        default: "Notifications are off for BruteForceHR, so this reminder shows in Today and the calendar only.",
        table: "TrackerBoard"
    )
    static let openSettings = LocalizedStringResource.bfhr("tracker.reminder.openSettings", default: "Open Settings", table: "TrackerBoard", comment: "Opens the iOS Settings page of the app.")
    static let save = LocalizedStringResource.bfhr("tracker.editor.save", default: "Save", table: "TrackerBoard")
    static let cancel = LocalizedStringResource.bfhr("tracker.editor.cancel", default: "Cancel", table: "TrackerBoard")
    static let removeReminder = LocalizedStringResource.bfhr("tracker.reminder.remove", default: "Remove reminder", table: "TrackerBoard")

    static func followUpReminderText(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.reminder.followUpText", default: "Follow up with \(company)", table: "TrackerBoard", comment: "Default reminder text from the follow-up suggestion. %@ = company.")
    }

    // MARK: Notifications

    static let explainerTitle = LocalizedStringResource.bfhr("tracker.notifications.title", default: "Get reminders on this iPhone", table: "TrackerBoard", comment: "Permission explainer title, shown before the system prompt.")
    static let explainerBody = LocalizedStringResource.bfhr(
        "tracker.notifications.body",
        default: "BruteForceHR can notify you at the times you set: a reminder on an application, or prep before an interview. Nothing else, and never at times you didn't choose.",
        table: "TrackerBoard"
    )
    static let explainerLater = LocalizedStringResource.bfhr(
        "tracker.notifications.later",
        default: "You can turn them on later in the iPhone's Settings.",
        table: "TrackerBoard"
    )
    static let explainerAllow = LocalizedStringResource.bfhr("tracker.notifications.allow", default: "Turn on notifications", table: "TrackerBoard")
    static let explainerNotNow = LocalizedStringResource.bfhr("tracker.notifications.notNow", default: "Not now", table: "TrackerBoard")

    static func prepNotificationTitle(_ company: String) -> LocalizedStringResource {
        .bfhr("tracker.notifications.prepTitle", default: "Interview prep · \(company)", table: "TrackerBoard", comment: "Notification title before an interview. %@ = company.")
    }

    // MARK: Interview editor

    static let interviewNew = LocalizedStringResource.bfhr("tracker.interview.new", default: "New interview", table: "TrackerBoard", comment: "Interview editor title for a new round.")
    static let interviewEdit = LocalizedStringResource.bfhr("tracker.interview.edit", default: "Interview", table: "TrackerBoard", comment: "Interview editor title for an existing round.")
    static let fieldTitle = LocalizedStringResource.bfhr("tracker.interview.titleField", default: "Title", table: "TrackerBoard")
    static let fieldTitlePlaceholder = LocalizedStringResource.bfhr("tracker.interview.titlePlaceholder", default: "Call with the hiring manager", table: "TrackerBoard")
    static let fieldKind = LocalizedStringResource.bfhr("tracker.interview.kind", default: "Type", table: "TrackerBoard")
    static let fieldRound = LocalizedStringResource.bfhr("tracker.interview.round", default: "Round", table: "TrackerBoard")
    static let fieldStarts = LocalizedStringResource.bfhr("tracker.interview.starts", default: "Starts", table: "TrackerBoard")
    static let fieldDuration = LocalizedStringResource.bfhr("tracker.interview.duration", default: "Length", table: "TrackerBoard")
    static let fieldTimeZone = LocalizedStringResource.bfhr("tracker.interview.timeZone", default: "Their time zone", table: "TrackerBoard", comment: "The organiser's time zone.")
    static let fieldLocation = LocalizedStringResource.bfhr("tracker.interview.location", default: "Place", table: "TrackerBoard", comment: "Office address, or empty for a video call.")
    static let fieldMeeting = LocalizedStringResource.bfhr("tracker.interview.meeting", default: "Video call link", table: "TrackerBoard")
    static let fieldPeople = LocalizedStringResource.bfhr("tracker.interview.people", default: "Interviewers", table: "TrackerBoard")
    static let fieldPersonName = LocalizedStringResource.bfhr("tracker.interview.personName", default: "Name", table: "TrackerBoard")
    static let fieldPersonTitle = LocalizedStringResource.bfhr("tracker.interview.personTitle", default: "Job title", table: "TrackerBoard")
    static let addPerson = LocalizedStringResource.bfhr("tracker.interview.addPerson", default: "Add interviewer", table: "TrackerBoard")
    static let fieldPrep = LocalizedStringResource.bfhr("tracker.interview.prep", default: "Prep notes", table: "TrackerBoard")
    static let removeInterview = LocalizedStringResource.bfhr("tracker.interview.remove", default: "Remove interview", table: "TrackerBoard")
    static let invalidURL = LocalizedStringResource.bfhr("tracker.interview.invalidURL", default: "Enter a link that starts with https://", table: "TrackerBoard", comment: "Validation under the video call link.")
    static let titleRequired = LocalizedStringResource.bfhr("tracker.interview.titleRequired", default: "Add a title, for example \"Technical interview\".", table: "TrackerBoard")

    static func minutes(_ count: Int) -> LocalizedStringResource {
        .bfhr("tracker.interview.minutes", default: "\(count) min", table: "TrackerBoard", comment: "Interview length. %lld = minutes.")
    }

    // MARK: Contact editor

    static let contactNew = LocalizedStringResource.bfhr("tracker.contact.new", default: "New contact", table: "TrackerBoard")
    static let contactEdit = LocalizedStringResource.bfhr("tracker.contact.edit", default: "Contact", table: "TrackerBoard")
    static let fieldName = LocalizedStringResource.bfhr("tracker.contact.name", default: "Name", table: "TrackerBoard")
    static let fieldRole = LocalizedStringResource.bfhr("tracker.contact.role", default: "Role", table: "TrackerBoard", comment: "The contact's job title, e.g. Recruiter.")
    static let fieldEmail = LocalizedStringResource.bfhr("tracker.contact.email", default: "Email", table: "TrackerBoard")
    static let fieldContactNotes = LocalizedStringResource.bfhr("tracker.contact.notes", default: "Notes", table: "TrackerBoard")
    static let nameRequired = LocalizedStringResource.bfhr("tracker.contact.nameRequired", default: "Add a name.", table: "TrackerBoard")
    static let invalidEmail = LocalizedStringResource.bfhr("tracker.contact.invalidEmail", default: "Check the address, for example name@company.com.", table: "TrackerBoard")
    static let removeContact = LocalizedStringResource.bfhr("tracker.contact.remove", default: "Remove from this application", table: "TrackerBoard")
}

extension InterviewKind {
    public var label: LocalizedStringResource {
        switch self {
        case .recruiterCall: .bfhr("interviewKind.recruiterCall", default: "Recruiter call")
        case .hiringManager: .bfhr("interviewKind.hiringManager", default: "Hiring manager")
        case .technical: .bfhr("interviewKind.technical", default: "Technical")
        case .systemDesign: .bfhr("interviewKind.systemDesign", default: "System design")
        case .takeHomeReview: .bfhr("interviewKind.takeHomeReview", default: "Take-home review")
        case .behavioral: .bfhr("interviewKind.behavioral", default: "Behavioral")
        case .onsite: .bfhr("interviewKind.onsite", default: "On-site")
        case .final: .bfhr("interviewKind.final", default: "Final round")
        case .other: .bfhr("interviewKind.other", default: "Other")
        }
    }
}
