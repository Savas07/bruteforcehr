#if DEBUG
import Foundation

extension DesignScenario {
    /// The Tracker on the fixture clock, driven into this scenario's state. No selection: the
    /// Pipeline shows every application; the `empty` dataset gives the empty Pipeline (states.md).
    /// Try again on the error state loads the fixture, standing in for the data layer's reload.
    public func trackerBoardModel() -> TrackerBoardModel {
        let model = TrackerBoardModel(now: now)
        apply(to: model)
        let data = data
        model.reload = { [weak model] in model?.load(data) }
        return model
    }
}
#endif
