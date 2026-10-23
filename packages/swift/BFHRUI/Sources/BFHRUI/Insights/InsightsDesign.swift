#if DEBUG
import Foundation

extension DesignScenario {
    /// Insights on the fixture clock over all time (the populated fixture spans ~10 weeks, so the
    /// default 12W range already shows every application); the `empty` dataset gives first use.
    public func insightsModel() -> InsightsModel {
        let model = InsightsModel(now: now)
        apply(to: model)
        return model
    }
}
#endif
