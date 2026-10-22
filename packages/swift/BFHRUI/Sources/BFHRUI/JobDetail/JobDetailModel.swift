import BFHRCore
import Foundation
import Observation

/// Job detail + match explanation (docs/design/research/job-detail.md "Decision — iOS"): one job,
/// its match against the selected CV, facts, description, sources and the apply route.
@Observable
public final class JobDetailModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    public let jobId: String
    public let now: Date
    public let calendar: Calendar

    private(set) var data = UserData.empty

    // MARK: Derived state

    /// Nil until a load finds the job.
    public private(set) var header: Header?
    public private(set) var match: MatchSummary = .pending
    /// Work mode · Where they hire · Visa sponsorship · Relocation · Employment type · Salary ·
    /// Last seen, in that order.
    public private(set) var facts: [Fact] = []
    /// The posting text. Empty: "This posting has no description. Open the original posting".
    public private(set) var description = ""
    /// `expiresAt` is before `now`: "This job is no longer listed" above the saved copy.
    public private(set) var isDelisted = false
    public private(set) var sources = Sources(direct: [], boards: [])
    /// The posting to open for "Open original posting": the apply source, else the first direct
    /// source, else the first board.
    public private(set) var originalPostingURL: URL?
    /// Nil when the job has no apply link, email or source URL.
    public private(set) var applyRoute: ApplyRoute?
    /// The tracker application made from this job, if any.
    public private(set) var applicationId: String?
    public private(set) var applicationStatus: ApplicationStatus?
    /// The match is saved, or the job's application sits in Saved.
    public private(set) var isSaved = false
    /// The user chose "Not for me": the "Hidden from your feed · Undo" banner.
    public private(set) var isHidden = false
    public private(set) var hiddenReasons: [DismissReason] = []
    /// The bookmark toggles the match's saved state. Off while there's no match yet, and once the
    /// job is in the Tracker (the application owns it there).
    public private(set) var canToggleSave = false
    /// "Not for me" needs a match document to write to.
    public private(set) var canHide = false
    /// 👍 / 👎 on the AI summary; nil until the user rates it. Kept per job for this session
    /// until the feedback write lands with the matching pipeline (M4).
    public private(set) var summaryFeedback: SummaryFeedback?

    public var hasDescription: Bool { !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    /// The job's match changed offline and hasn't synced (`SyncGlyph`).
    public var isPendingSync: Bool { pendingSyncIDs.contains(jobId) }

    public init(jobId: String, now: Date = .now, calendar: Calendar = .current) {
        self.jobId = jobId
        self.now = now
        self.calendar = calendar
    }

    public func load(_ data: UserData) {
        self.data = data
        guard data.job(id: jobId) != nil else {
            recompute()
            phase = .failed(LoadFailure(.notFound, details: "jobs/\(jobId)"))
            return
        }
        recompute()
        phase = .loaded
    }

    // MARK: Actions

    /// Saves or unsaves the job. Saving returns "Saved to your list · Undo"; unsaving is silent
    /// (nil). Does nothing when `canToggleSave` is false.
    @discardableResult
    public func toggleSave() -> ToastItem? {
        guard canToggleSave, let current = data.match(forJob: jobId) else { return nil }
        let target: JobMatchState = current.state == .saved ? .new : .saved
        data.setMatchState(jobId, to: target, at: now)
        commit()
        guard target == .saved else { return nil }
        return ToastItem(
            glyph: ToastGlyph.saved,
            message: JobDetailStrings.savedToast,
            action: .undo { [weak self] in self?.restoreState(of: current) }
        )
    }

    /// "Not for me": hides the job from the feed with optional reasons. Returns "Hidden from your
    /// feed · Undo"; nil when `canHide` is false.
    @discardableResult
    public func hide(reasons: [DismissReason] = []) -> ToastItem? {
        guard canHide, let current = data.match(forJob: jobId) else { return nil }
        data.setMatchState(jobId, to: .dismissed, reasons: reasons, at: now)
        commit()
        return ToastItem(
            glyph: ToastGlyph.hidden,
            message: JobDetailStrings.hiddenToast,
            action: .undo { [weak self] in self?.restoreState(of: current) }
        )
    }

    /// The hidden banner's Undo: back to a new match.
    public func unhide() {
        guard isHidden else { return }
        data.setMatchState(jobId, to: .new, at: now)
        commit()
    }

    /// The reason sheet's Save reason on a hidden job: replaces the hidden job's reasons
    /// (empty = none given). Returns "Thanks. We'll use this to tune your matches."; nil when the
    /// job isn't hidden.
    @discardableResult
    public func setHiddenReasons(_ reasons: [DismissReason]) -> ToastItem? {
        guard isHidden else { return nil }
        data.setMatchState(jobId, to: .dismissed, reasons: reasons, at: now)
        commit()
        return ToastItem(glyph: ToastGlyph.confirmed, message: JobDetailStrings.reasonsSavedToast)
    }

    /// Rates the AI summary; rating it the same way again clears the rating.
    public func rateSummary(_ feedback: SummaryFeedback) {
        guard match.scored?.rationale != nil else { return }
        summaryFeedback = summaryFeedback == feedback ? nil : feedback
    }

    /// "I have this" on a skill gap: moves `skill` (an unmatched skill or a skill gap's label) to
    /// the matched skills and drops its gap. Returns "{skill} added to your skills · Undo"; nil
    /// when the skill isn't unmatched or a gap.
    @discardableResult
    public func markHaveSkill(_ skill: String) -> ToastItem? {
        guard let current = data.match(forJob: jobId), let shown = data.markHaveSkill(skill, forJob: jobId) else { return nil }
        commit()
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: JobDetailStrings.skillAddedToast(shown),
            action: .undo { [weak self] in
                guard let self else { return }
                data.setMatchSkills(jobId, skills: current.skills, gaps: current.gaps)
                commit()
            }
        )
    }

    private func restoreState(of previous: JobMatch) {
        data.restoreMatchState(jobId, from: previous)
        commit()
    }

    private func commit() {
        recordWrite(jobId)
        recompute()
    }

    // MARK: Derivation

    private func recompute() {
        guard let job = data.job(id: jobId) else {
            header = nil
            match = .pending
            facts = []
            description = ""
            isDelisted = false
            sources = Sources(direct: [], boards: [])
            originalPostingURL = nil
            applyRoute = nil
            applicationId = nil
            applicationStatus = nil
            isSaved = false
            isHidden = false
            hiddenReasons = []
            canToggleSave = false
            canHide = false
            return
        }
        let jobMatch = data.match(forJob: jobId)
        let application = data.application(forJob: jobId)
        let statedSalary = job.salary.flatMap { $0.min != nil || $0.max != nil ? $0 : nil }

        header = Header(
            title: job.title,
            company: CompanyIdentity(name: job.company, domain: job.companyDomain),
            locations: job.locations,
            remoteType: job.remoteType,
            remoteEligibility: job.remoteEligibility,
            employmentType: job.employmentType,
            seniority: job.seniority,
            postedAt: job.postedAt,
            salary: statedSalary,
            salaryProvenance: statedSalary.map { $0.estimated ? .estimated : .statedByEmployer } ?? .notStated
        )
        match = Self.summary(of: jobMatch, cvs: data.cvs)
        facts = Self.facts(of: job, salary: statedSalary)
        description = job.description
        isDelisted = job.expiresAt.map { $0 < now } ?? false

        let rows = job.sources.map { Self.source($0, of: job) }
        sources = Sources(direct: rows.filter(\.isDirectFromEmployer), boards: rows.filter { !$0.isDirectFromEmployer })
        originalPostingURL = (rows.first(where: \.usedForApply) ?? sources.all.first)?.url

        applicationId = application?.id
        applicationStatus = application?.status
        applyRoute = Self.applyRoute(for: job, sources: rows, application: application)

        isSaved = jobMatch?.state == .saved || application?.status == .saved
        isHidden = jobMatch?.state == .dismissed
        hiddenReasons = isHidden ? jobMatch?.dismissReasons ?? [] : []
        canToggleSave = jobMatch != nil && application == nil
        canHide = jobMatch != nil && !isHidden
    }

    private static func summary(of jobMatch: JobMatch?, cvs: [Cv]) -> MatchSummary {
        guard let jobMatch else { return .pending }
        guard let cvId = jobMatch.basedOnCvId else { return .noCV }
        let reasons = jobMatch.reasons.enumerated().map { factor($1, origin: .reason, index: $0, unmatched: []) }
        let gaps = jobMatch.gaps.enumerated().map { factor($1, origin: .gap, index: $0, unmatched: jobMatch.skills.unmatched) }
        let requirements = (reasons + gaps)
            .filter { $0.kind == .requirement }
            .enumerated()
            .sorted { (facetOrder($0.element.facet), $0.offset) < (facetOrder($1.element.facet), $1.offset) }
            .map(\.element)
        let skills = jobMatch.skills
        return .scored(ScoredMatch(
            score: jobMatch.score,
            band: matchBand(jobMatch.score),
            basis: MatchBasis(
                cvId: cvId,
                cvRevisionId: jobMatch.basedOnCvRevisionId,
                cvTitle: cvs.first { $0.id == cvId }?.title
            ),
            computedAt: jobMatch.computedAt,
            requirementsMet: requirements.count { $0.status == .met },
            requirementsTotal: requirements.count,
            requirementsNotStated: requirements.count { $0.status == .notStated },
            skillsMatched: skills.matched.count,
            skillsTotal: skills.matched.count + skills.unmatched.count,
            gapCount: gaps.count,
            topReasons: Array(byImpact(reasons).prefix(3)),
            topGaps: Array(byImpact(gaps).prefix(2)),
            reasons: reasons,
            gaps: gaps,
            requirements: requirements,
            matchedSkills: skills.matched,
            unmatchedSkills: skills.unmatched,
            rationale: jobMatch.rationale.flatMap { $0.isEmpty ? nil : $0 }
        ))
    }

    private static func factor(_ factor: MatchFactor, origin: Factor.Origin, index: Int, unmatched: [String]) -> Factor {
        let skill = factor.kind == .skill && origin == .gap
            ? unmatched.first { SkillKey($0) == SkillKey(factor.label) }
            : nil
        return Factor(
            id: "\(origin.rawValue).\(index)",
            origin: origin,
            kind: factor.kind,
            facet: factor.facet,
            label: factor.label,
            status: factor.status,
            impact: factor.impact,
            evidence: factor.evidence,
            source: factor.source,
            skill: skill
        )
    }

    /// Impact `most` first; ties keep the match's order.
    private static func byImpact(_ factors: [Factor]) -> [Factor] {
        factors.enumerated()
            .sorted { ($0.element.impact == .most ? 0 : 1, $0.offset) < ($1.element.impact == .most ? 0 : 1, $1.offset) }
            .map(\.element)
    }

    private static func facetOrder(_ facet: MatchRequirementFacet?) -> Int {
        facet.flatMap { MatchRequirementFacet.allCases.firstIndex(of: $0) } ?? MatchRequirementFacet.allCases.count
    }

    private static func facts(of job: Job, salary: SalaryRange?) -> [Fact] {
        func yesNo(_ value: Bool?) -> Fact.Value { value.map { $0 ? .yes : .no } ?? .notStated }
        let whereTheyHire: Fact.Value = if let eligibility = job.remoteEligibility, !eligibility.isEmpty {
            .eligibility(eligibility)
        } else if !job.locations.isEmpty {
            .locations(job.locations)
        } else {
            .notStated
        }
        return [
            Fact(kind: .workMode, value: job.remoteType.map(Fact.Value.workMode) ?? .notStated),
            Fact(kind: .whereTheyHire, value: whereTheyHire),
            Fact(kind: .visaSponsorship, value: yesNo(job.visaSponsorship)),
            Fact(kind: .relocation, value: yesNo(job.relocationSupport)),
            Fact(kind: .employmentType, value: job.employmentType.map(Fact.Value.employmentType) ?? .notStated),
            Fact(kind: .salary, value: salary.map(Fact.Value.salary) ?? .notStated),
            Fact(kind: .lastSeen, value: job.sources.map(\.lastSeenAt).max().map(Fact.Value.date) ?? .notStated),
        ]
    }

    private static func source(_ link: JobSourceLink, of job: Job) -> Source {
        let usedForApply = if let applyUrl = job.applyUrl {
            link.url == applyUrl || link.applyUrl == applyUrl
        } else if let applyEmail = job.applyEmail {
            link.applyEmail == applyEmail
        } else {
            false
        }
        return Source(
            id: "\(link.source):\(link.sourceId ?? link.url)",
            source: link.source,
            url: URL(string: link.url),
            isDirectFromEmployer: link.isDirectFromEmployer,
            postedAt: link.postedAt,
            lastSeenAt: link.lastSeenAt,
            differingSalary: link.salary.flatMap { $0 != job.salary ? $0 : nil },
            differingTitle: link.title != job.title ? link.title : nil,
            usedForApply: usedForApply
        )
    }

    /// Applied (or a closed outcome after applying) → `.applied`. Otherwise the job's apply link,
    /// typed by the source it belongs to (an apply link no source lists counts as the company
    /// site), then the apply email, then the first source: direct before boards.
    private static func applyRoute(for job: Job, sources: [Source], application: Application?) -> ApplyRoute? {
        if let application {
            let hasApplied = statusRank(application.status).map { $0 >= statusRank(.applied)! } ?? (application.appliedAt != nil)
            if hasApplied {
                return .applied(date: application.appliedAt ?? application.statusChangedAt, applicationId: application.id)
            }
        }
        func route(_ url: URL, via source: Source?) -> ApplyRoute {
            if let source, !source.isDirectFromEmployer { .board(name: source.source, url: url) } else { .companySite(url: url) }
        }
        if let applyUrl = job.applyUrl, let url = URL(string: applyUrl) {
            return route(url, via: sources.first(where: \.usedForApply))
        }
        if let applyEmail = job.applyEmail, !applyEmail.isEmpty {
            return .email(address: applyEmail)
        }
        let fallback = sources.first(where: \.isDirectFromEmployer) ?? sources.first
        return fallback.flatMap { source in source.url.map { route($0, via: source) } }
    }
}

