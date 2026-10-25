import BFHRCore
import BFHRUI
import SwiftUI
import UserNotifications

/// Today, the Tracker, Insights, Jobs, Mail and Settings on live data (M3–M5): one Firestore store
/// feeds every screen model, so a change made in one shows in the others at once. One instance per
/// signed-in user, kept by `RootView` for the session.
@MainActor
final class LiveUserData {
    let today: TodayModel
    let tracker: TrackerBoardModel
    let insights: InsightsModel
    let jobs: JobsFeedModel
    let mail: MailReviewModel
    let settings: SettingsModel
    /// The mail callables behind Connect email and Settings › Mail accounts.
    let mailService = CloudMailService()
    private let oauthSession = WebAuthSession()
    /// The Jobs stack and its Apply sheet, so links (`bruteforcehr://jobs/…`) can drive them.
    let jobsNavigation = JobsNavigation()
    private(set) var store: FirestoreUserDataStore
    let uid: String
    /// First run (`onboardingCompletedAt == nil`): CV, Preferences, the first search.
    let onboarding: OnboardingGate
    private let scheduler = NotificationReminderScheduler()
    private let jobSearch = CloudJobSearch()
    /// `jobImportUrl` behind "Add a job from a link".
    let linkImporter = CloudJobLinkImporter()
    private let applyServices: CloudApplyServices
    private let applyRenderer: DeviceApplyRenderer?
    /// CV Studio's "Tailor for a job…" on the same data (the CVs tab has its own CV store).
    let tailoring: CVTailoringModel
    private var details: [String: JobDetailModel] = [:]

    init(uid: String, email: String) {
        self.uid = uid
        onboarding = OnboardingGate(uid: uid, email: email)
        today = TodayModel(now: .now)
        today.usesSystemClock = true
        today.mailAvailable = true
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
        mail = MailReviewModel(now: .now)
        mail.usesSystemClock = true
        settings = SettingsModel(now: .now)
        settings.usesSystemClock = true
        settings.mailService = mailService
        settings.requestPermission = { [weak settings] in
            await PushRegistrar.shared.requestPermission()
            settings?.permission = await Self.notificationPermission()
        }
        settings.appVersion = Self.appVersion
        applyServices = CloudApplyServices(uid: uid)
        // The app always bundles cv-render (the build phase fails otherwise).
        applyRenderer = (try? CVRenderEngine.bundled()).map(DeviceApplyRenderer.init)
        tailoring = CVTailoringModel(now: .now)
        tailoring.usesSystemClock = true
        tailoring.services = applyServices
        tailoring.renderer = applyRenderer
        store = FirestoreUserDataStore(uid: uid)
        jobs.usesSystemClock = true
        jobs.searchService = jobSearch
        // Turning a saved search's alerts on is the first moment a push makes sense (D25); the
        // system asks once, later calls just register.
        jobs.onAlertsTurnedOn = { Task { await PushRegistrar.shared.requestPermission() } }
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
                mail.now = .now
                settings.now = .now
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
        settings.permission = await Self.notificationPermission()
    }

    /// iOS's notification permission for this app, in Settings' terms.
    static func notificationPermission() async -> NotificationPermission {
        switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
        case .authorized, .ephemeral: .authorized
        case .provisional: .provisional
        case .denied: .denied
        case .notDetermined: .notDetermined
        @unknown default: .notDetermined
        }
    }

    /// "1.4 (37)".
    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return "\(version) (\(build))"
    }

    /// Connect email (or Reconnect) on the callables and the browser session; it follows the
    /// account snapshots for the scan. The first successful connect asks for push permission in
    /// context (decisions.md D25).
    var mailConnect: MailConnectLauncher {
        MailConnectLauncher { [weak self] reconnecting in
            let model = MailConnectModel(service: self?.mailService, oauthSession: self?.oauthSession, reconnecting: reconnecting)
            model.onConnected = { Task { await PushRegistrar.shared.requestPermission() } }
            if let self { self.store.attach(model) }
            return model
        }
    }

    private func connect() {
        today.writer = store
        store.onProfileSnapshot = { [onboarding] exists, fromCache, profile in
            onboarding.profileSnapshot(exists: exists, fromCache: fromCache, profile: profile)
        }
        store.onSavedSearches = { [onboarding] count in onboarding.savedSearchCount(count) }
        tracker.writer = store
        jobs.writer = store
        mail.writer = store
        settings.writer = store
        tailoring.writer = store
        store.start([today, tracker, insights, jobs, mail, settings, tailoring])
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
                    AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "", needsAttention: live.settings.mailNeedsAttention)
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
                                AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "", needsAttention: live.settings.mailNeedsAttention)
                            }
                        }
                    }
                }
        }
        .environment(\.bfhrReload) { live.reload() }
    }
}

/// The Mail tab with live data (M5): the review queue, Updates and All job mail, Connect email.
struct MailTabRoot: View {
    let live: LiveUserData
    @Environment(\.bfhrAccount) private var account

    var body: some View {
        NavigationStack {
            MailReviewScreen(model: live.mail)
                .navigationTitle(AppTab.mail.title)
                .navigationBarTitleDisplayMode(.large)
                .accessibilityIdentifier("screen.mail")
                .toolbar {
                    if let account {
                        ToolbarItem(placement: .topBarTrailing) {
                            AccountMenu(account) {
                                AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "", needsAttention: live.settings.mailNeedsAttention)
                            }
                        }
                    }
                }
        }
        .environment(\.bfhrReload) { live.reload() }
    }

    /// Mail links (IA.md "Deep links"): `mail` (To review), `mail/updates`, `mail/review/{id}`
    /// (the review sheet, or the email when it's no longer pending), `mail/backfill/{id}` (To
    /// review: the scan's proposals wait there).
    static func open(_ url: URL, model: MailReviewModel) {
        let parts = url.pathComponents.filter { $0 != "/" }
        switch parts.first {
        case "updates": model.filter = .updates
        case "review":
            if let id = parts.dropFirst().first, model.open(id) { return }
            model.filter = .toReview
        default: model.filter = .toReview
        }
    }
}
