import BFHRCore
import Foundation
import Observation

/// The Jobs tab (docs/design/research/job-feed-search.md "Decision — iOS", decisions.md D02 and
/// D10): the matches the server computed, scoped (All matches · Saved · a saved search),
/// searched, filtered and sorted on the device; Save / Not for me with Undo; the on-demand search
/// of every job source; saved searches and Hidden jobs.
@Observable
public final class JobsFeedModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = [] {
        didSet { recompute() }
    }

    /// The clock for ages and the time stamped on writes; the data layer advances it.
    public var now: Date {
        didSet { recompute() }
    }
    public let calendar: Calendar
    public private(set) var data = UserData.empty

    /// Persists every mutation (the app's Firestore store); nil in tests and design mode.
    public weak var writer: (any UserDataWriter)?
    /// `jobsSearch` / `savedSearchRunNow`; nil in tests and design mode.
    public weak var searchService: (any JobSearchService)?
    /// Live data: writes are stamped with the system clock.
    public var usesSystemClock = false
    /// Counts writes the server refused; the screen shows a toast when it changes.
    public private(set) var writeFailures = 0

    var writeTime: Date { usesSystemClock ? .now : now }

    // MARK: Inputs

    public var scope: JobFeedScope = .all {
        didSet {
            guard scope != oldValue else { return }
            recentlyHidden = []
            if case .search(let id) = scope, let search = data.savedSearches.first(where: { $0.id == id }) {
                query = search.query
                filters = JobFeedFilters(criteria: search.filters)
            } else if case .search = oldValue {
                query = ""
                filters = .none
            }
            recompute()
        }
    }
    /// The search field (keywords or title); filters the list as you type.
    public var query: String = "" {
        didSet { if query != oldValue { recompute() } }
    }
    public var filters: JobFeedFilters = .none {
        didSet { if filters != oldValue { recompute() } }
    }
    public var sort: JobFeedSort = .bestMatch {
        didSet { if sort != oldValue { recompute() } }
    }

    // MARK: Derived

    public private(set) var items: [JobFeedItem] = []
    /// Jobs in the list (hidden placeholders excluded).
    public private(set) var jobCount = 0
    public private(set) var savedSearchChips: [SavedSearchChip] = []
    public private(set) var savedCount = 0
    /// Hidden jobs ("Not for me"), newest first: Saved searches › Hidden jobs.
    public private(set) var hiddenJobs: [JobFeedRow] = []
    /// No jobs and no saved searches at all: the first-use empty state.
    public private(set) var isFirstUse = true
    /// The scope has jobs, but the query and filters leave none: "No jobs match…".
    public private(set) var hasNoResults = false
    /// The query or filters differ from every saved search: "Get alerts for this search".
    public private(set) var offersSavingSearch = false
    /// Sources seen on jobs (the Source filter's options).
    public private(set) var knownSources: [String] = []
    /// Countries seen on jobs (the Location filter's options), ISO codes.
    public private(set) var knownCountries: [String] = []
    public private(set) var searchState: JobSearchState = .idle

    /// Rows hidden from this list in this visit: they stay as "Hidden · Undo · Tell us why".
    private var recentlyHidden: [String] = []
    /// The last on-demand search's ranked results stay in the list while its query is typed.
    private var searchResults: (query: String, ids: [String])?

    public init(now: Date = .now, calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
    }

    public func load(_ data: UserData) {
        self.data = data
        if case .search(let id) = scope, !data.savedSearches.contains(where: { $0.id == id }) {
            scope = .all
        }
        recompute()
        phase = .loaded
    }

    /// Runs a mutation on `data`, recomputes and hands the changed documents to `writer` as one
    /// batch (see `TrackerBoardModel.mutate`).
    @discardableResult
    func mutate<Result>(_ body: (inout UserData) throws -> Result) rethrows -> Result {
        let before = data
        let result = try body(&data)
        let changes = UserDataChanges(from: before, to: data)
        if !changes.isEmpty, let writer {
            Task { [weak self] in
                do {
                    try await writer.commit(changes)
                } catch {
                    self?.writeFailures += 1
                }
            }
        }
        if connection.isOffline, !changes.touchedIDs.isSubset(of: pendingSyncIDs) {
            pendingSyncIDs.formUnion(changes.touchedIDs) // recomputes
        } else {
            recompute()
        }
        return result
    }

    // MARK: Job actions

    /// Save / unsave (D02). Saving returns "{company} · saved · Undo"; unsaving returns
    /// "Removed from Saved · Undo"; nil when the job can't be toggled.
    @discardableResult
    public func toggleSave(_ jobId: String) -> ToastItem? {
        guard data.canToggleJobSave(jobId), let job = data.job(id: jobId) else { return nil }
        if data.isJobSaved(jobId) {
            guard mutate({ $0.unsaveJob(jobId, at: writeTime) }) else { return nil }
            return ToastItem(
                glyph: ToastGlyph.removed,
                message: JobsStrings.unsavedToast(job.company),
                action: .undo { [weak self] in
                    guard let self else { return }
                    mutate { $0.saveJob(jobId, at: self.writeTime) }
                }
            )
        }
        mutate { $0.saveJob(jobId, at: writeTime) }
        return ToastItem(
            glyph: ToastGlyph.saved,
            message: JobsStrings.savedToast(job.company),
            action: .undo { [weak self] in
                guard let self else { return }
                mutate { $0.unsaveJob(jobId, at: self.writeTime) }
            }
        )
    }

    /// Not for me: the row collapses into "Hidden · Undo · Tell us why" (no toast; the inline row
    /// is the Undo). Returns false when the job has no match to hide.
    @discardableResult
    public func hide(_ jobId: String, reasons: [DismissReason] = []) -> Bool {
        guard let match = data.match(forJob: jobId), match.state != .dismissed else { return false }
        if !recentlyHidden.contains(jobId) { recentlyHidden.append(jobId) }
        mutate { $0.setMatchState(jobId, to: .dismissed, reasons: reasons, at: writeTime) }
        return true
    }

    /// The inline row's Undo (and Hidden jobs' Show in feed): back to a new match.
    public func unhide(_ jobId: String) {
        recentlyHidden.removeAll { $0 == jobId }
        guard data.match(forJob: jobId)?.state == .dismissed else {
            recompute()
            return
        }
        mutate { $0.setMatchState(jobId, to: .new, at: writeTime) }
    }

    /// "Tell us why": replaces a hidden job's reasons. Returns "Thanks. We'll use this to tune
    /// your matches."
    @discardableResult
    public func setHiddenReasons(_ jobId: String, reasons: [DismissReason]) -> ToastItem? {
        guard data.match(forJob: jobId)?.state == .dismissed else { return nil }
        mutate { $0.setMatchState(jobId, to: .dismissed, reasons: reasons, at: writeTime) }
        return ToastItem(glyph: ToastGlyph.confirmed, message: JobsStrings.reasonsSavedToast)
    }

    public func hiddenReasons(_ jobId: String) -> [DismissReason] {
        data.match(forJob: jobId)?.dismissReasons ?? []
    }

    // MARK: Searching job sources

    /// The on-demand search (`jobsSearch`): every source for the query and filters. Its ranked
    /// results join the list as they arrive through the `jobMatches` listener.
    public func searchSources() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let searchService else { return }
        guard !connection.isOffline else {
            searchState = .failed(query: text, error: .offline)
            return
        }
        searchState = .searching(query: text)
        do {
            let outcome = try await searchService.search(query: text, filters: filters.criteria)
            searchResults = (text, outcome.jobIds)
            searchState = .finished(query: text, outcome: outcome)
        } catch {
            searchState = .failed(query: text, error: error)
        }
        recompute()
    }

    /// "Run now" on a saved search (`savedSearchRunNow`).
    public func runSavedSearch(_ id: String) async {
        guard let searchService, let search = data.savedSearches.first(where: { $0.id == id }) else { return }
        guard !connection.isOffline else {
            searchState = .failed(query: search.query, error: .offline)
            return
        }
        searchState = .searching(query: search.query)
        do {
            let outcome = try await searchService.runSavedSearch(id: id)
            searchResults = (search.query, outcome.jobIds)
            searchState = .finished(query: search.query, outcome: outcome)
        } catch {
            searchState = .failed(query: search.query, error: error)
        }
        recompute()
    }

    public var canSearchSources: Bool { searchService != nil }

    public func dismissSearchState() {
        searchState = .idle
    }

    /// Sets the search state directly (design mode); a finished search's ids join the list.
    func setSearchState(_ state: JobSearchState) {
        searchState = state
        if case .finished(let query, let outcome) = state { searchResults = (query, outcome.jobIds) }
        recompute()
    }

    // MARK: Saved searches

    public var savedSearches: [SavedSearch] {
        data.savedSearches.sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
    }

    public func savedSearch(id: String) -> SavedSearch? {
        data.savedSearches.first { $0.id == id }
    }

    /// "Get alerts for this search": saves the query and filters at once with the defaults
    /// (daily digest, Good+ alerts) and scopes the feed to it. Returns "Search saved · Edit".
    @discardableResult
    public func saveCurrentSearch(onEdit: @escaping @MainActor (String) -> Void) -> ToastItem {
        let search = SavedSearch(
            id: UserData.makeID(),
            name: defaultSearchName(),
            query: query.trimmingCharacters(in: .whitespacesAndNewlines),
            filters: filters.criteria,
            schedule: .daily,
            alertThreshold: MatchBand.thresholds.good,
            dailyDigest: true,
            enabled: true,
            lastRunAt: nil,
            nextRunAt: writeTime,
            createdAt: writeTime,
            updatedAt: writeTime
        )
        mutate { $0.savedSearches.append(search) }
        scope = .search(search.id)
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: JobsStrings.searchSavedToast,
            action: ToastAction(label: JobsStrings.edit) { onEdit(search.id) }
        )
    }

    /// A new saved search from the editor ("+" chip). Returns its id.
    @discardableResult
    public func createSavedSearch(_ draft: SavedSearchDraft) -> String {
        let search = draft.makeSearch(id: UserData.makeID(), at: writeTime)
        mutate { $0.savedSearches.append(search) }
        return search.id
    }

    /// Saves the editor's changes. A change to the schedule or switching alerts on asks the
    /// scheduler to run it now (`nextRunAt = now`).
    public func updateSavedSearch(_ id: String, with draft: SavedSearchDraft) {
        guard let index = data.savedSearches.firstIndex(where: { $0.id == id }) else { return }
        let current = data.savedSearches[index]
        var updated = draft.apply(to: current, at: writeTime)
        if updated.enabled && (!current.enabled || updated.schedule != current.schedule || updated.query != current.query || updated.filters != current.filters) {
            updated.nextRunAt = writeTime
        }
        guard updated != current else { return }
        mutate { $0.savedSearches[index] = updated }
        if scope == .search(id) {
            query = updated.query
            filters = JobFeedFilters(criteria: updated.filters, minimumBand: filters.minimumBand, hidesUnstatedSalary: filters.hidesUnstatedSalary)
        }
    }

    /// Deletes a saved search. Returns "{name} deleted · Undo" (Undo recreates it as it was).
    @discardableResult
    public func deleteSavedSearch(_ id: String) -> ToastItem? {
        guard let search = data.savedSearches.first(where: { $0.id == id }) else { return nil }
        if scope == .search(id) { scope = .all }
        mutate { $0.savedSearches.removeAll { $0.id == id } }
        return ToastItem(
            glyph: ToastGlyph.removed,
            message: JobsStrings.searchDeletedToast(search.name),
            action: .undo { [weak self] in
                self?.mutate { $0.savedSearches.append(search) }
            }
        )
    }

    /// The criteria in one line ("Remote · Germany · Senior · Posted in the last 7 days"),
    /// as typed values for the view to format.
    public func criteria(of search: SavedSearch) -> SavedSearchFilters { search.filters }

    // MARK: Lookups for the views

    public func job(_ id: String) -> Job? { data.job(id: id) }

    // MARK: Derivation

    private func recompute() {
        let jobsById = Dictionary(data.jobs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let applicationsByJob = Dictionary(
            data.applications.compactMap { application in application.jobId.map { ($0, application) } },
            uniquingKeysWith: { first, _ in first }
        )
        let matchesById = Dictionary(data.jobMatches.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        func row(_ job: Job) -> JobFeedRow {
            let match = matchesById[job.id]
            let application = applicationsByJob[job.id]
            let saved = application.map { $0.status == .saved } ?? (match?.state == .saved)
            let tracked = application.flatMap { $0.status == .saved ? nil : $0.status }
            let stated = job.salary.flatMap { $0.min != nil || $0.max != nil ? $0 : nil }
            let posting = job.applyUrl ?? job.sources.first(where: \.isDirectFromEmployer)?.url ?? job.sources.first?.url
            return JobFeedRow(
                id: job.id,
                title: job.title,
                company: CompanyIdentity(name: job.company, domain: job.companyDomain),
                place: job.locations.first?.label ?? job.remoteEligibility.flatMap { $0.isEmpty ? nil : $0 },
                remoteType: job.remoteType,
                salary: stated,
                score: match.flatMap { $0.basedOnCvId == nil ? nil : $0.score },
                postedAt: job.postedAt ?? job.sources.compactMap(\.postedAt).min() ?? job.sources.map(\.firstSeenAt).min(),
                sourceCount: Set(job.sources.map(\.source)).count,
                isSaved: saved,
                trackedStatus: tracked,
                canToggleSave: data.canToggleJobSave(job.id),
                isPendingSync: pendingSyncIDs.contains(job.id) || application.map { pendingSyncIDs.contains($0.id) } ?? false,
                postingURL: posting.flatMap(URL.init(string:))
            )
        }

        let scoped = scopedJobs()
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = visible(scoped, filters: filters)
        var rows = filtered.map(row)
        switch sort {
        case .bestMatch:
            rows.sort { lhs, rhs in
                let left = Self.bandRank(lhs.band), right = Self.bandRank(rhs.band)
                if left != right { return left < right }
                return Self.newerFirst(lhs, rhs)
            }
        case .newest:
            rows.sort(by: Self.newerFirst)
        }

        // Rows hidden in this visit keep their place as an inline Undo row.
        var list = rows.map(JobFeedItem.job)
        for jobId in recentlyHidden {
            guard let job = jobsById[jobId], matchesById[jobId]?.state == .dismissed else { continue }
            let placeholder = JobFeedItem.hidden(jobId: jobId, title: job.title, company: job.company, reasons: matchesById[jobId]?.dismissReasons ?? [])
            let position = Self.position(of: row(job), in: rows, sort: sort)
            let index = list.firstIndex { item in
                if case .job(let other) = item { return rows.firstIndex(of: other).map { $0 >= position } ?? false }
                return false
            } ?? list.endIndex
            list.insert(placeholder, at: index)
        }
        items = list
        jobCount = rows.count
        hasNoResults = rows.isEmpty && !scoped.isEmpty
        isFirstUse = data.jobs.isEmpty && data.savedSearches.isEmpty

        savedCount = data.jobs.count { job in
            if let application = applicationsByJob[job.id] { return application.status == .saved }
            return matchesById[job.id]?.state == .saved
        }
        savedSearchChips = savedSearches.map { search in
            let fresh = data.jobMatches.count { match in
                guard match.state == .new, let job = jobsById[match.id], job.createdAt >= search.createdAt else { return false }
                return Self.matches(job, query: search.query)
                    && Self.matches(job, filters: JobFeedFilters(criteria: search.filters), score: nil, now: now, calendar: calendar)
            }
            return SavedSearchChip(id: search.id, name: search.name, newCount: fresh, enabled: search.enabled)
        }
        hiddenJobs = data.jobMatches
            .filter { $0.state == .dismissed }
            .sorted { ($0.stateChangedAt ?? $0.computedAt) > ($1.stateChangedAt ?? $1.computedAt) }
            .compactMap { jobsById[$0.id].map(row) }
        offersSavingSearch = scope != .saved
            && (!text.isEmpty || !filters.criteria.isSameSearch(as: .none))
            && !data.savedSearches.contains { $0.query.caseInsensitiveCompare(text) == .orderedSame && $0.filters.isSameSearch(as: filters.criteria) }
        knownSources = Array(Set(data.jobs.flatMap { $0.sources.map(\.source) })).sorted()
        knownCountries = Array(Set(data.jobs.flatMap { $0.locations.compactMap { $0.countryCode?.uppercased() } })).sorted()
    }

    /// The scope's jobs before the query and filters: the matches (never a hidden one) or the
    /// Saved stage. Saved jobs without a match yet (a link import) belong to All matches too.
    private func scopedJobs() -> [Job] {
        let matchesById = Dictionary(data.jobMatches.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let applicationsByJob = Dictionary(
            data.applications.compactMap { application in application.jobId.map { ($0, application) } },
            uniquingKeysWith: { first, _ in first }
        )
        return data.jobs.filter { job in
            switch scope {
            case .all, .search:
                if let match = matchesById[job.id] { return match.state != .dismissed }
                return applicationsByJob[job.id] != nil
            case .saved:
                if let application = applicationsByJob[job.id] { return application.status == .saved }
                return matchesById[job.id]?.state == .saved
            }
        }
    }

    /// `jobs` narrowed by the query (or the last on-demand search for it) and `filters`.
    private func visible(_ jobs: [Job], filters: JobFeedFilters) -> [Job] {
        let scores = Dictionary(
            data.jobMatches.compactMap { match in match.basedOnCvId == nil ? nil : (match.id, match.score) },
            uniquingKeysWith: { first, _ in first }
        )
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let searchIds = searchResults.flatMap { $0.query.caseInsensitiveCompare(text) == .orderedSame ? Set($0.ids) : nil } ?? []
        return jobs.filter { job in
            (searchIds.contains(job.id) || Self.matches(job, query: text))
                && Self.matches(job, filters: filters, score: scores[job.id], now: now, calendar: calendar)
        }
    }

    /// "Show N jobs" in a filter sheet: what `filters` would leave in the current scope and query.
    public func resultCount(with filters: JobFeedFilters) -> Int {
        visible(scopedJobs(), filters: filters).count
    }

    private static func bandRank(_ band: MatchBand?) -> Int {
        band.flatMap { MatchBand.allCases.firstIndex(of: $0) } ?? MatchBand.allCases.count
    }

    private static func newerFirst(_ lhs: JobFeedRow, _ rhs: JobFeedRow) -> Bool {
        switch (lhs.postedAt, rhs.postedAt) {
        case let (left?, right?) where left != right: left > right
        case (.some, nil): true
        case (nil, .some): false
        default: (lhs.score ?? -1, rhs.id) > (rhs.score ?? -1, lhs.id)
        }
    }

    /// Where a hidden row sat in the sorted list.
    private static func position(of row: JobFeedRow, in rows: [JobFeedRow], sort: JobFeedSort) -> Int {
        rows.firstIndex { other in
            switch sort {
            case .bestMatch:
                let left = bandRank(row.band), right = bandRank(other.band)
                return left != right ? left < right : newerFirst(row, other)
            case .newest:
                return newerFirst(row, other)
            }
        } ?? rows.count
    }

    /// Every word of the query (or of one of its " OR " alternatives) appears in the title,
    /// company, skills, locations or description: the text job sources search.
    static func matches(_ job: Job, query: String) -> Bool {
        let fold = { (text: String) in text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil) }
        let alternatives = query.components(separatedBy: " OR ")
            .map { $0.split(whereSeparator: \.isWhitespace).map { fold(String($0)) } }
            .filter { !$0.isEmpty }
        guard !alternatives.isEmpty else { return true }
        let haystack = fold(([job.title, job.company] + job.skills + job.locations.map(\.label) + [job.remoteEligibility ?? "", job.description])
            .joined(separator: " "))
        return alternatives.contains { words in words.allSatisfy(haystack.contains) }
    }

    /// The saved-search criteria exactly as the server applies them (`passesSearchFilters`, so a
    /// saved search lists here what it alerts for), plus the feed-only refinements.
    static func matches(_ job: Job, filters: JobFeedFilters, score: Int?, now: Date, calendar: Calendar) -> Bool {
        guard passesSearchFilters(job, filters.criteria, now: now) else { return false }
        if filters.hidesUnstatedSalary, job.salary.map({ $0.min == nil && $0.max == nil }) ?? true { return false }
        if let band = filters.minimumBand {
            guard let score, let rank = MatchBand.allCases.firstIndex(of: matchBand(score)),
                  let wanted = MatchBand.allCases.firstIndex(of: band), rank <= wanted else { return false }
        }
        return true
    }

    /// "frontend · Remote" from the query and the main filter.
    private func defaultSearchName() -> String {
        var parts: [String] = []
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { parts.append(text) }
        if let country = filters.criteria.countryCodes.first {
            parts.append(Locale.current.localizedString(forRegionCode: country) ?? country)
        }
        if let remote = filters.criteria.remoteTypes.first { parts.append(String(localized: JobDetailViewStrings.workMode(remote))) }
        return parts.isEmpty ? String(localized: JobsStrings.defaultSearchName) : parts.joined(separator: " · ")
    }
}

/// The saved-search editor's fields.
public struct SavedSearchDraft: Hashable, Sendable {
    public var name: String
    public var query: String
    public var filters: SavedSearchFilters
    /// Off = no alerts (`enabled == false`).
    public var alertsOn: Bool
    public var schedule: SavedSearchSchedule
    public var dailyDigest: Bool
    /// Notify for matches at or above this band.
    public var threshold: MatchBand

    public init(
        name: String = "",
        query: String = "",
        filters: SavedSearchFilters = .none,
        alertsOn: Bool = true,
        schedule: SavedSearchSchedule = .daily,
        dailyDigest: Bool = true,
        threshold: MatchBand = .good
    ) {
        self.name = name
        self.query = query
        self.filters = filters
        self.alertsOn = alertsOn
        self.schedule = schedule
        self.dailyDigest = dailyDigest
        self.threshold = threshold
    }

    public init(_ search: SavedSearch) {
        self.init(
            name: search.name,
            query: search.query,
            filters: search.filters,
            alertsOn: search.enabled,
            schedule: search.schedule,
            dailyDigest: search.dailyDigest,
            threshold: Self.band(forThreshold: search.alertThreshold)
        )
    }

    /// A name and either a query or a filter.
    public var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (!query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !filters.isSameSearch(as: .none))
    }

    /// The band a stored 0–100 threshold falls in ("Strong" = 80+, "Good and above" = 65+,
    /// "All" = anything below).
    public static func band(forThreshold threshold: Int) -> MatchBand {
        if threshold >= MatchBand.thresholds.strong { return .strong }
        if threshold >= MatchBand.thresholds.good { return .good }
        return .stretch
    }

    static func threshold(for band: MatchBand) -> Int {
        switch band {
        case .strong: MatchBand.thresholds.strong
        case .good: MatchBand.thresholds.good
        case .partial: MatchBand.thresholds.partial
        case .stretch: 0
        }
    }

    func makeSearch(id: String, at date: Date) -> SavedSearch {
        SavedSearch(
            id: id,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            query: query.trimmingCharacters(in: .whitespacesAndNewlines),
            filters: filters,
            schedule: schedule,
            alertThreshold: Self.threshold(for: threshold),
            dailyDigest: dailyDigest,
            enabled: alertsOn,
            lastRunAt: nil,
            nextRunAt: alertsOn ? date : nil,
            createdAt: date,
            updatedAt: date
        )
    }

    func apply(to search: SavedSearch, at date: Date) -> SavedSearch {
        var updated = search
        updated.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        updated.filters = filters
        updated.schedule = schedule
        updated.dailyDigest = dailyDigest
        updated.enabled = alertsOn
        updated.alertThreshold = Self.threshold(for: threshold)
        if updated != search { updated.updatedAt = date }
        return updated
    }
}
