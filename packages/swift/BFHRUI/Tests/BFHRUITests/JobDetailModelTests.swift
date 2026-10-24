import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

@Suite("JobDetail model")
struct JobDetailModelTests {
    static let featured = "job-lighthouse-senior-frontend"

    let document: FixtureDocument
    let data: UserData

    init() throws {
        document = try FixtureStore.document(.populated)
        data = UserData(document)
    }

    func model(_ jobId: String = featured, data: UserData? = nil) -> JobDetailModel {
        let model = JobDetailModel(jobId: jobId, now: document.now)
        model.load(data ?? self.data)
        return model
    }

    func date(_ iso: String) -> Date {
        try! Date(iso, strategy: .iso8601)
    }

    // MARK: Derivations

    @Test("Featured job: header, salary provenance, description")
    func header() throws {
        let model = model()
        #expect(model.phase == .loaded)
        let header = try #require(model.header)
        #expect(header.title == "Senior Frontend Engineer")
        #expect(header.company == CompanyIdentity(name: "Lighthouse Learning", domain: "lighthouselearning.com"))
        #expect(header.remoteType == .remote)
        #expect(header.remoteEligibility == "Europe, UK and Türkiye")
        #expect(header.employmentType == .fullTime)
        #expect(header.seniority == .senior)
        #expect(header.postedAt == date("2026-10-21T07:30:00Z"))
        #expect(header.salary?.min == 70000 && header.salary?.max == 85000 && header.salary?.currency == "EUR")
        #expect(header.salaryProvenance == .statedByEmployer)
        #expect(model.hasDescription)
        #expect(!model.isDelisted)
    }

    @Test("Featured job: band, basis, counts, top reasons and gaps")
    func scoredMatch() throws {
        let match = try #require(model().match.scored)
        #expect(match.score == 84)
        #expect(match.band == .strong)
        #expect(match.basis == JobDetailModel.MatchBasis(cvId: "cv-en", cvRevisionId: "rev-en-3", cvTitle: "Base CV — English"))
        #expect(match.computedAt == date("2026-10-22T00:18:00Z"))
        #expect(match.requirementsMet == 2)
        #expect(match.requirementsTotal == 3)
        #expect(match.requirementsNotStated == 0)
        #expect(match.requirements.map(\.facet) == [.remote, .salary, .seniority])
        #expect(match.requirements.map(\.status) == [.met, .met, .partial])
        #expect(match.requirements.first?.evidence == MatchEvidence(from: .posting, quote: "Remote — Europe, UK and Türkiye"))
        #expect(match.skillsMatched == 5)
        #expect(match.skillsTotal == 6)
        #expect(match.gapCount == 1)
        // Impact `most` first (remote, skills), then the match's order (salary).
        #expect(match.topReasons.map(\.id) == ["reason.0", "reason.3", "reason.1"])
        #expect(match.topReasons.map(\.impact) == [.most, .most, .some])
        #expect(match.reasons.count == 5)
        #expect(match.topGaps.map(\.label) == ["Vue.js"])
        #expect(match.topGaps.first?.skill == "vue")
        #expect(match.topGaps.first?.isGap == true)
        #expect(match.unmatchedSkills == ["vue"])
        #expect(match.rationale?.hasPrefix("Senior Frontend Engineer at Lighthouse Learning") == true)
    }

    @Test("Top gaps put impact most first and stop at 2")
    func topGapsOrder() throws {
        let match = try #require(model("job-fjordline-frontend").match.scored)
        #expect(match.gapCount == 3)
        #expect(match.topGaps.count == 2)
        #expect(match.topGaps.allSatisfy { $0.impact == .most })
        #expect(match.rationale == nil)
    }

    @Test("Not-stated requirements count apart from met ones")
    func notStated() throws {
        let model = model("job-northbeam-frontend")
        let match = try #require(model.match.scored)
        #expect(match.requirementsTotal == 4)
        #expect(match.requirementsMet == 2)
        #expect(match.requirementsNotStated == 2)
        #expect(model.header?.salaryProvenance == .notStated)
        #expect(model.facts.first { $0.kind == .salary }?.value == .notStated)
    }

