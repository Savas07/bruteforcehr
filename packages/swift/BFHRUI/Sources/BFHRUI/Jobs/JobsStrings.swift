import BFHRCore
import Foundation

/// Copy of the Jobs feed, saved searches and Hidden jobs (table "Jobs"). Counts are written as
/// "Label: N" so no language needs plural forms. Shared copy (Undo, Not for me, band names, work
/// modes, seniority, dismiss reasons) comes from `Strings` and `JobDetailViewStrings`.
enum JobsStrings {
    // MARK: Screen

    // MARK: Add from a link

    static let importLinkPlaceholder = LocalizedStringResource.bfhr("jobs.import.link", default: "Paste the job's web address", table: "Jobs")
    static let importLookUp = LocalizedStringResource.bfhr("jobs.import.lookUp", default: "Read the posting", table: "Jobs")
    static let importFooter = LocalizedStringResource.bfhr("jobs.import.footer", default: "We read the public page once and fill in the fields. You check them before anything is saved.", table: "Jobs")
    static let importReading = LocalizedStringResource.bfhr("jobs.import.reading", default: "Reading the posting…", table: "Jobs")
    static let importAddByHand = LocalizedStringResource.bfhr("jobs.import.byHand", default: "Log it by hand in the Tracker", table: "Jobs")
    static let importSave = LocalizedStringResource.bfhr("jobs.import.save", default: "Add", table: "Jobs")
    static let importDuplicateTitle = LocalizedStringResource.bfhr("jobs.import.duplicate", default: "Already in your jobs", table: "Jobs")
    static let importDuplicateBody = LocalizedStringResource.bfhr("jobs.import.duplicate.body", default: "Adding it keeps one job and lists this page as another source.", table: "Jobs")
    static let importCheckHeader = LocalizedStringResource.bfhr("jobs.import.check", default: "Check the details", table: "Jobs")
    static let importTitle = LocalizedStringResource.bfhr("jobs.import.title", default: "Job title", table: "Jobs")
    static let importCompany = LocalizedStringResource.bfhr("jobs.import.company", default: "Company", table: "Jobs")
    static let importLocation = LocalizedStringResource.bfhr("jobs.import.location", default: "Location", table: "Jobs")
    static let importNotStated = LocalizedStringResource.bfhr("jobs.import.notStated", default: "Not stated", table: "Jobs")
    static let importSaveToSaved = LocalizedStringResource.bfhr("jobs.import.saveToSaved", default: "Add and save it", table: "Jobs")
    static let importSaveToSavedFooter = LocalizedStringResource.bfhr("jobs.import.saveToSaved.footer", default: "Saved jobs also show in the Tracker.", table: "Jobs")

    static func importFrom(_ host: String) -> LocalizedStringResource {
        .bfhr("jobs.import.from", default: "Read from \(host)", table: "Jobs", comment: "%@ = web host, e.g. jobs.lever.co.")
    }

    static func importedToast(_ company: String) -> LocalizedStringResource {
        .bfhr("jobs.toast.imported", default: "\(company) · added", table: "Jobs", comment: "%@ = company. Followed by Open.")
    }

    static func importFailedTitle(_ error: JobImportError) -> LocalizedStringResource {
        switch error {
        case .offline: .bfhr("jobs.import.failed.offline", default: "Reading a page needs a connection", table: "Jobs")
        case .invalidURL: .bfhr("jobs.import.failed.invalid", default: "That doesn't look like a web address", table: "Jobs")
        case .notFound: .bfhr("jobs.import.failed.notFound", default: "This posting is no longer online", table: "Jobs")
        case .unreadable: .bfhr("jobs.import.failed.unreadable", default: "We couldn't read a job on that page", table: "Jobs")
        case .limit: .bfhr("jobs.import.failed.limit", default: "You've read a lot of pages today", table: "Jobs")
        case .failed: .bfhr("jobs.import.failed", default: "The page didn't load", table: "Jobs")
        }
    }

    static func importFailedBody(_ error: JobImportError) -> LocalizedStringResource {
        switch error {
        case .unreadable: .bfhr("jobs.import.failed.unreadable.body", default: "Some sites need a sign-in or block automatic reading. You can log the job by hand.", table: "Jobs")
        case .limit: .bfhr("jobs.import.failed.limit.body", default: "Try again tomorrow, or log the job by hand.", table: "Jobs")
        default: .bfhr("jobs.import.failed.body", default: "Check the address and try again.", table: "Jobs")
        }
    }

