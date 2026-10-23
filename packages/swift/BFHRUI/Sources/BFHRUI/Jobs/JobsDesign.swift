#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation

// Design mode for the Jobs tab: the feed, Saved searches and the Apply sheet on the fixtures
// (`-BFHRScreen jobs|saved-searches|apply`). `-BFHRApplyStep checklist|kit|email|prompt` opens
// the Apply sheet on that page; `-BFHRJobsSearch running|finished|failed` shows the on-demand
// search's states over the feed.

/// Apply pages for captures.
public enum DesignApplyStep: String, CaseIterable, Sendable {
    case checklist
    case kit
    case prompt
    case email

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

    /// The job the Apply sheet and Job detail open in design mode.
    public var designJobId: String {
        let populated = UserData(DesignScenario(dataset: .populated).document)
        return Self.featuredJobId(in: populated) ?? populated.jobs.first?.id ?? "job-missing"
    }

    /// The Apply sheet for the featured job, on `step`.
    public func applyModel(jobId: String, step: DesignApplyStep? = DesignApplyStep.launch) -> ApplyModel {
        let model = ApplyModel(jobId: jobId, now: now)
        switch dataset {
        case .populated:
            apply(to: model)
        case .empty:
            // No CV yet: the populated job with the empty account's profile.
            let job = UserData(DesignScenario(dataset: .populated).document).job(id: jobId)
            apply(to: model, data: UserData(profile: data.profile, jobs: job.map { [$0] } ?? []))
        }
        switch step {
        case .kit?:
            model.step = .kit
            model.designFiles()
        case .prompt?:
            model.step = .kit
            model.designFiles()
            model.returnedFromSite()
        case .email?:
            model.useEmail("talent@lighthouse-learning.example")
            model.email = ApplyEmailDraft(
                accountId: model.sendingAccounts.first?.id,
                to: "talent@lighthouse-learning.example",
                subject: String(localized: ApplyStrings.emailSubject(role: model.role)),
                body: String(localized: ApplyStrings.emailBody(role: model.role, company: model.company, name: data.profile?.fullName ?? ""))
            )
            model.step = .email
            model.designFiles()
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
        files = .ready([
            ApplyFile(id: "design-cv", kind: .cv(cvId: cv.id, revisionId: cv.revisionId), fileName: "Deniz-Aksoy-CV.pdf", data: Data(count: 84_211)),
        ])
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
