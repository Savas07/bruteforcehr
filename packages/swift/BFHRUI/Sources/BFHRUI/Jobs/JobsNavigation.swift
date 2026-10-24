import BFHRCore
import SwiftUI

/// Destinations pushed on the Jobs stack (IA.md "Jobs").
public enum JobsRoute: Hashable, Sendable {
    case job(String)
    case savedSearches
    case hiddenJobs

    /// `bruteforcehr://jobs/…` (IA.md "Deep links"): `jobs/{jobId}` (+ `/apply`), `jobs/saved`,
    /// `jobs/searches/{id}`, `jobs/hidden`. Returns the stack to show, the scope to select and
    /// the job whose Apply sheet opens; nil for a link that only selects the tab.
    public static func destination(for url: URL) -> (path: [JobsRoute], scope: JobFeedScope?, applyJobId: String?)? {
        guard url.scheme?.lowercased() == "bruteforcehr", url.host()?.lowercased() == "jobs" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch parts.first {
        case nil: return nil
        case "saved": return ([], .saved, nil)
        case "hidden": return ([.savedSearches, .hiddenJobs], nil, nil)
        case "searches":
            guard parts.count > 1 else { return ([.savedSearches], nil, nil) }
            return ([], .search(parts[1]), nil)
        case let jobId?:
            return ([.job(jobId)], nil, parts.count > 1 && parts[1] == "apply" ? jobId : nil)
        }
    }
}

extension EnvironmentValues {
    /// Opens the Apply sheet for a job (Job detail's Apply bar, the feed's context menu). Set by
    /// the Jobs stack; nil hides Apply.
    @Entry public var bfhrApply: (@MainActor (String) -> Void)? = nil
    /// Opens "Add a job from a link" (`jobImportUrl`). Set by the app; nil hides the entry.
    @Entry public var bfhrAddFromLink: (@MainActor () -> Void)? = nil
}