    static let title = LocalizedStringResource.bfhr("jobs.title", default: "Jobs", table: "Jobs")
    static let loading = LocalizedStringResource.bfhr("jobs.loading", default: "Loading jobs", table: "Jobs")
    static let errorTitle = LocalizedStringResource.bfhr("jobs.error.title", default: "We couldn't load your jobs", table: "Jobs")
    static let searchPrompt = LocalizedStringResource.bfhr("jobs.search.prompt", default: "Role, skill or company", table: "Jobs", comment: "Placeholder of the Jobs search field.")
    static let writeFailed = LocalizedStringResource.bfhr("jobs.toast.writeFailed", default: "A change didn't save. Your list shows what's stored.", table: "Jobs")
    static let firstUseTitle = LocalizedStringResource.bfhr("jobs.firstUse.title", default: "No jobs here yet", table: "Jobs")
    static let firstUseBody = LocalizedStringResource.bfhr("jobs.firstUse.body", default: "Search for a role above and press Search. We'll look across job sites and show how each job fits your CV.", table: "Jobs")
    static let firstUseBodyNoSearch = LocalizedStringResource.bfhr("jobs.firstUse.body.noSearch", default: "Jobs you save and jobs from your searches show up here, with how each one fits your CV.", table: "Jobs")
    static let addFromLink = LocalizedStringResource.bfhr("jobs.action.addFromLink", default: "Add a job from a link", table: "Jobs")
    static let savedEmpty = LocalizedStringResource.bfhr("jobs.saved.empty", default: "Jobs you save show up here and in the Tracker.", table: "Jobs")
    static let allHiddenEmpty = LocalizedStringResource.bfhr("jobs.all.empty", default: "Nothing new right now. New matches show up here.", table: "Jobs")
    static let save = LocalizedStringResource.bfhr("jobs.action.save", default: "Save", table: "Jobs")
    static let unsave = LocalizedStringResource.bfhr("jobs.action.unsave", default: "Remove from Saved", table: "Jobs")
    static let applyAction = LocalizedStringResource.bfhr("jobs.action.apply", default: "Apply…", table: "Jobs")
    static let add = LocalizedStringResource.bfhr("jobs.action.add", default: "Add", table: "Jobs")
    static let edit = LocalizedStringResource.bfhr("jobs.action.edit", default: "Edit", table: "Jobs")
    static let delete = LocalizedStringResource.bfhr("jobs.action.delete", default: "Delete", table: "Jobs")
    static let runNow = LocalizedStringResource.bfhr("jobs.action.runNow", default: "Search now", table: "Jobs", comment: "Runs a saved search against every job source right away.")
    static let cancel = LocalizedStringResource.bfhr("jobs.action.cancel", default: "Cancel", table: "Jobs")
    static let reset = LocalizedStringResource.bfhr("jobs.action.reset", default: "Reset", table: "Jobs")

    // MARK: Scopes

    static let scopesLabel = LocalizedStringResource.bfhr("jobs.scopes", default: "Show", table: "Jobs", comment: "VoiceOver label of the scope chip row (All matches · Saved · saved searches).")
    static let scopeAll = LocalizedStringResource.bfhr("jobs.scope.all", default: "All matches", table: "Jobs")
    static let scopeSaved = LocalizedStringResource.bfhr("jobs.scope.saved", default: "Saved", table: "Jobs")
    static let newSavedSearch = LocalizedStringResource.bfhr("jobs.savedSearch.new", default: "New saved search", table: "Jobs")

