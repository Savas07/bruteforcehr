import BFHRCore
import Foundation

/// Insights copy (table `Insights`), research/insights.md "Copy notes": factual and calm, every rate
/// next to its count, no "only", "low", "goal" or "streak". Status names come from the shared labels.
enum InsightsStrings {
    static let title = LocalizedStringResource.bfhr("insights.title", default: "Insights", table: "Insights")
    static let loading = LocalizedStringResource.bfhr("insights.loading", default: "Loading insights", table: "Insights")
    static let errorTitle = LocalizedStringResource.bfhr("insights.error.title", default: "We couldn't load your insights", table: "Insights")
    static let rangeLabel = LocalizedStringResource.bfhr("insights.range.label", default: "Range", table: "Insights", comment: "VoiceOver label of the 4W / 12W / All picker.")
    static let range4w = LocalizedStringResource.bfhr("insights.range.4w", default: "4W", table: "Insights", comment: "Range: last 4 weeks. Keep short.")
    static let range12w = LocalizedStringResource.bfhr("insights.range.12w", default: "12W", table: "Insights", comment: "Range: last 12 weeks. Keep short.")
    static let rangeAll = LocalizedStringResource.bfhr("insights.range.all", default: "All", table: "Insights", comment: "Range: all time.")
    static let range4wSpoken = LocalizedStringResource.bfhr("insights.range.4w.spoken", default: "Last 4 weeks", table: "Insights")
    static let range12wSpoken = LocalizedStringResource.bfhr("insights.range.12w.spoken", default: "Last 12 weeks", table: "Insights")
    static let rangeAllSpoken = LocalizedStringResource.bfhr("insights.range.all.spoken", default: "All time", table: "Insights")

    // MARK: Empty and low data

    static let firstUseTitle = LocalizedStringResource.bfhr("insights.empty.title", default: "Insights start with your first application", table: "Insights")
    static let firstUseBody = LocalizedStringResource.bfhr(
        "insights.empty.body",
        default: "Once you move an application to Applied, this shows how far your applications get and where replies come from.",
        table: "Insights"
    )
    static let emptyRangeTitle = LocalizedStringResource.bfhr("insights.emptyRange.title", default: "No applications in this range", table: "Insights")
    static let emptyRangeBody = LocalizedStringResource.bfhr("insights.emptyRange.body", default: "Applications you sent earlier show under All.", table: "Insights")
    static let showAllTime = LocalizedStringResource.bfhr("insights.emptyRange.showAll", default: "Show all time", table: "Insights")
    static let lowSample = LocalizedStringResource.bfhr(
        "insights.lowSample",
        default: "Not enough applications yet to show a rate. This fills in as you apply.",
        table: "Insights",
        comment: "Shown while fewer than 5 applications are in the range (decisions.md D31)."
    )
    static let provenance = LocalizedStringResource.bfhr(
        "insights.provenance",
        default: "Computed from your application history. Updated when your tracker changes.",
        table: "Insights"
    )

    // MARK: KPI tiles

    static let kpiApplications = LocalizedStringResource.bfhr("insights.kpi.applications", default: "Applications", table: "Insights")
    static let kpiResponse = LocalizedStringResource.bfhr("insights.kpi.response", default: "Response rate", table: "Insights")
    static let kpiInterviews = LocalizedStringResource.bfhr("insights.kpi.interviews", default: "Interviews", table: "Insights")
    static let kpiFirstResponse = LocalizedStringResource.bfhr("insights.kpi.firstResponse", default: "First response", table: "Insights", comment: "Short form of 'Median time to first response'.")
    static let sentInRange = LocalizedStringResource.bfhr("insights.kpi.sent", default: "sent in this range", table: "Insights")
    static let showsFromFive = LocalizedStringResource.bfhr("insights.kpi.showsFromFive", default: "shows from 5", table: "Insights", comment: "Under a suppressed rate or median.")
    static let kpiHint = LocalizedStringResource.bfhr("insights.kpi.hint", default: "Shows the details below", table: "Insights", comment: "VoiceOver hint: tapping a tile scrolls to its card.")

    static func countOf(_ count: Int, _ total: Int) -> LocalizedStringResource {
        .bfhr("insights.countOf", default: "\(count) of \(total)", table: "Insights", comment: "%1$lld of %2$lld applications.")
    }

    static func medianOf(_ count: Int) -> LocalizedStringResource {
        .bfhr("insights.kpi.medianOf", default: "median of \(count)", table: "Insights", comment: "%lld = replies measured.")
    }

    static func repliesSoFar(_ count: Int) -> LocalizedStringResource {
        .bfhr("insights.kpi.repliesSoFar", default: "Replies so far: \(count)", table: "Insights")
    }

