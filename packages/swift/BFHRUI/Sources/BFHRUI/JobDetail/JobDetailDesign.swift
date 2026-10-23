#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation

extension DesignScenario {
    /// Job detail in this scenario.
    ///
    /// - populated: the featured job (`featuredJobId(in:)`), Lighthouse Learning · Senior Frontend
    ///   Engineer in the current fixtures.
    /// - empty: the empty fixture has no jobs, so the featured populated job is stripped to
    ///   states.md's empty case (no description, no match yet, no application) and shown with the
    ///   empty fixture's profile: the no-description and "Working out your match…" states.
    public func jobDetailModel() -> JobDetailModel {
        let populated = UserData(Self.fixture(.populated))
        let jobId = designJobId
        let model = JobDetailModel(jobId: jobId, now: now)
        switch dataset {
        case .populated:
            apply(to: model)
        case .empty:
            var job = populated.job(id: jobId)
            job?.description = ""
            apply(to: model, data: UserData(profile: data.profile, jobs: job.map { [$0] } ?? []))
        }
        return model
    }

    /// The job that exercises the most of the screen: a match with an AI rationale, at least one
    /// gap ("I have this") and at least two sources ("Found on" groups); most sources first, then
    /// the highest score, then the id.
    static func featuredJobId(in data: UserData) -> String? {
        data.jobs
            .compactMap { job -> (job: Job, score: Int)? in
                guard let match = data.match(forJob: job.id), match.rationale != nil, !match.gaps.isEmpty, job.sources.count >= 2 else { return nil }
                return (job, match.score)
            }
            .min { a, b in
                // `a` comes first: more sources, then a higher score, then the smaller id.
                (b.job.sources.count, b.score, a.job.id) < (a.job.sources.count, a.score, b.job.id)
            }?
            .job.id
    }

    private static func fixture(_ dataset: FixtureDataset) -> FixtureDocument {
        do {
            return try FixtureStore.document(dataset)
        } catch {
            fatalError("Design mode: \(error)")
        }
    }
}
#endif
