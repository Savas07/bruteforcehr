#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation

// Design mode for the Jobs tab: the feed, Saved searches and the Apply sheet on the fixtures
// (`-BFHRScreen jobs|saved-searches|apply`). `-BFHRApplyStep <step>` opens the Apply sheet on
// that page (`DesignApplyStep`: checklist, kit, prompt, email, attach, tailor, tailor-loading,
// tailor-review, tailor-preview, tailor-off, tailor-limit, tailor-saved, letter, letter-draft,
// letter-limit); `-BFHRJobsSearch running|finished|failed` shows the on-demand
// search's states over the feed; `-BFHRJobId <id>` opens Job detail / Apply on that fixture job
// instead of the featured one (e.g. `job-northstar-frontend`, Preparing: "Did you apply?";
// `job-kumsal-frontend`, Applied: the application block); `-BFHRJobsPane filters|editor|hidden`
// opens the feed's filter sheet, the first saved search's editor or Hidden jobs.

/// Design-mode panes for critique captures and UI tests (`-BFHRJobsPane`), opened once per launch.
enum JobsDesignPane: String {
    case filters
    case editor
    case hidden

    static let requested: JobsDesignPane? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRJobsPane"), arguments.indices.contains(index + 1) else { return nil }
        return JobsDesignPane(rawValue: arguments[index + 1])
    }()

    private static var taken = false

    /// `pane` when it was requested and not opened yet.
    static func take(_ pane: JobsDesignPane) -> Bool {
        guard !taken, requested == pane else { return false }
        taken = true
        return true
    }
}

/// Apply pages for captures.
public enum DesignApplyStep: String, CaseIterable, Sendable {
    case checklist
    /// The kit (CV, cover letter, answers) before Safari.
    case kit
    /// The kit back from Safari: "Did you apply?".
    case prompt
    case email
    /// Review email with the attachment picker open.
    case attach
    /// Tailor: Light / Thorough.
    case tailor
    case tailorLoading = "tailor-loading"
    /// The suggested edits, one accepted and one kept.
    case tailorReview = "tailor-review"
    case tailorPreview = "tailor-preview"
    case tailorOff = "tailor-off"
    case tailorLimit = "tailor-limit"
    /// The checklist after "Save as new version": the tailored version selected.
    case tailorSaved = "tailor-saved"
    /// The cover letter editor on the starter template.
    case letter
    /// The editor after "Draft with AI": the banner, a field to fill.
    case letterDraft = "letter-draft"
    case letterLimit = "letter-limit"

    public static let launch: DesignApplyStep? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRApplyStep"), arguments.indices.contains(index + 1) else { return nil }
        return DesignApplyStep(rawValue: arguments[index + 1])
    }()
}

