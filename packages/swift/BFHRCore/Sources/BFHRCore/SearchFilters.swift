import Foundation

// Port of `passesSearchFilters` in packages/core/src/jobs/filters.ts: whether a normalized job
// satisfies a saved search's filters. Unknown job values pass (a posting that doesn't state its
// salary is not excluded by a salary minimum).

/// Salary periods as multiples of a year (220 working days, 1,760 working hours).
public let salaryPeriodsPerYear: [SalaryPeriod: Double] = [.year: 1, .month: 12, .day: 220, .hour: 1_760]

public func passesSearchFilters(_ job: Job, _ filters: SavedSearchFilters, now: Date) -> Bool {
    if !filters.sources.isEmpty, !job.sources.contains(where: { filters.sources.contains($0.source) }) {
        return false
    }
    if !filters.remoteTypes.isEmpty, let remote = job.remoteType, !filters.remoteTypes.contains(remote) {
        return false
    }
    if !filters.countryCodes.isEmpty {
        let countries = job.locations.compactMap(\.countryCode)
        let remoteAllowed = job.remoteType == .remote && filters.remoteTypes.contains(.remote)
        if !countries.isEmpty, !countries.contains(where: filters.countryCodes.contains), !remoteAllowed {
            return false
        }
    }
    if !filters.seniority.isEmpty, let seniority = job.seniority, !filters.seniority.contains(seniority) {
        return false
    }
    if filters.visaSponsorship == true, job.visaSponsorship == false { return false }
    if let days = filters.postedWithinDays, let posted = job.postedAt ?? job.sources.first?.firstSeenAt,
       now.timeIntervalSince(posted) > Double(days) * 86_400 {
        return false
    }
    if let minimum = filters.salaryMin, let salary = job.salary, salary.currency == minimum.currency {
        let top = (salary.max ?? salary.min ?? 0) * (salaryPeriodsPerYear[salary.period] ?? 1)
        if top < minimum.amount * (salaryPeriodsPerYear[minimum.period] ?? 1) { return false }
    }
    return true
}
