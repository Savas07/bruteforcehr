import BFHRCore
import BFHRUIFixtures
import Foundation
import Testing
@testable import BFHRUI

@Suite("Insights model")
struct InsightsModelTests {
    private func model(_ dataset: FixtureDataset = .populated, range: InsightsRangePreset = .twelveWeeks) throws -> InsightsModel {
        let document = try FixtureStore.document(dataset)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: document.profile.timezone)!
        calendar.firstWeekday = 2
        let model = InsightsModel(now: document.now, calendar: calendar)
        model.range = range
        model.load(UserData(document))
        return model
    }

    @Test func matchesTheCoreReport() throws {
        let model = try model()
        #expect(model.phase == .loaded)
        let expected = computeInsights(model.input, options: InsightsOptions(
            now: model.now, timeZone: model.timeZoneIdentifier, weekStart: 1, range: model.resolvedRange
        ))
        #expect(model.report == expected)
        #expect(model.report.applications > 5)
        #expect(model.funnel.map(\.stage) == FunnelStage.allCases)
        #expect(model.report.weekly.count == 12)
        #expect(!model.isFirstUse)
        #expect(!model.isLowSample)
    }

    @Test func emptyDataIsFirstUse() throws {
        let model = try model(.empty)
        #expect(model.isFirstUse)
        #expect(!model.isEmptyRange)
        #expect(model.report.responseRate.value == nil)
    }

    @Test func rangeChangesTheCohort() throws {
        let model = try model(range: .all)
        let all = model.report.applications
        model.range = .fourWeeks
        #expect(model.report.applications < all)
        #expect(model.resolvedRange.from == CivilDates.addDays(model.today, -27))
    }

    @Test func drillDownsSelectWhatTheFunnelCounts() throws {
        let model = try model(range: .all)
        for step in model.funnel {
            let filter = model.trackerFilter(for: model.drillDown(stage: step.stage.drillStage))
            #expect(filter.ids.count == step.reached, "\(step.stage)")
            #expect(!filter.label.isEmpty)
        }
        let row = try #require(model.breakdownRows.first)
        let filter = model.trackerFilter(for: model.drillDown(.source, key: row.key))
        #expect(filter.ids.count == row.applications)
        let week = try #require(model.report.weekly.last)
        let thisWeek = model.trackerFilter(for: model.drillDown(week: week.weekStart))
        #expect(thisWeek.ids.count == week.applied)
    }

    @Test func activitySeriesAndRunningTotal() throws {
        let model = try model()
        let weekly = model.activity.map(\.value)
        #expect(weekly == model.report.weekly.map(\.applied))
        model.isCumulative = true
        #expect(model.activity.last?.value == weekly.reduce(0, +))
        model.series = .interviews
        model.isCumulative = false
        #expect(model.activity.map(\.value) == model.report.weekly.map(\.interviews))
        #expect(model.thisWeek == model.report.weekly.last?.interviews)
    }

    @Test func labelsNameSourcesChannelsAndCvs() throws {
        let model = try model(range: .all)
        #expect(InsightsFormat.label(.source, key: "greenhouse", model: model) == "Greenhouse")
        #expect(InsightsFormat.label(.channel, key: "email", model: model) == "Email")
        let cv = try #require(model.data.cvs.first)
        #expect(InsightsFormat.label(.cv, key: cv.id, model: model) == cv.title)
        #expect(InsightsFormat.label(.market, key: "remote", model: model) == "Remote")
        let drill = InsightsDrillDown(.stage(.interview), from: "2026-07-25", to: "2026-10-22", filters: [.source: "greenhouse"])
        #expect(InsightsFormat.drillLabel(drill, model: model).hasPrefix("Reached interview · "))
        #expect(InsightsFormat.drillLabel(drill, model: model).hasSuffix(" · Greenhouse"))
    }
}
