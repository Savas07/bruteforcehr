#if DEBUG
import BFHRUI
import SwiftUI

// Design mode (Debug builds only, docs/design/foundation-ios.md): launched with
// `-BFHRDesign populated|empty`, `-BFHRState loading|error|offline` and/or
// `-BFHRScreen <screen>`, every tab shows its fixture-backed core screen in that state.
// Release builds compile none of this file and bundle no fixtures.

extension AppTab {
    /// The tab that hosts a design screen.
    init(designScreen: DesignScreen) {
        switch designScreen {
        case .today: self = .today
        case .jobs, .jobDetail, .savedSearches, .apply: self = .jobs
        case .cvEditor: self = .cvs
        case .trackerBoard, .insights: self = .tracker
        case .mailReview: self = .mail
        }
    }

    /// The design screen a tab hosts when another tab was launched.
    var designScreen: DesignScreen {
        switch self {
        case .today: .today
        case .jobs: .jobs
        case .tracker: .trackerBoard
        case .cvs: .cvEditor
        case .mail: .mailReview
        }
    }
}

/// A tab in design mode. The Jobs tab is the real Jobs stack on fixtures (Job detail, Saved
/// searches and Apply open over the feed when launched with them); the other screens are tab
/// roots with a large title.
struct DesignTabRoot: View {
    let tab: AppTab
    let scenario: DesignScenario

    var body: some View {
        if tab == .jobs {
            let screen = scenario.screen.flatMap { $0.isJobsScreen ? $0 : nil } ?? .jobs
            DesignScreenView(screen, scenario: scenario)
        } else {
            NavigationStack {
                DesignScreenView(tab.designScreen, scenario: scenario)
                    .navigationTitle(tab.title)
                    .navigationBarTitleDisplayMode(.large)
            }
        }
    }
}
#endif
