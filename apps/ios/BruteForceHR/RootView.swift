import BFHRDesignTokens
import BFHRUI
import SwiftUI

/// Native tabs, each owning a navigation stack with a large title (IA.md, "iOS › Structure").
struct RootView: View {
    @State private var selection: AppTab = RootView.initialTab
    /// One toast at a time for the whole app (decisions.md D12).
    @State private var toasts = ToastCenter()
    /// Badge counts reported by each tab's screen (`bfhrTabBadge`); only Mail uses one.
    @State private var badges: [AppTab: Int] = [:]
    /// `appConfig/ios` against this build: the update banner and the blocking update screen.
    @State private var updateGate = RootView.makeUpdateGate()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
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
        .tint(BFHRColor.tint)
        .environment(toasts)
        // `bruteforcehr://` links opened inside the app (`@Environment(\.openURL)`) navigate here
        // directly instead of a round trip through the system; other URLs go to the system.
        .environment(\.openURL, OpenURLAction { url in
            guard let tab = AppTab(deepLink: url) else { return .systemAction }
            selection = tab
            return .handled
        })
        .onOpenURL { url in
            if let tab = AppTab(deepLink: url) { selection = tab }
        }
        .bfhrUpdateGate(updateGate)
        // At launch and on every return to the foreground (PRD M1-UPD-2).
        .onChange(of: scenePhase, initial: true) { _, phase in
            guard phase == .active, RootView.readsAppConfig else { return }
            Task { await updateGate.check(AppConfigReader.iosVersions) }
        }
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
        return DesignScenario.launch == nil && DesignUpdateState.launch == nil
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

/// Root screen of one tab. Screen content lands with each screen's design (docs/STATUS.md); Debug
/// builds launched with design arguments show the fixture-backed screens instead (DesignMode.swift).
struct TabRootView: View {
    let tab: AppTab

    var body: some View {
        #if DEBUG
        if let scenario = DesignScenario.launch {
            DesignTabRoot(tab: tab, scenario: scenario)
        } else {
            shell
        }
        #else
        shell
        #endif
    }

    private var shell: some View {
        NavigationStack {
            ScrollView {}
                .navigationTitle(tab.title)
                .navigationBarTitleDisplayMode(.large)
                .accessibilityIdentifier("screen.\(tab.rawValue)")
        }
    }
}

#Preview {
    RootView()
}
