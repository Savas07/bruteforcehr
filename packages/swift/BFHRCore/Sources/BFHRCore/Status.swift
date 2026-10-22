import Foundation

// Port of packages/core/src/status.ts (§4.6 tracker state machine). TypeScript is the source of
// truth; the conformance vectors in packages/core/conformance/state-machine.json prove this port.
// Pure: no I/O, no clock; callers pass `at`/`now`.

/// The application fields the state machine reads (TypeScript `Pick<Application, …>`).
public protocol StatusTracked {
    var id: String { get }
    var status: ApplicationStatus { get }
    var appliedAt: Date? { get }
    var statusChangedAt: Date { get }
}

extension Application: StatusTracked {}

extension ApplicationStatus {
    /// Progress statuses, in rank order.
    public static let active: [ApplicationStatus] = [
        .saved, .preparing, .applied, .acknowledged, .screening, .interviewing, .offer,
    ]
    public static let outcomes: [ApplicationStatus] = [.accepted, .declined]
    /// Reachable from any active status.
    public static let sideExits: [ApplicationStatus] = [.rejected, .withdrawn, .ghosted]
    public static let terminal: [ApplicationStatus] = outcomes + sideExits
    /// Statuses automation (`rule`/`ai`) may never set.
    public static let automationForbidden: [ApplicationStatus] = [.accepted, .declined, .withdrawn, .ghosted]
    /// Statuses where silence from the employer can mean ghosting.
    public static let ghostable: [ApplicationStatus] = [.applied, .acknowledged, .screening, .interviewing]

    public var isActive: Bool { Self.active.contains(self) }
    public var isTerminal: Bool { !isActive }

    fileprivate var activeRank: Int? { Self.active.firstIndex(of: self) }
}

/// Rank in the progress order (accepted/declined rank above offer); side exits have none.
public func statusRank(_ status: ApplicationStatus) -> Int? {
    if let rank = status.activeRank { return rank }
    return status == .accepted || status == .declined ? ApplicationStatus.active.count : nil
}

/// Shortlist (saved, preparing) · In progress (applied → offer) · Closed (terminal statuses).
public enum StatusPhase: String, Codable, Hashable, Sendable, CaseIterable {
    case shortlist
    case inProgress = "in_progress"
    case closed
}

public func statusPhase(_ status: ApplicationStatus) -> StatusPhase {
    if status == .saved || status == .preparing { return .shortlist }
    return status.isActive ? .inProgress : .closed
}

public enum TransitionDirection: String, Codable, Hashable, Sendable, CaseIterable {
    case forward
    case backward
    case exit
    case reopen
    case correction
}

public enum TransitionDenial: String, Codable, Hashable, Sendable, CaseIterable {
    /// `to` equals `from`.
    case sameStatus = "same_status"
    /// Automation targeting accepted/declined/withdrawn/ghosted.
    case automationForbiddenTarget = "automation_forbidden_target"
    /// Automation moving to a lower progress rank.
    case automationBackward = "automation_backward"
    /// Automation moving a terminal application (only the user reopens).
    case automationFromTerminal = "automation_from_terminal"
    /// Accepted/declined are reachable only from offer.
    case outcomeRequiresOffer = "outcome_requires_offer"
}

public enum TransitionCheck: Hashable, Sendable {
    case allowed(TransitionDirection)
    case denied(TransitionDenial)

    public var isAllowed: Bool {
        if case .allowed = self { true } else { false }
    }
}

extension TransitionCheck: Codable {
    private enum CodingKeys: String, CodingKey {
        case allowed, direction, reason
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self = try container.decode(Bool.self, forKey: .allowed)
            ? .allowed(try container.decode(TransitionDirection.self, forKey: .direction))
            : .denied(try container.decode(TransitionDenial.self, forKey: .reason))
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .allowed(let direction):
            try container.encode(true, forKey: .allowed)
            try container.encode(direction, forKey: .direction)
        case .denied(let reason):
            try container.encode(false, forKey: .allowed)
            try container.encode(reason, forKey: .reason)
        }
    }
}

