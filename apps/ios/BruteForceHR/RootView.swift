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
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if showsApp {
                tabs
            } else {
                SignInScreen(model: signIn)
            }
        }
        .tint(BFHRColor.tint)
        .environment(toasts)
        // Universal links (the emailed sign-in link) and `bruteforcehr://` links from outside.
        .onOpenURL(perform: open)
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { open(url) }
        }
        .bfhrUpdateGate(updateGate)
        // At launch and on every return to the foreground (PRD M1-UPD-2).
        .onChange(of: scenePhase, initial: true) { _, phase in
            guard phase == .active, RootView.readsAppConfig else { return }
            Task { await updateGate.check(AppConfigReader.iosVersions) }
        }
        .onAppear {
            guard authListener == nil, RootView.usesFirebaseAuth else { return }
            authListener = FirebaseEmailLinkService.observe(signIn)
        }
    }

    private var tabs: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                Tab(tab.title, systemImage: tab.systemImage, value: tab) {
                    TabRootView(tab: tab)
                        .onPreferenceChange(BFHRTabBadgeKey.self) { badges[tab] = $0 }
                        .bfhrUpdateBanner(updateGate)
                }
                .badge(badges[tab] ?? 0)
            }
        }
        .environment(\.bfhrAccount, signIn.signedInEmail.map { email in
            AccountContext(email: email) { try signIn.signOut() }
        })
        // `bruteforcehr://` links opened inside the app (`@Environment(\.openURL)`) navigate here
        // directly instead of a round trip through the system; other URLs go to the system.
        .environment(\.openURL, OpenURLAction { url in
            guard let tab = AppTab(deepLink: url) else { return .systemAction }
            selection = tab
            return .handled
        })
    }

    /// Sign-in links go to the sign-in flow; other `bruteforcehr://` links select their tab.
    private func open(_ url: URL) {
        if SignInModel.handles(url) {
            Task { await signIn.open(url) }
        } else if let tab = AppTab(deepLink: url) {
            selection = tab
        }
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
        return DesignSignInState.launch == nil
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

/// Root screen of one tab. The CVs tab shows live data (M2); the other tabs' screens land with
/// their milestones (docs/STATUS.md). Debug builds launched with design arguments show the
/// fixture-backed screens instead (DesignMode.swift).
struct TabRootView: View {
    let tab: AppTab
    @Environment(\.bfhrAccount) private var account

    var body: some View {
        #if DEBUG
        if let scenario = DesignScenario.launch {
            DesignTabRoot(tab: tab, scenario: scenario)
        } else {
            live
        }
        #else
        live
        #endif
    }

    @ViewBuilder
    private var live: some View {
        if tab == .cvs, let uid = Auth.auth().currentUser?.uid {
            CVsTabRoot(uid: uid).id(uid)
        } else {
            shell
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
