import BFHRCore
import Foundation

/// Copy the job detail screen renders (table "JobDetail"). Shared copy (Undo, Not for me, AI
/// label, band names, "72 of 100") comes from `Strings` and `MatchBand`.
enum JobDetailViewStrings {
    // MARK: States

    static let loading = LocalizedStringResource.bfhr("jobDetail.loading", default: "Loading job", table: "JobDetail")
    static let errorTitle = LocalizedStringResource.bfhr("jobDetail.error.title", default: "We couldn't load this job", table: "JobDetail")
    static let notFoundTitle = LocalizedStringResource.bfhr("jobDetail.error.notFound", default: "This job isn't in your list anymore", table: "JobDetail")
    static let noDescription = LocalizedStringResource.bfhr("jobDetail.noDescription", default: "This posting has no description. Open the original posting to read it.", table: "JobDetail")
    static let delisted = LocalizedStringResource.bfhr("jobDetail.delisted", default: "This job is no longer listed", table: "JobDetail")
    static let delistedMessage = LocalizedStringResource.bfhr("jobDetail.delisted.message", default: "You're reading the copy we saved.", table: "JobDetail")

    // MARK: Header

    static func posted(_ when: String) -> LocalizedStringResource {
        .bfhr("jobDetail.posted", default: "Posted \(when)", table: "JobDetail", comment: "%@ = relative day, mid-sentence, e.g. yesterday.")
    }

    static let salaryNotStated = LocalizedStringResource.bfhr("jobDetail.salary.notStated", default: "Salary not stated", table: "JobDetail")
    static let salaryFromEmployer = LocalizedStringResource.bfhr("jobDetail.salary.fromEmployer", default: "from employer", table: "JobDetail", comment: "Salary provenance after the amount: €70K–€85K a year · from employer.")
    static let salaryEstimated = LocalizedStringResource.bfhr("jobDetail.salary.estimated", default: "estimated by the job site", table: "JobDetail", comment: "Salary provenance after the amount.")

    static func salaryRange(_ low: String, _ high: String) -> LocalizedStringResource {
        .bfhr("jobDetail.salary.range", default: "\(low)–\(high)", table: "JobDetail", comment: "%1$@ = lower amount, %2$@ = upper amount.")
    }

    static func salaryFrom(_ amount: String) -> LocalizedStringResource {
        .bfhr("jobDetail.salary.from", default: "From \(amount)", table: "JobDetail")
    }

    static func salaryUpTo(_ amount: String) -> LocalizedStringResource {
        .bfhr("jobDetail.salary.upTo", default: "Up to \(amount)", table: "JobDetail")
    }

    static func salaryPer(_ period: SalaryPeriod, amount: String) -> LocalizedStringResource {
        switch period {
        case .year: .bfhr("jobDetail.salary.perYear", default: "\(amount) a year", table: "JobDetail")
        case .month: .bfhr("jobDetail.salary.perMonth", default: "\(amount) a month", table: "JobDetail")
        case .day: .bfhr("jobDetail.salary.perDay", default: "\(amount) a day", table: "JobDetail")
        case .hour: .bfhr("jobDetail.salary.perHour", default: "\(amount) an hour", table: "JobDetail")
        }
    }

    static func workMode(_ type: RemoteType) -> LocalizedStringResource {
        switch type {
        case .remote: .bfhr("jobDetail.workMode.remote", default: "Remote", table: "JobDetail")
        case .hybrid: .bfhr("jobDetail.workMode.hybrid", default: "Hybrid", table: "JobDetail")
        case .onsite: .bfhr("jobDetail.workMode.onsite", default: "On-site", table: "JobDetail")
        }
    }

    static func employment(_ type: EmploymentType) -> LocalizedStringResource {
        switch type {
        case .fullTime: .bfhr("jobDetail.employment.fullTime", default: "Full-time", table: "JobDetail")
        case .partTime: .bfhr("jobDetail.employment.partTime", default: "Part-time", table: "JobDetail")
        case .contract: .bfhr("jobDetail.employment.contract", default: "Contract", table: "JobDetail")
        case .internship: .bfhr("jobDetail.employment.internship", default: "Internship", table: "JobDetail")
        case .temporary: .bfhr("jobDetail.employment.temporary", default: "Temporary", table: "JobDetail")
        }
    }