/// Whether `actor` may move an application from `from` to `to`, and how the move is classified.
public func canTransition(from: ApplicationStatus, to: ApplicationStatus, actor: EventActor) -> TransitionCheck {
    if from == to { return .denied(.sameStatus) }
    let automated = actor != .user

    guard let fromRank = from.activeRank else {
        if automated { return .denied(.automationFromTerminal) }
        return .allowed(to.isActive ? .reopen : .correction)
    }

    if automated && ApplicationStatus.automationForbidden.contains(to) {
        return .denied(.automationForbiddenTarget)
    }
    if to == .accepted || to == .declined {
        return from == .offer ? .allowed(.forward) : .denied(.outcomeRequiresOffer)
    }
    guard let toRank = to.activeRank else { return .allowed(.exit) }
    if toRank > fromRank { return .allowed(.forward) }
    if automated { return .denied(.automationBackward) }
    return .allowed(.backward)
}

public enum RevertDenial: String, Codable, Hashable, Sendable, CaseIterable {
    /// Not a status change, itself an undo, or of another application.
    case notRevertible = "not_revertible"
    case alreadyReverted = "already_reverted"
    /// A newer status move exists ("Can't undo — the status changed since").
    case superseded
}

public enum TransitionErrorCode: String, Codable, Hashable, Sendable, CaseIterable {
    case sameStatus = "same_status"
    case automationForbiddenTarget = "automation_forbidden_target"
    case automationBackward = "automation_backward"
    case automationFromTerminal = "automation_from_terminal"
    case outcomeRequiresOffer = "outcome_requires_offer"
    case notRevertible = "not_revertible"
    case alreadyReverted = "already_reverted"
    case superseded
    /// Automation must state confidence and evidence.
    case automationNeedsEvidence = "automation_needs_evidence"
}

/// A move the actor may not make (TypeScript `TransitionError`).
public struct TransitionError: Error, Hashable, Sendable, CustomStringConvertible {
    public let code: TransitionErrorCode
    public let description: String
}

/// Invalid arguments (TypeScript `RangeError`).
public enum StatusArgumentError: Error, Hashable, Sendable {
    /// Confidence outside [0, 1].
    case confidenceOutOfRange(Double)
    /// Day counts must be positive.
    case invalidDays(Int)
}

public struct ApplicationStatusPatch: Codable, Hashable, Sendable {
    public var status: ApplicationStatus
    public var statusChangedAt: Date
    /// Set when the application first reaches applied (or beyond) without an `appliedAt`. Never
    /// cleared: backward moves and reverts leave it out.
    public var appliedAt: Date?

    public init(status: ApplicationStatus, statusChangedAt: Date, appliedAt: Date? = nil) {
        self.status = status
        self.statusChangedAt = statusChangedAt
        self.appliedAt = appliedAt
    }
}

public struct TransitionResult: Codable, Hashable, Sendable {
    public var status: ApplicationStatus
    public var direction: TransitionDirection
    /// Event to append to `applicationEvents` (id assigned by the writer).
    public var event: ApplicationEventDraft
    /// Fields to write on the application in the same batch as the event.
    public var applicationPatch: ApplicationStatusPatch
}

/// Validates and performs a status transition. Throws `TransitionError` when the actor may not
/// make the move; use `canTransition` to gate UI affordances without throwing.
///
/// - Parameters:
///   - confidence: Required for `rule`/`ai`; ignored for `user`.
///   - evidence: Required for `rule`/`ai`; optional context for `user`.
///   - text: Optional note shown on the timeline.
public func transition(
    _ application: some StatusTracked,
    to: ApplicationStatus,
    actor: EventActor,
    at: Date,
    confidence: Double? = nil,
    evidence: EventEvidence? = nil,
    text: String? = nil
) throws -> TransitionResult {
    let direction: TransitionDirection
    switch canTransition(from: application.status, to: to, actor: actor) {
    case .allowed(let allowed):
        direction = allowed
    case .denied(let reason):
        throw TransitionError(
            code: TransitionErrorCode(rawValue: reason.rawValue)!,
            description: "\(actor.rawValue) may not move \(application.status.rawValue) → \(to.rawValue) (\(reason.rawValue))"
        )
    }

    let automated = actor != .user
    if automated && (confidence == nil || evidence == nil) {
        throw TransitionError(
            code: .automationNeedsEvidence,
            description: "\(actor.rawValue) transitions need confidence and evidence"
        )
    }
    if let confidence, !(0...1).contains(confidence) {
        throw StatusArgumentError.confidenceOutOfRange(confidence)
    }

    let reachesApplied = direction == .forward
        && (to.activeRank.map { $0 >= ApplicationStatus.applied.activeRank! } ?? true)
    return TransitionResult(
        status: to,
        direction: direction,
        event: ApplicationEventDraft(
            applicationId: application.id,
            type: .statusChanged,
            fromStatus: application.status,
            toStatus: to,
            actor: actor,
            confidence: automated ? confidence : nil,
            evidence: evidence,
            text: text,
            revertsEventId: nil,
            occurredAt: at,
            createdAt: at
        ),
        applicationPatch: ApplicationStatusPatch(
            status: to,
            statusChangedAt: at,
            appliedAt: reachesApplied && application.appliedAt == nil ? at : nil
        )
    )
}

