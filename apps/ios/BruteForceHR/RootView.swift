import SwiftUI

/// Native tabs, each owning a navigation stack with a large title (IA.md, "iOS › Structure").
struct RootView: View {
    @State private var selection: AppTab = .today

    var body: some View {
        TabView(selection: $selection) {
            ForEach(AppTab.allCases) { tab in
                Tab(tab.title, systemImage: tab.systemImage, value: tab) {
                    TabRootView(tab: tab)
                }
            }
        }
        .onOpenURL { url in
            if let tab = AppTab(deepLink: url) { selection = tab }
        }
    }
}

/// Root screen of one tab. Screen content lands with each screen's design (docs/STATUS.md).
struct TabRootView: View {
    let tab: AppTab

    var body: some View {
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