    @Test("Facts: Q&A rows in order, unknowns not stated")
    func facts() {
        let facts = model().facts
        #expect(facts.map(\.kind) == JobDetailModel.Fact.Kind.allCases)
        let value = Dictionary(uniqueKeysWithValues: facts.map { ($0.kind, $0.value) })
        #expect(value[.workMode] == .workMode(.remote))
        #expect(value[.whereTheyHire] == .eligibility("Europe, UK and Türkiye"))
        #expect(value[.visaSponsorship] == .notStated)
        #expect(value[.relocation] == JobDetailModel.Fact.Value.no)
        #expect(value[.employmentType] == .employmentType(.fullTime))
        #expect(value[.lastSeen] == .date(date("2026-10-22T02:42:00Z")))
        #expect(facts.first { $0.kind == .visaSponsorship }?.isStated == false)

        let pixelpost = Dictionary(uniqueKeysWithValues: model("job-pixelpost-design-systems").facts.map { ($0.kind, $0.value) })
        #expect(pixelpost[.visaSponsorship] == JobDetailModel.Fact.Value.yes)
        #expect(pixelpost[.whereTheyHire] == .locations([JobLocation(label: "Berlin (Mitte), hybrid", city: "Berlin", countryCode: "DE")]))
    }

    @Test("Sources: direct above boards, differing salary, used for Apply")
    func sources() {
        let model = model()
        let sources = model.sources
        #expect(sources.total == 3)
        #expect(sources.direct.map(\.source) == ["workable"])
        #expect(sources.boards.map(\.source) == ["remotive", "jooble"])
        #expect(sources.direct.first?.usedForApply == true)
        #expect(sources.boards.allSatisfy { !$0.usedForApply })
        #expect(sources.direct.first?.id == "workable:5E7A9C1B3D")
        #expect(sources.boards.first?.postedAt == date("2026-10-21T12:18:00Z"))
        #expect(sources.boards.first?.differingSalary == nil)
        #expect(sources.boards.last?.differingSalary?.min == 75000)
        #expect(sources.all.allSatisfy { $0.differingTitle == nil })
        #expect(model.originalPostingURL == URL(string: "https://apply.workable.com/lighthouse-learning/j/5E7A9C1B3D/"))
    }

    @Test("Apply route: company site, board, email, applied")
    func applyRoutes() {
        let featured = model()
        #expect(featured.applyRoute == .companySite(url: URL(string: "https://apply.workable.com/lighthouse-learning/j/5E7A9C1B3D/")!))
        #expect(featured.applicationStatus == nil && featured.applicationId == nil)

        #expect(model("job-aire-frontend").applyRoute == .board(name: "reed", url: URL(string: "https://www.reed.co.uk/jobs/frontend-engineer/53300114")!))
        #expect(model("job-halden-product").applyRoute == .applied(date: date("2026-10-20T07:30:00Z"), applicationId: "app-halden"))

        let brisk = model("job-brisk-frontend")
        #expect(brisk.applyRoute == .applied(date: date("2026-10-11T07:30:00Z"), applicationId: "app-brisk"))
        #expect(brisk.applicationStatus == .acknowledged)
        // Past Saved, the status replaces the bookmark (D02).
        #expect(!brisk.isSaved)
        #expect(!brisk.canToggleSave)

        // A side exit after applying still reads as applied.
        #expect(model("job-helio-frontend").applyRoute == .applied(date: date("2026-08-23T07:30:00Z"), applicationId: "app-helio"))

        // Saved application: not applied yet, the route stays the posting's.
        let sail = model("job-sail-product")
        #expect(sail.applicationStatus == .saved)
        #expect(sail.applyRoute == .companySite(url: URL(string: "https://jobs.ashbyhq.com/sailanalytics/0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f")!))
    }

    @Test("Apply route falls back to the apply email without an application")
    func emailRoute() {
        var data = self.data
        data.applications.removeAll { $0.jobId == "job-halden-product" }
        #expect(model("job-halden-product", data: data).applyRoute == .email(address: "careers@haldenfreight.co.uk"))
    }

    @Test("Missing job fails as not found")
    func notFound() {
        let model = model("job-does-not-exist")
        #expect(model.phase == .failed(LoadFailure(.notFound, details: "jobs/job-does-not-exist")))
        #expect(model.header == nil)
        #expect(model.match == .pending)
    }

    @Test("No match is pending; a match without a CV asks for one")
    func pendingAndNoCV() throws {
        var data = self.data
        data.jobMatches.removeAll { $0.id == Self.featured }
        let pending = model(data: data)
        #expect(pending.match == .pending)
        // No match yet: Save still works (D02, an application in Saved); Not for me needs one.
        #expect(pending.canToggleSave && !pending.canHide)
        #expect(pending.toggleSave() != nil)
        #expect(pending.data.application(forJob: Self.featured)?.status == .saved)
        #expect(pending.hide() == nil)

        data = self.data
        let index = try #require(data.jobMatches.firstIndex { $0.id == Self.featured })
        data.jobMatches[index].basedOnCvId = nil
        #expect(model(data: data).match == .noCV)
    }

