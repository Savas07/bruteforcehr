import BFHRCore
import Foundation

// Value types of the Jobs feed (docs/design/research/job-feed-search.md "Decision — iOS").

/// What the feed lists: every match, the Saved stage (D02), or one saved search's criteria.
public enum JobFeedScope: Hashable, Sendable {
    case all
    case saved
    case search(String)
}

/// "Best match" sorts by band, then newest inside a band, so one or two points never reorder
/// the list (job-feed-search OQ1); "Newest" by posting date.
public enum JobFeedSort: String, Hashable, Sendable, CaseIterable, Identifiable {
    case bestMatch
    case newest

    public var id: Self { self }
}

/// The filter chips, in their row order.
public enum JobFilterFacet: String, Hashable, Sendable, CaseIterable, Identifiable {
    case remote
    case match
    case posted
    case salary
    case location
    case seniority
    case source

    public var id: Self { self }
}

/// The feed's filters: a saved search's criteria plus two feed-only refinements.
public struct JobFeedFilters: Hashable, Sendable {
    public var criteria: SavedSearchFilters
    /// "Match: Good+": at least this band. Feed-only (a saved search alerts by its threshold).
    public var minimumBand: MatchBand?
    /// "Hide jobs without a stated salary" (off by default).
    public var hidesUnstatedSalary: Bool

    public init(criteria: SavedSearchFilters = .none, minimumBand: MatchBand? = nil, hidesUnstatedSalary: Bool = false) {
        self.criteria = criteria
        self.minimumBand = minimumBand
        self.hidesUnstatedSalary = hidesUnstatedSalary
    }

    public static let none = JobFeedFilters()

    public func isActive(_ facet: JobFilterFacet) -> Bool {
        switch facet {
        case .remote: !criteria.remoteTypes.isEmpty
        case .match: minimumBand != nil
        case .posted: criteria.postedWithinDays != nil
        case .salary: criteria.salaryMin != nil || hidesUnstatedSalary
        case .location: !criteria.countryCodes.isEmpty || criteria.visaSponsorship == true
        case .seniority: !criteria.seniority.isEmpty
        case .source: !criteria.sources.isEmpty
        }
    }

    /// The badge on the Filters button.
    public var activeCount: Int { JobFilterFacet.allCases.count(where: isActive) }

    public var isEmpty: Bool { activeCount == 0 }

    /// Clears one facet (a chip's Reset).
    public mutating func reset(_ facet: JobFilterFacet) {
        switch facet {
        case .remote: criteria.remoteTypes = []
        case .match: minimumBand = nil
        case .posted: criteria.postedWithinDays = nil
        case .salary:
            criteria.salaryMin = nil
            hidesUnstatedSalary = false
        case .location:
            criteria.countryCodes = []
            criteria.visaSponsorship = nil
        case .seniority: criteria.seniority = []
        case .source: criteria.sources = []
        }
    }
}

extension SavedSearchFilters {
    /// No criteria.
    public static let none = SavedSearchFilters(
        countryCodes: [], remoteTypes: [], seniority: [], salaryMin: nil, sources: [], postedWithinDays: nil, visaSponsorship: nil
    )

    /// Order-insensitive equality, so "Remote, Hybrid" and "Hybrid, Remote" are the same search.
    func isSameSearch(as other: SavedSearchFilters) -> Bool {
        Set(countryCodes.map { $0.uppercased() }) == Set(other.countryCodes.map { $0.uppercased() })
            && Set(remoteTypes) == Set(other.remoteTypes)
            && Set(seniority) == Set(other.seniority)
            && salaryMin == other.salaryMin
            && Set(sources) == Set(other.sources)
            && postedWithinDays == other.postedWithinDays
            && (visaSponsorship ?? false) == (other.visaSponsorship ?? false)
    }
}

/// One job in the feed (Glassdoor row anatomy): title, company · place · work mode, salary with
/// provenance, and a trailing band pill, age and bookmark (or the Tracker status once applied).
public struct JobFeedRow: Identifiable, Hashable, Sendable {
    public let id: String
    public var title: String
    public var company: CompanyIdentity
    /// The first location, else the remote eligibility ("Europe, UK and Türkiye").
    public var place: String?
    public var remoteType: RemoteType?
    /// A stated range; nil = "Salary not stated".
    public var salary: SalaryRange?
    /// Nil while the server hasn't scored the job (or it has no CV to score against).
    public var score: Int?
    public var postedAt: Date?
    /// Deduplicated listings ("3 sources").
    public var sourceCount: Int
    public var isSaved: Bool
    /// The Tracker status once the job has moved past Saved ("Applied" instead of the bookmark).
    public var trackedStatus: ApplicationStatus?
    public var canToggleSave: Bool
    public var isPendingSync: Bool
    /// "Open original posting" and Share.
    public var postingURL: URL?

    public var band: MatchBand? { score.map(matchBand) }
}

/// A row of the list: a job, or the inline "Hidden · Undo · Tell us why" left by Not for me.
public enum JobFeedItem: Identifiable, Hashable, Sendable {
    case job(JobFeedRow)
    case hidden(jobId: String, title: String, company: String, reasons: [DismissReason])

    public var id: String {
        switch self {
        case .job(let row): row.id
        case .hidden(let jobId, _, _, _): "hidden.\(jobId)"
        }
    }
}

/// A saved search in the scope chip row, with its new-match count (eBay).
public struct SavedSearchChip: Identifiable, Hashable, Sendable {
    public let id: String
    public var name: String
    /// New (not saved or hidden) matches for it found since it was saved.
    public var newCount: Int
    public var enabled: Bool
}

// MARK: - Searching job sources

public enum JobSearchError: Error, Hashable, Sendable {
    case offline
    /// `search_rate_limited`: too many searches in a short time.
    case rateLimited
    /// `no_sources`: every source is switched off or skipped.
    case noSources
    case savedSearchNotFound
    case failed(String)
}

/// The server side of searching (`jobsSearch`, `savedSearchRunNow`; `JobsSearchResponse` of
/// @bfhr/core); the app's Cloud Functions client, nil in tests and design mode.
public protocol JobSearchService: AnyObject {
    func search(query: String, filters: SavedSearchFilters) async throws(JobSearchError) -> JobsSearchResponse
    func runSavedSearch(id: String) async throws(JobSearchError) -> JobsSearchResponse
}

/// The on-demand search's progress, shown above the results.
public enum JobSearchState: Hashable, Sendable {
    case idle
    case searching(query: String)
    case finished(query: String, outcome: JobsSearchResponse)
    case failed(query: String, error: JobSearchError)

    public var query: String? {
        switch self {
        case .idle: nil
        case .searching(let query), .finished(let query, _), .failed(let query, _): query
        }
    }
}
