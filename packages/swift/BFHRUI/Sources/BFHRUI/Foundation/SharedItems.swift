import BFHRCore
import Foundation

// Row data shared by more than one core screen, derived from `UserData`. Screen models expose
// these and the shared components render them, so Today and Mail review (or Tracker and Job
// detail) can't drift apart.

/// Company name + domain for `CompanyMonogram` / `CompanyChip`.
public struct CompanyIdentity: Hashable, Sendable {
    public var name: String
    public var domain: String?

    public init(name: String, domain: String? = nil) {
        self.name = name
        self.domain = domain
    }
}

/// An automatic status change (actor rule / ai) with its source and Undo availability: Today's
/// "Applied automatically" rows, Mail › Updates, timeline auto rows (`AutoChangeRow`).
public struct AutoChangeItem: Identifiable, Hashable, Sendable {
    /// The status event id.
    public var id: String
    public var applicationId: String
    public var company: CompanyIdentity
    public var role: String
    public var from: ApplicationStatus?
    public var to: ApplicationStatus
    public var actor: EventActor
    /// The evidence sentence ("Email from recruiter@acme.com: “Interview invitation”").
    public var reason: String?
    public var mailMessageId: String?
    /// The sending address, when the change came from an email.
    public var sender: String?
    public var occurredAt: Date
    /// `allowed`, or why Undo isn't offered ("Can't undo — the status changed since").
    public var undo: RevertCheck

    public var canUndo: Bool { undo == .allowed }
}

/// Why a review proposal links an email to an application (mail-review.md "Review sheet").
public enum ReviewReason: Hashable, Sendable {
    case sameThread(appliedAt: Date?)
    case atsSender(domain: String)
    case companyDomain(domain: String)
    case aiMatch
    case noLink
}

/// An email waiting for the user's decision (`reviewState == pending`): Today "To review" rows and
/// the Mail review queue (`ReviewSheet`, `ProposalSentence`).
public struct ReviewProposal: Identifiable, Hashable, Sendable {
    /// The mail message id.
    public var id: String
    public var accountId: String
    public var accountAddress: String?
    public var sender: MailAddress
    public var subject: String
    public var snippet: String
    /// The stored body, nil once purged by retention (then only the snippet shows).
    public var bodyText: String?
    public var receivedAt: Date
    public var category: MailCategory
    public var confidence: Double
    /// Below the auto-apply threshold: copy is hedged ("Looks like an interview invite").
    public var isHedged: Bool
    public var applicationId: String?
    public var company: CompanyIdentity?
    public var role: String?
    public var currentStatus: ApplicationStatus?
    public var proposedStatus: ApplicationStatus?
    public var reason: ReviewReason
    public var dates: [ExtractedDate]
    public var meetingURLs: [String]
    public var contactName: String?

    /// Confirm is enabled only when every required field is set and the user may make the move.
    public var canConfirm: Bool {
        guard applicationId != nil, let currentStatus else { return false }
        guard let proposedStatus else { return true } // nothing to move: confirming files the email
        return proposedStatus == currentStatus || canTransition(from: currentStatus, to: proposedStatus, actor: .user).isAllowed
    }
}

/// A suggestion the user decides on, never applied automatically (`NudgeCard`): follow-up after
/// 7 days in Applied, no response after 21 days of silence.
public struct NudgeItem: Identifiable, Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case followUp(since: Date, dueAt: Date)
        case noResponse(silentSince: Date, silentDays: Int)
    }

    /// `"<applicationId>.followUp"` / `"<applicationId>.noResponse"`.
    public var id: String
    public var applicationId: String
    public var company: CompanyIdentity
    public var role: String
    public var kind: Kind

    /// Whole days since the reference date (applied / last signal) at `now`.
    public func days(at now: Date, calendar: Calendar) -> Int {
        let since = switch kind {
        case .followUp(let since, _): since
        case .noResponse(let since, _): since
        }
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: since), to: calendar.startOfDay(for: now)).day ?? 0
    }
}

