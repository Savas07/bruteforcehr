import BFHRCore
import Foundation

// Value types the job detail screen renders (docs/design/research/job-detail.md "Decision — iOS").
// Typed data only: views format dates, salaries and counts.

extension JobDetailModel {
    /// Where the header's salary comes from (`SalaryText`: "€60–75k · from employer").
    public enum SalaryProvenance: Hashable, Sendable {
        /// The posting states it.
        case statedByEmployer
        /// The source estimated it.
        case estimated
        /// No salary, or a range with neither bound: "Salary not stated".
        case notStated
    }

    /// `JobDetailHeader`: logo/monogram, title, meta line, fact chips, salary.
    public struct Header: Hashable, Sendable {
        public var title: String
        public var company: CompanyIdentity
        public var locations: [JobLocation]
        public var remoteType: RemoteType?
        /// "Europe, including Türkiye (CET ±3 h)": the "Remote · EU only" scope.
        public var remoteEligibility: String?
        public var employmentType: EmploymentType?
        public var seniority: Seniority?
        public var postedAt: Date?
        /// Nil when `salaryProvenance == .notStated`.
        public var salary: SalaryRange?
        public var salaryProvenance: SalaryProvenance
    }

    /// The CV the score was computed against ("Based on CV '…' · updated 2 h ago · Change").
    public struct MatchBasis: Hashable, Sendable {
        public var cvId: String
        public var cvRevisionId: String?
        /// Nil when the CV is no longer in the user's data.
        public var cvTitle: String?
    }

    /// One reason, gap or requirement (`FactorCard`, `GapRow`, `RequirementChecklist`).
    public struct Factor: Identifiable, Hashable, Sendable {
        public enum Origin: String, Hashable, Sendable {
            case reason
            case gap
        }

        /// `"reason.<index>"` / `"gap.<index>"`: position in the match's list.
        public var id: String
        public var origin: Origin
        public var kind: MatchFactorKind
        public var facet: MatchRequirementFacet?
        /// One sentence ("Remote role you can take from Türkiye"), or the skill name for skill gaps.
        public var label: String
        public var status: MatchFactorStatus
        /// "Matters most" / "Matters some".
        public var impact: MatchImpact
        /// The posting or CV phrase behind the claim.
        public var evidence: MatchEvidence?
        public var source: MatchFactorSource
        /// For skill gaps: the unmatched skill this gap stands for, to pass to `markHaveSkill(_:)`
        /// ("I have this").
        public var skill: String?

        public var isGap: Bool { origin == .gap }
    }

    /// A computed match (`MatchSummaryCard` + `MatchBreakdown`).
    public struct ScoredMatch: Hashable, Sendable {
        /// 0–100; shown as "72 of 100", never "%".
        public var score: Int
        public var band: MatchBand
        public var basis: MatchBasis
        public var computedAt: Date
        /// Requirement factors (reasons and gaps) with status `met`.
        public var requirementsMet: Int
        /// Every requirement factor, including the not-stated ones ("4 of 5 met · 1 not stated").
        public var requirementsTotal: Int
        /// Requirement factors the posting doesn't state. Not gaps.
        public var requirementsNotStated: Int
        public var skillsMatched: Int
        public var skillsTotal: Int
        public var gapCount: Int
        /// "Why it matches": up to 3 reasons, impact `most` first, then the match's order.
        public var topReasons: [Factor]
        /// "Gaps to consider": up to 2 gaps, impact `most` first, then the match's order.
        public var topGaps: [Factor]
        /// Every reason, in the match's order.
        public var reasons: [Factor]
        /// Every gap, in the match's order.
        public var gaps: [Factor]
        /// Requirement factors from reasons and gaps, by facet (location, remote, authorization,
        /// salary, seniority, language; no facet last).
        public var requirements: [Factor]
        public var matchedSkills: [String]
        public var unmatchedSkills: [String]
        /// The LLM summary (top N matches only). Nil: "A written summary is created for your top
        /// matches."
        public var rationale: String?
    }

    /// The match card's state.
    public enum MatchSummary: Hashable, Sendable {
        /// No match computed yet: "Working out your match…". Never shows 0.
        case pending
        /// The match isn't based on a CV: "Pick a CV to see how this fits".
        case noCV
        case scored(ScoredMatch)

        public var scored: ScoredMatch? {
            if case .scored(let match) = self { match } else { nil }
        }
    }

    /// One row of the Q&A facts list (`FactsList`).
    public struct Fact: Identifiable, Hashable, Sendable {
        public enum Kind: String, Hashable, Sendable, CaseIterable {
            case workMode
            case whereTheyHire
            case visaSponsorship
            case relocation
            case employmentType
            case salary
            case lastSeen
        }

        public enum Value: Hashable, Sendable {
            case workMode(RemoteType)
            /// The remote scope as the posting words it ("Europe, UK and Türkiye").
            case eligibility(String)
            case locations([JobLocation])
            case yes
            case no
            case employmentType(EmploymentType)
            /// `estimated` is on the range.
            case salary(SalaryRange)
            case date(Date)
            /// "Not stated": neutral, never a gap.
            case notStated
        }

        public var kind: Kind
        public var value: Value

        public var id: Kind { kind }
        public var isStated: Bool { value != .notStated }
    }

    /// One "Found on" row (`SourceRow`).
    public struct Source: Identifiable, Hashable, Sendable {
        /// `"<source>:<sourceId>"` (the job's source key), or `"<source>:<url>"`.
        public var id: String
        /// The source key ("greenhouse", "remotive").
        public var source: String
        public var url: URL?
        public var isDirectFromEmployer: Bool
        /// Posted date at this source.
        public var postedAt: Date?
        public var lastSeenAt: Date
        /// This source's salary when it differs from the job's (KAYAK-style per-row note).
        public var differingSalary: SalaryRange?
        /// This source's title when it differs from the job's.
        public var differingTitle: String?
        /// The Apply button uses this source ("Used for Apply" tag).
        public var usedForApply: Bool
    }

    /// "Found on {n} sites", grouped "Direct from employer" above "Job boards".
    public struct Sources: Hashable, Sendable {
        public var direct: [Source]
        public var boards: [Source]

        public var total: Int { direct.count + boards.count }
        public var all: [Source] { direct + boards }
    }

    /// What the sticky Apply bar offers (`ApplyButton`).
    public enum ApplyRoute: Hashable, Sendable {
        /// "Apply": the email apply flow.
        case email(address: String)
        /// "Apply on company site ↗" (employer ATS or careers page).
        case companySite(url: URL)
        /// "Apply on {board} ↗"; `name` is the source key.
        case board(name: String, url: URL)
        /// An application exists at Applied or beyond: "Applied {date} · View in Tracker".
        case applied(date: Date, applicationId: String)
    }

    /// 👍 / 👎 on the AI summary (`AISummaryBlock`).
    public enum SummaryFeedback: Hashable, Sendable {
        case helpful
        case notHelpful
    }
}
