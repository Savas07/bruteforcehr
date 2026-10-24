import BFHRCore
import Foundation

// Strings live in BFHRUI's string catalogs: `Resources/Localizable.xcstrings` for shared
// components (this file), and `<Screen>/<Screen>.xcstrings` (table "<Screen>") for each screen.
// Keys are semantic ("status.rejected"); the English default sits next to the key so code reads
// naturally and the catalog's `en` value matches it. Every key has en, tr (siz) and de (du).

extension LocalizedStringResource {
    /// A string from BFHRUI's catalogs. `table` nil is the shared `Localizable` table; screens pass
    /// their own table name ("Today", "JobDetail", "CVEditor", "TrackerBoard", "MailReview").
    public static func bfhr(
        _ key: StaticString,
        default value: String.LocalizationValue,
        table: String? = nil,
        comment: StaticString? = nil
    ) -> LocalizedStringResource {
        LocalizedStringResource(key, defaultValue: value, table: table, bundle: .atURL(Bundle.module.bundleURL), comment: comment)
    }
}

/// Shared strings used by components and by more than one screen.
public enum Strings {
    // Actions
    public static let undo = LocalizedStringResource.bfhr("action.undo", default: "Undo")
    public static let open = LocalizedStringResource.bfhr("action.open", default: "Open")
    public static let view = LocalizedStringResource.bfhr("action.view", default: "View")
    public static let tryAgain = LocalizedStringResource.bfhr("action.tryAgain", default: "Try again")
    public static let goBack = LocalizedStringResource.bfhr("action.goBack", default: "Go back")
    public static let copyDetails = LocalizedStringResource.bfhr("action.copyDetails", default: "Copy details")
    public static let close = LocalizedStringResource.bfhr("action.close", default: "Close")
    public static let moveTo = LocalizedStringResource.bfhr("action.moveTo", default: "Move to…")
    public static let snooze = LocalizedStringResource.bfhr("action.snooze", default: "Snooze")
    public static let notNeeded = LocalizedStringResource.bfhr("action.notNeeded", default: "Not needed", comment: "Dismisses a suggestion (follow-up, no response). decisions.md D19.")
    public static let notForMe = LocalizedStringResource.bfhr("action.notForMe", default: "Not for me", comment: "Hides a job. decisions.md D19.")
    public static let notJobMail = LocalizedStringResource.bfhr("action.notJobMail", default: "Not job mail", comment: "Removes an email from the job-mail list. decisions.md D19.")
    public static let confirm = LocalizedStringResource.bfhr("action.confirm", default: "Confirm")
    public static let change = LocalizedStringResource.bfhr("action.change", default: "Change…")

    // Toasts
    public static let restored = LocalizedStringResource.bfhr("toast.restored", default: "Restored", comment: "Follow-up toast after Undo. Never offers another Undo.")

    public static func moved(_ object: String, to status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("toast.moved", default: "\(object) · moved to \(status.label)", comment: "Toast after a status move. %1$@ = company, %2$@ = status label.")
    }

    // Loading, errors, connection
    public static let loading = LocalizedStringResource.bfhr("state.loading", default: "Loading", comment: "Accessibility label of a skeleton when the screen gives no specific one.")
    public static let offlineTitle = LocalizedStringResource.bfhr("connection.offline.title", default: "You're offline.")
    public static let offlineBody = LocalizedStringResource.bfhr("connection.offline.body", default: "Changes save on this device and sync when you're back online.")
    public static let backOnline = LocalizedStringResource.bfhr("connection.backOnline", default: "Back online")
    public static let allSynced = LocalizedStringResource.bfhr("connection.allSynced", default: "All changes synced")
    public static let waitingToSync = LocalizedStringResource.bfhr("connection.waitingToSync", default: "Waiting to sync")
    public static let needsConnection = LocalizedStringResource.bfhr("connection.needsConnection", default: "Needs a connection", comment: "Why a server-only action is disabled offline.")

    public static func updated(_ time: String) -> LocalizedStringResource {
        .bfhr("stamp.updated", default: "Updated \(time)", comment: "Stale-data stamp. %@ = time, e.g. 09:12.")
    }