/// One row of the Move to… sheet (`StatusMenu`): every status, the current one checked, invalid
/// ones disabled with a reason (decisions.md D16).
public struct MoveTarget: Identifiable, Hashable, Sendable {
    public var status: ApplicationStatus
    public var check: TransitionCheck
    public var isCurrent: Bool

    public var id: ApplicationStatus { status }
    public var isEnabled: Bool { !isCurrent && check.isAllowed }
}

/// One timeline entry (`TimelineRow`), newest first in the timeline.
public struct TimelineEntry: Identifiable, Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case created
        case statusChanged(from: ApplicationStatus?, to: ApplicationStatus)
        /// An Undo event (`revertsEventId`).
        case reverted(to: ApplicationStatus)
        case note
        case mailReceived
        case mailSent
        case interviewScheduled
    }

    public var id: String
    public var applicationId: String
    public var kind: Kind
    public var actor: EventActor
    public var text: String?
    /// Evidence sentence for automatic changes.
    public var reason: String?
    public var mailMessageId: String?
    public var occurredAt: Date
    /// For status changes: Undo availability.
    public var undo: RevertCheck?
    /// This event was later undone.
    public var isReverted: Bool

    public var isAutomatic: Bool { actor != .user }
}

// MARK: - Builders

extension UserData {
    /// Auto-apply threshold from the profile (default 0.9).
    public var autoApplyConfidence: Double { profile?.settings.autoApplyConfidence ?? 0.9 }

    /// Automatic status changes since `date` (nil: all), newest first. Undo events and moves that
    /// were undone are left out.
    public func autoChanges(since date: Date? = nil) -> [AutoChangeItem] {
        let reverted = Set(applicationEvents.compactMap(\.revertsEventId))
        return applicationEvents
            .filter { $0.type == .statusChanged && $0.actor != .user && $0.revertsEventId == nil && !reverted.contains($0.id) }
            .filter { date == nil || $0.occurredAt >= date! }
            .compactMap { event -> AutoChangeItem? in
                guard let to = event.toStatus, let application = application(id: event.applicationId) else { return nil }
                let message = event.evidence?.mailMessageId.flatMap { mailMessage(id: $0) }
                return AutoChangeItem(
                    id: event.id,
                    applicationId: application.id,
                    company: CompanyIdentity(name: application.company, domain: application.companyDomain),
                    role: application.role,
                    from: event.fromStatus,
                    to: to,
                    actor: event.actor,
                    reason: event.evidence?.reason,
                    mailMessageId: event.evidence?.mailMessageId,
                    sender: message?.from.address,
                    occurredAt: event.occurredAt,
                    undo: revertCheck(for: event.id)
                )
            }
            .sorted { $0.occurredAt > $1.occurredAt }
    }

    /// Emails waiting for review (`reviewState == pending`), newest first. Job alerts never enter
    /// the queue.
    public func reviewQueue() -> [ReviewProposal] {
        mailMessages
            .filter { $0.reviewState == .pending && $0.category != .jobAlert }
            .sorted { $0.receivedAt > $1.receivedAt }
            .map(reviewProposal(for:))
    }