extension DesignScenario {
    /// The Jobs feed on this scenario's data.
    public func jobsFeedModel() -> JobsFeedModel {
        let model = JobsFeedModel(now: now)
        apply(to: model)
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "-BFHRJobsSearch"), arguments.indices.contains(index + 1) {
            let query = "frontend"
            model.query = query
            switch arguments[index + 1] {
            case "running":
                model.designSearchState(.searching(query: query))
            case "failed":
                model.designSearchState(.failed(query: query, error: .rateLimited))
            default:
                let ids = Array(data.jobs.prefix(6).map(\.id))
                model.designSearchState(.finished(query: query, outcome: JobsSearchResponse(
                    jobIds: ids,
                    counts: JobsSearchCounts(found: 23, created: 8, updated: 15, matched: 23),
                    sources: [
                        SourceRunReport(source: "remotive", status: .ok, reason: nil, count: 9),
                        SourceRunReport(source: "arbeitnow", status: .ok, reason: nil, count: 14),
                        SourceRunReport(source: "adzuna", status: .skipped, reason: .noKey, count: 0),
                    ]
                )))
            }
        }
        return model
    }

    /// The job the Apply sheet and Job detail open in design mode: `-BFHRJobId`, else the
    /// featured job.
    public var designJobId: String {
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "-BFHRJobId"), arguments.indices.contains(index + 1) {
            return arguments[index + 1]
        }
        let populated = UserData(DesignScenario(dataset: .populated).document)
        return Self.featuredJobId(in: populated) ?? populated.jobs.first?.id ?? "job-missing"
    }

    /// The Apply sheet for the featured job, on `step`.
    public func applyModel(jobId: String, step: DesignApplyStep? = DesignApplyStep.launch) -> ApplyModel {
        let model = ApplyModel(jobId: jobId, now: now)
        let services = DesignApplyServices(data: UserData(DesignScenario(dataset: .populated).document))
        model.designRetained = services
        model.services = services
        #if os(iOS)
        model.renderer = DeviceApplyRenderer(makeEngine: { try CVRenderEngine.bundled() })
        #endif
        switch dataset {
        case .populated, .scaled:
            apply(to: model)
        case .empty:
            // No CV yet: the populated job with the empty account's profile.
            let job = UserData(DesignScenario(dataset: .populated).document).job(id: jobId)
            apply(to: model, data: UserData(profile: data.profile, jobs: job.map { [$0] } ?? []))
        }
        if [.kit, .prompt].contains(step), let job = model.data.job(id: jobId) {
            // A drafted letter with its one field filled, so the kit shows Copy / Share.
            model.letter.designDraft(DesignApplyServices.letterResponse(job: job, name: data.profile?.fullName ?? ""))
            model.letter.typedValues[.hiringManager] = "Ms. Weber"
            model.coverLetter = .written
        }
        switch step {
        case .kit?:
            model.step = .kit
            model.designFiles()
        case .prompt?:
            model.step = .kit
            model.designFiles()
            model.returnedFromSite()
        case .email?, .attach?:
            model.useEmail("talent@lighthouse-learning.example")
            model.email = ApplyEmailDraft(
                accountId: model.sendingAccounts.first?.id,
                to: "talent@lighthouse-learning.example",
                subject: String(localized: ApplyStrings.emailSubject(role: model.role)),
                body: String(localized: ApplyStrings.emailBody(role: model.role, company: model.company, name: data.profile?.fullName ?? "", withLetter: model.letterBody != nil))
            )
            model.step = .email
            model.designFiles()
            if step == .attach { model.picksAttachments = true }
        case .tailor?, .tailorLoading?, .tailorReview?, .tailorPreview?, .tailorOff?, .tailorLimit?:
            guard model.selectedCV != nil else { break }
            model.beginTailoring()
            guard let tailoring = model.tailoring else { break }
            let revision = UserData(DesignScenario(dataset: .populated).document).cvRevisions.first { $0.id == tailoring.revisionId }
            switch step {
            case .tailorLoading?: tailoring.designLoading()
            case .tailorOff?: tailoring.designFailure(.aiDisabled)
            case .tailorLimit?: tailoring.designFailure(.dailyLimit)
            case .tailorReview?, .tailorPreview?:
                if let revision {
                    tailoring.designReview(DesignApplyServices.tailorResponse(for: revision.content, language: tailoring.locale), original: revision.content, decided: true)
                }
                tailoring.showsPreview = step == .tailorPreview
            default: break
            }
        case .tailorSaved?:
            guard model.selectedCV != nil else { break }
            model.beginTailoring()
            if let tailoring = model.tailoring,
               let revision = UserData(DesignScenario(dataset: .populated).document).cvRevisions.first(where: { $0.id == tailoring.revisionId }) {
                tailoring.designReview(DesignApplyServices.tailorResponse(for: revision.content, language: tailoring.locale), original: revision.content, decided: true)
                tailoring.decide("e2", .accepted)
                tailoring.save()
            }
            model.endTailoring()
        case .letter?, .letterDraft?, .letterLimit?:
            model.editLetter()
            if step == .letterDraft, let job = model.data.job(id: jobId) {
                model.letter.designDraft(DesignApplyServices.letterResponse(job: job, name: data.profile?.fullName ?? ""))
            }
            if step == .letterLimit { model.letter.designFailure(.dailyLimit) }
        case .checklist?, nil:
            break
        }
        return model
    }
}

extension JobsFeedModel {
    func designSearchState(_ state: JobSearchState) {
        setSearchState(state)
    }
}

extension ApplyModel {
    /// Placeholder PDFs so the kit and the email show their file rows.
    func designFiles() {
        guard let cv = selectedCV else { return }
        var made = [
            ApplyFile(id: "design-cv", kind: .cv(cvId: cv.cvId, revisionId: cv.revisionId), fileName: "Deniz-Aksoy-CV.pdf", data: Data(count: 84_211)),
        ]
        if letterBody != nil {
            made.append(ApplyFile(id: "design-letter", kind: .coverLetter(coverLetterId: "design-letter"), fileName: "Deniz-Aksoy-Cover-Letter.pdf", data: Data(count: 31_402)))
        }
        files = .ready(made)
    }
}
#endif

#if DEBUG
/// "Add a job from a link" in design mode: any link returns the featured job as a new draft, with
/// a low-confidence location ("Check this"); a link containing "fail" shows the unreadable state.
public final class DesignJobLinkImporter: JobLinkImporter {
    private let scenario: DesignScenario

    public init(scenario: DesignScenario) {
        self.scenario = scenario
    }

    public func lookUp(_ url: String) async throws(JobImportError) -> JobImportDraft {
        try? await Task.sleep(for: .milliseconds(400))
        if url.contains("fail") { throw .unreadable }
        let populated = UserData(DesignScenario(dataset: .populated).document)
        guard var job = populated.job(id: scenario.designJobId) else { throw .unreadable }
        job.id = ""
        return JobImportDraft(job: job, existingJobId: nil, confidence: ["title": 0.95, "company": 0.9, "locations": 0.4], warnings: [], finalURL: URL(string: url))
    }
}
#endif
