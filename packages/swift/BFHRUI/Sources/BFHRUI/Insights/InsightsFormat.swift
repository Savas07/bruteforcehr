import BFHRCore
import Foundation

/// Formatting for Insights: percentages and day counts through Foundation's locale-aware styles
/// ("60 %" in DE, "%60" in TR), group labels and the Pipeline chip label of a drill-down.
enum InsightsFormat {
    static func percent(_ value: Double, locale: Locale = .current) -> String {
        value.formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }

    /// "7 days", "6.5 days", "7 gün", "7 Tage" (plural rules from Foundation).
    static func days(_ value: Double, locale: Locale = .current) -> String {
        let rounded = (value * 10).rounded() / 10
        let seconds = Int64((rounded * 86_400).rounded())
        return Duration.seconds(seconds).formatted(
            .units(allowed: [.days], width: .wide, fractionalPart: rounded.truncatingRemainder(dividingBy: 1) == 0 ? .hide : .show(length: 1))
                .locale(locale)
        )
    }

    static func rate(_ rate: InsightsRate, locale: Locale = .current) -> String? {
        rate.value.map { percent($0, locale: locale) }
    }

    static func civil(_ date: CivilDate, style: Date.FormatStyle) -> String {
        let day = CivilDates.dayNumber(date)
        let instant = Date(timeIntervalSince1970: TimeInterval(day) * 86_400 + 43_200)
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0)!
        var style = style
        style.calendar = utc
        style.timeZone = utc.timeZone
        return instant.formatted(style)
    }

    static func shortDay(_ date: CivilDate) -> String {
        civil(date, style: Date.FormatStyle().day().month(.abbreviated))
    }

    static func longDay(_ date: CivilDate) -> String {
        civil(date, style: Date.FormatStyle().day().month(.wide).year())
    }

    /// The display label of a breakdown key.
    static func label(_ dimension: InsightsDimension, key: String, model: InsightsModel) -> String {
        switch dimension {
        case .source:
            switch key {
            case Insights.noneKey: String(localized: InsightsStrings.sourceNone)
            case "manual": String(localized: InsightsStrings.sourceManual)
            case "alert_email": String(localized: InsightsStrings.sourceAlertEmail)
            case "url_import": String(localized: InsightsStrings.sourceUrlImport)
            case "web": String(localized: InsightsStrings.sourceWeb)
            default: JobDetailFormat.sourceName(key)
            }
        case .channel:
            Channel(rawValue: key).map { String(localized: $0.label) } ?? String(localized: InsightsStrings.channelNone)
        case .cv:
            key == Insights.noneKey
                ? String(localized: InsightsStrings.cvNone)
                : model.cvTitle(key) ?? String(localized: InsightsStrings.cvDeleted)
        case .market:
            switch key {
            case InsightsMarket.remote: String(localized: InsightsStrings.marketRemote)
            case Insights.noneKey: String(localized: InsightsStrings.marketNone)
            default: Locale.current.localizedString(forRegionCode: key) ?? key
            }
        }
    }

    /// "Reached interview · 25 Jul 2026 – 22 Oct 2026 · Greenhouse" for the Pipeline chip.
    static func drillLabel(_ drill: InsightsDrillDown, model: InsightsModel) -> String {
        let kind: LocalizedStringResource = switch drill.kind {
        case .stage(.applied): InsightsStrings.drillApplied
        case .stage(.responded): InsightsStrings.drillResponded
        case .stage(.interview): InsightsStrings.drillInterview
        case .stage(.offer): InsightsStrings.drillOffer
        case .stage(.waiting): InsightsStrings.drillWaiting
        case .stage(.noResponse): InsightsStrings.drillNoResponse
        case .stage(.withdrawn): InsightsStrings.drillWithdrawn
        case .activity(.applied): InsightsStrings.drillSent
        case .activity(.followUp): InsightsStrings.drillFollowUps
        case .activity(.interview): InsightsStrings.drillInterviewsHeld
        }
        var parts = [String(localized: kind)]
        let style = Date.FormatStyle().day().month(.abbreviated).year()
        switch (drill.from, drill.to) {
        case let (from?, to?): parts.append("\(civil(from, style: style)) – \(civil(to, style: style))")
        case let (from?, nil): parts.append("\(civil(from, style: style)) –")
        case let (nil, to?): parts.append("– \(civil(to, style: style))")
        case (nil, nil): break
        }
        for dimension in InsightsDimension.allCases {
            if let key = drill.filters[dimension] { parts.append(label(dimension, key: key, model: model)) }
        }
        return parts.joined(separator: " · ")
    }
}

extension InsightsRangePreset {
    var shortLabel: LocalizedStringResource {
        switch self {
        case .fourWeeks: InsightsStrings.range4w
        case .twelveWeeks: InsightsStrings.range12w
        default: InsightsStrings.rangeAll
        }
    }

    var spokenLabel: LocalizedStringResource {
        switch self {
        case .fourWeeks: InsightsStrings.range4wSpoken
        case .twelveWeeks: InsightsStrings.range12wSpoken
        default: InsightsStrings.rangeAllSpoken
        }
    }
}

extension FunnelStage {
    var label: LocalizedStringResource {
        switch self {
        case .applied: InsightsStrings.stageApplied
        case .responded: InsightsStrings.stageResponse
        case .interview: InsightsStrings.stageInterview
        case .offer: InsightsStrings.stageOffer
        }
    }

    var drillStage: DrillDownStage {
        switch self {
        case .applied: .applied
        case .responded: .responded
        case .interview: .interview
        case .offer: .offer
        }
    }
}

extension InsightsDimension {
    var label: LocalizedStringResource {
        switch self {
        case .source: InsightsStrings.dimensionSource
        case .channel: InsightsStrings.dimensionChannel
        case .cv: InsightsStrings.dimensionCv
        case .market: InsightsStrings.dimensionMarket
        }
    }
}

extension InsightsSeries {
    var label: LocalizedStringResource {
        switch self {
        case .applied: InsightsStrings.seriesApplied
        case .followUps: InsightsStrings.seriesFollowUps
        case .interviews: InsightsStrings.seriesInterviews
        }
    }
}
