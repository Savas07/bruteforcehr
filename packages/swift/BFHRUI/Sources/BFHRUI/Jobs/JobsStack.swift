import BFHRCore
import SwiftUI

/// The Jobs tab's navigation (IA.md "Jobs"): the feed at the root; Job detail, Saved searches and
/// Hidden jobs pushed; the Apply sheet over any of them; "Add a job from a link" when an importer
/// is set. The host (the app on Firestore, or design mode on fixtures) supplies the models.
public struct JobsStack<Toolbar: ToolbarContent>: View {
    private let feed: JobsFeedModel
    @Binding private var path: [JobsRoute]
    @Binding private var applying: String?
    @Binding private var importing: JobImportModel?
    private let importer: (any JobLinkImporter)?
    private let detailModel: (String) -> JobDetailModel
    private let applyModel: (String) -> ApplyModel
    private let toolbar: () -> Toolbar
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL

    public init(
        feed: JobsFeedModel,
        path: Binding<[JobsRoute]>,
        applying: Binding<String?>,
        importing: Binding<JobImportModel?> = .constant(nil),
        importer: (any JobLinkImporter)? = nil,
        detailModel: @escaping (String) -> JobDetailModel,
        applyModel: @escaping (String) -> ApplyModel,
        @ToolbarContentBuilder toolbar: @escaping () -> Toolbar
    ) {
        self.feed = feed
        _path = path
        _applying = applying
        _importing = importing
        self.importer = importer
        self.detailModel = detailModel
        self.applyModel = applyModel
        self.toolbar = toolbar
    }

    public var body: some View {
        stack
            .environment(\.bfhrApply) { jobId in applying = jobId }
            .environment(\.bfhrAddFromLink, addFromLink)
            .sheet(item: applyRequest) { request in
                ApplySheet(model: applyModel(request.jobId))
            }
            .sheet(item: $importing, content: importSheet)
    }

    private var stack: some View {
        NavigationStack(path: $path) {
            JobsFeedScreen(model: feed)
                .navigationTitle(Text(JobsStrings.title))
                .bfhrLargeTitle()
                .toolbar(content: toolbar)
                .navigationDestination(for: JobsRoute.self, destination: destination)
        }
    }

    @ViewBuilder private func destination(_ route: JobsRoute) -> some View {
        switch route {
        case .job(let jobId): JobDetailScreen(model: detailModel(jobId))
        case .savedSearches: SavedSearchesScreen(model: feed)
        case .hiddenJobs: HiddenJobsScreen(model: feed)
        }
    }

    private var addFromLink: (@MainActor () -> Void)? {
        guard let importer else { return nil }
        return { importing = JobImportModel(importer: importer) }
    }

    private var applyRequest: Binding<ApplyRequest?> {
        Binding(get: { applying.map(ApplyRequest.init) }, set: { applying = $0?.jobId })
    }

    private func importSheet(_ model: JobImportModel) -> some View {
        JobImportReviewView(model: model, onAddByHand: { openURL(URL(string: "bruteforcehr://tracker/new")!) }) { job, isNew, alsoSave in
            let toast = feed.importJob(job, isNew: isNew, alsoSave: alsoSave) { jobId in path = [.job(jobId)] }
            toasts?.show(toast)
        }
    }
}


extension JobImportModel: Identifiable {
    public var id: ObjectIdentifier { ObjectIdentifier(self) }
}

private struct ApplyRequest: Identifiable {
    let jobId: String
    var id: String { jobId }
}
