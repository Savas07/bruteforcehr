#if DEBUG
import BFHRCore
import Foundation

extension FixtureDocument {
    /// This document grown to `jobs` jobs and `applications` applications for the performance
    /// budget (docs/runbooks/performance.md), the way `scaledDataset()` in @bfhr/fixtures grows
    /// the populated dataset: copy `n` of a job (with its match) gets the id `<id>-x<n>`, its own
    /// source ids, URLs and fingerprint, and is posted `n` hours earlier; copy `n` of an
    /// application (with its events and interviews) links to copy `n` of its job, and its
    /// interviews move `n` weeks later. Copy 0 is the document's own.
    func scaled(jobs jobCount: Int, applications applicationCount: Int) -> FixtureDocument {
        func copyId(_ id: String, _ copy: Int) -> String { copy == 0 ? id : "\(id)-x\(copy)" }
        var scaled = self
        let matches = Dictionary(jobMatches.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        scaled.jobs = []
        scaled.jobMatches = []
        if !jobs.isEmpty {
            for index in 0..<jobCount {
                let copy = index / jobs.count
                let base = jobs[index % jobs.count]
                var job = base
                if copy > 0 {
                    let age = TimeInterval(copy) * 3_600
                    job.id = copyId(base.id, copy)
                    job.sources = base.sources.map { source in
                        var link = source
                        link.sourceId = source.sourceId.map { "\($0)-x\(copy)" }
                        link.url = source.url + (source.url.contains("?") ? "&" : "?") + "copy=\(copy)"
                        link.postedAt = source.postedAt?.addingTimeInterval(-age)
                        return link
                    }
                    job.sourceKeys = base.sourceKeys.map { "\($0)-x\(copy)" }
                    job.fingerprint = "\(base.fingerprint.prefix(112))-x\(copy)"
                    job.postedAt = base.postedAt?.addingTimeInterval(-age)
                }
                scaled.jobs.append(job)
                if var match = matches[base.id] {
                    if copy > 0 {
                        match.id = job.id
                        match.score = max(0, match.score - (copy * 7) % 40)
                    }
                    scaled.jobMatches.append(match)
                }
            }
        }
        let jobIds = Set(scaled.jobs.map(\.id))

        scaled.applications = []
        scaled.applicationEvents = []
        scaled.interviews = []
        if !applications.isEmpty {
            for index in 0..<applicationCount {
                let copy = index / applications.count
                let base = applications[index % applications.count]
                var application = base
                application.id = copyId(base.id, copy)
                if copy > 0 {
                    let jobId = base.jobId.map { copyId($0, copy) }
                    application.jobId = jobId.flatMap { jobIds.contains($0) ? $0 : nil }
                }
                scaled.applications.append(application)
                for event in applicationEvents where event.applicationId == base.id {
                    var copied = event
                    copied.id = copyId(event.id, copy)
                    copied.applicationId = application.id
                    copied.revertsEventId = event.revertsEventId.map { copyId($0, copy) }
                    scaled.applicationEvents.append(copied)
                }
                for interview in interviews where interview.applicationId == base.id {
                    var copied = interview
                    copied.id = copyId(interview.id, copy)
                    copied.applicationId = application.id
                    copied.startsAt = interview.startsAt.addingTimeInterval(TimeInterval(copy) * 7 * 86_400)
                    scaled.interviews.append(copied)
                }
            }
        }
        return scaled
    }
}
#endif
