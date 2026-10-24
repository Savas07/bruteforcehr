#if DEBUG
import SwiftUI

extension DesignScenario {
    /// Today in this scenario.
    public func todayModel() -> TodayModel {
        let model = TodayModel(now: now)
        apply(to: model)
        return model
    }
}

/// A core screen built from fixtures in the given scenario, for design builds and previews. The
/// app's design mode puts one in each tab (`apps/ios/BruteForceHR/DesignMode.swift`).
public struct DesignScreenView: View {
    private let screen: DesignScreen
    private let scenario: DesignScenario
    @State private var holder: ModelHolder

    public init(_ screen: DesignScreen, scenario: DesignScenario) {
        self.screen = screen
        self.scenario = scenario
        _holder = State(initialValue: ModelHolder(screen: screen, scenario: scenario))
    }

    public var body: some View {
        Group {
            switch holder.model {
            case .today(let model): TodayScreen(model: model)
            case .jobs(let screen): DesignJobsTab(screen: screen, scenario: scenario)
            case .cvEditor(let model): CVEditorScreen(model: model)
            case .trackerBoard(let model, let insights):
                TrackerBoardScreen(model: model) {
                    InsightsScreen(model: insights) { drill in
                        let filter = insights.trackerFilter(for: drill)
                        model.applyFilter(ids: filter.ids, label: filter.label)
                        model.showsInsights = false
                    }
                }
            case .insights(let model): InsightsScreen(model: model) { _ in }
            case .mailReview(let model): MailReviewScreen(model: model)
            }
        }
        .environment(\.bfhrNow, holder.now)
        .environment(\.bfhrReload, reload)
        .accessibilityIdentifier("design.\(screen.rawValue)")
    }

    /// Try again in design mode: a cold load (skeleton) for a moment, then the scenario's data
    /// without the forced condition.
    private func reload() {
        var loading = scenario
        loading.condition = .loading
        holder = ModelHolder(screen: screen, scenario: loading)
        var loaded = scenario
        loaded.condition = nil
        Task {
            try? await Task.sleep(for: .seconds(1))
            holder = ModelHolder(screen: screen, scenario: loaded)
        }
    }
}

/// Keeps the screen's model alive across view updates.
private final class ModelHolder {
    /// The Tracker with Insights behind its toolbar button; `-BFHRScreen insights` opens it pushed.
    private static func tracker(_ scenario: DesignScenario) -> Model {
        let tracker = scenario.trackerBoardModel()
        tracker.showsInsights = scenario.screen == .insights
        return .trackerBoard(tracker, scenario.insightsModel())
    }

    enum Model {
        case today(TodayModel)
        /// The Jobs tab's own stack (feed, Saved searches, Apply).
        case jobs(DesignScreen)
        case cvEditor(CVEditorModel)
        case trackerBoard(TrackerBoardModel, InsightsModel)
        case insights(InsightsModel)
        case mailReview(MailReviewModel)
    }

    let model: Model
    let now: Date

    init(screen: DesignScreen, scenario: DesignScenario) {
        now = scenario.now
        model = switch screen {
        case .today: .today(scenario.todayModel())
        // Job detail is pushed on the real Jobs stack (toolbar, back button, Apply sheet).
        case .jobs, .jobDetail, .savedSearches, .apply: .jobs(screen)
        case .cvEditor: .cvEditor(scenario.cvEditorModel())
        case .trackerBoard: Self.tracker(scenario)
        case .insights: .insights(scenario.insightsModel())
        case .mailReview: .mailReview(scenario.mailReviewModel())
        }
    }
}

#Preview("Today · populated") {
    NavigationStack { DesignScreenView(.today, scenario: DesignScenario()) }
        .environment(ToastCenter())
}
#endif
