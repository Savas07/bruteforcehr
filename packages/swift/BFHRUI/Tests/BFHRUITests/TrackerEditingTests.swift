import BFHRCore
import BFHRUIFixtures
import Foundation
import Testing
@testable import BFHRUI

/// M3 Tracker editing on the populated fixture: Log an application, reminders, interviews,
/// contacts, suggestion answers, the agenda, local notifications, `.ics`, links, and the batches
/// the data layer receives (`UserDataChanges`).
@Suite("Tracker editing (M3)")
struct TrackerEditingTests {
    let document: FixtureDocument
    let calendar: Calendar

    init() throws {
        document = try FixtureStore.document(.populated)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        self.calendar = calendar
    }

    private var now: Date { document.now }

    private func makeModel(_ dataset: FixtureDataset = .populated) throws -> (TrackerBoardModel, RecordingWriter) {
        let model = TrackerBoardModel(now: now, calendar: calendar)
        let writer = RecordingWriter()
        model.writer = writer
        model.load(UserData(try FixtureStore.document(dataset)))
        return (model, writer)
    }

    // MARK: Log an application

    @Test("Log an application: Applied with a back-dated applied date, one created event, one batch")
    func logApplication() async throws {
        let (model, writer) = try makeModel(.empty)
        var draft = model.newApplicationDraft()
        #expect(!draft.isValid)
        draft.company = "  Acme  "
        draft.role = "Frontend Engineer"
        draft.date = now.addingTimeInterval(-3 * 86400)
        draft.channel = .referral
        #expect(draft.isValid && draft.hasApplied)
        let id = model.logApplication(draft)
        let application = try #require(model.data.application(id: id))
        #expect(application.company == "Acme")
        #expect(application.status == .applied)
        #expect(application.appliedAt == draft.date)
        #expect(application.statusChangedAt == draft.date)
        #expect(application.source == "manual")
        #expect(id.count == 20)
        let events = model.data.events(forApplication: id)
        #expect(events.count == 1)
        #expect(events.first?.type == .created && events.first?.actor == .user && events.first?.toStatus == .applied)
        #expect(events.first?.occurredAt == draft.date)
        #expect(!model.isEmpty)
        #expect(model.loggedToast(id) != nil)

        let batch = try await writer.next()
        #expect(batch.applications.count == 1)
        if case .created = batch.applications.first {} else { Issue.record("application not created") }
        #expect(batch.applicationEvents.count == 1)
    }

    @Test("A logged application in Saved has no applied date; a future date is clamped to now")
    func logSaved() throws {
        let (model, _) = try makeModel(.empty)
        var draft = ApplicationDraft(company: "Acme", role: "Engineer", status: .saved, date: now.addingTimeInterval(86400))
        #expect(!draft.hasApplied)
        let id = model.logApplication(draft)
        #expect(model.data.application(id: id)?.appliedAt == nil)
        #expect(model.data.application(id: id)?.statusChangedAt == now)
        draft.status = .preparing
        #expect(!draft.hasApplied)
    }

    @Test("Delete removes the application, its rounds and its contact links; events stay for the server")
    func deleteApplication() async throws {
        let (model, writer) = try makeModel()
        _ = try model.deleteApplication("app-brightwave")
        #expect(model.data.application(id: "app-brightwave") == nil)
        #expect(model.data.interviews(forApplication: "app-brightwave").isEmpty)
        #expect(model.data.contacts(forApplication: "app-brightwave").isEmpty)
        let batch = try await writer.next()
        #expect(batch.applications.contains { if case .deleted = $0 { true } else { false } })
        #expect(batch.interviews.allSatisfy { if case .deleted = $0 { true } else { false } })
        #expect(batch.applicationEvents.isEmpty)
    }

    // MARK: Reminder, notes

