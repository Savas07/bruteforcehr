import BFHRCore
import Foundation
import Observation

/// Insights on iPhone (research/insights.md "Decision — iOS", decisions.md D30/D31): pushed on the
/// Tracker stack (D03). Every number comes from BFHRCore's `computeInsights`, the port of
/// `@bfhr/core` proven by the conformance vectors, so iPhone and desktop always agree. The model
/// exposes typed values; the view formats them.
@Observable
public final class InsightsModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    /// `4W · 12W · All` (D31). The host persists it per device (`onRangeChange`).
    public var range: InsightsRangePreset = .twelveWeeks {
        didSet {
            guard range != oldValue else { return }
            rebuild()
            onRangeChange?(range)
        }
    }

    /// Called when the user picks another range, to remember it on this device.
    public var onRangeChange: ((InsightsRangePreset) -> Void)?

    /// Applies the range a `bruteforcehr://insights?range=` link asked for (iOS ranges only).
    public func applyLinkRange(_ value: String?) {
        guard let value, let preset = InsightsRangePreset(rawValue: value), InsightsRangePreset.ios.contains(preset) else { return }
        range = preset
    }

    /// "Where responses come from": Source · Channel · CV.
    public var dimension: InsightsDimension = .source

    /// Weekly activity series.
    public var series: InsightsSeries = .applied

    /// Scrolls to this card when the screen appears (design captures of the lower cards).
    public var scrollTarget: InsightsCard?

    /// Weekly activity as a running total (small numbers read better cumulatively).
    public var isCumulative = false

    /// The clock; the data layer advances it.
    public var now: Date {
        didSet { rebuild() }
    }

    public let calendar: Calendar

    public private(set) var data: UserData = .empty
    public private(set) var report: InsightsReport
    /// Applications applied at any time (first use = 0).
    public private(set) var appliedEver = 0

    public init(now: Date = .now, calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
        report = computeInsights(InsightsInput(applications: [], events: []), options: InsightsOptions(
            now: now, timeZone: calendar.timeZone.identifier, weekStart: 1,
            range: InsightsRange(from: nil, to: InsightsCalendar(timeZone: calendar.timeZone).civilDate(now))
        ))
        rebuild()
    }

    public func load(_ data: UserData) {
        self.data = data
        rebuild()
        phase = .loaded
    }

    // MARK: Derived

    /// The zone applied dates and weeks are counted in: the profile's, else the device's.
    public var timeZoneIdentifier: String { data.profile?.timezone ?? calendar.timeZone.identifier }

    /// The locale's first weekday as an ISO weekday (Calendar: 1 = Sunday … 7 = Saturday).
    public var weekStart: Int { calendar.firstWeekday == 1 ? 7 : calendar.firstWeekday - 1 }

    public var today: CivilDate { InsightsCalendar(timeZoneIdentifier: timeZoneIdentifier).civilDate(now) }

    public var input: InsightsInput {
        var categories: [String: MailCategory] = [:]
        for message in data.mailMessages { categories[message.id] = message.category }
        return InsightsInput(
            applications: data.applications.map(InsightsApplication.init),
            events: data.applicationEvents,
            interviews: data.interviews.map(InsightsInterview.init),
            mailCategories: categories
        )
    }

    /// Nothing has been sent yet: the first-use empty state.
    public var isFirstUse: Bool { appliedEver == 0 }
    /// Applications exist, but none in this range.
    public var isEmptyRange: Bool { !isFirstUse && report.applications == 0 }
    /// Fewer than 5 applications in range: rates are suppressed.
    public var isLowSample: Bool { report.applications > 0 && report.applications < Insights.lowSampleThreshold }

    public var funnel: [FunnelStep] { report.funnel }

    /// Breakdown rows for `dimension`.
    public var breakdownRows: [BreakdownRow] { report.breakdowns[dimension] }

    /// Values of the selected series, oldest first (cumulative when on).
    public var activity: [ActivityPoint] {
        var total = 0
        return report.weekly.map { week in
            let value = series.value(of: week)
            total += value
            return ActivityPoint(weekStart: week.weekStart, value: isCumulative ? total : value, weekly: value)
        }
    }

    /// This week's count of the selected series and the 12-week weekly average.
    public var thisWeek: Int { report.weekly.last.map(series.value(of:)) ?? 0 }
    public var weeklyAverage: Double {
        Double(report.weekly.reduce(0) { $0 + series.value(of: $1) }) / Double(max(1, report.weekly.count))
    }

    /// The range shown, for the drill-downs and the date line.
    public var resolvedRange: InsightsRange { rangeForPreset(range, today: today) }

    /// The CV title for a CV breakdown key.
    public func cvTitle(_ id: String) -> String? { data.cv(id: id)?.title }

    // MARK: Drill-downs

    /// The applications that reached `stage` in this range.
    public func drillDown(stage: DrillDownStage) -> InsightsDrillDown {
        InsightsDrillDown(.stage(stage), from: resolvedRange.from, to: resolvedRange.to)
    }

    /// Applications in this range with `key` for `dimension`.
    public func drillDown(_ dimension: InsightsDimension, key: String) -> InsightsDrillDown {
        InsightsDrillDown(.stage(.applied), from: resolvedRange.from, to: resolvedRange.to, filters: [dimension: key])
    }

    /// The selected series in the week starting `weekStart`.
    public func drillDown(week weekStart: CivilDate) -> InsightsDrillDown {
        let end = min(CivilDates.addDays(weekStart, 6), today)
        return InsightsDrillDown(.activity(series.activity), from: weekStart, to: end)
    }

    /// What the Pipeline shows for `drill`: the matching ids and the chip label ("From Insights: …").
    public func trackerFilter(for drill: InsightsDrillDown) -> (ids: Set<String>, label: String) {
        let ids = selectDrillDownIds(input, drill: drill, now: now, timeZone: timeZoneIdentifier)
        return (Set(ids), InsightsFormat.drillLabel(drill, model: self))
    }

    // MARK: Building

    private func rebuild() {
        let input = input
        let tz = timeZoneIdentifier
        let options = InsightsOptions(now: now, timeZone: tz, weekStart: weekStart, range: resolvedRange)
        report = computeInsights(input, options: options)
        let calendar = InsightsCalendar(timeZoneIdentifier: tz)
        appliedEver = insightsJourneys(input, calendar: calendar, filters: [:]).filter { $0.appliedDate != nil }.count
    }
}

/// The cards below the KPI grid; a KPI tile scrolls to its card.
public enum InsightsCard: String, Hashable, Sendable {
    case funnel, breakdown, firstResponse = "first-response", activity
}

/// Weekly activity series (research/insights.md: applications, with follow-ups and interviews as a
/// toggle, never stacked).
public enum InsightsSeries: String, CaseIterable, Identifiable, Sendable {
    case applied, followUps, interviews

    public var id: Self { self }

    func value(of week: ActivityWeek) -> Int {
        switch self {
        case .applied: week.applied
        case .followUps: week.followUps
        case .interviews: week.interviews
        }
    }

    var activity: DrillDownActivity {
        switch self {
        case .applied: .applied
        case .followUps: .followUp
        case .interviews: .interview
        }
    }
}

public struct ActivityPoint: Hashable, Identifiable, Sendable {
    public let weekStart: CivilDate
    /// Plotted value (running total when cumulative).
    public let value: Int
    /// That week's own count.
    public let weekly: Int

    public var id: CivilDate { weekStart }
}
