import BFHRCore
import Foundation

// Tracker writes beyond status moves (M3): logging an application, its reminder and notes,
// interview rounds and contacts. Same rules as the status mutations: field-level changes on the
// documents the client may write (docs/adr/0002-data-model.md), events append-only and made by
// the user.

/// What "Log an application" records.
public struct ApplicationDraft: Hashable, Sendable {
    public var company: String
    public var role: String
    public var location: String
    public var status: ApplicationStatus
    /// When the application reached `status` (the applied date for Applied and later).
    public var date: Date
    public var channel: Channel?
    public var notes: String

    public init(
        company: String = "",
        role: String = "",
        location: String = "",
        status: ApplicationStatus = .applied,
        date: Date,
        channel: Channel? = nil,
        notes: String = ""
    ) {
        self.company = company
        self.role = role
        self.location = location
        self.status = status
        self.date = date
        self.channel = channel
        self.notes = notes
    }

    /// Statuses an application can be logged in: the active ones (a closed outcome is logged by
    /// moving it afterwards, so the history reads in order).
    public static let statuses = ApplicationStatus.active

    /// Applied or later: the date is the applied date.
    public var hasApplied: Bool {
        guard let rank = ApplicationStatus.active.firstIndex(of: status),
              let applied = ApplicationStatus.active.firstIndex(of: .applied) else { return false }
        return rank >= applied
    }