    public static func lastChecked(_ time: String) -> LocalizedStringResource {
        .bfhr("stamp.lastChecked", default: "Last checked \(time)", comment: "Mail sync stamp. %@ = time, e.g. 09:40.")
    }

    // Undo availability (decisions.md D11)
    public static let cantUndo = LocalizedStringResource.bfhr("undo.unavailable", default: "Can't undo — the status changed since.")

    // AI and provenance (decisions.md D13, components.md SourceTag)
    public static let aiAssisted = LocalizedStringResource.bfhr("ai.badge", default: "AI-assisted")
    public static let aiSummaryLabel = LocalizedStringResource.bfhr("ai.summaryLabel", default: "Summary · can be wrong")
    public static let aiDisclaimer = LocalizedStringResource.bfhr("ai.disclaimer", default: "Suggested by Claude. Check names, numbers and dates before you use it.")
    public static let needsALook = LocalizedStringResource.bfhr("confidence.needsALook", default: "Needs a look", comment: "Low-confidence tag on proposals and imported fields. Amber, never red.")

    // Pane errors (states.md rule 5: what + why + how to fix, "We couldn't…", no raw codes)
    public static func paneErrorTitle(_ kind: LoadFailure.Kind) -> LocalizedStringResource {
        switch kind {
        case .network: .bfhr("error.network.title", default: "We couldn't load this")
        case .permission: .bfhr("error.permission.title", default: "We couldn't open this")
        case .notFound: .bfhr("error.notFound.title", default: "This isn't here anymore")
        case .unknown: .bfhr("error.unknown.title", default: "We couldn't load this")
        }
    }

    public static func paneErrorMessage(_ kind: LoadFailure.Kind) -> LocalizedStringResource {
        switch kind {
        case .network: .bfhr("error.network.message", default: "The connection dropped before your data arrived. Check your connection, then try again.")
        case .permission: .bfhr("error.permission.message", default: "Your session may have ended. Sign in again, then try again.")
        case .notFound: .bfhr("error.notFound.message", default: "It may have been removed on another device.")
        case .unknown: .bfhr("error.unknown.message", default: "Something on our side didn't respond. Try again in a moment.")
        }
    }

    // Provenance, waits, chrome
    public static let sourceCV = LocalizedStringResource.bfhr("source.cv", default: "From CV")
    public static let sourceEmail = LocalizedStringResource.bfhr("source.email", default: "From email")
    public static let longWait = LocalizedStringResource.bfhr("wait.long", default: "This can take up to a minute. You can keep working; we'll show it here.")
    public static let settings = LocalizedStringResource.bfhr("chrome.settings", default: "Settings")
    public static let accountNeedsAttention = LocalizedStringResource.bfhr("chrome.accountNeedsAttention", default: "An email account needs attention")
    public static let showFullEmail = LocalizedStringResource.bfhr("action.showFullEmail", default: "Show full email")
    public static let showLess = LocalizedStringResource.bfhr("action.showLess", default: "Show less")
    public static let viewSource = LocalizedStringResource.bfhr("action.viewSource", default: "View source")
    public static let willSync = LocalizedStringResource.bfhr("connection.willSync", default: "Will sync when you're back online.")

    // Automatic changes (today-home.md / mail-review.md copy notes)
    public static func autoChange(to status: ApplicationStatus, sender: String?) -> LocalizedStringResource {
        if let sender {
            .bfhr("autoChange.fromEmail", default: "Moved to \(status.label) — from an email by \(sender)", comment: "%1$@ = status label, %2$@ = sender address or company. TR avoids suffixes on the placeholder.")
        } else {
            .bfhr("autoChange.automatic", default: "Moved to \(status.label) automatically", comment: "%@ = status label.")
        }
    }

    // Nudges (tracker.md copy notes, decisions.md D15)
    public static func followUpPrompt(days: Int) -> LocalizedStringResource {
        .bfhr("nudge.followUp", default: "No reply in \(days) days. Send a short follow-up?")
    }