/// Id of the event that reverted `eventId`, or nil. Derives the brief's `reverted_by`.
public func revertedBy(_ eventId: String, events: [ApplicationEvent]) -> String? {
    events.first { $0.revertsEventId == eventId }?.id
}

public enum RevertCheck: Hashable, Sendable {
    case allowed
    case denied(RevertDenial)
}

extension RevertCheck: Codable {
    private enum CodingKeys: String, CodingKey {
        case allowed, reason
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self = try container.decode(Bool.self, forKey: .allowed)
            ? .allowed
            : .denied(try container.decode(RevertDenial.self, forKey: .reason))
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .allowed:
            try container.encode(true, forKey: .allowed)
        case .denied(let reason):
            try container.encode(false, forKey: .allowed)
            try container.encode(reason, forKey: .reason)
        }
    }
}

/// Whether Undo is offered for `event`: only while it is the application's latest status move and
/// the application still sits in the status it moved to. No time limit.
///
/// - Parameter events: Events of the application (any order), used to find newer moves and earlier undos.
public func canRevert(
    _ event: ApplicationEvent,
    of application: some StatusTracked,
    events: [ApplicationEvent]
) -> RevertCheck {
    guard
        event.type == .statusChanged,
        event.fromStatus != nil,
        let toStatus = event.toStatus,
        event.revertsEventId == nil,
        event.applicationId == application.id
    else { return .denied(.notRevertible) }
    if revertedBy(event.id, events: events) != nil { return .denied(.alreadyReverted) }
    let occurredAt = event.occurredAt.epochMilliseconds
    let newerMove = events.contains { other in
        other.id != event.id
            && other.applicationId == application.id
            && (other.type == .statusChanged || other.type == .created)
            && other.occurredAt.epochMilliseconds > occurredAt
    }
    if newerMove || application.status != toStatus { return .denied(.superseded) }
    return .allowed
}

/// Undo of a status change (typically an automatic one): appends the inverse transition, made by
/// the user and linked through `revertsEventId`; the original event is never edited. Permitted
/// whenever `canRevert` allows it, so even moves that are otherwise gated (e.g. back into accepted
/// after a mistaken reopen) restore exactly.
public func revert(
    _ event: ApplicationEvent,
    of application: some StatusTracked,
    events: [ApplicationEvent],
    at: Date,
    text: String? = nil
) throws -> TransitionResult {
    if case .denied(let reason) = canRevert(event, of: application, events: events) {
        throw TransitionError(
            code: TransitionErrorCode(rawValue: reason.rawValue)!,
            description: "Event \(event.id) of \(application.id) cannot be undone (\(reason.rawValue))"
        )
    }
    guard let from = event.toStatus, let to = event.fromStatus else {
        throw TransitionError(code: .notRevertible, description: "Event \(event.id) is not a status change")
    }
    let direction: TransitionDirection = switch canTransition(from: from, to: to, actor: .user) {
    case .allowed(let direction): direction
    case .denied: .correction
    }
    return TransitionResult(
        status: to,
        direction: direction,
        event: ApplicationEventDraft(
            applicationId: application.id,
            type: .statusChanged,
            fromStatus: from,
            toStatus: to,
            actor: .user,
            confidence: nil,
            evidence: nil,
            text: text,
            revertsEventId: event.id,
            occurredAt: at,
            createdAt: at
        ),
        applicationPatch: ApplicationStatusPatch(status: to, statusChangedAt: at)
    )
}