    static func seniority(_ level: Seniority) -> LocalizedStringResource {
        switch level {
        case .intern: .bfhr("jobDetail.seniority.intern", default: "Intern", table: "JobDetail")
        case .junior: .bfhr("jobDetail.seniority.junior", default: "Junior", table: "JobDetail")
        case .mid: .bfhr("jobDetail.seniority.mid", default: "Mid-level", table: "JobDetail")
        case .senior: .bfhr("jobDetail.seniority.senior", default: "Senior", table: "JobDetail")
        case .staff: .bfhr("jobDetail.seniority.staff", default: "Staff", table: "JobDetail")
        case .principal: .bfhr("jobDetail.seniority.principal", default: "Principal", table: "JobDetail")
        case .lead: .bfhr("jobDetail.seniority.lead", default: "Lead", table: "JobDetail")
        case .manager: .bfhr("jobDetail.seniority.manager", default: "Manager", table: "JobDetail")
        case .director: .bfhr("jobDetail.seniority.director", default: "Director", table: "JobDetail")
        }
    }

    // MARK: Match

    static let match = LocalizedStringResource.bfhr("jobDetail.section.match", default: "How it fits", table: "JobDetail")
    static let pending = LocalizedStringResource.bfhr("jobDetail.match.pending", default: "Working out your match…", table: "JobDetail")
    static let pendingMessage = LocalizedStringResource.bfhr("jobDetail.match.pending.message", default: "You'll see how this job fits your CV here as soon as it's ready.", table: "JobDetail")
    static let noCV = LocalizedStringResource.bfhr("jobDetail.match.noCV", default: "Pick a CV to see how this fits", table: "JobDetail")
    static let noCVMessage = LocalizedStringResource.bfhr("jobDetail.match.noCV.message", default: "Matches are worked out against one of your CVs.", table: "JobDetail")
    static let openCVs = LocalizedStringResource.bfhr("jobDetail.action.openCVs", default: "Open CVs", table: "JobDetail")
    static let explainer = LocalizedStringResource.bfhr("jobDetail.match.explainer", default: "A rough guide to how this job fits your CV and preferences. It isn't a prediction of your chances.", table: "JobDetail")

    static func basis(cv: String, updated: String) -> LocalizedStringResource {
        .bfhr("jobDetail.match.basis", default: "Based on “\(cv)” · updated \(updated)", table: "JobDetail", comment: "%1$@ = CV title, %2$@ = relative time, e.g. 7 hours ago. DE uses „…“.")
    }

    static func basisRemovedCV(updated: String) -> LocalizedStringResource {
        .bfhr("jobDetail.match.basis.removedCV", default: "Based on a CV you've since removed · updated \(updated)", table: "JobDetail", comment: "%@ = relative time.")
    }

    static func requirementsCount(met: Int, total: Int) -> LocalizedStringResource {
        .bfhr("jobDetail.count.requirements", default: "Requirements: \(met) of \(total) met", table: "JobDetail")
    }

