import BFHRCore
import Foundation

// Tracker edits beyond status moves (M3): Log an application, reminders, notes, interview rounds
// and contacts. Each is optimistic, goes through `mutate` (one batch to the writer) and returns a
// toast; removals offer Undo.

extension TrackerBoardModel {
    // MARK: Log an application

    /// A blank draft dated now.
    public func newApplicationDraft() -> ApplicationDraft {
        ApplicationDraft(date: now)
    }

    /// Adds the application (with its `created` event) and returns its id; the view pushes the
    /// detail and shows `loggedToast`.
    @discardableResult
    public func logApplication(_ draft: ApplicationDraft) -> String {
        mutate { $0.addApplication(draft, now: writeTime) }.id
    }

    /// "Acme · added to Applied" (the detail is already open, so no action).
    public func loggedToast(_ applicationId: String) -> ToastItem? {
        guard let application = data.application(id: applicationId) else { return nil }
        return ToastItem(
            glyph: ToastGlyph.saved,
            message: TrackerBoardStrings.logged(application.company, status: application.status)
        )
    }

    /// Deletes an application, its interview rounds and its links to contacts (after a
    /// confirmation; no Undo, the server deletes its history).
    public func deleteApplication(_ applicationId: String) throws -> ToastItem {
        let company = data.application(id: applicationId)?.company ?? ""
        try mutate { try $0.deleteApplication(applicationId, now: writeTime) }
        for interview in interviewPrep.keys where !data.interviews.contains(where: { $0.id == interview }) {
            interviewPrep[interview] = nil
        }
        return ToastItem(glyph: ToastGlyph.removed, message: TrackerBoardStrings.deleted(company))
    }

    // MARK: Reminder and notes

    /// The reminder sheet's starting values: the current reminder, or "Follow up" tomorrow 09:00.
    public func reminderDraft(for applicationId: String, followUp: Bool = false) -> (text: String, dueAt: Date) {
        let application = data.application(id: applicationId)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        let nine = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: tomorrow) ?? tomorrow
        if !followUp, let text = application?.nextAction, !text.isEmpty {
            return (text, application?.nextActionAt ?? nine)
        }
        return (String(localized: TrackerBoardStrings.followUpReminderText(application?.company ?? "")), nine)
    }

    /// Sets the application's reminder. Undo puts the previous one back.
    @discardableResult
    public func setReminder(_ applicationId: String, text: String, at date: Date?) throws -> ToastItem {
        let previous = data.application(id: applicationId).map { ($0.nextAction, $0.nextActionAt) }
        try mutate { try $0.setReminder(applicationId, text: text, at: date, now: writeTime) }
        let company = data.application(id: applicationId)?.company ?? ""
        return ToastItem(
            glyph: ToastGlyph.snoozed,
            message: TrackerBoardStrings.reminderSet(company),
            action: .undo { [weak self] in
                guard let self else { return }
                _ = try? mutate { try $0.setReminder(applicationId, text: previous?.0, at: previous?.1, now: self.writeTime) }
            }
        )
    }

    /// Clears the reminder (Done or Remove). Undo restores it.
    @discardableResult
    public func clearReminder(_ applicationId: String) throws -> ToastItem {
        guard let application = data.application(id: applicationId) else { throw UserDataError.missingApplication(applicationId) }
        let previous = (application.nextAction, application.nextActionAt)
        try mutate { try $0.setReminder(applicationId, text: nil, at: nil, now: writeTime) }
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: TrackerBoardStrings.reminderCleared(application.company),
            action: .undo { [weak self] in
                guard let self else { return }
                _ = try? mutate { try $0.setReminder(applicationId, text: previous.0, at: previous.1, now: self.writeTime) }
            }
        )
    }

    /// Saves the notes when they changed (silent: the field shows them).
    public func setNotes(_ applicationId: String, notes: String) throws {
        guard let application = data.application(id: applicationId) else { throw UserDataError.missingApplication(applicationId) }
        guard application.notes != notes.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
        try mutate { try $0.setNotes(applicationId, notes: notes, now: writeTime) }
    }

    // MARK: Interviews

    /// A new round for the editor (not saved until `saveInterview`).
    public func newInterview(for applicationId: String) -> Interview {
        let round = (data.interviews(forApplication: applicationId).map(\.round).max() ?? 0) + 1
        return .draft(for: applicationId, round: round, now: now, calendar: calendar)
    }

    public func isNewInterview(_ interviewId: String) -> Bool {
        !data.interviews.contains { $0.id == interviewId }
    }

    @discardableResult
    public func saveInterview(_ interview: Interview) -> ToastItem {
        let isNew = isNewInterview(interview.id)
        mutate { $0.saveInterview(interview, now: writeTime) }
        let company = data.application(id: interview.applicationId)?.company ?? ""
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: isNew ? TrackerBoardStrings.interviewAdded(company) : TrackerBoardStrings.interviewSaved(company)
        )
    }

    /// Removes a round. Undo puts it back with the same id.
    @discardableResult
    public func deleteInterview(_ interviewId: String) throws -> ToastItem {
        guard let interview = data.interviews.first(where: { $0.id == interviewId }) else { throw UserDataError.missingInterview(interviewId) }
        let prep = interviewPrep[interviewId]
        try mutate { try $0.deleteInterview(interviewId) }
        if prep != nil { setPrep(nil, for: interviewId) }
        let company = data.application(id: interview.applicationId)?.company ?? ""
        return ToastItem(
            glyph: ToastGlyph.removed,
            message: TrackerBoardStrings.interviewRemoved(company),
            action: .undo { [weak self] in
                guard let self else { return }
                mutate { $0.restore(interview: interview) }
                if let prep { setPrep(prep, for: interviewId) }
            }
        )
    }

    // MARK: Contacts

    public func newContact(for applicationId: String) -> Contact {
        .draft(for: applicationId, company: data.application(id: applicationId)?.company, now: now)
    }

    public func isNewContact(_ contactId: String) -> Bool {
        !data.contacts.contains { $0.id == contactId }
    }

    @discardableResult
    public func saveContact(_ contact: Contact) -> ToastItem {
        let isNew = isNewContact(contact.id)
        mutate { $0.saveContact(contact, now: writeTime) }
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: isNew ? TrackerBoardStrings.contactAdded(contact.name) : TrackerBoardStrings.contactSaved(contact.name)
        )
    }

    /// Removes the contact from this application. Undo restores it.
    @discardableResult
    public func removeContact(_ contactId: String, from applicationId: String) throws -> ToastItem {
        guard let contact = data.contacts.first(where: { $0.id == contactId }) else { throw UserDataError.missingContact(contactId) }
        try mutate { try $0.removeContact(contactId, from: applicationId, now: writeTime) }
        return ToastItem(
            glyph: ToastGlyph.removed,
            message: TrackerBoardStrings.contactRemoved(contact.name),
            action: .undo { [weak self] in
                self?.mutate { $0.restore(contact: contact) }
            }
        )
    }
}