    @Test("Set, change and clear a reminder; Undo restores the previous one")
    func reminder() async throws {
        let (model, writer) = try makeModel()
        let draft = model.reminderDraft(for: "app-quill", followUp: true)
        #expect(draft.text.contains("Quill Docs"))
        let toast = try model.setReminder("app-quill", text: draft.text, at: draft.dueAt)
        #expect(model.detail(for: "app-quill")?.reminder?.text == draft.text)
        let batch = try await writer.next()
        guard case .updated(_, let after) = batch.applications.first else { Issue.record("no update"); return }
        #expect(after.nextActionAt == draft.dueAt)
        toast.action?.perform()
        #expect(model.detail(for: "app-quill")?.reminder == nil)

        let cleared = try model.clearReminder("app-thames")
        #expect(model.detail(for: "app-thames")?.reminder == nil)
        cleared.action?.perform()
        #expect(model.detail(for: "app-thames")?.reminder?.text == "Prepare the pairing exercise")
    }

    @Test("Notes save trimmed and only when changed")
    func notes() async throws {
        let (model, writer) = try makeModel()
        try model.setNotes("app-quill", notes: "  Referred by Ada  ")
        #expect(model.detail(for: "app-quill")?.notes == "Referred by Ada")
        _ = try await writer.next()
        try model.setNotes("app-quill", notes: "Referred by Ada")
        #expect(writer.batches.count == 1)
    }

    // MARK: Interviews, contacts

    @Test("A new round gets the next number, an interview_scheduled event and a remove Undo")
    func interviews() async throws {
        let (model, writer) = try makeModel()
        var interview = model.newInterview(for: "app-brightwave")
        #expect(interview.round == 2)
        #expect(model.isNewInterview(interview.id))
        interview.title = "Pairing"
        model.saveInterview(interview)
        #expect(model.detail(for: "app-brightwave")?.interviews.count == 2)
        #expect(model.data.events(forApplication: "app-brightwave").last?.type == .interviewScheduled)
        let batch = try await writer.next()
        #expect(batch.interviews.count == 1 && batch.applicationEvents.count == 1)

        model.setPrep(.hourBefore, for: interview.id)
        let toast = try model.deleteInterview(interview.id)
        #expect(model.interviewPrep[interview.id] == nil)
        #expect(model.detail(for: "app-brightwave")?.interviews.count == 1)
        toast.action?.perform()
        #expect(model.detail(for: "app-brightwave")?.interviews.count == 2)
        #expect(model.interviewPrep[interview.id] == .hourBefore)
    }

    @Test("Contacts: add, edit, remove from the application (deleted when linked to nothing else), Undo")
    func contacts() throws {
        let (model, _) = try makeModel()
        var contact = model.newContact(for: "app-quill")
        contact.name = "Ada"
        model.saveContact(contact)
        #expect(model.detail(for: "app-quill")?.contacts.map(\.name) == ["Ada"])
        contact.role = "Recruiter"
        model.saveContact(contact)
        #expect(model.detail(for: "app-quill")?.contacts.first?.role == "Recruiter")
        let toast = try model.removeContact(contact.id, from: "app-quill")
        #expect(model.data.contacts.first { $0.id == contact.id } == nil)
        toast.action?.perform()
        #expect(model.detail(for: "app-quill")?.contacts.count == 1)
    }

    // MARK: Suggestions

    @Test("Not now on a follow-up is kept on the application; Undo clears it")
    func suggestionAnswer() async throws {
        let (model, writer) = try makeModel()
        let nudge = try #require(model.nudges.first { if case .followUp = $0.kind { true } else { false } })
        let toast = model.dismissNudge(nudge)
        #expect(!model.nudges.contains { $0.id == nudge.id })
        #expect(model.data.application(id: nudge.applicationId)?.followUpDismissedAt != nil)
        let batch = try await writer.next()
        #expect(batch.applications.count == 1)
        toast.action?.perform()
        #expect(model.nudges.contains { $0.id == nudge.id })
    }

    // MARK: Agenda