    static func newCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobs.newCount", default: "New: \(count)", table: "Jobs", comment: "New matches for a saved search. %lld = count.")
    }

    // MARK: Filters

    static let filters = LocalizedStringResource.bfhr("jobs.filters", default: "Filters", table: "Jobs")
    static let filtersLabel = LocalizedStringResource.bfhr("jobs.filters.label", default: "Filters", table: "Jobs", comment: "VoiceOver label of the filter chip row.")

    static func facet(_ facet: JobFilterFacet) -> LocalizedStringResource {
        switch facet {
        case .remote: .bfhr("jobs.facet.remote", default: "Work mode", table: "Jobs")
        case .match: .bfhr("jobs.facet.match", default: "Match", table: "Jobs")
        case .posted: .bfhr("jobs.facet.posted", default: "Posted", table: "Jobs")
        case .salary: .bfhr("jobs.facet.salary", default: "Salary", table: "Jobs")
        case .location: .bfhr("jobs.facet.location", default: "Location", table: "Jobs")
        case .seniority: .bfhr("jobs.facet.seniority", default: "Seniority", table: "Jobs")
        case .source: .bfhr("jobs.facet.source", default: "Source", table: "Jobs")
        }
    }

    static func facetValue(_ facet: String, _ value: String) -> LocalizedStringResource {
        .bfhr("jobs.facet.value", default: "\(facet): \(value)", table: "Jobs", comment: "An active filter chip. %1$@ = filter, %2$@ = value, e.g. Work mode: Remote.")
    }

    static func selectedCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobs.facet.selectedCount", default: "\(count) selected", table: "Jobs", comment: "Chip value when more than two options are picked. %lld = count.")
    }

    static func showJobs(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobs.filters.show", default: "Show results (\(count))", table: "Jobs", comment: "Applies the filters. %lld = jobs the filters leave.")
    }

    static let matchAny = LocalizedStringResource.bfhr("jobs.match.any", default: "Any match", table: "Jobs")

    static func matchAtLeast(_ band: MatchBand) -> LocalizedStringResource {
        switch band {
        case .strong: .bfhr("jobs.match.strong", default: "Strong matches only", table: "Jobs")
        case .good: .bfhr("jobs.match.good", default: "Good matches and better", table: "Jobs")
        case .partial, .stretch: .bfhr("jobs.match.partial", default: "Partial matches and better", table: "Jobs")
        }
    }

    static func matchShort(_ band: MatchBand) -> LocalizedStringResource {
        switch band {
        case .strong: .bfhr("jobs.match.short.strong", default: "Strong", table: "Jobs")
        case .good: .bfhr("jobs.match.short.good", default: "Good+", table: "Jobs")
        case .partial, .stretch: .bfhr("jobs.match.short.partial", default: "Partial+", table: "Jobs")
        }
    }

    static let matchFooter = LocalizedStringResource.bfhr("jobs.match.footer", default: "Bands are a rough guide to how a job fits your CV, not a prediction.", table: "Jobs")
    static let postedAny = LocalizedStringResource.bfhr("jobs.posted.any", default: "Any time", table: "Jobs")

    static func postedWithin(_ days: Int) -> LocalizedStringResource {
        if days == 1 { return .bfhr("jobs.posted.day", default: "Last 24 hours", table: "Jobs", comment: "Posted-date filter for one day.") }
        return .bfhr("jobs.posted.within", default: "Last \(days) days", table: "Jobs", comment: "Posted-date filter. %lld = days (3, 7, 30).")
    }

    static let currency = LocalizedStringResource.bfhr("jobs.salary.currency", default: "Currency", table: "Jobs")
    static let salaryMinimum = LocalizedStringResource.bfhr("jobs.salary.minimum", default: "Minimum a year", table: "Jobs")
    static let hideUnstatedSalary = LocalizedStringResource.bfhr("jobs.salary.hideUnstated", default: "Hide jobs without a stated salary", table: "Jobs")
    static let salaryFooter = LocalizedStringResource.bfhr("jobs.salary.footer", default: "Jobs in other currencies, or without a salary, stay in the list unless you hide them.", table: "Jobs")
    static let statedOnly = LocalizedStringResource.bfhr("jobs.salary.statedOnly", default: "Stated only", table: "Jobs")
    static let noCountries = LocalizedStringResource.bfhr("jobs.location.none", default: "Countries appear here once jobs list them.", table: "Jobs")
    static let visaOnly = LocalizedStringResource.bfhr("jobs.location.visa", default: "Only jobs that sponsor a visa", table: "Jobs")
    static let visaShort = LocalizedStringResource.bfhr("jobs.location.visaShort", default: "Visa", table: "Jobs")
    static let noSources = LocalizedStringResource.bfhr("jobs.source.none", default: "Sources appear here once you have jobs.", table: "Jobs")
    static let removeFilterHint = LocalizedStringResource.bfhr("jobs.filter.removeHint", default: "Removes this filter", table: "Jobs")
    static let removeAllFilters = LocalizedStringResource.bfhr("jobs.filter.removeAll", default: "Remove all filters", table: "Jobs")

    // MARK: Result header

    static func jobCount(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobs.count", default: "Jobs: \(count)", table: "Jobs", comment: "Result header. %lld = jobs in the list.")
    }

    static func sort(_ sort: JobFeedSort) -> LocalizedStringResource {
        switch sort {
        case .bestMatch: .bfhr("jobs.sort.bestMatch", default: "Best match", table: "Jobs")
        case .newest: .bfhr("jobs.sort.newest", default: "Newest", table: "Jobs")
        }
    }

    static let sortBy = LocalizedStringResource.bfhr("jobs.sort.by", default: "Sort by", table: "Jobs")

    static func sortAccessibility(_ sort: JobFeedSort) -> LocalizedStringResource {
        let order = String(localized: Self.sort(sort))
        return .bfhr("jobs.sort.accessibility", default: "Sort: \(order)", table: "Jobs", comment: "VoiceOver label of the sort menu. %@ = current order.")
    }

    static let rankingInfoTitle = LocalizedStringResource.bfhr("jobs.ranking.title", default: "How jobs are ordered", table: "Jobs")
    static let rankingInfoBody = LocalizedStringResource.bfhr("jobs.ranking.body", default: "Best match sorts by match band, then newest first. Scores are a rough guide to how a job fits your CV and preferences, not a prediction of your chances.", table: "Jobs")

    // MARK: Searching job sources

    static func searching(_ query: String) -> LocalizedStringResource {
        .bfhr("jobs.search.running", default: "Searching job sites for “\(query)”…", table: "Jobs", comment: "%@ = the search text.")
    }

    static func searchFound(found: Int, new: Int) -> LocalizedStringResource {
        .bfhr("jobs.search.found", default: "Search finished. Found: \(found) · New: \(new)", table: "Jobs", comment: "%1$lld = jobs found, %2$lld = jobs not seen before.")
    }

    static func searchedSources(_ list: String) -> LocalizedStringResource {
        .bfhr("jobs.search.sources", default: "Searched \(list).", table: "Jobs", comment: "%@ = list of job sites, e.g. Remotive and Arbeitnow.")
    }

    static func skippedSources(_ list: String) -> LocalizedStringResource {
        .bfhr("jobs.search.skipped", default: "Not searched: \(list).", table: "Jobs", comment: "%@ = list of sources with the reason in brackets.")
    }

    static func skipReason(_ report: SourceRunReport) -> LocalizedStringResource {
        switch report.reason {
        case .noKey: .bfhr("jobs.search.skip.noKey", default: "needs an API key", table: "Jobs")
        case .quotaExhausted: .bfhr("jobs.search.skip.quota", default: "daily limit reached", table: "Jobs")
        case .rateLimited: .bfhr("jobs.search.skip.rateLimited", default: "busy, try later", table: "Jobs")
        case .blocked, .unavailable, .invalidResponse: .bfhr("jobs.search.skip.blocked", default: "not available", table: "Jobs")
        case .disabled: .bfhr("jobs.search.skip.off", default: "switched off", table: "Jobs")
        case nil:
            report.status == .error
                ? .bfhr("jobs.search.skip.error", default: "didn't answer", table: "Jobs")
                : .bfhr("jobs.search.skip.off", default: "switched off", table: "Jobs")
        }
    }

    static func searchFailedTitle(_ error: JobSearchError) -> LocalizedStringResource {
        switch error {
        case .offline: .bfhr("jobs.search.failed.offline", default: "Searching job sites needs a connection", table: "Jobs")
        case .rateLimited: .bfhr("jobs.search.failed.rateLimited", default: "Lots of searches just now", table: "Jobs")
        case .noSources: .bfhr("jobs.search.failed.noSources", default: "No job sources are switched on", table: "Jobs")
        case .savedSearchNotFound: .bfhr("jobs.search.failed.notFound", default: "This saved search was deleted", table: "Jobs")
        case .failed: .bfhr("jobs.search.failed", default: "The search didn't finish", table: "Jobs")
        }
    }

    static func searchFailedBody(_ error: JobSearchError) -> LocalizedStringResource {
        switch error {
        case .offline: .bfhr("jobs.search.failed.offline.body", default: "Your list still filters the jobs you already have.", table: "Jobs")
        case .rateLimited: .bfhr("jobs.search.failed.rateLimited.body", default: "Wait a minute, then try again.", table: "Jobs")
        case .noSources: .bfhr("jobs.search.failed.noSources.body", default: "Job sources come back on as soon as they're available.", table: "Jobs")
        case .savedSearchNotFound, .failed: .bfhr("jobs.search.failed.body", default: "Your jobs are safe. Try again in a moment.", table: "Jobs")
        }
    }

    static let searchAllSources = LocalizedStringResource.bfhr("jobs.search.allSources", default: "Search job sites", table: "Jobs")
    static let noResultsTitle = LocalizedStringResource.bfhr("jobs.noResults.title", default: "No jobs match all of these filters", table: "Jobs")
    static let noResultsBody = LocalizedStringResource.bfhr("jobs.noResults.body", default: "Try removing one.", table: "Jobs")

    // MARK: Rows

    static func sources(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobs.row.sources", default: "Sources: \(count)", table: "Jobs", comment: "The same job found on several sites. %lld = count.")
    }

    static func hiddenRow(title: String, company: String) -> LocalizedStringResource {
        .bfhr("jobs.row.hidden", default: "Hidden: \(title) · \(company)", table: "Jobs", comment: "Inline row after Not for me. %1$@ = job title, %2$@ = company.")
    }

    // MARK: Save search banner

    static let saveSearchBanner = LocalizedStringResource.bfhr("jobs.saveSearch.banner", default: "Get alerts for this search", table: "Jobs")

    // MARK: Toasts

    static func savedToast(_ company: String) -> LocalizedStringResource {
        .bfhr("jobs.toast.saved", default: "\(company) · saved", table: "Jobs", comment: "%@ = company. Followed by Undo.")
    }

    static func unsavedToast(_ company: String) -> LocalizedStringResource {
        .bfhr("jobs.toast.unsaved", default: "\(company) · removed from Saved", table: "Jobs", comment: "%@ = company. Followed by Undo.")
    }

    static let reasonsSavedToast = LocalizedStringResource.bfhr("jobs.toast.reasonsSaved", default: "Thanks. We'll use this to tune your matches.", table: "Jobs")
    static let searchSavedToast = LocalizedStringResource.bfhr("jobs.toast.searchSaved", default: "Search saved", table: "Jobs", comment: "Followed by Edit.")

    static func searchDeletedToast(_ name: String) -> LocalizedStringResource {
        .bfhr("jobs.toast.searchDeleted", default: "\(name) · deleted", table: "Jobs", comment: "%@ = saved search name. Followed by Undo.")
    }

    static func unhiddenToast(_ company: String) -> LocalizedStringResource {
        .bfhr("jobs.toast.unhidden", default: "\(company) · back in your feed", table: "Jobs", comment: "%@ = company.")
    }

    static let defaultSearchName = LocalizedStringResource.bfhr("jobs.savedSearch.defaultName", default: "My search", table: "Jobs")

    // MARK: Saved searches

    static let savedSearchesTitle = LocalizedStringResource.bfhr("jobs.savedSearches.title", default: "Saved searches", table: "Jobs")
    static let savedSearchesLoading = LocalizedStringResource.bfhr("jobs.savedSearches.loading", default: "Loading saved searches", table: "Jobs")
    static let savedSearchesError = LocalizedStringResource.bfhr("jobs.savedSearches.error", default: "We couldn't load your saved searches", table: "Jobs")
    static let noSavedSearchesTitle = LocalizedStringResource.bfhr("jobs.savedSearches.empty.title", default: "No saved searches yet", table: "Jobs")
    static let noSavedSearchesBody = LocalizedStringResource.bfhr("jobs.savedSearches.empty.body", default: "Save a search to have it run for you and hear about good matches.", table: "Jobs")
    static let savedSearchesFooter = LocalizedStringResource.bfhr("jobs.savedSearches.footer", default: "Saved searches run on their schedule, even when the app is closed.", table: "Jobs")
    static let showJobsAction = LocalizedStringResource.bfhr("jobs.savedSearches.show", default: "Show jobs", table: "Jobs")
    static let hiddenJobsTitle = LocalizedStringResource.bfhr("jobs.hidden.title", default: "Hidden jobs", table: "Jobs")

    static func cadenceLine(_ search: SavedSearch) -> LocalizedStringResource {
        guard search.enabled else {
            return .bfhr("jobs.savedSearches.alertsOff", default: "Alerts off", table: "Jobs")
        }
        let schedule = String(localized: Self.schedule(search.schedule))
        let threshold = String(localized: Self.threshold(SavedSearchDraft.band(forThreshold: search.alertThreshold)))
        return .bfhr("jobs.savedSearches.cadence", default: "\(schedule) · \(threshold)", table: "Jobs", comment: "%1$@ = schedule, %2$@ = alert threshold.")
    }

    static func schedule(_ schedule: SavedSearchSchedule) -> LocalizedStringResource {
        switch schedule {
        case .hourly: .bfhr("jobs.schedule.hourly", default: "Every hour", table: "Jobs")
        case .daily: .bfhr("jobs.schedule.daily", default: "Every day", table: "Jobs")
        case .weekly: .bfhr("jobs.schedule.weekly", default: "Every week", table: "Jobs")
        }
    }

    static func threshold(_ band: MatchBand) -> LocalizedStringResource {
        switch band {
        case .strong: .bfhr("jobs.threshold.strong", default: "Strong matches", table: "Jobs")
        case .good: .bfhr("jobs.threshold.good", default: "Good and above", table: "Jobs")
        case .partial, .stretch: .bfhr("jobs.threshold.all", default: "All matches", table: "Jobs")
        }
    }

    static let editSavedSearch = LocalizedStringResource.bfhr("jobs.editor.title", default: "Saved search", table: "Jobs")
    static let searchSection = LocalizedStringResource.bfhr("jobs.editor.search", default: "Search", table: "Jobs")
    static let searchName = LocalizedStringResource.bfhr("jobs.editor.name", default: "Name", table: "Jobs")
    static let searchKeywords = LocalizedStringResource.bfhr("jobs.editor.keywords", default: "Role, skill or company", table: "Jobs")
    static let searchKeywordsLabel = LocalizedStringResource.bfhr("jobs.editor.keywordsLabel", default: "Keywords", table: "Jobs")
    static let noFilters = LocalizedStringResource.bfhr("jobs.editor.noFilters", default: "None", table: "Jobs")
    static let alertsSection = LocalizedStringResource.bfhr("jobs.editor.alertsSection", default: "Alerts", table: "Jobs")
    static let alerts = LocalizedStringResource.bfhr("jobs.editor.alerts", default: "Run and notify me", table: "Jobs")
    static let checkFor = LocalizedStringResource.bfhr("jobs.editor.schedule", default: "Runs", table: "Jobs")
    static let notifyFor = LocalizedStringResource.bfhr("jobs.editor.threshold", default: "Notify me for", table: "Jobs")
    static let dailyDigest = LocalizedStringResource.bfhr("jobs.editor.digest", default: "Daily summary", table: "Jobs")
    static let alertsFooter = LocalizedStringResource.bfhr("jobs.editor.alerts.footer", default: "New jobs are added to your feed either way. Notifications only cover matches at or above your choice.", table: "Jobs")
    static let alertsOffFooter = LocalizedStringResource.bfhr("jobs.editor.alerts.off", default: "The search stays saved. It won't run on its own or notify you.", table: "Jobs")
    static let deleteSearch = LocalizedStringResource.bfhr("jobs.editor.delete", default: "Delete saved search", table: "Jobs")
    static let saveSearch = LocalizedStringResource.bfhr("jobs.editor.save", default: "Save", table: "Jobs")
    static let countryCodes = LocalizedStringResource.bfhr("jobs.editor.countries", default: "Country codes, e.g. DE, NL", table: "Jobs")
    static let countryCodesFooter = LocalizedStringResource.bfhr("jobs.editor.countries.footer", default: "Two-letter codes, separated by commas.", table: "Jobs")

    // MARK: Hidden jobs

    static let hiddenEmpty = LocalizedStringResource.bfhr("jobs.hidden.empty", default: "Jobs you hide with Not for me show up here.", table: "Jobs")
    static let hiddenFooter = LocalizedStringResource.bfhr("jobs.hidden.footer", default: "Hidden jobs don't come back from other sites. Swipe right to show one again.", table: "Jobs")
    static let showInFeed = LocalizedStringResource.bfhr("jobs.hidden.show", default: "Show in feed", table: "Jobs")
}
