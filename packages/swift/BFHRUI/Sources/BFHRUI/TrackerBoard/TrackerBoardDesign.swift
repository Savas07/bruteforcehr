#if DEBUG
import Foundation

extension DesignScenario {
    /// The Tracker on the fixture clock, driven into this scenario's state. No selection: the
    /// Pipeline shows every application; the `empty` dataset gives the empty Pipeline (states.md).
    public func trackerBoardModel() -> TrackerBoardModel {
        let model = TrackerBoardModel(now: now)
        apply(to: model)
        return model
    }
}
#endif