    @Test("Delisted when expiresAt is before now")
    func delisted() throws {
        var data = self.data
        let index = try #require(data.jobs.firstIndex { $0.id == Self.featured })
        data.jobs[index].expiresAt = document.now.addingTimeInterval(-60)
        #expect(model(data: data).isDelisted)
        data.jobs[index].expiresAt = document.now.addingTimeInterval(60)
        #expect(!model(data: data).isDelisted)
    }

    // MARK: Design

    @Test("Design populated picks the featured job deterministically")
    func designPopulated() {
        #expect(DesignScenario.featuredJobId(in: data) == Self.featured)
        let model = DesignScenario(screen: .jobDetail, dataset: .populated).jobDetailModel()
        #expect(model.jobId == Self.featured)
        #expect(model.phase == .loaded)
        #expect(model.now == document.now)
    }

    @Test("Design empty shows no description and a pending match")
    func designEmpty() throws {
        let model = DesignScenario(screen: .jobDetail, dataset: .empty).jobDetailModel()
        #expect(model.phase == .loaded)
        #expect(model.header?.title == "Senior Frontend Engineer")
        #expect(!model.hasDescription)
        #expect(model.match == .pending)
        #expect(model.applicationStatus == nil)
        #expect(!model.isSaved && !model.isHidden)
        #expect(model.data.profile?.id == (try FixtureStore.document(.empty)).profile.id)
    }

    @Test("Design conditions reach the model")
    func designConditions() {
        #expect(DesignScenario(screen: .jobDetail, condition: .loading).jobDetailModel().phase == .loading)
        #expect(DesignScenario(screen: .jobDetail, condition: .error).jobDetailModel().phase == .failed(LoadFailure(.network, details: "Design scenario (-BFHRState error)")))
        #expect(DesignScenario(screen: .jobDetail, condition: .offline).jobDetailModel().connection.isOffline)
    }

    // MARK: Mutations

    @Test("Save shows a toast and Undo unsaves")
    func save() throws {
        let model = model()
        #expect(!model.isSaved && model.canToggleSave)
        let toast = try #require(model.toggleSave())
        #expect(model.isSaved)
        #expect(model.data.match(forJob: Self.featured)?.state == .saved)
        // D02: one batch writes the Saved application, its created event and the match state.
        let application = try #require(model.data.application(forJob: Self.featured))
        #expect(application.status == .saved)
        #expect(model.data.events(forApplication: application.id).map(\.type) == [.created])
        #expect(toast.resolvedMessage == "Saved to your list")
        #expect(toast.glyph == ToastGlyph.saved)
        #expect(toast.action?.role == .undo)
        toast.action?.perform()
        #expect(!model.isSaved)
        #expect(model.data.match(forJob: Self.featured)?.state == .new)
        #expect(model.data.application(forJob: Self.featured) == nil)
    }

    @Test("Unsave is silent")
    func unsave() {
        let model = model("job-gridline-product")
        #expect(model.isSaved && model.canToggleSave)
        #expect(model.toggleSave() == nil)
        #expect(!model.isSaved)
        #expect(model.data.match(forJob: "job-gridline-product")?.state == .new)
    }

    @Test("Hide shows the D19 toast; Undo and unhide restore")
    func hide() throws {
        let model = model()
        let toast = try #require(model.hide(reasons: [.salary, .location]))
        #expect(model.isHidden)
        #expect(model.hiddenReasons == [.salary, .location])
        #expect(!model.canHide)
        #expect(toast.resolvedMessage == "Hidden from your feed")
        #expect(toast.glyph == ToastGlyph.hidden)
        toast.action?.perform()
        #expect(!model.isHidden)
        #expect(model.hiddenReasons.isEmpty)
        #expect(model.data.match(forJob: Self.featured)?.state == .new)

        _ = model.hide()
        #expect(model.isHidden)
        model.unhide()
        #expect(!model.isHidden)
        #expect(model.data.match(forJob: Self.featured)?.state == .new)
    }

    @Test("Hiding a saved job and undoing keeps it saved")
    func hideSavedUndo() throws {
        let model = model("job-gridline-product")
        let toast = try #require(model.hide())
        #expect(!model.isSaved && model.isHidden)
        toast.action?.perform()
        #expect(model.isSaved && !model.isHidden)
    }