    public static func noResponsePrompt(days: Int) -> LocalizedStringResource {
        .bfhr("nudge.noResponse", default: "No reply in \(days) days. Mark as no response?")
    }

    public static let draftFollowUp = LocalizedStringResource.bfhr("nudge.draftFollowUp", default: "Draft follow-up")
    public static let notNow = LocalizedStringResource.bfhr("nudge.notNow", default: "Not now")
    public static let markNoResponse = LocalizedStringResource.bfhr("nudge.markNoResponse", default: "Mark as no response")
    public static let keepWaiting = LocalizedStringResource.bfhr("nudge.keepWaiting", default: "Keep waiting")

    // Snooze presets (decisions.md D19)
    public static let snoozeLaterToday = LocalizedStringResource.bfhr("snooze.laterToday", default: "Later today")
    public static let snoozeTomorrow = LocalizedStringResource.bfhr("snooze.tomorrow", default: "Tomorrow")
    public static let snoozeNextWeek = LocalizedStringResource.bfhr("snooze.nextWeek", default: "Next week")
    public static let snoozePickDate = LocalizedStringResource.bfhr("snooze.pickDate", default: "Pick a date…")

    // Review proposals (mail-review.md copy notes)
    public static func proposalMove(application: String, from: ApplicationStatus, to: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("proposal.move", default: "Move \(application) from \(from.label) to \(to.label)", comment: "%1$@ = company · role, %2$@ / %3$@ = status labels.")
    }

    public static func classification(_ category: MailCategory, hedged: Bool) -> LocalizedStringResource {
        switch (category, hedged) {
        case (.interviewInvite, true): .bfhr("category.hedged.interviewInvite", default: "Looks like an interview invite")
        case (.interviewInvite, false): .bfhr("category.interviewInvite", default: "Interview invite")
        case (.applicationReceived, true): .bfhr("category.hedged.applicationReceived", default: "Looks like an application confirmation")
        case (.applicationReceived, false): .bfhr("category.applicationReceived", default: "Application received")
        case (.rejection, true): .bfhr("category.hedged.rejection", default: "Looks like a decision")
        case (.rejection, false): .bfhr("category.rejection", default: "Decision", comment: "Mail category rejection (decisions.md D18).")
        case (.assessment, true): .bfhr("category.hedged.assessment", default: "Looks like an assessment")
        case (.assessment, false): .bfhr("category.assessment", default: "Assessment")
        case (.offer, true): .bfhr("category.hedged.offer", default: "Looks like an offer")
        case (.offer, false): .bfhr("category.offer", default: "Offer")
        case (.recruiterOutreach, true): .bfhr("category.hedged.recruiterOutreach", default: "Looks like a recruiter reaching out")
        case (.recruiterOutreach, false): .bfhr("category.recruiterOutreach", default: "Recruiter")
        case (.infoRequest, true): .bfhr("category.hedged.infoRequest", default: "Looks like a request for information")
        case (.infoRequest, false): .bfhr("category.infoRequest", default: "Info request")
        case (.jobAlert, _): .bfhr("category.jobAlert", default: "Job alert")
        case (.otherJob, true): .bfhr("category.hedged.otherJob", default: "Looks like job mail")
        case (.otherJob, false): .bfhr("category.otherJob", default: "Other job mail")
        case (.notJob, _): .bfhr("category.notJob", default: "Not job mail")
        }
    }

    public static func reasonSameThread(date: String) -> LocalizedStringResource {
        .bfhr("reason.sameThread", default: "Same email thread as your application of \(date)")
    }

    public static let reasonSameThreadNoDate = LocalizedStringResource.bfhr("reason.sameThreadNoDate", default: "Same email thread as your application")

    public static func reasonATS(domain: String) -> LocalizedStringResource {
        .bfhr("reason.ats", default: "Sent from \(domain) and mentions this role")
    }

    public static func reasonCompanyDomain(domain: String) -> LocalizedStringResource {
        .bfhr("reason.companyDomain", default: "Sent from \(domain), the company's own domain")
    }

