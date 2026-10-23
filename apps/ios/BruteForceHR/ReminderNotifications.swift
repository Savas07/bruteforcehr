import BFHRUI
import Foundation
import Observation
import UserNotifications

/// Local notifications for the Tracker's reminders and interview prep (decisions.md D33):
/// `UNUserNotificationCenter` calendar triggers, one request per reminder (`LocalReminder.id`),
/// replaced as a whole whenever the data changes. Only this app's requests are touched (prefix
/// `bfhr.`). Tapping a notification opens its `bruteforcehr://` link.
final class NotificationReminderScheduler: ReminderScheduler {
    private let center = UNUserNotificationCenter.current()
    private static let prefix = "bfhr."

    func authorization() async -> ReminderAuthorization {
        switch await center.notificationSettings().authorizationStatus {
        case .notDetermined: .notDetermined
        case .denied: .denied
        default: .allowed
        }
    }

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func replaceAll(with reminders: [LocalReminder]) async {
        let ours = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        let wanted = Set(reminders.map { Self.prefix + $0.id })
        center.removePendingNotificationRequests(withIdentifiers: ours.filter { !wanted.contains($0) })
        for reminder in reminders {
            let content = UNMutableNotificationContent()
            content.title = reminder.title
            content.body = reminder.body
            content.sound = .default
            content.threadIdentifier = reminder.kind == .interviewPrep ? "interviews" : "reminders"
            content.userInfo = [NotificationRouter.linkKey: reminder.link.absoluteString]
            let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: reminder.fireAt)
            let request = UNNotificationRequest(
                identifier: Self.prefix + reminder.id,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            )
            try? await center.add(request)
        }
    }

    /// Signing out removes this account's reminders from the device.
    static func removeAll() {
        let center = UNUserNotificationCenter.current()
        Task {
            let ours = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(prefix) }
            center.removePendingNotificationRequests(withIdentifiers: ours)
        }
    }
}

/// Receives notification taps (the delegate is set at launch, before the app finishes launching,
/// so a tap that launched the app is delivered) and hands the link to `RootView`.
@Observable
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationRouter()
    nonisolated static let linkKey = "link"
    /// The link of the last tapped notification; `RootView` opens and clears it.
    var pendingLink: URL?

    func install() {
        UNUserNotificationCenter.current().delegate = self
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let link = (response.notification.request.content.userInfo[Self.linkKey] as? String).flatMap(URL.init(string:))
        await MainActor.run { self.pendingLink = link }
    }

    /// Shown as a banner while the app is open, too.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}
