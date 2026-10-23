import BFHRUI
import SwiftUI

/// Today and the Tracker on live data (M3): one Firestore store feeds both screen models, so a
/// change made in one shows in the other at once. One instance per signed-in user, kept by
/// `RootView` for the session.
@MainActor
final class LiveUserData {
    let today: TodayModel
    let tracker: TrackerBoardModel
    private(set) var store: FirestoreUserDataStore
    let uid: String
    private let scheduler = NotificationReminderScheduler()

    init(uid: String) {
        self.uid = uid
        today = TodayModel(now: .now)
        today.usesSystemClock = true
        // Email (M5) and job matching (M4) aren't on yet: Today says so instead of offering them.
        today.mailAvailable = false
        today.matchesAvailable = false
        tracker = TrackerBoardModel(now: .now)
        tracker.usesSystemClock = true
        tracker.reminderScheduler = scheduler
        tracker.restore(Self.preferences(uid))
        tracker.onPreferencesChange = { [uid] preferences in Self.save(preferences, uid: uid) }
        store = FirestoreUserDataStore(uid: uid)
        connect()
        // Relative times ("Tomorrow, 09:00", "Overdue") and suggestions follow the clock; the
        // loop ends with the session (weak self).
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard let self else { return }
                today.now = .now
                tracker.now = .now
            }
        }
    }

    /// Try again after a failed first load: new listeners.
    func reload() {
        store = FirestoreUserDataStore(uid: uid)
        connect()
    }

    /// At launch and on every return to the foreground: the permission may have changed in
    /// Settings.
    func refreshNotifications() async {
        await tracker.refreshNotificationAuthorization()
    }

    private func connect() {
        today.writer = store
        tracker.writer = store
        store.start([today, tracker])
    }

    // MARK: Device preferences

    private static func key(_ uid: String) -> String { "tracker.devicePreferences.\(uid)" }

    private static func preferences(_ uid: String) -> TrackerDevicePreferences {
        guard let data = UserDefaults.standard.data(forKey: key(uid)),
              let preferences = try? JSONDecoder().decode(TrackerDevicePreferences.self, from: data) else { return TrackerDevicePreferences() }
        return preferences
    }

    private static func save(_ preferences: TrackerDevicePreferences, uid: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(preferences), forKey: key(uid))
    }
}

/// The Today tab with live data.
struct TodayTabRoot: View {
    let live: LiveUserData
    @Environment(\.bfhrAccount) private var account

    var body: some View {
        NavigationStack {
            TodayScreen(model: live.today, showsSettingsButton: false)
                .navigationTitle(AppTab.today.title)
                .navigationBarTitleDisplayMode(.large)
                .accessibilityIdentifier("screen.today")
                .toolbar { accountMenu }
        }
        .environment(\.bfhrReload) { live.reload() }
    }

    @ToolbarContentBuilder private var accountMenu: some ToolbarContent {
        if let account {
            ToolbarItem(placement: .topBarTrailing) {
                AccountMenu(account) {
                    AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "")
                }
            }
        }
    }
}

/// The Tracker tab with live data: Pipeline and Calendar (the title menu), Log an application,
/// the Application detail.
struct TrackerTabRoot: View {
    let live: LiveUserData
    @Environment(\.bfhrAccount) private var account

    var body: some View {
        NavigationStack {
            TrackerBoardScreen(model: live.tracker)
                .navigationBarTitleDisplayMode(.large)
                .accessibilityIdentifier("screen.tracker")
                .toolbar {
                    if let account {
                        ToolbarItem(placement: .topBarTrailing) {
                            AccountMenu(account) {
                                AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "")
                            }
                        }
                    }
                }
        }
        .environment(\.bfhrReload) { live.reload() }
    }
}