    public func reviewProposal(for message: MailMessage) -> ReviewProposal {
        let linked = message.applicationId.flatMap { self.application(id: $0) }
        let companyName = linked?.company ?? message.extracted.company
        let senderDomain = message.from.address.split(separator: "@").last.map(String.init) ?? ""
        let reason: ReviewReason = switch message.linkStrength {
        case .thread: .sameThread(appliedAt: linked?.appliedAt)
        case .atsCompanyRole: .atsSender(domain: senderDomain)
        case .companyDomain: .companyDomain(domain: senderDomain)
        case .llm: .aiMatch
        case .none: .noLink
        }
        return ReviewProposal(
            id: message.id,
            accountId: message.accountId,
            accountAddress: mailAccount(id: message.accountId)?.address,
            sender: message.from,
            subject: message.subject,
            snippet: message.snippet,
            bodyText: message.bodyText,
            receivedAt: message.receivedAt,
            category: message.category,
            confidence: message.confidence,
            isHedged: message.confidence < autoApplyConfidence,
            applicationId: linked?.id,
            company: companyName.map { CompanyIdentity(name: $0, domain: linked?.companyDomain) },
            role: linked?.role ?? message.extracted.role,
            currentStatus: linked?.status,
            proposedStatus: message.suggestedStatus,
            reason: reason,
            dates: message.extracted.dates,
            meetingURLs: message.extracted.meetingUrls,
            contactName: message.extracted.contactName
        )
    }

    /// Follow-up and no-response suggestions at `now` (BFHRCore `followUpDue` / `suggestGhosted`
    /// with the profile's day settings), oldest first.
    public func nudges(at now: Date) -> [NudgeItem] {
        let followUpDays = profile?.settings.followUpAfterDays ?? defaultFollowUpAfterDays
        let ghostedDays = profile?.settings.ghostedAfterDays ?? defaultGhostedAfterDays
        var items: [(Date, NudgeItem)] = []
        for application in applications {
            let events = events(forApplication: application.id)
            let company = CompanyIdentity(name: application.company, domain: application.companyDomain)
            if let followUp = try? followUpDue(application, events: events, now: now, days: followUpDays) {
                items.append((followUp.since, NudgeItem(
                    id: "\(application.id).followUp", applicationId: application.id, company: company,
                    role: application.role, kind: .followUp(since: followUp.since, dueAt: followUp.dueAt)
                )))
            } else if let ghosted = try? suggestGhosted(application, events: events, now: now, days: ghostedDays) {
                items.append((ghosted.silentSince, NudgeItem(
                    id: "\(application.id).noResponse", applicationId: application.id, company: company,
                    role: application.role, kind: .noResponse(silentSince: ghosted.silentSince, silentDays: ghosted.silentDays)
                )))
            }
        }
        return items.sorted { $0.0 < $1.0 }.map(\.1)
    }

    /// Every status as a Move to… target for the user, in display order (active statuses, then
    /// outcomes and side exits).
    public func moveTargets(for applicationId: String) -> [MoveTarget] {
        guard let application = application(id: applicationId) else { return [] }
        return (ApplicationStatus.active + ApplicationStatus.terminal).map { status in
            MoveTarget(
                status: status,
                check: canTransition(from: application.status, to: status, actor: .user),
                isCurrent: status == application.status
            )
        }
    }

    /// The application's timeline, newest first.
    public func timeline(for applicationId: String) -> [TimelineEntry] {
        let events = events(forApplication: applicationId)
        let reverted = Set(events.compactMap(\.revertsEventId))
        return events.reversed().map { event in
            let kind: TimelineEntry.Kind
            switch event.type {
            case .created: kind = .created
            case .statusChanged:
                if event.revertsEventId != nil, let to = event.toStatus {
                    kind = .reverted(to: to)
                } else if let to = event.toStatus {
                    kind = .statusChanged(from: event.fromStatus, to: to)
                } else {
                    kind = .note
                }
            case .note: kind = .note
            case .mailReceived: kind = .mailReceived
            case .mailSent: kind = .mailSent
            case .interviewScheduled: kind = .interviewScheduled
            }
            let isMove = if case .statusChanged = kind { true } else { false }
            return TimelineEntry(
                id: event.id,
                applicationId: applicationId,
                kind: kind,
                actor: event.actor,
                text: event.text,
                reason: event.evidence?.reason,
                mailMessageId: event.evidence?.mailMessageId,
                occurredAt: event.occurredAt,
                undo: isMove ? revertCheck(for: event.id) : nil,
                isReverted: reverted.contains(event.id)
            )
        }
    }
}