    // MARK: Funnel

    static let funnelQuestion = LocalizedStringResource.bfhr("insights.funnel.question", default: "How far do my applications get?", table: "Insights")
    static let stageApplied = LocalizedStringResource.bfhr("insights.stage.applied", default: "Applied", table: "Insights")
    static let stageResponse = LocalizedStringResource.bfhr("insights.stage.response", default: "Response", table: "Insights")
    static let stageInterview = LocalizedStringResource.bfhr("insights.stage.interview", default: "Interview", table: "Insights", comment: "Short: fits a bar label (DE 'Gespräch').")
    static let stageOffer = LocalizedStringResource.bfhr("insights.stage.offer", default: "Offer", table: "Insights")
    static let opensTracker = LocalizedStringResource.bfhr("insights.opensTracker", default: "Shows these applications in Tracker", table: "Insights", comment: "VoiceOver hint of every drill-down.")

    static func funnelTitle(responded: Int, applied: Int) -> LocalizedStringResource {
        .bfhr("insights.funnel.title", default: "\(responded) of \(applied) got a response", table: "Insights", comment: "Funnel card sentence. %1$lld responded, %2$lld applied.")
    }

    static func stepFromPrevious(_ percent: String) -> LocalizedStringResource {
        .bfhr("insights.funnel.step", default: "\(percent) of the previous stage", table: "Insights", comment: "%@ = '60 %'.")
    }

    static func stageValue(_ count: Int, _ percent: String) -> LocalizedStringResource {
        .bfhr("insights.funnel.stageValue", default: "Applications: \(count), \(percent) of applied", table: "Insights", comment: "VoiceOver value of a funnel bar. %1$lld count, %2$@ percent.")
    }

    static func stillWaiting(_ count: Int) -> LocalizedStringResource {
        .bfhr("insights.bucket.waiting", default: "Still waiting: \(count)", table: "Insights", comment: "Applications without a reply that are still open (decisions.md D15).")
    }

    static func noResponse(_ count: Int) -> LocalizedStringResource {
        .bfhr("insights.bucket.noResponse", default: "Marked no response: \(count)", table: "Insights")
    }

    static func withdrawn(_ count: Int) -> LocalizedStringResource {
        .bfhr("insights.bucket.withdrawn", default: "Withdrawn: \(count)", table: "Insights")
    }

    // MARK: Breakdown

    static let breakdownQuestion = LocalizedStringResource.bfhr("insights.breakdown.question", default: "Where do responses come from?", table: "Insights")
    static let breakdownBy = LocalizedStringResource.bfhr("insights.breakdown.by", default: "Group by", table: "Insights")
    static let dimensionSource = LocalizedStringResource.bfhr("insights.dimension.source", default: "Source", table: "Insights")
    static let dimensionChannel = LocalizedStringResource.bfhr("insights.dimension.channel", default: "Channel", table: "Insights")
    static let dimensionCv = LocalizedStringResource.bfhr("insights.dimension.cv", default: "CV", table: "Insights")
    static let dimensionMarket = LocalizedStringResource.bfhr("insights.dimension.market", default: "Market", table: "Insights")
    static let tooFew = LocalizedStringResource.bfhr("insights.breakdown.tooFew", default: "Too few to compare", table: "Insights")
    static let showAll = LocalizedStringResource.bfhr("insights.breakdown.showAll", default: "Show all", table: "Insights")
    static let showFewer = LocalizedStringResource.bfhr("insights.breakdown.showFewer", default: "Show fewer", table: "Insights")
    static let sourceNone = LocalizedStringResource.bfhr("insights.source.none", default: "Not recorded", table: "Insights")
    static let sourceManual = LocalizedStringResource.bfhr("insights.source.manual", default: "Added by you", table: "Insights")
    static let sourceAlertEmail = LocalizedStringResource.bfhr("insights.source.alertEmail", default: "Job alert email", table: "Insights")
    static let sourceUrlImport = LocalizedStringResource.bfhr("insights.source.urlImport", default: "Added from a link", table: "Insights")
    static let sourceWeb = LocalizedStringResource.bfhr("insights.source.web", default: "Company website", table: "Insights")
    static let channelNone = LocalizedStringResource.bfhr("insights.channel.none", default: "Not recorded", table: "Insights")
    static let cvNone = LocalizedStringResource.bfhr("insights.cv.none", default: "No CV recorded", table: "Insights")
    static let cvDeleted = LocalizedStringResource.bfhr("insights.cv.deleted", default: "Deleted CV", table: "Insights")
    static let marketRemote = LocalizedStringResource.bfhr("insights.market.remote", default: "Remote", table: "Insights")
    static let marketNone = LocalizedStringResource.bfhr("insights.market.none", default: "Location not recognised", table: "Insights")