    /// Company and role are required; everything else is optional.
    public var isValid: Bool {
        !company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

extension UserData {
    /// Adds a manually logged application and its `created` event (actor user). The event and
    /// `statusChangedAt` carry the date the user gave, so follow-up and no-response suggestions
    /// count from it; `createdAt` is the time of logging.
    @discardableResult
    public mutating func addApplication(_ draft: ApplicationDraft, now: Date) -> Application {
        let trimmed = { (value: String) -> String? in
            let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return text.isEmpty ? nil : text
        }
        let date = min(draft.date, now)
        let application = Application(
            id: Self.makeID(),
            jobId: nil,
            company: trimmed(draft.company) ?? "",
            companyDomain: nil,
            role: trimmed(draft.role) ?? "",
            location: trimmed(draft.location),
            status: draft.status,
            statusChangedAt: date,
            channel: draft.channel,
            source: "manual",
            appliedAt: draft.hasApplied ? date : nil,
            cvId: nil,
            cvRevisionId: nil,
            cvFileId: nil,
            coverLetterId: nil,
            coverLetterFileId: nil,
            fromAccountId: nil,
            threadRefs: [],
            nextAction: nil,
            nextActionAt: nil,
            priority: .normal,
            notes: trimmed(draft.notes) ?? "",
            followUpSnoozedUntil: nil,
            followUpDismissedAt: nil,
            ghostedSnoozedUntil: nil,
            ghostedDismissedAt: nil,
            emailSend: nil,
            createdAt: now,
            updatedAt: now
        )
        applications.append(application)
        applicationEvents.append(ApplicationEvent(
            id: Self.makeID(),
            applicationId: application.id,
            type: .created,
            fromStatus: nil,
            toStatus: draft.status,
            actor: .user,
            confidence: nil,
            evidence: nil,
            text: nil,
            revertsEventId: nil,
            occurredAt: date,
            createdAt: now
        ))
        return application
    }

    /// Removes an application with its interview rounds and unlinks its contacts. The server
    /// deletes its events (clients can't), so they leave only this copy.
    public mutating func deleteApplication(_ applicationId: String, now: Date) throws {
        guard applications.contains(where: { $0.id == applicationId }) else { throw UserDataError.missingApplication(applicationId) }
        applications.removeAll { $0.id == applicationId }
        applicationEvents.removeAll { $0.applicationId == applicationId }
        interviews.removeAll { $0.applicationId == applicationId }
        for index in contacts.indices where contacts[index].applicationIds.contains(applicationId) {
            contacts[index].applicationIds.removeAll { $0 == applicationId }
            contacts[index].updatedAt = now
        }
    }

    /// The reminder ("next action") on an application: `text` nil or blank clears it.
    public mutating func setReminder(_ applicationId: String, text: String?, at date: Date?, now: Date) throws {
        guard let index = applications.firstIndex(where: { $0.id == applicationId }) else {
            throw UserDataError.missingApplication(applicationId)
        }
        let text = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let text, !text.isEmpty {
            applications[index].nextAction = text
            applications[index].nextActionAt = date
        } else {
            applications[index].nextAction = nil
            applications[index].nextActionAt = nil
        }
        applications[index].updatedAt = now
    }

    public mutating func setNotes(_ applicationId: String, notes: String, now: Date) throws {
        guard let index = applications.firstIndex(where: { $0.id == applicationId }) else {
            throw UserDataError.missingApplication(applicationId)
        }
        applications[index].notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        applications[index].updatedAt = now
    }

    /// Adds or replaces an interview round. A new round also appends an `interview_scheduled`
    /// event (actor user) so the timeline shows when it was added.
    public mutating func saveInterview(_ interview: Interview, now: Date) {
        var interview = interview
        interview.updatedAt = now
        if let index = interviews.firstIndex(where: { $0.id == interview.id }) {
            interviews[index] = interview
        } else {
            interview.createdAt = now
            interviews.append(interview)
            applicationEvents.append(ApplicationEvent(
                id: Self.makeID(),
                applicationId: interview.applicationId,
                type: .interviewScheduled,
                fromStatus: nil,
                toStatus: nil,
                actor: .user,
                confidence: nil,
                evidence: nil,
                text: interview.title,
                revertsEventId: nil,
                occurredAt: now,
                createdAt: now
            ))
        }
    }

    public mutating func deleteInterview(_ interviewId: String) throws {
        guard interviews.contains(where: { $0.id == interviewId }) else { throw UserDataError.missingInterview(interviewId) }
        interviews.removeAll { $0.id == interviewId }
    }

    /// Adds or replaces a contact.
    public mutating func saveContact(_ contact: Contact, now: Date) {
        var contact = contact
        contact.updatedAt = now
        if let index = contacts.firstIndex(where: { $0.id == contact.id }) {
            contacts[index] = contact
        } else {
            contact.createdAt = now
            contacts.append(contact)
        }
    }

    /// Unlinks a contact from an application; a contact linked to nothing else is deleted.
    public mutating func removeContact(_ contactId: String, from applicationId: String, now: Date) throws {
        guard let index = contacts.firstIndex(where: { $0.id == contactId }) else { throw UserDataError.missingContact(contactId) }
        contacts[index].applicationIds.removeAll { $0 == applicationId }
        if contacts[index].applicationIds.isEmpty {
            contacts.remove(at: index)
        } else {
            contacts[index].updatedAt = now
        }
    }

    /// Restores documents removed or changed by an earlier mutation (Undo of a delete).
    public mutating func restore(interview: Interview) {
        interviews.removeAll { $0.id == interview.id }
        interviews.append(interview)
    }

    public mutating func restore(contact: Contact) {
        contacts.removeAll { $0.id == contact.id }
        contacts.append(contact)
    }

    /// The user's answer on a suggestion card, kept on the application (decisions.md F9): the
    /// follow-up's "Not needed" / snooze, the no-response's "Keep waiting" / snooze. `nil` clears
    /// the answer again (Undo).
    public mutating func answerSuggestion(
        _ applicationId: String,
        _ kind: SuggestionKind,
        _ answer: SuggestionAnswer?,
        now: Date
    ) throws {
        guard let index = applications.firstIndex(where: { $0.id == applicationId }) else {
            throw UserDataError.missingApplication(applicationId)
        }
        switch (kind, answer) {
        case (.followUp, .dismissed): applications[index].followUpDismissedAt = now
        case (.followUp, .snoozed(let until)): applications[index].followUpSnoozedUntil = until
        case (.followUp, nil):
            applications[index].followUpDismissedAt = nil
            applications[index].followUpSnoozedUntil = nil
        case (.noResponse, .dismissed): applications[index].ghostedDismissedAt = now
        case (.noResponse, .snoozed(let until)): applications[index].ghostedSnoozedUntil = until
        case (.noResponse, nil):
            applications[index].ghostedDismissedAt = nil
            applications[index].ghostedSnoozedUntil = nil
        }
        applications[index].updatedAt = now
    }
}

/// Which suggestion card an answer is for.
public enum SuggestionKind: Hashable, Sendable {
    case followUp
    case noResponse
}

/// "Not needed" / "Keep waiting" (`dismissed`) or Snooze (`snoozed`).
public enum SuggestionAnswer: Hashable, Sendable {
    case dismissed
    case snoozed(until: Date)
}

/// A blank interview round for `applicationId`: the next round number, tomorrow at 10:00 in
/// the user's zone, 45 minutes.
extension Interview {
    public static func draft(for applicationId: String, round: Int, now: Date, calendar: Calendar) -> Interview {
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        let start = calendar.date(bySettingHour: 10, minute: 0, second: 0, of: tomorrow) ?? tomorrow
        return Interview(
            id: UserData.makeID(),
            applicationId: applicationId,
            round: round,
            kind: round == 1 ? .recruiterCall : .technical,
            title: "",
            startsAt: start,
            durationMinutes: 45,
            timezone: calendar.timeZone.identifier,
            location: nil,
            meetingUrl: nil,
            people: [],
            prepNotes: "",
            sourceMailMessageId: nil,
            createdAt: now,
            updatedAt: now
        )
    }

    public nonisolated var endsAt: Date { startsAt.addingTimeInterval(TimeInterval(durationMinutes * 60)) }
}

extension Contact {
    public static func draft(for applicationId: String, company: String?, now: Date) -> Contact {
        Contact(
            id: UserData.makeID(),
            name: "",
            email: nil,
            company: company,
            role: nil,
            links: [],
            applicationIds: [applicationId],
            notes: "",
            createdAt: now,
            updatedAt: now
        )
    }
}
