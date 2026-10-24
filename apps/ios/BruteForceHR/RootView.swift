import BFHRDesignTokens
import BFHRUI
import FirebaseAuth
import SwiftUI

/// Signed out: the sign-in takeover (IA.md). Signed in: native tabs, each owning a navigation
/// stack with a large title (IA.md, "iOS › Structure").
struct RootView: View {
    @State private var selection: AppTab = RootView.initialTab
    /// One toast at a time for the whole app (decisions.md D12).
    @State private var toasts = ToastCenter()
    /// Badge counts reported by each tab's screen (`bfhrTabBadge`); only Mail uses one.
    @State private var badges: [AppTab: Int] = [:]
    /// `appConfig/ios` against this build: the update banner and the blocking update screen.
    @State private var updateGate = RootView.makeUpdateGate()
    /// Email-link sign-in and the session (ADR 0003).
    @State private var signIn = RootView.makeSignIn()
    @State private var authListener: AuthStateDidChangeListenerHandle?
    /// Today and the Tracker on Firestore for the signed-in user (M3), shared by both tabs.
    @State private var live: LiveUserData?
    /// Settings › Data & privacy for the signed-in user (M5): kept for the session so an export
    /// and a pending re-authentication survive leaving the page; the Settings shell shows it with
    /// `DataPrivacyView(model:)`.
    @State private var dataPrivacy: DataPrivacyModel?
    @State private var notifications = NotificationRouter.shared
    /// The Settings sheet (avatar menu, `bruteforcehr://settings/…`) and its pages.
    @State private var showsSettings = false
    @State private var settingsPath: [SettingsRoute] = []
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            #if DEBUG
            // `-BFHRPerf`: the first body of the root view (DesignMode.swift).
            let _ = LaunchTimeline.mark("root")
            if let state = DesignDataPrivacyState.launch {
                DesignDataPrivacyScreen(state, languageCode: FirebaseEmailLinkService.languageCode)
            } else {
                content
            }
            #else
            content
            #endif
        }
        .tint(BFHRColor.tint)
        .preferredColorScheme(appearance.colorScheme)
        .environment(toasts)
        // Universal links (the emailed sign-in link) and `bruteforcehr://` links from outside.
        .onOpenURL(perform: open)
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { open(url) }
        }
        .bfhrUpdateGate(updateGate)
        // At launch and on every return to the foreground (PRD M1-UPD-2).
        .onChange(of: scenePhase, initial: true) { _, phase in
            // Held email decisions go out before the app may be suspended.
            if phase == .background { live?.store.flushHeldReviews() }
            guard phase == .active else { return }
            if RootView.readsAppConfig {
                Task { await updateGate.check(AppConfigReader.iosVersions) }
            }
            if let live {
                Task { await live.refreshNotifications() }
            }
        }
        .onAppear {
            guard authListener == nil, RootView.usesFirebaseAuth else { return }
            authListener = FirebaseEmailLinkService.observe(signIn)
        }
        // The live data follows the session: created at sign-in, dropped (with this device's
        // reminders) at sign-out.
        .onChange(of: signIn.isSignedIn, initial: true) { _, _ in syncSession() }
        // A tapped reminder notification opens its application.
        .onChange(of: notifications.pendingLink, initial: true) { _, link in
            guard let link else { return }
            notifications.pendingLink = nil
            open(link)
        }
    }

    @ViewBuilder private var content: some View {
        if showsApp {
            tabs
        } else {
            SignInScreen(model: signIn)
        }
    }

    private var tabs: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                Tab(tab.title, systemImage: tab.systemImage, value: tab) {
                    TabRootView(tab: tab, live: live)
                        .onPreferenceChange(BFHRTabBadgeKey.self) { badges[tab] = $0 }
                        .bfhrUpdateBanner(updateGate)
                }
                .badge(badges[tab] ?? 0)
            }
        }
        .sheet(isPresented: $showsSettings) { settingsSheet }
        .environment(\.bfhrAccount, signIn.signedInEmail.map { email in
            AccountContext(email: email) { try signIn.signOut() }
        })
        .environment(\.bfhrMailConnect, mailConnect)
        // `bruteforcehr://` links opened inside the app (`@Environment(\.openURL)`) navigate here
        // directly instead of a round trip through the system; other URLs go to the system.
        .environment(\.openURL, OpenURLAction { url in
            guard AppTab(deepLink: url) != nil else { return .systemAction }
            navigate(to: url)
            return .handled
        })
    }

    /// Settings over the current tab (IA.md "Avatar"), with Data & privacy from the account-data
    /// session model.
    @ViewBuilder private var settingsSheet: some View {
        if let live {
            SettingsScreen(model: live.settings, path: $settingsPath) {
                if let dataPrivacy { DataPrivacyView(model: dataPrivacy) }
            }
            .environment(toasts)
            .environment(\.bfhrMailConnect, mailConnect)
            .environment(\.bfhrReload) { live.reload() }
            .environment(\.bfhrAccount, signIn.signedInEmail.map { email in
                AccountContext(email: email) { try signIn.signOut() }
            })
            .task { await live.refreshNotifications() }
        } else {
            #if DEBUG
            DesignSettingsSheet(path: $settingsPath)
            #endif
        }
    }

    /// Connect email on the live callables, or on the design fakes in design mode.
    private var mailConnect: MailConnectLauncher? {
        #if DEBUG
        if DesignScenario.launch != nil { return DesignMailConnect.launcher }
        #endif
        return live?.mailConnect
    }

    /// Sign-in links go to the sign-in flow, or, while signed in, to a waiting re-authentication
    /// (Delete account); other `bruteforcehr://` links select their tab.
    private func open(_ url: URL) {
        if SignInModel.handles(url) {
            if signIn.isSignedIn, let dataPrivacy, dataPrivacy.acceptsReauthLink {
                Task { await dataPrivacy.openReauthLink(url) }
            } else {
                Task { await signIn.open(url) }
            }
        } else if AppTab(deepLink: url) != nil {
            navigate(to: url)
        }
    }

    /// `bruteforcehr://settings/…`: the Settings sheet at that page.
    private func openSettings(_ url: URL) -> Bool {
        guard let path = SettingsRoute.path(for: url) else { return false }
        settingsPath = path
        showsSettings = true
        return true
    }

    /// Selects the link's tab; Tracker links (applications, interviews, Log an application, the
    /// calendar) and Jobs links (a job, Saved, a saved search, Hidden jobs, Apply) also open
    /// their destination.
    private func navigate(to url: URL) {
        if openSettings(url) { return }
        // The OAuth return link ends the browser session; on its own it leads nowhere.
        if url.host()?.lowercased() == "connected" { return }
        guard let tab = AppTab(deepLink: url) else { return }
        showsSettings = false
        selection = tab
        if tab == .mail, let live { MailTabRoot.open(url, model: live.mail) }
        if tab == .tracker, let live, let route = live.tracker.route(for: url) {
            live.tracker.route = route
        }
        if tab == .jobs, let live {
            live.jobsNavigation.open(url, feed: live.jobs)
        }
    }

    private func syncSession() {
        #if DEBUG
        if DesignScenario.launch != nil || DesignUpdateState.launch != nil || DesignSignInState.launch != nil
            || DesignDataPrivacyState.launch != nil { return }
        #endif
        let user = signIn.isSignedIn ? Auth.auth().currentUser : nil
        guard let user else {
            if live != nil {
                NotificationReminderScheduler.removeAll()
                PushRegistrar.shared.signedOut()
            }
            live = nil
            dataPrivacy = nil
            return
        }
        if dataPrivacy == nil, let email = user.email {
            dataPrivacy = FirebaseAccountDataService.makeModel(signIn: signIn, email: email)
        }
        guard live?.uid != user.uid else { return }
        let session = LiveUserData(uid: user.uid)
        live = session
        PushRegistrar.shared.signedIn(uid: user.uid)
        Task { await session.refreshNotifications() }
    }

    /// Release: the tabs only with a session. Debug design mode shows the fixture screens without
    /// one, and `-BFHRSignIn` shows a sign-in state.
    private var showsApp: Bool {
        #if DEBUG
        if DesignSignInState.launch != nil { return false }
        if DesignScenario.launch != nil || DesignUpdateState.launch != nil { return true }
        #endif
        return signIn.isSignedIn
    }

    private static func makeSignIn() -> SignInModel {
        #if DEBUG
        if let state = DesignSignInState.launch { return state.model() }
        #endif
        return FirebaseEmailLinkService.makeModel()
    }

    /// Design states never talk to Firebase Auth.
    private static var usesFirebaseAuth: Bool {
        #if DEBUG
        return DesignSignInState.launch == nil && DesignDataPrivacyState.launch == nil
        #else
        return true
        #endif
    }

    private static func makeUpdateGate() -> UpdateGateModel {
        #if DEBUG
        if let state = DesignUpdateState.launch { return state.model() }
        #endif
        return UpdateGateModel(installedVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String)
    }

    /// Design mode shows fixed states and never reads Firestore, so captures and audits don't
    /// depend on the live config.
    private static var readsAppConfig: Bool {
        #if DEBUG
        return DesignScenario.launch == nil && DesignUpdateState.launch == nil && DesignSignInState.launch == nil
            && DesignDataPrivacyState.launch == nil
        #else
        return true
        #endif
    }

    private static var initialTab: AppTab {
        #if DEBUG
        if let screen = DesignScenario.launch?.screen { return AppTab(designScreen: screen) }
        #endif
        return .today
    }
}

