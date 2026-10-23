import Foundation
import Testing
@testable import BFHRCore

/// `packages/core/conformance/insights.json`, decoded.
struct InsightsVectors: Decodable {
    struct CivilDateCase: Decodable {
        let instant: Date
        let timeZone: String
        let date: CivilDate
    }

    struct ValidityCase: Decodable {
        let value: String
        let valid: Bool
    }

    struct DateCase: Decodable {
        struct Shift: Decodable {
            let days: Int?
            let months: Int?
            let date: CivilDate
        }

        struct Preset: Decodable {
            let preset: InsightsRangePreset
            let range: InsightsRange
            let previous: InsightsRange?
        }

        let date: CivilDate
        let isoWeekday: Int
        let startOfWeekMonday: CivilDate
        let startOfWeekSunday: CivilDate
        let addDays: [Shift]
        let addMonths: [Shift]
        let presets: [Preset]
    }

    struct Calendar: Decodable {
        let civilDate: [CivilDateCase]
        let isCivilDate: [ValidityCase]
        let dates: [DateCase]
    }

    struct Market: Decodable {
        struct Case: Decodable {
            let location: String
            let folded: String
            let market: String?
        }

        let order: [String]
        let keywords: [String: [String]]
        let remote: [String]
        let cases: [Case]
    }

    struct Dataset: Decodable {
        let applications: [InsightsApplication]
        let events: [ApplicationEvent]
        let interviews: [InsightsInterview]?
        let mailCategories: [String: MailCategory]?

        var input: InsightsInput {
            InsightsInput(
                applications: applications, events: events, interviews: interviews ?? [],
                mailCategories: mailCategories ?? [:]
            )
        }
    }

    struct Options: Decodable {
        let now: Date
        let timeZone: String
        let weekStart: Int
        let range: InsightsRange
        let filters: [String: String]?

        var value: InsightsOptions {
            InsightsOptions(now: now, timeZone: timeZone, weekStart: weekStart, range: range, filters: filters.dimensions)
        }
    }

    struct ReportCase: Decodable {
        let name: String
        let dataset: String
        let options: Options
        let expected: InsightsReport
    }

    /// TypeScript `InsightsDrillDown` as JSON.
    struct Drill: Decodable, Equatable {
        let stage: String?
        let activity: String?
        let from: String?
        let to: String?
        let filters: [String: String]?

        var parameters: [String: String] {
            var parameters = filters ?? [:]
            for (key, value) in [("stage", stage), ("activity", activity), ("from", from), ("to", to)] {
                if let value { parameters[key] = value }
            }
            return parameters
        }

        init(stage: String?, activity: String?, from: String?, to: String?, filters: [String: String]?) {
            (self.stage, self.activity, self.from, self.to, self.filters) = (stage, activity, from, to, filters)
        }

        init(_ drill: InsightsDrillDown) {
            let filters = Dictionary(uniqueKeysWithValues: drill.filters.map { ($0.key.rawValue, $0.value) })
            switch drill.kind {
            case .stage(let stage):
                self.init(stage: stage.rawValue, activity: nil, from: drill.from, to: drill.to, filters: filters.isEmpty ? nil : filters)
            case .activity(let activity):
                self.init(stage: nil, activity: activity.rawValue, from: drill.from, to: drill.to, filters: filters.isEmpty ? nil : filters)
            }
        }
    }

    struct DrillCase: Decodable {
        let name: String
        let dataset: String
        let drill: Drill
        let now: Date
        let timeZone: String
        let expected: [String]
    }

    struct ParseCase: Decodable {
        let params: [String: String]
        let expected: Drill?
        let searchParams: [String: String]?
    }

    let format: Int
    let calendar: Calendar
    let market: Market
    let datasets: [String: Dataset]
    let reports: [ReportCase]
    let drillDowns: [DrillCase]
    let parse: [ParseCase]
}

extension Optional where Wrapped == [String: String] {
    var dimensions: InsightsFilters {
        var filters: InsightsFilters = [:]
        for (key, value) in self ?? [:] {
            if let dimension = InsightsDimension(rawValue: key) { filters[dimension] = value }
        }
        return filters
    }
}

@Suite("Insights conformance (packages/core/conformance/insights.json)")
struct InsightsConformanceTests {
    let vectors: InsightsVectors