    public static let reasonAI = LocalizedStringResource.bfhr("reason.ai", default: "Matched by reading the email")
    public static let reasonNoLink = LocalizedStringResource.bfhr("reason.noLink", default: "We couldn't match this email to an application")
    public static let fieldCategory = LocalizedStringResource.bfhr("field.category", default: "Category")
    public static let fieldApplication = LocalizedStringResource.bfhr("field.application", default: "Application")
    public static let fieldStatusChange = LocalizedStringResource.bfhr("field.statusChange", default: "Status change")
    public static let noApplicationFound = LocalizedStringResource.bfhr("field.noApplication", default: "No application found")
    public static let noStatusChange = LocalizedStringResource.bfhr("field.noStatusChange", default: "No change")

    // Interview suggested by an invite (ADR 0012)
    public static let suggestedInterview = LocalizedStringResource.bfhr("interview.suggested", default: "Interview in this email")
    public static let interviewOnConfirm = LocalizedStringResource.bfhr("interview.onConfirm", default: "Confirming adds it to your interviews.")
    public static let interviewNeedsApplication = LocalizedStringResource.bfhr("interview.needsApplication", default: "Link an application to add it to your interviews.")
    public static let interviewNoZone = LocalizedStringResource.bfhr("interview.noZone", default: "The email didn't name a time zone, so this uses yours.")
    public static let addInterview = LocalizedStringResource.bfhr("action.addInterview", default: "Add interview")

    public static func interviewTheirTime(_ time: String, zone: String) -> LocalizedStringResource {
        .bfhr("interview.theirTime", default: "\(time) in \(zone)", comment: "The organiser's local time. %1$@ = time, %2$@ = time zone name.")
    }

    public static func interviewLength(_ minutes: Int) -> LocalizedStringResource {
        .bfhr("interview.length", default: "\(minutes) min", comment: "%lld = minutes.")
    }

    // Timeline
    public static let timelineCreated = LocalizedStringResource.bfhr("timeline.created", default: "Added to your tracker")
    public static let timelineNote = LocalizedStringResource.bfhr("timeline.note", default: "Note")
    public static let timelineMailReceived = LocalizedStringResource.bfhr("timeline.mailReceived", default: "Email received")
    public static let timelineMailSent = LocalizedStringResource.bfhr("timeline.mailSent", default: "Email sent")
    public static let timelineInterviewScheduled = LocalizedStringResource.bfhr("timeline.interviewScheduled", default: "Interview scheduled")
    public static let openEmail = LocalizedStringResource.bfhr("action.openEmail", default: "Open email")

    public static func timelineMailFrom(_ sender: String) -> LocalizedStringResource {
        .bfhr("timeline.mailFrom", default: "Email from \(sender)", comment: "A linked email on the application timeline. %@ = sender name or address.")
    }

    public static func timelineMoved(to status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("timeline.moved", default: "Moved to \(status.label)")
    }

    public static func timelineReverted(to status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("timeline.reverted", default: "Undone: back to \(status.label)")
    }

    // Application summary and submit prompt
    public static let fieldChannel = LocalizedStringResource.bfhr("field.channel", default: "Applied via")
    public static let fieldApplied = LocalizedStringResource.bfhr("field.applied", default: "Applied")
    public static let fieldCV = LocalizedStringResource.bfhr("field.cv", default: "CV")
    public static let fieldCoverLetter = LocalizedStringResource.bfhr("field.coverLetter", default: "Cover letter")

    public static func submitQuestion(company: String) -> LocalizedStringResource {
        .bfhr("submit.question", default: "Did you submit your application to \(company)?")
    }

    public static let submitYes = LocalizedStringResource.bfhr("submit.yes", default: "Yes, I applied")
    public static let submitNotYet = LocalizedStringResource.bfhr("submit.notYet", default: "Not yet")
    public static let submitNotApplying = LocalizedStringResource.bfhr("submit.notApplying", default: "I'm not applying")

    // Status pill and match band
    public static let statusPillHint = LocalizedStringResource.bfhr("status.pill.hint", default: "Changes the status")

    public static func statusPillLabel(_ status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("status.pill.label", default: "Status: \(status.label)", comment: "VoiceOver label of a status pill. %@ = status label.")
    }