    @Test("Tell us why sets the hidden job's reasons; nothing happens while it's visible")
    func hiddenReasons() throws {
        let model = model()
        #expect(model.setHiddenReasons([.salary]) == nil)
        let hideToast = try #require(model.hide())
        let toast = try #require(model.setHiddenReasons([.location, .seniority]))
        #expect(model.isHidden)
        #expect(model.hiddenReasons == [.location, .seniority])
        #expect(model.data.match(forJob: Self.featured)?.dismissReasons == [.location, .seniority])
        #expect(toast.action == nil)
        #expect(toast.resolvedMessage == "Thanks. We'll use this to tune your matches.")
        // The hide toast's Undo still restores the job as it was before Not for me.
        hideToast.action?.perform()
        #expect(!model.isHidden && model.hiddenReasons.isEmpty)
    }

    @Test("AI summary rating toggles, and needs a summary")
    func rateSummary() {
        let model = model()
        #expect(model.summaryFeedback == nil)
        model.rateSummary(.helpful)
        #expect(model.summaryFeedback == .helpful)
        model.rateSummary(.notHelpful)
        #expect(model.summaryFeedback == .notHelpful)
        model.rateSummary(.notHelpful)
        #expect(model.summaryFeedback == nil)

        let pending = JobDetailModel(jobId: Self.featured, now: document.now)
        pending.load(UserData(profile: data.profile, jobs: data.jobs))
        pending.rateSummary(.helpful)
        #expect(pending.summaryFeedback == nil)
    }

    @Test("Skill keys read as the gap or the posting spells them")
    func skillLabels() throws {
        let model = model()
        let match = try #require(model.match.scored)
        #expect(match.label(forSkill: "vue") == "Vue.js")
        #expect(match.label(forSkill: "typescript") == "TypeScript")
        #expect(match.label(forSkill: "design systems") == "design systems")
        #expect(match.label(forSkill: "unknown-skill") == "unknown-skill")
        _ = model.markHaveSkill("vue")
        #expect(model.match.scored?.label(forSkill: "vue") == "Vue.js")
    }

    @Test("Salary, relative time and source names format for display")
    func formatting() throws {
        let en = Locale(identifier: "en_US")
        let range = SalaryRange(min: 70_000, max: 85_000, currency: "EUR", period: .year, estimated: false)
        #expect(JobDetailFormat.salary(range, locale: en) == "€70K–€85K a year")
        let from = SalaryRange(min: 70_000, max: nil, currency: "EUR", period: .month, estimated: false)
        #expect(JobDetailFormat.salary(from, locale: en) == "From €70K a month")
        #expect(JobDetailFormat.salary(SalaryRange(min: nil, max: nil, currency: "EUR", period: .year, estimated: false), locale: en) == nil)
        #expect(JobDetailFormat.sourceName("smartrecruiters") == "SmartRecruiters")
        #expect(JobDetailFormat.sourceName("company_site") == "Company Site")
        #expect(JobDetailFormat.relativeTime(date("2026-10-22T00:18:00Z"), now: document.now, locale: en, calendar: .current) == "7 hours ago")
    }

    @Test("I have this moves the skill and drops its gap; Undo restores", arguments: ["vue", "Vue.js"])
    func markHaveSkill(skill: String) throws {
        let model = model()
        let toast = try #require(model.markHaveSkill(skill))
        let match = try #require(model.match.scored)
        #expect(match.matchedSkills.contains("vue"))
        #expect(match.unmatchedSkills.isEmpty)
        #expect(match.skillsMatched == 6 && match.skillsTotal == 6)
        #expect(match.gapCount == 0 && match.topGaps.isEmpty)
        #expect(toast.resolvedMessage == "Vue.js added to your skills")
        #expect(toast.glyph == ToastGlyph.confirmed)
        toast.action?.perform()
        let restored = try #require(model.match.scored)
        #expect(restored.unmatchedSkills == ["vue"])
        #expect(restored.gapCount == 1)
        #expect(restored.skillsMatched == 5)
    }

    @Test("I have this matches .js names and ignores unknown skills")
    func markHaveSkillMatching() throws {
        let model = model("job-northbeam-frontend")
        #expect(model.markHaveSkill("Rust") == nil)
        #expect(model.markHaveSkill("three.js") != nil)
        let match = try #require(model.match.scored)
        #expect(match.unmatchedSkills.isEmpty && match.gapCount == 0)
    }

    @Test("Writes are pending only while offline")
    func offline() throws {
        let model = model()
        _ = model.toggleSave()
        #expect(model.pendingSyncIDs.isEmpty)
        model.connection = .offline(lastSyncedAt: document.now)
        _ = try #require(model.hide())
        #expect(model.pendingSyncIDs == [Self.featured])
        #expect(model.isPendingSync)
    }
}