    @Test("Agenda: interviews, reminders, follow-ups by day; overdue items on today; Past newest first")
    func agenda() throws {
        let (model, _) = try makeModel()
        let upcoming = model.agenda(.upcoming)
        let today = calendar.startOfDay(for: now)
        #expect(upcoming.first?.day == today)
        #expect(upcoming.map(\.day) == upcoming.map(\.day).sorted())
        let items = upcoming.flatMap(\.items)
        #expect(items.contains { if case .interview(let interview, _) = $0.kind { interview.id == "int-thames-2" } else { false } })
        #expect(items.contains { if case .reminder = $0.kind { $0.applicationId == "app-polder" } else { false } })
        #expect(items.contains { if case .followUp = $0.kind { $0.applicationId == "app-quill" } else { false } })
        #expect(items.allSatisfy { $0.at >= today })
        let past = model.agenda(.past)
        #expect(past.flatMap(\.items).contains { $0.id == "int-kiez-1" })
        #expect(past.map(\.day) == past.map(\.day).sorted(by: >))
        #expect(model.hasAgenda)

        let (empty, _) = try makeModel(.empty)
        #expect(empty.agenda(.upcoming).isEmpty && !empty.hasAgenda)
    }

    // MARK: Notifications

    @Test("Local reminders: future dated reminders of active applications and chosen prep, soonest first")
    func localReminders() throws {
        let (model, _) = try makeModel()
        var reminders = model.localReminders()
        #expect(reminders.allSatisfy { $0.fireAt > now && $0.kind == .reminder })
        #expect(reminders.map(\.fireAt) == reminders.map(\.fireAt).sorted())
        #expect(reminders.contains { $0.id == "reminder.app-polder" && $0.link.absoluteString == "bruteforcehr://applications/app-polder" })
        model.setPrep(.dayBefore, for: "int-brightwave-1")
        reminders = model.localReminders()
        let prep = try #require(reminders.first { $0.id == "prep.int-brightwave-1" })
        #expect(prep.kind == .interviewPrep)
        #expect(prep.fireAt == model.data.interviews.first { $0.id == "int-brightwave-1" }!.startsAt.addingTimeInterval(-86400))
        #expect(prep.link.absoluteString == "bruteforcehr://interviews/int-brightwave-1")
        // A past round never schedules.
        model.setPrep(.hourBefore, for: "int-kiez-1")
        #expect(!model.localReminders().contains { $0.id == "prep.int-kiez-1" })
    }

    @Test("The explainer shows once, only while the system hasn't asked; allowing schedules")
    func explainer() async throws {
        let (model, _) = try makeModel()
        #expect(!model.takeNotificationExplainer()) // no scheduler: design mode / tests
        let scheduler = FakeScheduler()
        model.reminderScheduler = scheduler
        var saved: TrackerDevicePreferences?
        model.onPreferencesChange = { saved = $0 }
        #expect(model.takeNotificationExplainer())
        #expect(saved?.hasShownNotificationExplainer == true)
        #expect(!model.takeNotificationExplainer())
        await model.requestNotifications()
        #expect(model.notificationAuthorization == .allowed)
        try await Task.sleep(for: .milliseconds(50))
        #expect(scheduler.replaced.last?.isEmpty == false)

        let fresh = TrackerBoardModel(now: now, calendar: calendar)
        fresh.restore(TrackerDevicePreferences(interviewPrep: ["x": .hourBefore], hasShownNotificationExplainer: true))
        #expect(fresh.interviewPrep["x"] == .hourBefore && fresh.hasShownNotificationExplainer)
    }

    // MARK: Links, .ics

    @Test("Links: applications, interviews, Log an application, calendar, insights")
    func routes() throws {
        let (model, _) = try makeModel()
        #expect(model.route(for: URL(string: "bruteforcehr://applications/app-quill")!) == .application("app-quill", interviewId: nil))
        #expect(model.route(for: URL(string: "bruteforcehr://interviews/int-thames-2")!) == .application("app-thames", interviewId: "int-thames-2"))
        #expect(model.route(for: URL(string: "bruteforcehr://tracker/new")!) == .add)
        #expect(model.route(for: URL(string: "bruteforcehr://tracker?view=calendar")!) == .calendar)
        #expect(model.route(for: URL(string: "bruteforcehr://insights?range=4w")!) == .insights(range: "4w"))
        #expect(model.route(for: URL(string: "bruteforcehr://jobs")!) == nil)
        #expect(model.route(for: URL(string: "https://example.com")!) == nil)
    }

