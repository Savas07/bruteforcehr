import BFHRCore
import Foundation

// Optimistic writes shared by every screen. They follow BFHRCore's rules (status moves only
// through `transition`, Undo only through `revert`, events are append-only), so a screen model
// that mutates its `UserData` with these behaves like the Firestore writes that replace them.

public enum UserDataError: Error, Hashable {
    case missingApplication(String)
    case missingEvent(String)
    case missingMailMessage(String)
    case missingInterview(String)
    case missingContact(String)
}

extension UserData {
    // MARK: Status moves

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

    /// Writes a decision on an email in the review queue. Clients write only the four review
    /// fields; the server's `mailMessageReviewed` trigger links the email, records it on the
    /// timeline, makes the move and creates a suggested interview (ADR 0012), so the local copy
    /// changes only the email and the snapshot brings the rest. Returns the move the server will
    /// make (nil: the email is filed without one).
    @discardableResult
    public mutating func review(_ messageId: String, _ decision: ReviewDecision, at date: Date) throws -> ApplicationStatus? {
        guard let index = mailMessages.firstIndex(where: { $0.id == messageId }) else {
            throw UserDataError.missingMailMessage(messageId)
        }
        var message = mailMessages[index]
        let move: ApplicationStatus?
        switch decision {
        case .confirm:
            move = reviewMove(for: message, category: message.category, applicationId: message.applicationId)
            message.reviewState = .confirmed
        case .correct(let category, let applicationId):
            move = reviewMove(for: message, category: category, applicationId: applicationId)
            let changed = category != message.category || applicationId != message.applicationId
            message.category = category
            message.applicationId = applicationId
            message.reviewState = changed ? .corrected : .confirmed
        case .notJobMail:
            move = nil
            message.category = .notJob
            message.applicationId = nil
            message.reviewState = .corrected
        }
        message.reviewedAt = date
        message.updatedAt = date
        mailMessages[index] = message
        return move
    }

    /// The move the review trigger makes for `message` filed under `category` and `applicationId`
    /// (`reviewMoveTarget`): nil without an application or when the move isn't forward or an exit.
    public func reviewMove(for message: MailMessage, category: MailCategory, applicationId: String?) -> ApplicationStatus? {
        guard let application = applicationId.flatMap({ self.application(id: $0) }) else { return nil }
        return reviewMoveTarget(
            category: category,
            previousCategory: message.category,
            suggestedStatus: message.suggestedStatus,
            applicationStatus: application.status
        )
    }

    /// "Looks right" / "Add interview" on an automatically applied email: `auto_applied` →
    /// `confirmed`. The status change stays; for an invite the server creates the interview it
    /// suggests (ADR 0012).
    public mutating func confirmAutoApplied(_ messageId: String, at date: Date) throws {
        guard mailMessages.first(where: { $0.id == messageId })?.reviewState == .autoApplied else { return }
        try setReviewState(messageId, to: .confirmed, at: date)
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
        let event = result.event.event(id: Self.makeID())
        applicationEvents.append(event)
        applications[index].status = result.applicationPatch.status
        applications[index].statusChangedAt = result.applicationPatch.statusChangedAt
        if let appliedAt = result.applicationPatch.appliedAt { applications[index].appliedAt = appliedAt }
        applications[index].updatedAt = result.applicationPatch.statusChangedAt
        return event
    }
}

/// A decision on an email in the review queue (`UserData.review`).
public enum ReviewDecision: Hashable, Sendable {
    /// The proposal as is.
    case confirm
    /// Change…: another category and/or application (the same values confirm).
    case correct(category: MailCategory, applicationId: String?)
    /// "Not job mail": the server deletes the email and keeps the correction as a labeled example.
    case notJobMail
}