    init() throws {
        vectors = try ConformanceFile.decode(InsightsVectors.self, from: ConformanceFile.insights)
        try #require(vectors.format == 1, "Unknown vector format; update the Swift decoder")
    }

    @Test func civilDatesMatch() {
        #expect(!vectors.calendar.civilDate.isEmpty)
        for vector in vectors.calendar.civilDate {
            let actual = InsightsCalendar(timeZoneIdentifier: vector.timeZone).civilDate(vector.instant)
            #expect(actual == vector.date, "\(ISO8601Timestamp.string(from: vector.instant)) in \(vector.timeZone)")
        }
        for vector in vectors.calendar.isCivilDate {
            #expect(CivilDates.isValid(vector.value) == vector.valid, "\(vector.value)")
        }
    }

    @Test func dateArithmeticAndPresetsMatch() {
        for vector in vectors.calendar.dates {
            let date = vector.date
            #expect(CivilDates.isoWeekday(date) == vector.isoWeekday, "weekday \(date)")
            #expect(CivilDates.startOfWeek(date, weekStart: 1) == vector.startOfWeekMonday, "monday week \(date)")
            #expect(CivilDates.startOfWeek(date, weekStart: 7) == vector.startOfWeekSunday, "sunday week \(date)")
            for shift in vector.addDays {
                #expect(CivilDates.addDays(date, shift.days ?? 0) == shift.date, "\(date) + \(shift.days ?? 0) days")
            }
            for shift in vector.addMonths {
                #expect(CivilDates.addMonths(date, shift.months ?? 0) == shift.date, "\(date) + \(shift.months ?? 0) months")
            }
            for preset in vector.presets {
                let range = rangeForPreset(preset.preset, today: date)
                #expect(range == preset.range, "\(preset.preset.rawValue) ending \(date)")
                #expect(previousRange(range) == preset.previous, "previous of \(preset.preset.rawValue) ending \(date)")
            }
        }
    }

    @Test func marketTableAndFoldingMatch() {
        #expect(InsightsMarket.keywords.map(\.market) == vectors.market.order)
        for (market, keywords) in InsightsMarket.keywords {
            #expect(vectors.market.keywords[market] == keywords, "keywords of \(market)")
        }
        #expect(InsightsMarket.remoteKeywords == vectors.market.remote)
        for vector in vectors.market.cases {
            #expect(InsightsMarket.fold(vector.location) == vector.folded, "fold \(vector.location)")
            #expect(InsightsMarket.of(vector.location) == vector.market, "market \(vector.location)")
        }
    }

    @Test func reportsMatch() throws {
        #expect(vectors.reports.count > 50)
        for vector in vectors.reports {
            let dataset = try #require(vectors.datasets[vector.dataset])
            let actual = computeInsights(dataset.input, options: vector.options.value)
            #expect(actual == vector.expected, "\(vector.name)")
        }
    }

    @Test func drillDownsMatch() throws {
        #expect(!vectors.drillDowns.isEmpty)
        for vector in vectors.drillDowns {
            let dataset = try #require(vectors.datasets[vector.dataset])
            let drill = try #require(InsightsDrillDown(parameters: vector.drill.parameters), "\(vector.name)")
            let actual = selectDrillDownIds(dataset.input, drill: drill, now: vector.now, timeZone: vector.timeZone)
            #expect(actual == vector.expected, "\(vector.name)")
        }
    }

    @Test func drillDownParsingMatches() {
        for vector in vectors.parse {
            let drill = InsightsDrillDown(parameters: vector.params)
            #expect(drill.map(InsightsVectors.Drill.init) == vector.expected, "parse \(vector.params)")
            let items = drill.map { Dictionary(uniqueKeysWithValues: $0.queryItems.map { ($0.name, $0.value ?? "") }) }
            #expect(items == vector.searchParams, "search params \(vector.params)")
        }
    }

    @Test func drillDownURLIsTheTrackerTable() throws {
        let drill = InsightsDrillDown(.stage(.interview), from: "2026-07-24", to: "2026-10-22", filters: [.source: "greenhouse"])
        #expect(
            drill.url.absoluteString
                == "bruteforcehr://tracker?view=table&stage=interview&from=2026-07-24&to=2026-10-22&source=greenhouse"
        )
        let items = try #require(URLComponents(url: drill.url, resolvingAgainstBaseURL: false)?.queryItems)
        let parameters = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        #expect(InsightsDrillDown(parameters: parameters) == drill)
    }
}
