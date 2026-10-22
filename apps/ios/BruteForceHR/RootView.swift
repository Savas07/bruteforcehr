import BFHRDesignTokens
import BFHRUI
import SwiftUI

/// Native tabs, each owning a navigation stack with a large title (IA.md, "iOS › Structure").
struct RootView: View {
    @State private var selection: AppTab = RootView.initialTab
    /// One toast at a time for the whole app (decisions.md D12).
    @State private var toasts = ToastCenter()

    var body: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                Tab(tab.title, systemImage: tab.systemImage, value: tab) {
                    TabRootView(tab: tab)
                }
            }
        }
        .tint(BFHRColor.tint)
        .environment(toasts)
        .onOpenURL { url in
            if let tab = AppTab(deepLink: url) { selection = tab }
        }
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
