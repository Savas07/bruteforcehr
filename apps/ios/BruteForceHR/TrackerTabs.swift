import BFHRCore
import BFHRUI
import SwiftUI

/// Today, the Tracker, Insights and Jobs on live data (M3, M4): one Firestore store feeds every
/// screen model, so a change made in one shows in the others at once. One instance per signed-in
/// user, kept by `RootView` for the session.
@MainActor
final class LiveUserData {
    let today: TodayModel
    let tracker: TrackerBoardModel
    let insights: InsightsModel
    let jobs: JobsFeedModel
    /// The Jobs stack and its Apply sheet, so links (`bruteforcehr://jobs/…`) can drive them.
    let jobsNavigation = JobsNavigation()
    private(set) var store: FirestoreUserDataStore
    let uid: String
    private let scheduler = NotificationReminderScheduler()
    private let jobSearch = CloudJobSearch()
    /// `jobImportUrl` behind "Add a job from a link".
    let linkImporter = CloudJobLinkImporter()
    private let applyServices: CloudApplyServices
    private let applyRenderer: DeviceApplyRenderer?
    private var details: [String: JobDetailModel] = [:]

    init(uid: String) {
        self.uid = uid
        today = TodayModel(now: .now)
        today.usesSystemClock = true
        // Mail (M5) isn't on yet: Today says so instead of offering it. Job matching is (M4).
        today.mailAvailable = false
        today.matchesAvailable = true
        tracker = TrackerBoardModel(now: .now)
        tracker.usesSystemClock = true
        tracker.reminderScheduler = scheduler
        tracker.restore(Self.preferences(uid))
        tracker.onPreferencesChange = { [uid] preferences in Self.save(preferences, uid: uid) }
        insights = InsightsModel(now: .now)
        if let range = UserDefaults.standard.string(forKey: Self.insightsRangeKey).flatMap(InsightsRangePreset.init(rawValue:)),
           InsightsRangePreset.ios.contains(range) {
            insights.range = range
        }
        insights.onRangeChange = { range in UserDefaults.standard.set(range.rawValue, forKey: Self.insightsRangeKey) }
        today.insightsAvailable = true
        jobs = JobsFeedModel(now: .now)
        applyServices = CloudApplyServices(uid: uid)
        // The app always bundles cv-render (the build phase fails otherwise).
        applyRenderer = (try? CVRenderEngine.bundled()).map(DeviceApplyRenderer.init)
        store = FirestoreUserDataStore(uid: uid)
        jobs.usesSystemClock = true
        jobs.searchService = jobSearch
        connect()
        // Relative times ("Tomorrow, 09:00", "Overdue") and suggestions follow the clock; the
        // loop ends with the session (weak self).
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard let self else { return }
                today.now = .now
                tracker.now = .now
                insights.now = .now
                jobs.now = .now
                for detail in details.values { detail.now = .now }
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
        jobs.writer = store
        store.start([today, tracker, insights, jobs])
        // Open Job details move to the new store.
        for detail in details.values {
            detail.writer = store
            store.attach(detail)
        }
    }

    /// Job detail on live data, one model per job for the session (the stack may rebuild it).
    func detailModel(_ jobId: String) -> JobDetailModel {
        if let model = details[jobId] { return model }
        let model = JobDetailModel(jobId: jobId, now: .now)
        model.usesSystemClock = true
        model.writer = store
        store.attach(model)
        details[jobId] = model
        return model
    }

    /// A fresh Apply sheet for a job: Firestore, Storage and the callables behind it.
    func applyModel(_ jobId: String) -> ApplyModel {
        let model = ApplyModel(jobId: jobId, now: .now)
        model.usesSystemClock = true
        model.writer = store
        model.services = applyServices
        model.renderer = applyRenderer
        store.attach(model)
        return model
    }

    // MARK: Device preferences

    /// Insights' range (`4w`, `12w`, `all`), per device (research/insights.md "RangePicker").
    private static let insightsRangeKey = "insights.range"

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
            TrackerBoardScreen(model: live.tracker) {
                InsightsScreen(model: live.insights) { drill in
                    // A number in Insights opens the Pipeline filtered to those applications.
                    let filter = live.insights.trackerFilter(for: drill)
                    live.tracker.applyFilter(ids: filter.ids, label: filter.label)
                    live.tracker.showsInsights = false
                }
                .onChange(of: live.tracker.insightsRange, initial: true) { _, range in
                    guard range != nil else { return }
                    live.insights.applyLinkRange(range)
                    live.tracker.insightsRange = nil
                }
            }
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
