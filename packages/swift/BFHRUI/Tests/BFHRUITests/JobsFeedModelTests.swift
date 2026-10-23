import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

/// `jobsSearch` / `savedSearchRunNow` returning canned results.
final class FakeJobSearch: JobSearchService {
    var response: JobsSearchResponse
    var error: JobSearchError?
    var requests: [(query: String, filters: SavedSearchFilters)] = []
    var runs: [String] = []

    init(response: JobsSearchResponse) {
        self.response = response
    }

    func search(query: String, filters: SavedSearchFilters) async throws(JobSearchError) -> JobsSearchResponse {
        requests.append((query, filters))
        if let error { throw error }
        return response
    }

    func runSavedSearch(id: String) async throws(JobSearchError) -> JobsSearchResponse {
        runs.append(id)
        if let error { throw error }
        return response
    }
}

@Suite("Jobs feed model")
struct JobsFeedModelTests {
    static let featured = "job-lighthouse-senior-frontend"

    let document: FixtureDocument
    let data: UserData

    init() throws {
        document = try FixtureStore.document(.populated)
        data = UserData(document)
    }

    func model(data: UserData? = nil) -> JobsFeedModel {
        let model = JobsFeedModel(now: document.now)
        model.load(data ?? self.data)
        return model
    }

    func rows(_ model: JobsFeedModel) -> [JobFeedRow] {
        model.items.compactMap { if case .job(let row) = $0 { row } else { nil } }
    }

    /// Lets the writer's `Task` run.
    func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    // MARK: Scopes and order

    @Test("All matches lists every match that isn't hidden; Saved lists the Saved stage")
    func scopes() {
        let model = model()
        let hidden = Set(data.jobMatches.filter { $0.state == .dismissed }.map(\.id))
        #expect(model.jobCount == data.jobMatches.count - hidden.count)
        #expect(rows(model).allSatisfy { !hidden.contains($0.id) })
        model.scope = .saved
        let saved = Set(rows(model).map(\.id))
        #expect(saved.contains("job-sail-product"))
        #expect(!saved.contains("job-lumenpay-frontend")) // Offer: in the Tracker, not Saved
        #expect(model.savedCount == saved.count)
        #expect(model.hiddenJobs.count == hidden.count)
        #expect(!model.isFirstUse)
    }

    @Test("Best match sorts by band, then newest; Newest by date")
    func order() {
        let model = model()
        let bands = rows(model).map { $0.band.flatMap { MatchBand.allCases.firstIndex(of: $0) } ?? 4 }
        #expect(bands == bands.sorted())
        model.sort = .newest
        let dates = rows(model).compactMap(\.postedAt)
        #expect(dates == dates.sorted(by: >))
    }

    @Test("A tracked job shows its status instead of the bookmark")
    func trackedRow() throws {
        let row = try #require(rows(model()).first { $0.id == "job-lumenpay-frontend" })
        #expect(row.trackedStatus == .offer)
        #expect(!row.canToggleSave)
    }

    // MARK: Query and filters

    @Test("The query matches every word, or any OR alternative")
    func query() throws {
        let job = try #require(data.job(id: Self.featured))
        #expect(JobsFeedModel.matches(job, query: "senior frontend"))
        #expect(!JobsFeedModel.matches(job, query: "senior plumber"))
        #expect(JobsFeedModel.matches(job, query: "plumber OR frontend"))
        #expect(JobsFeedModel.matches(job, query: ""))
    }

    @Test("Filters narrow the list; a chip resets one; zero results is its own state")
    func filters() {
        let model = model()
        let all = model.jobCount
        model.filters.criteria.remoteTypes = [.remote]
        #expect(model.filters.activeCount == 1)
        #expect(model.jobCount < all)
        #expect(rows(model).allSatisfy { $0.remoteType == .remote || $0.remoteType == nil })
        #expect(model.resultCount(with: model.filters) == model.jobCount)
        model.filters.minimumBand = .strong
        #expect(rows(model).allSatisfy { ($0.score ?? 0) >= MatchBand.thresholds.strong })
        model.query = "no job is called this"
        #expect(model.items.isEmpty && model.hasNoResults)
        model.query = ""
        model.filters.reset(.match)
        model.filters.reset(.remote)
        #expect(model.jobCount == all)
    }

