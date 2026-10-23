#if DEBUG
import Foundation

extension DesignScenario {
    /// Insights on the fixture clock over all time (the populated fixture spans ~10 weeks, so the
    /// default 12W range already shows every application); the `empty` dataset gives first use.
    public func insightsModel() -> InsightsModel {
        let model = InsightsModel(now: now)
        // `-BFHRInsightsCard funnel|breakdown|first-response|activity` opens scrolled to that card.
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "-BFHRInsightsCard"), arguments.indices.contains(index + 1) {
            model.scrollTarget = InsightsCard(rawValue: arguments[index + 1])
        }
        apply(to: model)
        return model
    }
}
#endif