    static func notStatedCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobDetail.count.notStated", default: "Not stated in the posting: \(count)", table: "JobDetail")
    }

    static func skillsCount(matched: Int, total: Int) -> LocalizedStringResource {
        .bfhr("jobDetail.count.skills", default: "Skills: \(matched) of \(total) match", table: "JobDetail")
    }

    static func gapsCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobDetail.count.gaps", default: "Gaps to consider: \(count)", table: "JobDetail")
    }

    static let reasons = LocalizedStringResource.bfhr("jobDetail.section.reasons", default: "Why it matches", table: "JobDetail")
    static let gaps = LocalizedStringResource.bfhr("jobDetail.section.gaps", default: "Gaps to consider", table: "JobDetail")
    static let haveThis = LocalizedStringResource.bfhr("jobDetail.gap.haveThis", default: "I have this", table: "JobDetail")
    static let addToCV = LocalizedStringResource.bfhr("jobDetail.gap.addToCV", default: "Add to CV…", table: "JobDetail")

    static func skillGap(_ skill: String) -> LocalizedStringResource {
        .bfhr("jobDetail.gap.skill", default: "Not in your CV yet: \(skill)", table: "JobDetail", comment: "%@ = skill name, e.g. Vue.js.")
    }

    static func outsidePreferences(_ detail: String) -> LocalizedStringResource {
        .bfhr("jobDetail.gap.outsidePrefs", default: "Outside your preferences: \(detail)", table: "JobDetail")
    }

    static func impact(_ impact: MatchImpact) -> LocalizedStringResource {
        switch impact {
        case .most: .bfhr("jobDetail.impact.most", default: "Matters most", table: "JobDetail")
        case .some: .bfhr("jobDetail.impact.some", default: "Matters some", table: "JobDetail")
        }
    }

    static func status(_ status: MatchFactorStatus) -> LocalizedStringResource {
        switch status {
        case .met: .bfhr("jobDetail.status.met", default: "Meets this", table: "JobDetail")
        case .partial: .bfhr("jobDetail.status.partial", default: "Partly", table: "JobDetail")
        case .missing: .bfhr("jobDetail.status.missing", default: "Not in your CV yet", table: "JobDetail")
        case .outsidePrefs: .bfhr("jobDetail.status.outsidePrefs", default: "Outside your preferences", table: "JobDetail")
        case .notStated: .bfhr("jobDetail.status.notStated", default: "Not stated", table: "JobDetail")
        }
    }

    static func evidence(_ evidence: MatchEvidence) -> LocalizedStringResource {
        let quote = evidence.quote
        return switch evidence.from {
        case .posting: .bfhr("jobDetail.evidence.posting", default: "Posting: “\(quote)”", table: "JobDetail", comment: "%@ = quoted posting text. DE uses „…“.")
        case .cv: .bfhr("jobDetail.evidence.cv", default: "Your CV: “\(quote)”", table: "JobDetail", comment: "%@ = quoted CV text. DE uses „…“.")
        case .profile: .bfhr("jobDetail.evidence.profile", default: "Your profile: “\(quote)”", table: "JobDetail", comment: "%@ = quoted profile text. DE uses „…“.")
        }
    }

    static let summary = LocalizedStringResource.bfhr("jobDetail.section.summary", default: "Summary", table: "JobDetail")
    static let noRationale = LocalizedStringResource.bfhr("jobDetail.summary.none", default: "A written summary is created for your top matches.", table: "JobDetail")
    static let summaryQuestion = LocalizedStringResource.bfhr("jobDetail.summary.question", default: "Was this summary useful?", table: "JobDetail")
    static let summaryUseful = LocalizedStringResource.bfhr("jobDetail.summary.useful", default: "Useful", table: "JobDetail", comment: "Thumbs-up button on the AI summary (accessibility label).")
    static let summaryNotUseful = LocalizedStringResource.bfhr("jobDetail.summary.notUseful", default: "Not useful", table: "JobDetail", comment: "Thumbs-down button on the AI summary (accessibility label).")
    static let summaryThanks = LocalizedStringResource.bfhr("jobDetail.summary.thanks", default: "Thanks for the feedback.", table: "JobDetail")

    static let breakdownOpen = LocalizedStringResource.bfhr("jobDetail.breakdown.open", default: "See full breakdown", table: "JobDetail")
    static let breakdownRequirements = LocalizedStringResource.bfhr("jobDetail.breakdown.requirements", default: "Requirements", table: "JobDetail")
    static let breakdownSkills = LocalizedStringResource.bfhr("jobDetail.breakdown.skills", default: "Skills", table: "JobDetail")
    static let breakdownSkillsFooter = LocalizedStringResource.bfhr("jobDetail.breakdown.skills.footer", default: "Skills with a check are in your CV.", table: "JobDetail")
    static let explainerTitle = LocalizedStringResource.bfhr("jobDetail.breakdown.explainer.title", default: "What goes into this score?", table: "JobDetail")
    static let explainerBody = LocalizedStringResource.bfhr("jobDetail.breakdown.explainer.body", default: "We compare the posting with your CV and your preferences. Requirements like location, remote work and salary count first, then skills and experience. Each line shows the text from the posting or your CV behind it.", table: "JobDetail")
    static let done = LocalizedStringResource.bfhr("jobDetail.action.done", default: "Done", table: "JobDetail")

    // MARK: Details and description

    static let details = LocalizedStringResource.bfhr("jobDetail.section.details", default: "Details", table: "JobDetail")
    static let about = LocalizedStringResource.bfhr("jobDetail.section.about", default: "About the job", table: "JobDetail")
    static let showMore = LocalizedStringResource.bfhr("jobDetail.description.showMore", default: "Show more", table: "JobDetail")
    static let yes = LocalizedStringResource.bfhr("jobDetail.fact.yes", default: "Yes", table: "JobDetail")
    static let no = LocalizedStringResource.bfhr("jobDetail.fact.no", default: "No", table: "JobDetail")
    static let notStated = LocalizedStringResource.bfhr("jobDetail.fact.notStated", default: "Not stated", table: "JobDetail")

    static func fact(_ kind: JobDetailModel.Fact.Kind) -> LocalizedStringResource {
        switch kind {
        case .workMode: .bfhr("jobDetail.fact.workMode", default: "Work mode", table: "JobDetail")
        case .whereTheyHire: .bfhr("jobDetail.fact.whereTheyHire", default: "Where they hire", table: "JobDetail")
        case .visaSponsorship: .bfhr("jobDetail.fact.visaSponsorship", default: "Visa sponsorship", table: "JobDetail")
        case .relocation: .bfhr("jobDetail.fact.relocation", default: "Relocation support", table: "JobDetail")
        case .employmentType: .bfhr("jobDetail.fact.employmentType", default: "Employment type", table: "JobDetail")
        case .salary: .bfhr("jobDetail.fact.salary", default: "Salary", table: "JobDetail")
        case .lastSeen: .bfhr("jobDetail.fact.lastSeen", default: "Last seen live", table: "JobDetail")
        }
    }

    // MARK: Sources

    static func foundOn(_ count: Int) -> LocalizedStringResource {
        count == 1
            ? .bfhr("jobDetail.foundOn.one", default: "Found on 1 site", table: "JobDetail")
            : .bfhr("jobDetail.foundOn", default: "Found on \(count) sites", table: "JobDetail")
    }

    static let directFromEmployer = LocalizedStringResource.bfhr("jobDetail.sources.direct", default: "Direct from employer", table: "JobDetail")
    static let usedForApply = LocalizedStringResource.bfhr("jobDetail.sources.usedForApply", default: "Used for Apply", table: "JobDetail")
    static let sourcesFootnote = LocalizedStringResource.bfhr("jobDetail.sources.footnote", default: "Collected from public job sites. Details can differ between sources.", table: "JobDetail")
    static let opensInBrowser = LocalizedStringResource.bfhr("jobDetail.opensInBrowser", default: "Opens in your browser", table: "JobDetail")

    static func sourceSalary(_ salary: String) -> LocalizedStringResource {
        .bfhr("jobDetail.sources.salary", default: "Lists \(salary)", table: "JobDetail", comment: "This source shows a different salary. %@ = e.g. €75K–€85K a year.")
    }

    static func sourceTitle(_ title: String) -> LocalizedStringResource {
        .bfhr("jobDetail.sources.title", default: "Listed as “\(title)”", table: "JobDetail", comment: "This source shows a different job title.")
    }

    static func showAllSources(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobDetail.sources.showAll", default: "Show all \(count) sources", table: "JobDetail")
    }

    // MARK: Actions

    static let save = LocalizedStringResource.bfhr("jobDetail.action.save", default: "Save", table: "JobDetail")
    static let saved = LocalizedStringResource.bfhr("jobDetail.action.saved", default: "Saved", table: "JobDetail")
    static let more = LocalizedStringResource.bfhr("jobDetail.action.more", default: "More", table: "JobDetail")
    static let openOriginal = LocalizedStringResource.bfhr("jobDetail.action.openOriginal", default: "Open original posting", table: "JobDetail")
    static let showInFeed = LocalizedStringResource.bfhr("jobDetail.action.showInFeed", default: "Show in your feed again", table: "JobDetail")
    static let notForMeFooter = LocalizedStringResource.bfhr("jobDetail.notForMe.footer", default: "Hides this job from your feed. You can undo it.", table: "JobDetail")
    static let viewInTracker = LocalizedStringResource.bfhr("jobDetail.apply.viewInTracker", default: "View in Tracker", table: "JobDetail")

    static func apply(_ route: JobDetailModel.ApplyRoute) -> LocalizedStringResource {
        switch route {
        case .email: .bfhr("jobDetail.apply", default: "Apply by email", table: "JobDetail")
        case .companySite: .bfhr("jobDetail.apply.companySite", default: "Apply on company site", table: "JobDetail")
        case .board(let name, _):
            .bfhr("jobDetail.apply.board", default: "Apply on \(JobDetailFormat.sourceName(name))", table: "JobDetail", comment: "%@ = job board name, e.g. Remotive.")
        case .applied: viewInTracker
        }
    }

    static func appliedOn(_ day: String) -> LocalizedStringResource {
        .bfhr("jobDetail.apply.applied", default: "Applied \(day)", table: "JobDetail", comment: "%@ = date, e.g. 12 Oct.")
    }

    // MARK: Hidden + reasons

    static let hidden = LocalizedStringResource.bfhr("jobDetail.hidden", default: "Hidden from your feed", table: "JobDetail")

    static let tellUsWhy = LocalizedStringResource.bfhr("jobDetail.hidden.tellUsWhy", default: "Tell us why", table: "JobDetail")

    static func hiddenReasons(_ reasons: String) -> LocalizedStringResource {
        .bfhr("jobDetail.hidden.reasons", default: "Your reasons: \(reasons)", table: "JobDetail", comment: "%@ = comma-separated reasons, e.g. Location, Salary.")
    }

    static let reasonsTitle = LocalizedStringResource.bfhr("jobDetail.reasons.title", default: "What didn't fit?", table: "JobDetail")
    static let reasonsSubtitle = LocalizedStringResource.bfhr("jobDetail.reasons.subtitle", default: "Pick any that apply. We'll use this to tune your matches.", table: "JobDetail")
    static let reasonsSkip = LocalizedStringResource.bfhr("jobDetail.reasons.skip", default: "Skip", table: "JobDetail")
    static let reasonsSave = LocalizedStringResource.bfhr("jobDetail.reasons.save", default: "Save reason", table: "JobDetail")

    static func reason(_ reason: DismissReason) -> LocalizedStringResource {
        switch reason {
        case .location: .bfhr("jobDetail.reason.location", default: "Location", table: "JobDetail")
        case .salary: .bfhr("jobDetail.reason.salary", default: "Salary", table: "JobDetail")
        case .seniority: .bfhr("jobDetail.reason.seniority", default: "Seniority", table: "JobDetail")
        case .notRelevant: .bfhr("jobDetail.reason.notRelevant", default: "Role or skills", table: "JobDetail")
        case .company: .bfhr("jobDetail.reason.company", default: "Company", table: "JobDetail")
        case .language: .bfhr("jobDetail.reason.language", default: "Language", table: "JobDetail")
        case .visa: .bfhr("jobDetail.reason.visa", default: "Visa", table: "JobDetail")
        case .alreadyApplied: .bfhr("jobDetail.reason.alreadyApplied", default: "Already applied", table: "JobDetail")
        case .other: .bfhr("jobDetail.reason.other", default: "Something else", table: "JobDetail")
        }
    }
}
