import BFHRCore
import SwiftUI

/// The Jobs tab's navigation (IA.md "Jobs"): the feed at the root; Job detail, Saved searches and
/// Hidden jobs pushed; the Apply sheet over any of them. The host (the app on Firestore, or
/// design mode on fixtures) supplies the models.
public struct JobsStack<Toolbar: ToolbarContent>: View {
    private let feed: JobsFeedModel
    @Binding private var path: [JobsRoute]
    @Binding private var applying: String?
    private let detailModel: (String) -> JobDetailModel
    private let applyModel: (String) -> ApplyModel
    private let toolbar: () -> Toolbar

    public init(
        feed: JobsFeedModel,
        path: Binding<[JobsRoute]>,
        applying: Binding<String?>,
        detailModel: @escaping (String) -> JobDetailModel,
        applyModel: @escaping (String) -> ApplyModel,
        @ToolbarContentBuilder toolbar: @escaping () -> Toolbar
    ) {
        self.feed = feed
        _path = path
        _applying = applying
        self.detailModel = detailModel
        self.applyModel = applyModel
        self.toolbar = toolbar
    }

    public var body: some View {
        NavigationStack(path: $path) {
            JobsFeedScreen(model: feed)
                .navigationTitle(Text(JobsStrings.title))
                .bfhrLargeTitle()
                .toolbar(content: toolbar)
                .navigationDestination(for: JobsRoute.self) { route in
                    switch route {
                    case .job(let jobId): JobDetailScreen(model: detailModel(jobId))
                    case .savedSearches: SavedSearchesScreen(model: feed)
                    case .hiddenJobs: HiddenJobsScreen(model: feed)
                    }
                }
        }
        .environment(\.bfhrApply) { jobId in applying = jobId }
        .sheet(item: Binding(get: { applying.map(ApplyRequest.init) }, set: { applying = $0?.jobId })) { request in
            ApplySheet(model: applyModel(request.jobId))
        }
    }
}

private struct ApplyRequest: Identifiable {
    let jobId: String
    var id: String { jobId }
}
