import BFHRCore
import BFHRDesignTokens
import Observation
import SwiftUI

// "Tailor for a job…" in CV Studio (BRIEF §4.4.1 from the CV side): pick one of your jobs, then the
// same review as the Apply sheet. The tailored version is saved for that job and pinned on its
// application (saved first when needed, D02/D45); the CV itself keeps its current version.

/// A job the user can tailor a CV for.
public struct TailorJobChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public var title: String
    public var company: String
    public var score: Int?
    public var status: ApplicationStatus?
}

/// The jobs and the data layer behind CV Studio's "Tailor for a job…" (fed by the same
/// `UserData` store as the Jobs tab).
@Observable
public final class CVTailoringModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []
    public private(set) var data = UserData.empty
    public weak var writer: (any UserDataWriter)?
    public weak var services: (any ApplyServices)?
    public var renderer: (any ApplyRenderer)?
    public var now: Date
    public var usesSystemClock = false
    public private(set) var writeFailures = 0
    var writeTime: Date { usesSystemClock ? .now : now }

    public init(now: Date = .now) {
        self.now = now
    }

    public func load(_ data: UserData) {
        self.data = data
        phase = .loaded
    }

    /// Jobs still worth tailoring for: not applied yet (a pin is write-once after that), best
    /// match first; tracked (Saved / Preparing) jobs before the rest.
    public var jobs: [TailorJobChoice] {
        data.jobs.compactMap { job -> TailorJobChoice? in
            let application = data.application(forJob: job.id)
            if application?.appliedAt != nil { return nil }
            if data.match(forJob: job.id)?.state == .dismissed { return nil }
            return TailorJobChoice(
                id: job.id, title: job.title, company: job.company,
                score: data.match(forJob: job.id)?.score, status: application?.status
            )
        }
        .sorted { a, b in
            if (a.status != nil) != (b.status != nil) { return a.status != nil }
            if (a.score ?? -1) != (b.score ?? -1) { return (a.score ?? -1) > (b.score ?? -1) }
            return a.title < b.title
        }
    }

    /// The review for `cvId`'s `revisionId` and `jobId`; saving pins the version on the job.
    public func reviewModel(cvId: String, revisionId: String, cvTitle: String, language: String, jobId: String) -> TailorReviewModel? {
        guard let job = data.job(id: jobId) else { return nil }
        let model = TailorReviewModel(
            cvId: cvId, revisionId: revisionId, jobId: jobId, company: job.company, role: job.title,
            cvTitle: cvTitle, language: language, aiEnabled: data.profile?.aiEnabled ?? true
        )
        model.services = services
        model.renderer = renderer
        model.locale = data.profile?.uiLanguage ?? UiLanguage(rawValue: Locale.current.language.languageCode?.identifier ?? "") ?? .en
        model.clock = { [weak self] in self?.writeTime ?? .now }
        model.onSave = { [weak self] revision in self?.save(revision) }
        return model
    }

    func save(_ revision: CvRevision) {
        let before = data
        guard let jobId = revision.jobId, data.saveTailoredRevision(revision, forJob: jobId, at: writeTime) != nil else { return }
        let changes = UserDataChanges(from: before, to: data)
        if let writer {
            Task { [weak self] in
                do { try await writer.commit(changes) } catch { self?.writeFailures += 1 }
            }
        }
        for id in changes.touchedIDs { recordWrite(id) }
    }
}

extension EnvironmentValues {
    /// CV Studio's "Tailor for a job…" (nil: the action isn't offered, e.g. no job data yet).
    @Entry public var bfhrTailoring: CVTailoringModel?
}

/// CV Studio's sheet: pick a job, then the tailoring review.
struct CVTailorSheet: View {
    let tailoring: CVTailoringModel
    let cvId: String
    let revisionId: String
    let cvTitle: String
    let language: String
    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @State private var review: TailorReviewModel?
    @State private var query = ""

    var body: some View {
        NavigationStack {
            Group {
                if let review {
                    TailorReviewPage(model: review) { _ in
                        toasts?.show(ToastItem(glyph: ToastGlyph.confirmed, message: ApplyStrings.tailorSaved(review.company)))
                        dismiss()
                    }
                    .navigationTitle(Text(verbatim: review.role))
                } else {
                    picker.navigationTitle(Text(ApplyStrings.pickJobTitle))
                }
            }
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if review != nil {
                        Button {
                            review?.cancel()
                            review = nil
                        } label: { Text(ApplyStrings.back) }
                        .accessibilityIdentifier("cv.tailor.back")
                    } else {
                        Button { dismiss() } label: { Text(ApplyStrings.cancel) }
                    }
                }
            }
            .bfhrToastHost()
        }
        .interactiveDismissDisabled(review != nil)
        .accessibilityIdentifier("cv.tailor.sheet")
    }

    private var picker: some View {
        let jobs = tailoring.jobs.filter {
            query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.company.localizedCaseInsensitiveContains(query)
        }
        return List {
            Section {
                Text(ApplyStrings.pickJobIntro(cvTitle))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            if tailoring.jobs.isEmpty {
                EmptyState(.subArea, glyph: "briefcase", title: ApplyStrings.noJobsTitle, message: ApplyStrings.noJobsBody)
                    .listRowBackground(Color.clear)
            }
            Section {
                ForEach(jobs) { job in
                    Button {
                        review = tailoring.reviewModel(cvId: cvId, revisionId: revisionId, cvTitle: cvTitle, language: language, jobId: job.id)
                    } label: {
                        HStack(spacing: BFHRSpace.s3) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: job.title).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                                Text(verbatim: job.company).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            if let score = job.score { MatchBandPill(score: score) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("cv.tailor.job.\(job.id)")
                }
            }
        }
        .bfhrInsetGroupedList()
        .searchable(text: $query)
    }
}
