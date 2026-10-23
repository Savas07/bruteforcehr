#if DEBUG
import BFHRUI
import SwiftUI

// Design mode (Debug builds only, docs/design/foundation-ios.md): launched with
// `-BFHRDesign populated|empty`, `-BFHRState loading|error|offline` and/or
// `-BFHRScreen <screen>`, every tab shows its fixture-backed core screen in that state.
// Release builds compile none of this file and bundle no fixtures.

extension AppTab {
    /// The tab that hosts a core screen.
    init(designScreen: DesignScreen) {
        switch designScreen {
        case .today: self = .today
        case .jobDetail: self = .jobs
        case .cvEditor: self = .cvs
        case .trackerBoard, .insights: self = .tracker
        case .mailReview: self = .mail
        }
    }

    /// The core screen a tab hosts in design mode.
    var designScreen: DesignScreen {
        switch self {
        case .today: .today
        case .jobs: .jobDetail
        case .tracker: .trackerBoard
        case .cvs: .cvEditor
        case .mail: .mailReview
        }
    }
}

/// A tab in design mode. Job detail is a push from Jobs, so it opens pushed over the Jobs root,
/// with the real back button; the other screens are tab roots with a large title.
struct DesignTabRoot: View {
    let tab: AppTab
    let scenario: DesignScenario
    @State private var path: [DesignScreen]

    init(tab: AppTab, scenario: DesignScenario) {
        self.tab = tab
        self.scenario = scenario
        _path = State(initialValue: tab.designScreen == .jobDetail ? [.jobDetail] : [])
    }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if tab.designScreen == .jobDetail {
                    ScrollView {}
                } else {
                    DesignScreenView(tab.designScreen, scenario: scenario)
                }
            }
            .navigationTitle(tab.title)
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: DesignScreen.self) { screen in
                DesignScreenView(screen, scenario: scenario)
            }
        }
    }
}
#endif
