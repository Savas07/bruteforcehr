import BFHRCore
import Foundation

// Value types the Tracker (iOS Pipeline + Application detail) exposes. tracker.md "Decision — iOS".

/// Scope tabs above the Pipeline: Active · Closed · All.
public enum PipelineScope: String, CaseIterable, Identifiable, Hashable, Sendable {
    /// Saved … Offer, grouped Shortlist / In progress.
    case active
    /// Accepted, Declined, Not selected, Withdrawn, No response.
    case closed
    case all

    public var id: Self { self }

    /// The statuses that get a section, in display order.
    public var statuses: [ApplicationStatus] {
        switch self {
        case .active: ApplicationStatus.active
        case .closed: ApplicationStatus.terminal
        case .all: ApplicationStatus.active + ApplicationStatus.terminal
        }
    }

    public var label: LocalizedStringResource {
        switch self {
        case .active: .bfhr("tracker.scope.active", default: "Active", table: "TrackerBoard", comment: "Scope tab: applications still in progress (Saved to Offer).")
        case .closed: .bfhr("tracker.scope.closed", default: "Closed", table: "TrackerBoard", comment: "Scope tab: applications with an outcome.")
        case .all: .bfhr("tracker.scope.all", default: "All", table: "TrackerBoard", comment: "Scope tab: every application.")
        }
    }
}

/// What comes next for an application: the row's second line and the detail's next action.
public enum ApplicationNextStep: Hashable, Sendable {
    /// The earliest upcoming interview ("Interview Thu 14:00").
    case interview(startsAt: Date, kind: InterviewKind)
    /// The user's next action; `dueAt` may be nil or already past.
    case nextAction(text: String, dueAt: Date?)
    /// No signal for `silentDays` (≥ the follow-up setting) in a status that waits on the
    /// employer: "No reply in 9 days".
    case stale(silentDays: Int)
    /// Nothing to show: the row has one line.
    case none
}

/// One application on the Pipeline (`ApplicationRow`).
public struct PipelineRow: Identifiable, Hashable, Sendable {
    /// The application id.
    public var id: String
    public var company: CompanyIdentity
    public var role: String
    public var status: ApplicationStatus
    public var statusChangedAt: Date
    /// Calendar days since `statusChangedAt` ("12 d").
    public var daysInStage: Int
    /// Upcoming interview or next action date (≥ now), the trailing meta when present.
    public var nextDate: Date?
    public var secondLine: ApplicationNextStep
    /// The latest status move that wasn't undone came from automation (envelope glyph).
    public var lastMoveAutomatic: Bool
    /// Changed offline and not synced yet (`SyncGlyph`).
    public var pendingSync: Bool

    public var phase: StatusPhase { status.phase }
}

/// One status section of the Pipeline (`PipelineSection`). Every status of the scope has one,
/// even with no rows.
public struct PipelineSection: Identifiable, Hashable, Sendable {
    public var status: ApplicationStatus
    /// Next date soonest first, then most recently moved.
    public var rows: [PipelineRow]
    /// Saved with more than 5 rows (the backlog), or an empty section (a single header line).
    public var collapsedByDefault: Bool

    public var id: ApplicationStatus { status }
    public var phase: StatusPhase { status.phase }
    public var count: Int { rows.count }
    public var isEmpty: Bool { rows.isEmpty }
}

/// Sections of one phase (Shortlist, In progress, Closed), for the grouped list.
public struct PipelinePhaseGroup: Identifiable, Hashable, Sendable {
    public var phase: StatusPhase
    public var sections: [PipelineSection]

    public var id: StatusPhase { phase }
    public var count: Int { sections.reduce(0) { $0 + $1.count } }
}

/// One tab of the stage index strip (`StageIndexStrip`). Empty stages are dimmed, still tappable.
public struct StageCount: Identifiable, Hashable, Sendable {
    public var status: ApplicationStatus
    public var count: Int

