import BFHRCore
import Foundation

// Optimistic writes shared by every screen. They follow BFHRCore's rules (status moves only
// through `transition`, Undo only through `revert`, events are append-only), so a screen model
// that mutates its `UserData` with these behaves like the Firestore writes that replace them.

public enum UserDataError: Error, Hashable {
    case missingApplication(String)
    case missingEvent(String)
    case missingMailMessage(String)
}

extension UserData {
    /// A new local document id (Firestore assigns real ids later).
    public static func makeID(_ prefix: String) -> String { "\(prefix)-local-\(UUID().uuidString.prefix(8).lowercased())" }

    /// Moves an application through the state machine and appends the event. Throws
    /// `TransitionError` for a move the actor may not make.
    @discardableResult
    public mutating func moveApplication(
        _ applicationId: String,
        to status: ApplicationStatus,
        actor: EventActor = .user,
        at date: Date,
        confidence: Double? = nil,
        evidence: EventEvidence? = nil,
        text: String? = nil
    ) throws -> ApplicationEvent {
        guard let index = applications.firstIndex(where: { $0.id == applicationId }) else {
            throw UserDataError.missingApplication(applicationId)
        }
        let result = try transition(
            applications[index], to: status, actor: actor, at: date,
            confidence: confidence, evidence: evidence, text: text
        )
        return apply(result, at: index)
    }

    /// Undoes a status change by appending the inverse event (`revertsEventId`). Throws when
    /// `canRevert` denies it.
    @discardableResult
    public mutating func revertEvent(_ eventId: String, at date: Date) throws -> ApplicationEvent {
        guard let event = applicationEvents.first(where: { $0.id == eventId }) else {
            throw UserDataError.missingEvent(eventId)
        }
        guard let index = applications.firstIndex(where: { $0.id == event.applicationId }) else {
            throw UserDataError.missingApplication(event.applicationId)
        }
        let result = try revert(event, of: applications[index], events: events(forApplication: event.applicationId), at: date)
        return apply(result, at: index)
    }

    /// Whether Undo is offered for `eventId` (decisions.md D11: latest move, no time limit).
    public func revertCheck(for eventId: String) -> RevertCheck {
        guard
            let event = applicationEvents.first(where: { $0.id == eventId }),
            let application = application(id: event.applicationId)
        else { return .denied(.notRevertible) }
        return canRevert(event, of: application, events: events(forApplication: application.id))
    }

    /// Sets a mail message's review fields (the only fields clients may write).
    public mutating func setReviewState(_ messageId: String, to state: ReviewState, at date: Date) throws {
        guard let index = mailMessages.firstIndex(where: { $0.id == messageId }) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        mailMessages[index].reviewState = state
        mailMessages[index].reviewedAt = date
        mailMessages[index].updatedAt = date
    }

    /// Sets a job match's state (save, not for me, back to new).
    public mutating func setMatchState(
        _ jobId: String,
        to state: JobMatchState,
        reasons: [DismissReason] = [],
        at date: Date
    ) {
        guard let index = jobMatches.firstIndex(where: { $0.id == jobId }) else { return }
        jobMatches[index].state = state
        jobMatches[index].dismissReasons = state == .dismissed ? reasons : []
        jobMatches[index].stateChangedAt = date
    }

    /// Archives (`date` set) or unarchives (`nil`) a CV. CVs are archive-only in v1 (D14).
    public mutating func setCvArchived(_ cvId: String, at date: Date?, now: Date) {
        guard let index = cvs.firstIndex(where: { $0.id == cvId }) else { return }
        cvs[index].archivedAt = date
        cvs[index].updatedAt = date ?? now
    }

    /// Confirms (or corrects) a review-queue email: writes the review fields and, when the
    /// proposed status differs from the application's, moves the application as the user with the
    /// email as evidence. Passing a different category, application or status marks the email
    /// `corrected` instead of `confirmed`. Returns the status event, if one was written.
    @discardableResult
    public mutating func confirmReview(
        _ messageId: String,
        category: MailCategory? = nil,
        applicationId: String?? = nil,
        status: ApplicationStatus?? = nil,
        at date: Date
    ) throws -> ApplicationEvent? {
        guard let index = mailMessages.firstIndex(where: { $0.id == messageId }) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        var message = mailMessages[index]
        let corrected = (category.map { $0 != message.category } ?? false)
            || (applicationId.map { $0 != message.applicationId } ?? false)
            || (status.map { $0 != message.suggestedStatus } ?? false)
        if let category { message.category = category }
        if let applicationId { message.applicationId = applicationId }
        if let status { message.suggestedStatus = status }

        var event: ApplicationEvent?
        if let target = message.suggestedStatus, let linkedId = message.applicationId,
           let application = application(id: linkedId), application.status != target {
            event = try moveApplication(
                linkedId, to: target, actor: .user, at: date,
                evidence: EventEvidence(mailMessageId: message.id, reason: message.subject)
            )
            message.appliedEventId = event?.id
        }
        message.reviewState = corrected ? .corrected : .confirmed
        message.reviewedAt = date
        message.updatedAt = date
        mailMessages[index] = message
        return event
    }

    /// Undoes an automatic status change and marks its email `corrected` (decisions.md D11).
    @discardableResult
    public mutating func undoAutoChange(_ eventId: String, at date: Date) throws -> ApplicationEvent {
        let mailMessageId = applicationEvents.first { $0.id == eventId }?.evidence?.mailMessageId
        let undo = try revertEvent(eventId, at: date)
        if let mailMessageId, mailMessages.contains(where: { $0.id == mailMessageId }) {
            try setReviewState(mailMessageId, to: .corrected, at: date)
        }
        return undo
    }

    private mutating func apply(_ result: TransitionResult, at index: Int) -> ApplicationEvent {
        let event = result.event.event(id: Self.makeID("evt"))
        applicationEvents.append(event)
        applications[index].status = result.applicationPatch.status
        applications[index].statusChangedAt = result.applicationPatch.statusChangedAt
        if let appliedAt = result.applicationPatch.appliedAt { applications[index].appliedAt = appliedAt }
        applications[index].updatedAt = result.applicationPatch.statusChangedAt
        return event
    }
}
