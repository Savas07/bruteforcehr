import BFHRCore
import Foundation

// Tracker › Calendar on iPhone (decisions.md D09, D34): a dated agenda list, not a grid.
// Interviews (timed), the user's reminders, suggested follow-ups (7 days after applying without
// a reply) and deadlines from job emails, grouped by day, Upcoming or Past.

/// Upcoming (today onwards, soonest first) or Past (before today, newest first).
public enum AgendaScope: String, CaseIterable, Identifiable, Hashable, Sendable {
    case upcoming
    case past

    public var id: Self { self }
}

/// One agenda row.
public struct AgendaItem: Identifiable, Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        /// A round; `prep` is this device's reminder.
        case interview(Interview, prep: InterviewPrepLead?)
        /// The application's reminder (`nextAction`); `isOverdue` when its time has passed.
        case reminder(text: String, isOverdue: Bool)
        /// Suggested follow-up (never automatic), on the day it falls due.
        case followUp(since: Date)
        /// From a job email: assessment due, reply by.
        case deadline(ExtractedDateKind, label: String)
    }

    public var id: String
    public var applicationId: String
    public var company: CompanyIdentity
    public var role: String
    public var at: Date
    /// No meaningful time of day (follow-ups): the row shows no time.
    public var isAllDay: Bool
    public var kind: Kind
    public var pendingSync: Bool
}

public struct AgendaDay: Identifiable, Hashable, Sendable {
    /// Start of the day in the model's calendar.
    public var day: Date
    public var items: [AgendaItem]

    public var id: Date { day }
}

extension TrackerBoardModel {
    /// How far back Past reaches.
    public static let agendaPastDays = 90

    /// The agenda for `scope`. Overdue reminders and follow-ups due earlier are listed on today
    /// in Upcoming, so nothing pending hides in Past.
    public func agenda(_ scope: AgendaScope) -> [AgendaDay] {
        let today = calendar.startOfDay(for: now)
        let items = agendaItems().compactMap { item -> AgendaItem? in
            var item = item
            let pending: Bool = switch item.kind {
            case .reminder, .followUp: true
            case .interview, .deadline: false
            }
            if item.at < today && pending {
                guard scope == .upcoming else { return nil }
                item.at = today
                item.isAllDay = true
            }
            let upcoming = item.at >= today
            switch scope {
            case .upcoming: return upcoming ? item : nil
            case .past:
                let horizon = calendar.date(byAdding: .day, value: -Self.agendaPastDays, to: today) ?? today
                return !upcoming && item.at >= horizon ? item : nil
            }
        }
        let grouped = Dictionary(grouping: items) { calendar.startOfDay(for: $0.at) }
        let order: (AgendaItem, AgendaItem) -> Bool = { lhs, rhs in
            if lhs.isAllDay != rhs.isAllDay { return lhs.isAllDay }
            if lhs.at != rhs.at { return lhs.at < rhs.at }
            return lhs.id < rhs.id
        }
        return grouped
            .map { AgendaDay(day: $0.key, items: $0.value.sorted(by: order)) }
            .sorted { scope == .upcoming ? $0.day < $1.day : $0.day > $1.day }
    }

    /// Whether the agenda has anything at all (Upcoming or Past).
    public var hasAgenda: Bool { !agendaItems().isEmpty }

    private func agendaItems() -> [AgendaItem] {
        var items: [AgendaItem] = []
        let followUpDays = data.profile?.settings.followUpAfterDays ?? defaultFollowUpAfterDays
        for application in data.applications {
            let company = CompanyIdentity(name: application.company, domain: application.companyDomain)
            let pendingSync = pendingSyncIDs.contains(application.id)
            if application.status.isActive, let text = application.nextAction, !text.isEmpty, let due = application.nextActionAt {
                items.append(AgendaItem(
                    id: "\(application.id).reminder", applicationId: application.id, company: company, role: application.role,
                    at: due, isAllDay: false, kind: .reminder(text: text, isOverdue: due < now), pendingSync: pendingSync
                ))
            }
            let events = data.events(forApplication: application.id)
            // The date it falls due, whether or not that is past (`now` far ahead); gone once
            // answered "Not now", moved to the end of a snooze.
            if let followUp = try? followUpDue(application, events: events, now: .distantFuture, days: followUpDays),
               (application.followUpDismissedAt.map { $0 < followUp.since } ?? true) {
                let at = max(followUp.dueAt, application.followUpSnoozedUntil ?? followUp.dueAt)
                items.append(AgendaItem(
                    id: "\(application.id).followUp", applicationId: application.id, company: company, role: application.role,
                    at: at, isAllDay: true, kind: .followUp(since: followUp.since), pendingSync: false
                ))
            }
        }
        for interview in data.interviews {
            guard let application = data.application(id: interview.applicationId) else { continue }
            items.append(AgendaItem(
                id: interview.id, applicationId: application.id,
                company: CompanyIdentity(name: application.company, domain: application.companyDomain), role: application.role,
                at: interview.startsAt, isAllDay: false, kind: .interview(interview, prep: interviewPrep[interview.id]),
                pendingSync: pendingSyncIDs.contains(interview.id)
            ))
        }
        for message in data.mailMessages {
            guard let applicationId = message.applicationId, let application = data.application(id: applicationId),
                  application.status.isActive else { continue }
            for date in message.extracted.dates where date.kind == .assessmentDeadline || date.kind == .replyDeadline {
                items.append(AgendaItem(
                    id: "\(message.id).\(date.kind.rawValue)", applicationId: application.id,
                    company: CompanyIdentity(name: application.company, domain: application.companyDomain), role: application.role,
                    at: date.at, isAllDay: false, kind: .deadline(date.kind, label: date.label), pendingSync: false
                ))
            }
        }
        return items
    }
}