    @Test("The salary filter compares in years and lets unstated salaries through unless hidden")
    func salary() throws {
        let job = try #require(data.jobs.first { $0.salary?.currency == "EUR" && $0.salary?.max != nil })
        var filters = JobFeedFilters()
        filters.criteria.salaryMin = SalaryMinimum(amount: (job.salary?.max ?? 0) + 1, currency: "EUR", period: .year)
        #expect(!JobsFeedModel.matches(job, filters: filters, score: nil, now: document.now, calendar: .current))
        var unstated = job
        unstated.salary = nil
        #expect(JobsFeedModel.matches(unstated, filters: filters, score: nil, now: document.now, calendar: .current))
        filters.hidesUnstatedSalary = true
        #expect(!JobsFeedModel.matches(unstated, filters: filters, score: nil, now: document.now, calendar: .current))
    }

    // MARK: Save (D02)

    @Test("Save writes the Saved application, its event and the match in one batch; Undo unsaves")
    func save() async throws {
        let model = model()
        let writer = RecordingWriter()
        model.writer = writer
        let toast = try #require(model.toggleSave(Self.featured))
        #expect(toast.resolvedMessage == "Lighthouse Learning · saved")
        await settle()
        let batch = try #require(writer.batches.first)
        #expect(batch.applications.count == 1)
        guard case .created(let application) = batch.applications.first else { Issue.record("no application"); return }
        #expect(application.status == .saved && application.jobId == Self.featured)
        #expect(batch.applicationEvents.map(\.type) == [.created])
        #expect(batch.jobMatches.count == 1)
        #expect(rows(model).first { $0.id == Self.featured }?.isSaved == true)

        toast.action?.perform()
        await settle()
        #expect(writer.batches.count == 2)
        guard case .deleted = writer.batches[1].applications.first else { Issue.record("not deleted"); return }
        #expect(rows(model).first { $0.id == Self.featured }?.isSaved == false)
    }

    // MARK: Not for me

    @Test("Not for me leaves an inline Undo row; reasons and Undo write the match")
    func hide() throws {
        let model = model()
        let before = model.jobCount
        #expect(model.hide(Self.featured))
        #expect(model.jobCount == before - 1)
        #expect(model.items.contains(.hidden(jobId: Self.featured, title: "Senior Frontend Engineer", company: "Lighthouse Learning", reasons: [])))
        let toast = try #require(model.setHiddenReasons(Self.featured, reasons: [.salary]))
        #expect(toast.resolvedMessage == "Thanks. We'll use this to tune your matches.")
        #expect(model.hiddenReasons(Self.featured) == [.salary])
        #expect(model.hiddenJobs.contains { $0.id == Self.featured })
        model.unhide(Self.featured)
        #expect(model.jobCount == before)
        #expect(!model.items.contains { if case .hidden = $0 { true } else { false } })
    }

    // MARK: Saved searches

    @Test("A saved search scopes the feed with its query and filters")
    func savedSearchScope() throws {
        let model = model()
        let search = try #require(data.savedSearches.first)
        model.scope = .search(search.id)
        #expect(model.query == search.query)
        #expect(model.filters.criteria == search.filters)
        #expect(!model.offersSavingSearch)
        model.scope = .all
        #expect(model.query.isEmpty && model.filters.isEmpty)
    }

    @Test("Get alerts saves the current search with the defaults and selects it")
    func saveCurrentSearch() async throws {
        let model = model()
        let writer = RecordingWriter()
        model.writer = writer
        model.query = "platform engineer"
        model.filters.criteria.remoteTypes = [.remote]
        #expect(model.offersSavingSearch)
        var edited: String?
        let toast = model.saveCurrentSearch { edited = $0 }
        #expect(toast.resolvedMessage == "Search saved")
        await settle()
        guard case .created(let search) = writer.batches.first?.savedSearches.first else { Issue.record("no search"); return }
        #expect(search.query == "platform engineer" && search.filters.remoteTypes == [.remote])
        #expect(search.schedule == .daily && search.enabled && search.dailyDigest)
        #expect(search.alertThreshold == MatchBand.thresholds.good)
        #expect(search.nextRunAt == document.now)
        #expect(model.scope == .search(search.id))
        #expect(!model.offersSavingSearch)
        toast.action?.perform()
        #expect(edited == search.id)
    }

