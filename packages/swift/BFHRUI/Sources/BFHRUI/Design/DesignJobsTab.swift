#if DEBUG
import SwiftUI

/// The Jobs tab in design mode: the real `JobsStack` on fixtures, opened on `screen` (the feed;
/// Job detail or Saved searches pushed; the Apply sheet over Job detail). Owns its navigation
/// stack, so the app's design tab root shows it as is.
public struct DesignJobsTab: View {
    private let scenario: DesignScenario
    @State private var feed: JobsFeedModel
    @State private var path: [JobsRoute]
    @State private var applying: String?
    @State private var details = DetailModels()

    public init(screen: DesignScreen, scenario: DesignScenario) {
        self.scenario = scenario
        _feed = State(initialValue: scenario.jobsFeedModel())
        let jobId = scenario.designJobId
        switch screen {
        case .jobDetail: _path = State(initialValue: [.job(jobId)])
        case .savedSearches: _path = State(initialValue: [.savedSearches])
        case .apply:
            _path = State(initialValue: [.job(jobId)])
            _applying = State(initialValue: jobId)
        default: _path = State(initialValue: [])
        }
    }

    public var body: some View {
        JobsStack(
            feed: feed,
            path: $path,
            applying: $applying,
            detailModel: detailModel,
            applyModel: { scenario.applyModel(jobId: $0) }
        ) {
            // Design mode has no account: no avatar.
            ToolbarItem(placement: .bfhrLeading) { EmptyView() }
        }
        .environment(\.bfhrNow, scenario.now)
    }

    /// The featured job uses the job-detail design builder (empty: the stripped job); others
    /// load the scenario's data.
    private func detailModel(_ jobId: String) -> JobDetailModel {
        if let model = details.models[jobId] { return model }
        let model: JobDetailModel
        if jobId == scenario.designJobId {
            model = scenario.jobDetailModel()
        } else {
            model = JobDetailModel(jobId: jobId, now: scenario.now)
            scenario.apply(to: model)
        }
        details.models[jobId] = model
        return model
    }
}
#endif

/// Job detail models by job, kept for the tab's lifetime (pushing the same job reuses its model).
final class DetailModels {
    var models: [String: JobDetailModel] = [:]
}
