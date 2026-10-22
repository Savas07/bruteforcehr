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
    @State private var holder: ModelHolder

    public init(_ screen: DesignScreen, scenario: DesignScenario) {
        self.screen = screen
        _holder = State(initialValue: ModelHolder(screen: screen, scenario: scenario))
    }

    public var body: some View {
        Group {
            switch holder.model {
            case .today(let model): TodayScreen(model: model)
            case .jobDetail(let model): JobDetailScreen(model: model)
            case .cvEditor(let model): CVEditorScreen(model: model)
            case .trackerBoard(let model): TrackerBoardScreen(model: model)
            case .mailReview(let model): MailReviewScreen(model: model)
            }
        }
        .environment(\.bfhrNow, holder.now)
        .accessibilityIdentifier("design.\(screen.rawValue)")
    }
}

/// Keeps the screen's model alive across view updates.
private final class ModelHolder {
    enum Model {
        case today(TodayModel)
        case jobDetail(JobDetailModel)
        case cvEditor(CVEditorModel)
        case trackerBoard(TrackerBoardModel)
        case mailReview(MailReviewModel)
    }

    let model: Model
    let now: Date

    init(screen: DesignScreen, scenario: DesignScenario) {
        now = scenario.now
        model = switch screen {
        case .today: .today(scenario.todayModel())
        case .jobDetail: .jobDetail(scenario.jobDetailModel())
        case .cvEditor: .cvEditor(scenario.cvEditorModel())
        case .trackerBoard: .trackerBoard(scenario.trackerBoardModel())
        case .mailReview: .mailReview(scenario.mailReviewModel())
        }
    }
}

#Preview("Today · populated") {
    NavigationStack { DesignScreenView(.today, scenario: DesignScenario()) }
        .environment(ToastCenter())
}
#endif