/// Skill identity across `skills.unmatched` ("vue", "d3") and gap labels ("Vue.js", "D3.js").
private struct SkillKey: Hashable {
    let value: String

    init(_ skill: String) {
        var key = skill.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if key.hasSuffix(".js") { key.removeLast(3) }
        value = key
    }
}

extension UserData {
    /// Restores a match's state fields (Undo of save / hide), leaving skills and gaps alone.
    fileprivate mutating func restoreMatchState(_ jobId: String, from previous: JobMatch) {
        guard let index = jobMatches.firstIndex(where: { $0.id == jobId }) else { return }
        jobMatches[index].state = previous.state
        jobMatches[index].dismissReasons = previous.dismissReasons
        jobMatches[index].stateChangedAt = previous.stateChangedAt
    }

    /// Sets a match's skills and gaps ("I have this" and its Undo).
    fileprivate mutating func setMatchSkills(_ jobId: String, skills: MatchSkills, gaps: [MatchFactor]) {
        guard let index = jobMatches.firstIndex(where: { $0.id == jobId }) else { return }
        jobMatches[index].skills = skills
        jobMatches[index].gaps = gaps
    }

    /// Moves `skill` from unmatched to matched and drops its skill gaps. Returns the name to show
    /// (the gap's label, else the skill), or nil when nothing matched.
    fileprivate mutating func markHaveSkill(_ skill: String, forJob jobId: String) -> String? {
        guard let match = match(forJob: jobId) else { return nil }
        let key = SkillKey(skill)
        let unmatched = match.skills.unmatched.filter { SkillKey($0) == key }
        let gaps = match.gaps.filter { $0.kind == .skill && SkillKey($0.label) == key }
        guard !unmatched.isEmpty || !gaps.isEmpty else { return nil }
        let skills = MatchSkills(
            matched: match.skills.matched + (unmatched.isEmpty ? [skill] : unmatched),
            unmatched: match.skills.unmatched.filter { SkillKey($0) != key }
        )
        setMatchSkills(jobId, skills: skills, gaps: match.gaps.filter { !($0.kind == .skill && SkillKey($0.label) == key) })
        return gaps.first?.label ?? unmatched.first ?? skill
    }
}