    public static func bandAccessibility(band: MatchBand, score: Int) -> LocalizedStringResource {
        .bfhr("band.accessibility", default: "\(band.label), \(score) of 100", comment: "VoiceOver label of a match band. %1$@ = band, %2$lld = score.")
    }

    // Dates
    public static func dayAndTime(day: String, time: String) -> LocalizedStringResource {
        .bfhr("date.dayAndTime", default: "\(day), \(time)", comment: "Relative day and time, e.g. \"Tomorrow, 17:00\".")
    }
}

// MARK: - Domain labels

extension ApplicationStatus {
    /// The shared status dictionary (tracker.md "Status labels", decisions.md U2/D15).
    public var label: LocalizedStringResource {
        switch self {
        case .saved: .bfhr("status.saved", default: "Saved")
        case .preparing: .bfhr("status.preparing", default: "Preparing")
        case .applied: .bfhr("status.applied", default: "Applied")
        case .acknowledged: .bfhr("status.acknowledged", default: "Acknowledged")
        case .screening: .bfhr("status.screening", default: "Screening")
        case .interviewing: .bfhr("status.interviewing", default: "Interviewing")
        case .offer: .bfhr("status.offer", default: "Offer")
        case .accepted: .bfhr("status.accepted", default: "Accepted")
        case .declined: .bfhr("status.declined", default: "Declined", comment: "The user turned the offer down (\"I declined\"), distinct from rejected.")
        case .rejected: .bfhr("status.rejected", default: "Not selected", comment: "Status rejected. Never \"Rejected\" (decisions.md U2).")
        case .withdrawn: .bfhr("status.withdrawn", default: "Withdrawn")
        case .ghosted: .bfhr("status.ghosted", default: "No response", comment: "Status ghosted (decisions.md D15).")
        }
    }

    public var phase: StatusPhase { statusPhase(self) }
}

extension StatusPhase {
    public var label: LocalizedStringResource {
        switch self {
        case .shortlist: .bfhr("phase.shortlist", default: "Shortlist")
        case .inProgress: .bfhr("phase.inProgress", default: "In progress")
        case .closed: .bfhr("phase.closed", default: "Closed")
        }
    }
}

extension MatchBand {
    /// Band first, number second (job-detail.md "Findings"). Never "Low", "Poor" or "Weak".
    public var label: LocalizedStringResource {
        switch self {
        case .strong: .bfhr("band.strong", default: "Strong match")
        case .good: .bfhr("band.good", default: "Good match")
        case .partial: .bfhr("band.partial", default: "Partial match")
        case .stretch: .bfhr("band.stretch", default: "Stretch")
        }
    }

    /// "72 of 100". Never "%".
    public static func scoreCaption(_ score: Int) -> LocalizedStringResource {
        .bfhr("band.scoreCaption", default: "\(score) of 100")
    }

    /// Segment label under `MatchBandBar`.
    public var shortLabel: LocalizedStringResource {
        switch self {
        case .strong: .bfhr("band.short.strong", default: "Strong")
        case .good: .bfhr("band.short.good", default: "Good")
        case .partial: .bfhr("band.short.partial", default: "Partial")
        case .stretch: .bfhr("band.short.stretch", default: "Stretch")
        }
    }
}

extension TransitionDenial {
    /// Why a target is disabled in Move to… (decisions.md D16). Automation denials never reach the
    /// UI as user choices, so they have no copy.
    public var reason: LocalizedStringResource? {
        switch self {
        case .outcomeRequiresOffer: .bfhr("move.denied.outcomeRequiresOffer", default: "Accepted and Declined come after an offer.")
        case .sameStatus: .bfhr("move.denied.sameStatus", default: "Current stage")
        case .automationForbiddenTarget, .automationBackward, .automationFromTerminal: nil
        }
    }
}

extension EventActor {
    /// Actor chip on timeline and auto-change rows (components.md `SourceTag`).
    public var label: LocalizedStringResource {
        switch self {
        case .user: .bfhr("actor.user", default: "You")
        case .rule, .ai: .bfhr("actor.mail", default: "Automatic · Mail")
        }
    }
}