    @Test(".ics: one UTC event with escaped text, folded lines and the meeting link")
    func ics() throws {
        let (model, _) = try makeModel()
        var interview = try #require(model.data.interviews.first { $0.id == "int-thames-2" })
        interview.prepNotes = "Bring: laptop; charger, notes"
        let file = model.calendarFile(for: interview)
        let text = file.contents
        #expect(text.hasPrefix("BEGIN:VCALENDAR\r\n") && text.hasSuffix("END:VCALENDAR\r\n"))
        #expect(text.contains("UID:int-thames-2@bruteforcehr.web.app"))
        #expect(text.contains("DTSTART:20261027T110000Z"))
        #expect(text.contains("laptop\\; charger\\, notes") || text.replacingOccurrences(of: "\r\n ", with: "").contains("laptop\\; charger\\, notes"))
        #expect(text.components(separatedBy: "\r\n").allSatisfy { $0.utf8.count <= 75 })
        #expect(file.fileName.hasSuffix(".ics"))
    }

    @Test(".ics: a lone CR, LF or CRLF in text can't start a property of its own")
    func icsLineBreaks() throws {
        #expect(InterviewCalendarFile.escape("a\rATTENDEE:x") == "a\\nATTENDEE:x")
        #expect(InterviewCalendarFile.escape("a\nb\r\nc") == "a\\nb\\nc")
        let (model, _) = try makeModel()
        var interview = try #require(model.data.interviews.first { $0.id == "int-thames-2" })
        interview.location = "Room 4\rBEGIN:VALARM"
        let lines = model.calendarFile(for: interview).contents.components(separatedBy: "\r\n")
        #expect(!lines.contains { $0.hasPrefix("BEGIN:VALARM") })
        #expect(!lines.contains { $0.contains("\r") })
    }

    // MARK: Insights filter

    @Test("An Insights drill-down shows only its applications across every stage until cleared")
    func insightsFilter() throws {
        let (model, _) = try makeModel()
        model.showsInsights = true
        model.applyFilter(ids: ["app-quill", "app-mosaic"], label: "Applied")
        #expect(!model.showsInsights)
        #expect(Set(model.sections.flatMap(\.rows).map(\.id)) == ["app-quill", "app-mosaic"])
        model.clearFilter()
        #expect(model.sections.flatMap(\.rows).count > 2)
    }

    // MARK: Diff

    @Test("UserDataChanges: creates, field updates, deletes; events only as creates")
    func diff() {
        var before = UserData(document)
        var after = before
        after.applications[0].notes = "changed"
        after.applications.removeLast()
        after.interviews.append(.draft(for: "app-quill", round: 1, now: now, calendar: calendar))
        after.applicationEvents.removeFirst()
        let changes = UserDataChanges(from: before, to: after)
        #expect(changes.applications.count == 2)
        #expect(changes.interviews.count == 1)
        #expect(changes.applicationEvents.isEmpty)
        #expect(changes.touchedIDs.contains(after.applications[0].id))
        before = after
        #expect(UserDataChanges(from: before, to: after).isEmpty)
    }
}

/// Records each committed batch.
final class RecordingWriter: UserDataWriter {
    private(set) var batches: [UserDataChanges] = []

    func commit(_ changes: UserDataChanges) async throws {
        batches.append(changes)
    }

    /// The first batch not yet returned, after the model's write task has run.
    private var returned = 0
    func next() async throws -> UserDataChanges {
        for _ in 0..<50 where batches.count <= returned {
            try await Task.sleep(for: .milliseconds(10))
        }
        let batch = try #require(batches.indices.contains(returned) ? batches[returned] : nil)
        returned += 1
        return batch
    }
}

final class FakeScheduler: ReminderScheduler {
    private(set) var replaced: [[LocalReminder]] = []
    func authorization() async -> ReminderAuthorization { .notDetermined }
    func requestAuthorization() async -> Bool { true }
    func replaceAll(with reminders: [LocalReminder]) async { replaced.append(reminders) }
}