/// Root screen of one tab, on live data: Today, Tracker (M3), CVs (M2), Jobs (M4), Mail (M5). Debug
/// builds launched with design arguments show the fixture-backed screens instead (DesignMode.swift).
struct TabRootView: View {
    let tab: AppTab
    let live: LiveUserData?
    @Environment(\.bfhrAccount) private var account

    var body: some View {
        #if DEBUG
        if let scenario = DesignScenario.launch {
            DesignTabRoot(tab: tab, scenario: scenario)
        } else {
            content
        }
        #else
        content
        #endif
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .cvs:
            if let uid = Auth.auth().currentUser?.uid {
                CVsTabRoot(uid: uid).id(uid)
            } else {
                shell
            }
        case .today:
            if let live { TodayTabRoot(live: live) } else { shell }
        case .tracker:
            if let live { TrackerTabRoot(live: live) } else { shell }
        case .jobs:
            if let live { JobsTabRoot(live: live) } else { shell }
        case .mail:
            if let live { MailTabRoot(live: live) } else { shell }
        }
    }

    private var shell: some View {
        NavigationStack {
            ScrollView {}
                .navigationTitle(tab.title)
                .navigationBarTitleDisplayMode(.large)
                .accessibilityIdentifier("screen.\(tab.rawValue)")
                .toolbar {
                    // The avatar on every tab root (IA.md): the account menu.
                    if let account {
                        ToolbarItem(placement: .topBarTrailing) {
                            AccountMenu(account) {
                                AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "")
                            }
                        }
                    }
                }
        }
    }
}

#Preview {
    RootView()
}
