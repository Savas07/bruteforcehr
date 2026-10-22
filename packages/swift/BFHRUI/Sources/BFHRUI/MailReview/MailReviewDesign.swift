#if DEBUG
import Foundation

extension DesignScenario {
    /// The Mail tab in this scenario: all accounts, chip by the default rule (To review when it has
    /// items, else Updates). The empty dataset has no account, so the screen shows the connect card.
    public func mailReviewModel() -> MailReviewModel {
        let model = MailReviewModel(now: now)
        apply(to: model)
        return model
    }
}
#endif