    @Test("Editing asks for a run when alerts or the schedule change; delete has Undo")
    func editAndDelete() async throws {
        let model = model()
        let writer = RecordingWriter()
        model.writer = writer
        let search = try #require(data.savedSearches.first)
        var draft = SavedSearchDraft(search)
        #expect(draft.threshold == .strong)
        draft.schedule = .weekly
        draft.threshold = .good
        model.updateSavedSearch(search.id, with: draft)
        let updated = try #require(model.savedSearch(id: search.id))
        #expect(updated.schedule == .weekly && updated.alertThreshold == MatchBand.thresholds.good)
        #expect(updated.nextRunAt == document.now)

        let toast = try #require(model.deleteSavedSearch(search.id))
        #expect(model.savedSearch(id: search.id) == nil)
        toast.action?.perform()
        #expect(model.savedSearch(id: search.id) != nil)
        await settle()
        #expect(writer.batches.count == 3)
    }

    @Test("A draft needs a name and a query or a filter")
    func draftValidity() {
        #expect(!SavedSearchDraft().isValid)
        #expect(!SavedSearchDraft(name: "x").isValid)
        #expect(SavedSearchDraft(name: "x", query: "react").isValid)
        var draft = SavedSearchDraft(name: "x")
        draft.filters.remoteTypes = [.remote]
        #expect(draft.isValid)
    }

    // MARK: Searching job sources

    @Test("Searching job sources keeps the ranked results in the list for that query")
    func searchSources() async throws {
        let model = model()
        let ids = ["job-zuiderzee-webgl"]
        let service = FakeJobSearch(response: JobsSearchResponse(
            jobIds: ids,
            counts: JobsSearchCounts(found: 1, created: 1, updated: 0, matched: 1),
            sources: [SourceRunReport(source: "adzuna", status: .skipped, reason: .noKey, count: 0)]
        ))
        model.searchService = service
        model.query = "nothing matches this text locally"
        #expect(model.items.isEmpty)
        await model.searchSources()
        #expect(service.requests.first?.query == "nothing matches this text locally")
        guard case .finished(_, let outcome) = model.searchState else { Issue.record("not finished"); return }
        #expect(outcome.counts.created == 1)
        #expect(rows(model).map(\.id) == ids)

        service.error = .rateLimited
        await model.searchSources()
        #expect(model.searchState == .failed(query: "nothing matches this text locally", error: .rateLimited))
    }

    @Test("Offline, searching job sources says so without calling the server")
    func searchOffline() async {
        let model = model()
        let service = FakeJobSearch(response: JobsSearchResponse(jobIds: [], counts: JobsSearchCounts(found: 0, created: 0, updated: 0, matched: 0), sources: []))
        model.searchService = service
        model.connection = .offline(lastSyncedAt: nil)
        model.query = "frontend"
        await model.searchSources()
        #expect(service.requests.isEmpty)
        #expect(model.searchState == .failed(query: "frontend", error: .offline))
    }

    // MARK: Empty account and links

    @Test("An empty account is the first-use state")
    func firstUse() throws {
        let model = model(data: UserData(try FixtureStore.document(.empty)))
        #expect(model.isFirstUse && model.items.isEmpty)
    }

    @Test("Jobs links open the job, Apply, Saved, a saved search and Hidden jobs")
    func links() {
        #expect(JobsRoute.destination(for: URL(string: "bruteforcehr://jobs")!) == nil)
        #expect(JobsRoute.destination(for: URL(string: "bruteforcehr://jobs/abc")!)?.path == [.job("abc")])
        #expect(JobsRoute.destination(for: URL(string: "bruteforcehr://jobs/abc/apply")!)?.applyJobId == "abc")
        #expect(JobsRoute.destination(for: URL(string: "bruteforcehr://jobs/saved")!)?.scope == .saved)
        #expect(JobsRoute.destination(for: URL(string: "bruteforcehr://jobs/searches/s1")!)?.scope == .search("s1"))
        #expect(JobsRoute.destination(for: URL(string: "bruteforcehr://jobs/hidden")!)?.path == [.savedSearches, .hiddenJobs])
    }
}