// MARK: - Calendar file and links

extension TrackerBoardModel {
    /// Add to Calendar (.ics) for one round.
    public func calendarFile(for interview: Interview) -> InterviewCalendarFile {
        let application = data.application(id: interview.applicationId)
        return InterviewCalendarFile(
            interview: interview,
            company: application?.company ?? "",
            role: application?.role ?? "",
            roundLabel: String(localized: TrackerBoardStrings.round(interview.round)),
            now: writeTime
        )
    }

    /// The Tracker destination of a `bruteforcehr://` link (IA.md "Deep links"):
    /// `applications/{id}`, `applications/{id}/events/{eventId}`, `interviews/{id}`,
    /// `tracker/new` and `tracker?view=calendar`. Nil for other links. An interview that isn't
    /// loaded yet keeps its id so the screen can resolve it after the first snapshot.
    public func route(for url: URL) -> TrackerRoute? {
        guard url.scheme?.lowercased() == "bruteforcehr" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch url.host()?.lowercased() {
        case "applications":
            guard let id = parts.first else { return nil }
            return .application(id, interviewId: nil)
        case "interviews":
            guard let id = parts.first else { return nil }
            let applicationId = data.interviews.first { $0.id == id }?.applicationId ?? ""
            return .application(applicationId, interviewId: id)
        case "insights":
            return .insights(range: URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "range" }?.value)
        case "tracker":
            if parts.first == "new" { return .add }
            let view = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "view" }?.value
            return view == "calendar" ? .calendar : nil
        default:
            return nil
        }
    }
}

// MARK: - Insights drill-down

/// The applications behind an Insights datum (decisions.md D03: Insights drills into the
/// Tracker). `label` names the datum on the chip ("Applied in the last 4 weeks").
public struct PipelineFilter: Hashable, Sendable {
    public var applicationIds: Set<String>
    public var label: String

    public init(applicationIds: Set<String>, label: String) {
        self.applicationIds = applicationIds
        self.label = label
    }
}

extension TrackerBoardModel {
    /// Shows only `ids` on the Pipeline (every stage) and pops Insights.
    public func applyFilter(ids: Set<String>, label: String) {
        filter = PipelineFilter(applicationIds: ids, label: label)
        view = .pipeline
        showsInsights = false
    }

    public func clearFilter() {
        filter = nil
    }
}