    public var id: ApplicationStatus { status }
    public var isEmpty: Bool { count == 0 }
}

/// Everything the Application detail shows.
public struct ApplicationDetail: Identifiable, Hashable, Sendable {
    /// `RecordHeader`: status pill (tap = Move to…) and facts.
    public struct Header: Hashable, Sendable {
        public var company: CompanyIdentity
        public var role: String
        public var location: String?
        public var status: ApplicationStatus
        public var statusChangedAt: Date
        public var daysInStage: Int
        public var channel: Channel?
        public var appliedAt: Date?
        /// Where the job came from (greenhouse, lever, web…).
        public var source: String?
        public var lastMoveAutomatic: Bool
        public var pendingSync: Bool
    }

    /// One step of `StageProgressStrip`.
    public struct StageStep: Identifiable, Hashable, Sendable {
        public enum State: Hashable, Sendable {
            case done
            case current
            case upcoming
        }

        public var status: ApplicationStatus
        public var state: State

        public var id: ApplicationStatus { status }
        /// The closed outcome that ends the strip.
        public var isOutcome: Bool { status.isTerminal }
    }

    /// Timeline entries of one calendar day, newest first.
    public struct TimelineDay: Identifiable, Hashable, Sendable {
        /// Start of the day in the model's calendar.
        public var day: Date
        public var entries: [TimelineEntry]

        public var id: Date { day }
    }

    /// A CV or cover letter used for the application.
    public struct DocumentRef: Identifiable, Hashable, Sendable {
        public var id: String
        public var title: String
    }

    /// One interview round with this device's prep reminder.
    public struct InterviewItem: Identifiable, Hashable, Sendable {
        public var interview: Interview
        /// Ended before now.
        public var isPast: Bool
        /// The prep reminder set on this device, if any.
        public var prep: InterviewPrepLead?
        public var pendingSync: Bool

        public var id: String { interview.id }
    }

    /// The application's reminder (`nextAction` + `nextActionAt`).
    public struct Reminder: Hashable, Sendable {
        public var text: String
        public var dueAt: Date?
        public var isOverdue: Bool
    }

    /// The application id.
    public var id: String
    public var header: Header
    /// Active: every active status (done / current / upcoming). Closed: active statuses up to the
    /// last one reached (done), then the outcome (current).
    public var progress: [StageStep]
    public var nextStep: ApplicationNextStep
    /// Follow-up / no-response suggestions for this application (`NudgeCard`).
    public var nudges: [NudgeItem]
    /// Newest day first.
    public var timeline: [TimelineDay]
    /// Earliest first, past rounds included.
    public var interviews: [InterviewItem]
    /// Oldest first.
    public var contacts: [Contact]
    public var cv: DocumentRef?
    public var coverLetter: DocumentRef?
    public var reminder: Reminder?
    /// The follow-up suggestion when one is due (7 days in Applied without a reply).
    public var followUp: NudgeItem?
    public var notes: String
}

/// The Tracker's two views on iPhone, switched from the title menu.
public enum TrackerView: String, CaseIterable, Identifiable, Hashable, Sendable {
    case pipeline
    case calendar

    public var id: Self { self }

    public var label: LocalizedStringResource {
        switch self {
        case .pipeline: .bfhr("tracker.view.pipeline", default: "Pipeline", table: "TrackerBoard", comment: "Tracker title menu: the list of applications by stage.")
        case .calendar: .bfhr("tracker.view.calendar", default: "Calendar", table: "TrackerBoard", comment: "Tracker title menu: interviews, reminders and deadlines by date.")
        }
    }

    public var systemImage: String {
        switch self {
        case .pipeline: "rectangle.split.3x1"
        case .calendar: "calendar"
        }
    }
}

public enum TrackerBoardError: Error, Hashable, Sendable {
    /// `close` was given an active status.
    case notAnOutcome(ApplicationStatus)
}