extension ApplicationEventDraft {
    /// The stored event once the writer has assigned `id`.
    public func event(id: String) -> ApplicationEvent {
        ApplicationEvent(
            id: id,
            applicationId: applicationId,
            type: type,
            fromStatus: fromStatus,
            toStatus: toStatus,
            actor: actor,
            confidence: confidence,
            evidence: evidence,
            text: text,
            revertsEventId: revertsEventId,
            occurredAt: occurredAt,
            createdAt: createdAt
        )
    }
}

// MARK: - Suggestions. Never applied automatically: the UI offers them, the user decides.

public let defaultGhostedAfterDays = 21
public let defaultFollowUpAfterDays = 7

/// Events that count as employer activity (or a status update the user learned of).
private let signalEventTypes: [ApplicationEventType] = [.created, .statusChanged, .mailReceived, .interviewScheduled]

public struct GhostedSuggestion: Codable, Hashable, Sendable {
    /// Time of the last signal.
    public var silentSince: Date
    public var silentDays: Int
}

public struct FollowUpSuggestion: Codable, Hashable, Sendable {
    /// Application time or last follow-up sent, whichever is later.
    public var since: Date
    public var dueAt: Date
}

/// This application's events, minus undone ones and the undo events themselves.
private func effectiveEvents(_ applicationId: String, _ events: [ApplicationEvent]) -> [ApplicationEvent] {
    let own = events.filter { $0.applicationId == applicationId }
    let reverted = Set(own.compactMap(\.revertsEventId))
    return own.filter { $0.revertsEventId == nil && !reverted.contains($0.id) }
}

/// Suggest marking the application Ghosted after `days` (default 21) days without any signal.
/// Returns nil when not applicable.
public func suggestGhosted(
    _ application: some StatusTracked,
    events: [ApplicationEvent],
    now: Date,
    days: Int = defaultGhostedAfterDays
) throws -> GhostedSuggestion? {
    guard days >= 1 else { throw StatusArgumentError.invalidDays(days) }
    guard ApplicationStatus.ghostable.contains(application.status) else { return nil }

    var signals = effectiveEvents(application.id, events)
        .filter { signalEventTypes.contains($0.type) }
        .map(\.occurredAt.epochMilliseconds)
    if let appliedAt = application.appliedAt { signals.append(appliedAt.epochMilliseconds) }
    let last = signals.max() ?? application.statusChangedAt.epochMilliseconds

    let silentDays = Int(floorDivide(now.epochMilliseconds - last, by: millisecondsPerDay))
    return silentDays >= days
        ? GhostedSuggestion(silentSince: Date(epochMilliseconds: last), silentDays: silentDays)
        : nil
}

/// Suggest a follow-up `days` (default 7) after applying (or after the last follow-up sent) while
/// the application is still Applied and nothing has been received since applying.
public func followUpDue(
    _ application: some StatusTracked,
    events: [ApplicationEvent],
    now: Date,
    days: Int = defaultFollowUpAfterDays
) throws -> FollowUpSuggestion? {
    guard days >= 1 else { throw StatusArgumentError.invalidDays(days) }
    guard application.status == .applied else { return nil }

    let appliedAt = (application.appliedAt ?? application.statusChangedAt).epochMilliseconds
    let after = effectiveEvents(application.id, events).filter { $0.occurredAt.epochMilliseconds >= appliedAt }
    if after.contains(where: { $0.type == .mailReceived }) { return nil }

    let since = after
        .filter { $0.type == .mailSent }
        .map(\.occurredAt.epochMilliseconds)
        .reduce(appliedAt, max)
    let dueAt = since + Int64(days) * millisecondsPerDay
    return now.epochMilliseconds >= dueAt
        ? FollowUpSuggestion(since: Date(epochMilliseconds: since), dueAt: Date(epochMilliseconds: dueAt))
        : nil
}
