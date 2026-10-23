import BFHRCore
import Foundation

// Local notifications for the Tracker (M3): a reminder set on an application ("Follow up with
// Acme", Fri 09:00) and interview prep before a round. Both are the user's own choices; nothing
// is scheduled because of a suggestion (automation never runs on clients). The permission is
// asked the first time the user sets one, after an in-app explainer (decisions.md D36).

/// When to remind before an interview round. Chosen per round, on this device.
public enum InterviewPrepLead: String, CaseIterable, Identifiable, Codable, Hashable, Sendable {
    case hourBefore
    case dayBefore

    public var id: Self { self }

    public var interval: TimeInterval {
        switch self {
        case .hourBefore: 3600
        case .dayBefore: 24 * 3600
        }
    }

    public var label: LocalizedStringResource {
        switch self {
        case .hourBefore: .bfhr("tracker.prep.hourBefore", default: "1 hour before", table: "TrackerBoard", comment: "Interview prep reminder option.")
        case .dayBefore: .bfhr("tracker.prep.dayBefore", default: "1 day before", table: "TrackerBoard", comment: "Interview prep reminder option.")
        }
    }
}

/// The system's notification permission for this app.
public enum ReminderAuthorization: Hashable, Sendable {
    case notDetermined
    case allowed
    case denied
}

/// A notification to deliver at `fireAt`. Ids are stable per source, so rescheduling replaces.
public struct LocalReminder: Identifiable, Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case reminder
        case interviewPrep
    }

    /// `reminder.<applicationId>` / `prep.<interviewId>`.
    public var id: String
    public var kind: Kind
    public var title: String
    public var body: String
    public var fireAt: Date
    /// The deep link the notification opens (IA.md "Deep links").
    public var link: URL
}

/// Schedules local notifications (`UNUserNotificationCenter` in the app).
public protocol ReminderScheduler: AnyObject {
    func authorization() async -> ReminderAuthorization
    /// Shows the system prompt; true when allowed.
    func requestAuthorization() async -> Bool
    /// Replaces every pending reminder of this app with `reminders`.
    func replaceAll(with reminders: [LocalReminder]) async
}

/// Tracker settings kept on this device.
public struct TrackerDevicePreferences: Codable, Hashable, Sendable {
    public var interviewPrep: [String: InterviewPrepLead]
    public var hasShownNotificationExplainer: Bool

    public init(interviewPrep: [String: InterviewPrepLead] = [:], hasShownNotificationExplainer: Bool = false) {
        self.interviewPrep = interviewPrep
        self.hasShownNotificationExplainer = hasShownNotificationExplainer
    }
}

extension TrackerBoardModel {
    /// iOS keeps at most 64 pending notifications per app; the soonest win.
    public static let reminderLimit = 64

    /// Applies preferences read from the device (before the first load).
    public func restore(_ preferences: TrackerDevicePreferences) {
        hasShownNotificationExplainer = preferences.hasShownNotificationExplainer
        interviewPrep = preferences.interviewPrep
    }

    public var devicePreferences: TrackerDevicePreferences {
        TrackerDevicePreferences(interviewPrep: interviewPrep, hasShownNotificationExplainer: hasShownNotificationExplainer)
    }

    /// Notifications to schedule now: dated reminders on active applications and prep reminders
    /// of upcoming rounds, in the future only, soonest first.
    public func localReminders() -> [LocalReminder] {
        var reminders: [LocalReminder] = []
        let format = Date.FormatStyle(date: .abbreviated, time: .shortened, calendar: calendar, timeZone: calendar.timeZone)
        for application in data.applications where application.status.isActive {
            guard let text = application.nextAction, !text.isEmpty, let due = application.nextActionAt, due > now,
                  let link = URL(string: "bruteforcehr://applications/\(application.id)") else { continue }
            reminders.append(LocalReminder(
                id: "reminder.\(application.id)",
                kind: .reminder,
                title: text,
                body: "\(application.company) · \(application.role)",
                fireAt: due,
                link: link
            ))
        }
        for interview in data.interviews {
            guard let lead = interviewPrep[interview.id], let application = data.application(id: interview.applicationId),
                  let link = URL(string: "bruteforcehr://interviews/\(interview.id)") else { continue }
            let fireAt = interview.startsAt.addingTimeInterval(-lead.interval)
            guard fireAt > now else { continue }
            let title = interview.title.isEmpty ? application.role : interview.title
            reminders.append(LocalReminder(
                id: "prep.\(interview.id)",
                kind: .interviewPrep,
                title: String(localized: TrackerBoardStrings.prepNotificationTitle(application.company)),
                body: "\(title) · \(interview.startsAt.formatted(format))",
                fireAt: fireAt,
                link: link
            ))
        }
        return Array(reminders.sorted { $0.fireAt < $1.fireAt }.prefix(Self.reminderLimit))
    }

    /// Hands the current reminders to the scheduler when notifications are allowed.
    func scheduleReminders() {
        guard let reminderScheduler, notificationAuthorization == .allowed, phase == .loaded else { return }
        let reminders = localReminders()
        Task { await reminderScheduler.replaceAll(with: reminders) }
    }

    /// Re-reads the system permission (at launch and when the app returns to the foreground: the
    /// user may have changed it in Settings) and reschedules.
    public func refreshNotificationAuthorization() async {
        guard let reminderScheduler else { return }
        notificationAuthorization = await reminderScheduler.authorization()
        scheduleReminders()
    }

    /// The explainer shows the first time the user sets a reminder while the system hasn't asked
    /// yet. Calling this marks it shown.
    public func takeNotificationExplainer() -> Bool {
        guard reminderScheduler != nil, notificationAuthorization == .notDetermined, !hasShownNotificationExplainer else { return false }
        hasShownNotificationExplainer = true
        onPreferencesChange?(devicePreferences)
        return true
    }

    /// "Turn on notifications" in the explainer: the system prompt, then scheduling.
    public func requestNotifications() async {
        guard let reminderScheduler else { return }
        notificationAuthorization = await reminderScheduler.requestAuthorization() ? .allowed : .denied
        scheduleReminders()
    }

    /// Sets or clears (`nil`) the prep reminder of one interview round on this device.
    public func setPrep(_ lead: InterviewPrepLead?, for interviewId: String) {
        interviewPrep[interviewId] = lead
        onPreferencesChange?(devicePreferences)
    }
}