    static func responsesOf(_ responses: Int, _ applications: Int) -> LocalizedStringResource {
        .bfhr("insights.breakdown.responsesOf", default: "Responses: \(responses) of \(applications)", table: "Insights")
    }

    // MARK: First response

    static let firstResponseQuestion = LocalizedStringResource.bfhr("insights.firstResponse.question", default: "How long until a first reply?", table: "Insights")
    static let firstResponseDefinition = LocalizedStringResource.bfhr(
        "insights.firstResponse.definition",
        default: "Median days from applying to the first reply, over applications that got one.",
        table: "Insights"
    )

    // MARK: Activity

    static let activityQuestion = LocalizedStringResource.bfhr("insights.activity.question", default: "How active have I been?", table: "Insights")
    static let seriesLabel = LocalizedStringResource.bfhr("insights.activity.series", default: "Show", table: "Insights", comment: "VoiceOver label of the series picker.")
    static let seriesApplied = LocalizedStringResource.bfhr("insights.series.applied", default: "Applications", table: "Insights")
    static let seriesFollowUps = LocalizedStringResource.bfhr("insights.series.followUps", default: "Follow-ups", table: "Insights")
    static let seriesInterviews = LocalizedStringResource.bfhr("insights.series.interviews", default: "Interviews", table: "Insights")
    static let cumulative = LocalizedStringResource.bfhr("insights.activity.cumulative", default: "Running total", table: "Insights")
    static let weekAxis = LocalizedStringResource.bfhr("insights.activity.axis.week", default: "Week", table: "Insights")
    static let countAxis = LocalizedStringResource.bfhr("insights.activity.axis.count", default: "Count", table: "Insights")
    static let chartTitle = LocalizedStringResource.bfhr("insights.activity.chart", default: "Last 12 weeks", table: "Insights")

    static func thisWeek(_ count: Int, average: String) -> LocalizedStringResource {
        .bfhr("insights.activity.summary", default: "This week: \(count) · 12-week average: \(average) a week", table: "Insights", comment: "%1$lld this week, %2$@ average.")
    }

    static func weekOf(_ date: String) -> LocalizedStringResource {
        .bfhr("insights.activity.weekOf", default: "Week of \(date)", table: "Insights")
    }

    // MARK: Definitions

    static let about = LocalizedStringResource.bfhr("insights.about", default: "How these are counted", table: "Insights")
    static let defApplications = LocalizedStringResource.bfhr(
        "insights.def.applications",
        default: "Applications you moved to Applied (or later), counted on the day you applied.",
        table: "Insights"
    )
    static let defResponse = LocalizedStringResource.bfhr(
        "insights.def.response",
        default: "A reply from the employer: a move to Screening, Interviewing, Offer or Not selected, or a linked email that invites you, asks for something or decides. Automatic receipts don't count.",
        table: "Insights"
    )
    static let defInterviews = LocalizedStringResource.bfhr("insights.def.interviews", default: "Applications that reached Interviewing or an offer.", table: "Insights")
    static let defRates = LocalizedStringResource.bfhr(
        "insights.def.rates",
        default: "Rates and the median appear from 5 applications, so a single reply doesn't swing them.",
        table: "Insights"
    )

    // MARK: Drill-down labels (the Pipeline's "From Insights" chip)

    static let drillApplied = LocalizedStringResource.bfhr("insights.drill.applied", default: "Applied", table: "Insights")
    static let drillResponded = LocalizedStringResource.bfhr("insights.drill.responded", default: "Got a response", table: "Insights")
    static let drillInterview = LocalizedStringResource.bfhr("insights.drill.interview", default: "Reached interview", table: "Insights")
    static let drillOffer = LocalizedStringResource.bfhr("insights.drill.offer", default: "Reached offer", table: "Insights")
    static let drillWaiting = LocalizedStringResource.bfhr("insights.drill.waiting", default: "Still waiting", table: "Insights")
    static let drillNoResponse = LocalizedStringResource.bfhr("insights.drill.noResponse", default: "No response", table: "Insights")
    static let drillWithdrawn = LocalizedStringResource.bfhr("insights.drill.withdrawn", default: "Withdrawn without a response", table: "Insights")
    static let drillSent = LocalizedStringResource.bfhr("insights.drill.sent", default: "Applications sent", table: "Insights")
    static let drillFollowUps = LocalizedStringResource.bfhr("insights.drill.followUps", default: "Follow-ups sent", table: "Insights")
    static let drillInterviewsHeld = LocalizedStringResource.bfhr("insights.drill.interviewsHeld", default: "Interviews held", table: "Insights")
}
