import BFHRCore
import Foundation
import Observation

/// The Tracker tab on iOS: the Pipeline (scope tabs, stage strip, status sections) and the
/// Application detail (tracker.md "Decision — iOS", flows.md §5). Moves are optimistic, go through
/// BFHRCore's state machine and return a toast whose Undo appends a revert event.
@Observable
public final class TrackerBoardModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = [] {
        didSet { rebuild() }
    }

    /// Active · Closed · All.
    public var scope: PipelineScope = .active {
        didSet { rebuild() }
    }

    /// The clock for relative values and for the time stamped on writes. The data layer advances it.
    public var now: Date {
        didSet { rebuild() }
    }

    public let calendar: Calendar

    public private(set) var data: UserData = .empty

    /// One section per status of `scope`, in status order.
    public private(set) var sections: [PipelineSection] = []
    /// One tab per section.
    public private(set) var stageStrip: [StageCount] = []
    /// Follow-up and no-response suggestions, minus the ones dismissed here.
    public private(set) var nudges: [NudgeItem] = []

    /// Suggestions dismissed with Not needed / Keep waiting (local only).
    private var dismissedNudgeIDs: Set<String> = []

    public init(now: Date = .now, calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
        rebuild()
    }

    public func load(_ data: UserData) {
        self.data = data
        rebuild()
        phase = .loaded
    }

    // MARK: Pipeline

    /// No applications at all: the empty Pipeline ("No applications yet").
    public var isEmpty: Bool { data.applications.isEmpty }

    /// `sections` grouped by phase (Shortlist, In progress, Closed), in order.
    public var phaseGroups: [PipelinePhaseGroup] {
        var groups: [PipelinePhaseGroup] = []
        for section in sections {
            if groups.last?.phase == section.phase {
                groups[groups.count - 1].sections.append(section)
            } else {
                groups.append(PipelinePhaseGroup(phase: section.phase, sections: [section]))
            }
        }
        return groups
    }

    /// The status the leading swipe advances to ("Advance to Screening"); nil from Offer and
    /// from closed statuses.
    public func advanceTarget(for applicationId: String) -> ApplicationStatus? {
        guard
            let status = data.application(id: applicationId)?.status,
            let index = ApplicationStatus.active.firstIndex(of: status),
            index + 1 < ApplicationStatus.active.count
        else { return nil }
        return ApplicationStatus.active[index + 1]
    }

    /// Move to… sheet rows: every status, current checked, invalid ones disabled with a reason.
    public func moveTargets(for applicationId: String) -> [MoveTarget] {
        data.moveTargets(for: applicationId)
    }

    /// Close… sheet rows: Not selected, Withdrawn, No response, then Accepted and Declined
    /// (disabled with a reason unless the application is at Offer).
    public func outcomeTargets(for applicationId: String) -> [MoveTarget] {
        let targets = data.moveTargets(for: applicationId)
        return (ApplicationStatus.sideExits + ApplicationStatus.outcomes).compactMap { status in
            targets.first { $0.status == status }
        }
    }

    // MARK: Actions

    /// Moves an application as the user. Throws `TransitionError` for a move the state machine
    /// denies (e.g. Applied → Accepted).
    @discardableResult
    public func move(_ applicationId: String, to status: ApplicationStatus) throws -> ToastItem {
        let event = try data.moveApplication(applicationId, to: status, actor: .user, at: now)
        commit(applicationId)
        let company = data.application(id: applicationId)?.company ?? ""
        return ToastItem(
            glyph: ToastGlyph.moved,
            message: Strings.moved(company, to: status),
            action: .undo { [weak self] in self?.revertSilently(event.id) }
        )
    }

    /// Leading swipe: moves to the next active status. Nil when there is none (Offer, closed).
    @discardableResult
    public func advance(_ applicationId: String) throws -> ToastItem? {
        guard let target = advanceTarget(for: applicationId) else { return nil }
        return try move(applicationId, to: target)
    }

    /// Close…: moves to an outcome. Accepted and Declined only from Offer (throws
    /// `TransitionError` otherwise); an active status throws `TrackerBoardError.notAnOutcome`.
    @discardableResult
    public func close(_ applicationId: String, outcome: ApplicationStatus) throws -> ToastItem {
        guard outcome.isTerminal else { throw TrackerBoardError.notAnOutcome(outcome) }
        return try move(applicationId, to: outcome)
    }

    /// Undo on a timeline row (usually an automatic change): appends the revert event; undoing an
    /// automatic change also marks its email corrected. The toast names the restored status and
    /// offers no further Undo.
    @discardableResult
    public func undo(eventId: String) throws -> ToastItem {
        guard let event = data.applicationEvents.first(where: { $0.id == eventId }) else {
            throw UserDataError.missingEvent(eventId)
        }
        let revert = event.actor == .user
            ? try data.revertEvent(eventId, at: now)
            : try data.undoAutoChange(eventId, at: now)
        commit(event.applicationId)
        let application = data.application(id: event.applicationId)
        return ToastItem(
            glyph: ToastGlyph.restored,
            message: Strings.moved(application?.company ?? "", to: revert.toStatus ?? application?.status ?? .applied)
        )
    }

    /// Not needed / Keep waiting on a suggestion. Local; Undo brings it back.
    @discardableResult
    public func dismissNudge(_ nudge: NudgeItem) -> ToastItem {
        dismissedNudgeIDs.insert(nudge.id)
        rebuild()
        return ToastItem(
            glyph: ToastGlyph.hidden,
            message: TrackerBoardStrings.suggestionDismissed(nudge.company.name),
            action: .undo { [weak self] in
                guard let self else { return }
                dismissedNudgeIDs.remove(nudge.id)
                rebuild()
            }
        )
    }

    /// Mark as no response: moves the application to `ghosted`.
    @discardableResult
    public func markNoResponse(_ nudge: NudgeItem) throws -> ToastItem {
        try move(nudge.applicationId, to: .ghosted)
    }

    // MARK: Detail

    public func detail(for applicationId: String) -> ApplicationDetail? {
        guard let application = data.application(id: applicationId) else { return nil }
        let events = data.events(forApplication: applicationId)
        let lastMoveAutomatic = Self.lastMoveAutomatic(events)
        let pendingSync = pendingSyncIDs.contains(applicationId)

        var days: [ApplicationDetail.TimelineDay] = []
        for entry in data.timeline(for: applicationId) {
            let day = calendar.startOfDay(for: entry.occurredAt)
            if days.last?.day == day {
                days[days.count - 1].entries.append(entry)
            } else {
                days.append(ApplicationDetail.TimelineDay(day: day, entries: [entry]))
            }
        }

        return ApplicationDetail(
            id: application.id,
            header: ApplicationDetail.Header(
                company: CompanyIdentity(name: application.company, domain: application.companyDomain),
                role: application.role,
                location: application.location,
                status: application.status,
                statusChangedAt: application.statusChangedAt,
                daysInStage: daysSince(application.statusChangedAt),
                channel: application.channel,
                appliedAt: application.appliedAt,
                source: application.source,
                lastMoveAutomatic: lastMoveAutomatic,
                pendingSync: pendingSync
            ),
            progress: Self.progress(application.status, events: events),
            nextStep: nextStep(application, events: events).step,
            nudges: nudges.filter { $0.applicationId == applicationId },
            timeline: days,
            interviews: data.interviews(forApplication: applicationId),
            contacts: data.contacts(forApplication: applicationId),
            cv: application.cvId.flatMap { data.cv(id: $0) }.map { .init(id: $0.id, title: $0.title) },
            coverLetter: application.coverLetterId
                .flatMap { id in data.coverLetters.first { $0.id == id } }
                .map { .init(id: $0.id, title: $0.title) }
        )
    }

    // MARK: Derivation

    private func rebuild() {
        let statuses = scope.statuses
        let rows = data.applications
            .filter { statuses.contains($0.status) }
            .map(row(for:))
        let byStatus = Dictionary(grouping: rows, by: \.status)
        sections = statuses.map { status in
            let rows = (byStatus[status] ?? []).sorted(by: Self.rowOrder)
            return PipelineSection(
                status: status,
                rows: rows,
                collapsedByDefault: rows.isEmpty || (status == .saved && rows.count > 5)
            )
        }
        stageStrip = sections.map { StageCount(status: $0.status, count: $0.count) }
        nudges = data.nudges(at: now).filter { !dismissedNudgeIDs.contains($0.id) }
    }

    /// Marks the write for sync and recomputes (once: an offline write recomputes through
    /// `pendingSyncIDs`).
    private func commit(_ applicationId: String) {
        let pendingBefore = pendingSyncIDs
        recordWrite(applicationId)
        if pendingSyncIDs == pendingBefore { rebuild() }
    }

    /// Toast Undo: a no-op when a newer move superseded the event.
    private func revertSilently(_ eventId: String) {
        guard let applicationId = data.applicationEvents.first(where: { $0.id == eventId })?.applicationId,
              (try? data.revertEvent(eventId, at: now)) != nil
        else { return }
        commit(applicationId)
    }

    private func row(for application: Application) -> PipelineRow {
        let events = data.events(forApplication: application.id)
        let next = nextStep(application, events: events)
        return PipelineRow(
            id: application.id,
            company: CompanyIdentity(name: application.company, domain: application.companyDomain),
            role: application.role,
            status: application.status,
            statusChangedAt: application.statusChangedAt,
            daysInStage: daysSince(application.statusChangedAt),
            nextDate: next.date,
            secondLine: next.step,
            lastMoveAutomatic: Self.lastMoveAutomatic(events),
            pendingSync: pendingSyncIDs.contains(application.id)
        )
    }

    /// The soonest of the next interview and the next action (interview on a tie), else an
    /// undated or overdue next action, else the staleness hint. `date` is set only when ≥ now.
    private func nextStep(_ application: Application, events: [ApplicationEvent]) -> (step: ApplicationNextStep, date: Date?) {
        let interview = data.interviews(forApplication: application.id).first { $0.startsAt >= now }
        let action = application.nextAction.flatMap { $0.isEmpty ? nil : $0 }
        let upcomingActionAt = application.nextActionAt.flatMap { action != nil && $0 >= now ? $0 : nil }

        if let interview, upcomingActionAt.map({ interview.startsAt <= $0 }) ?? true {
            return (.interview(startsAt: interview.startsAt, kind: interview.kind), interview.startsAt)
        }
        if let action {
            return (.nextAction(text: action, dueAt: application.nextActionAt), upcomingActionAt)
        }
        let followUpDays = data.profile?.settings.followUpAfterDays ?? defaultFollowUpAfterDays
        if let silence = try? suggestGhosted(application, events: events, now: now, days: followUpDays) {
            return (.stale(silentDays: silence.silentDays), nil)
        }
        return (.none, nil)
    }

    private func daysSince(_ date: Date) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
    }

    /// Next date soonest (rows without one last), then most recently moved.
    private static func rowOrder(_ lhs: PipelineRow, _ rhs: PipelineRow) -> Bool {
        switch (lhs.nextDate, rhs.nextDate) {
        case let (left?, right?) where left != right: return left < right
        case (.some, nil): return true
        case (nil, .some): return false
        default:
            if lhs.statusChangedAt != rhs.statusChangedAt { return lhs.statusChangedAt > rhs.statusChangedAt }
            return lhs.id < rhs.id
        }
    }

    /// Status-setting events (created, status changes), oldest first.
    private static func statusEvents(_ events: [ApplicationEvent]) -> [ApplicationEvent] {
        events.filter { $0.type == .created || $0.type == .statusChanged }
    }

    /// The latest status event that wasn't undone was made by automation. Undo events are the
    /// user's, so an undone automatic move reads as manual.
    private static func lastMoveAutomatic(_ events: [ApplicationEvent]) -> Bool {
        let reverted = Set(events.compactMap(\.revertsEventId))
        return statusEvents(events).last { !reverted.contains($0.id) }.map { $0.actor != .user } ?? false
    }

    private static func progress(_ status: ApplicationStatus, events: [ApplicationEvent]) -> [ApplicationDetail.StageStep] {
        let active = ApplicationStatus.active
        if let current = active.firstIndex(of: status) {
            return active.enumerated().map { index, step in
                ApplicationDetail.StageStep(
                    status: step,
                    state: index < current ? .done : index == current ? .current : .upcoming
                )
            }
        }
        // Closed: the active statuses up to the last one the application sat in, then the outcome.
        let lastActive = statusEvents(events).compactMap(\.toStatus).last { $0.isActive }
        let reached = lastActive.flatMap { active.firstIndex(of: $0) }.map { Array(active[...$0]) } ?? []
        return reached.map { ApplicationDetail.StageStep(status: $0, state: .done) }
            + [ApplicationDetail.StageStep(status: status, state: .current)]
    }
}

enum TrackerBoardStrings {
    static func suggestionDismissed(_ company: String) -> LocalizedStringResource {
        .bfhr(
            "tracker.toast.suggestionDismissed",
            default: "\(company) · suggestion dismissed",
            table: "TrackerBoard",
            comment: "Toast after Not needed / Keep waiting on a follow-up or no-response suggestion. %@ = company."
        )
    }
}
