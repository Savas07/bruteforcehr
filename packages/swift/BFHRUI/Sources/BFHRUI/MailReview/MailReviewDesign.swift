#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation

/// Design-mode panes of the Mail tab for critique captures and UI tests: `-BFHRMailPane
/// review|email|updates|add-interview|all|scanning` opens that state over the scenario's data.
enum DesignMailPane: String {
    /// The review sheet of Nordlicht's invite (a suggested interview, a hedged proposal).
    case review
    /// The read-only email of Brightwave's automatically applied invite.
    case email
    /// The Updates chip.
    case updates
    /// Updates with Brightwave's interview not on the calendar yet ("Add interview").
    case addInterview = "add-interview"
    /// All job mail.
    case all
    /// The Gmail account still checking its past emails (the scanning card).
    case scanning

    static var requested: DesignMailPane? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRMailPane"), arguments.indices.contains(index + 1) else { return nil }
        return DesignMailPane(rawValue: arguments[index + 1])
    }
}

extension DesignScenario {
    /// The Mail tab in this scenario: all accounts, chip by the default rule (To review when it has
    /// items, else Updates). The empty dataset has no account, so the screen shows the connect card.
    /// `-BFHRMailPane` opens a pane.
    public func mailReviewModel() -> MailReviewModel {
        let model = MailReviewModel(now: now)
        var data = self.data
        let pane = dataset == .populated ? DesignMailPane.requested : nil
        if pane == .addInterview || pane == .email, let index = data.mailMessages.firstIndex(where: { $0.id == "mail-brightwave-invite" }) {
            data.mailMessages[index].interviewSuggestion?.interviewId = nil
            data.interviews.removeAll { $0.id == "int-brightwave-1" }
        }
        if pane == .scanning, let index = data.mailAccounts.firstIndex(where: { $0.id == "acc-gmail" }) {
            data.mailAccounts[index].backfill = MailBackfill(
                state: .running, stage: .classifying, lookbackDays: 90, since: now.addingTimeInterval(-90 * 86_400),
                scanned: 1_240, total: nil, jobMessages: 9, applications: 4, interviewInvites: 1, jobAlerts: 2,
                pendingReview: 3, startedAt: now.addingTimeInterval(-180), finishedAt: nil, error: nil
            )
        }
        apply(to: model, data: data)
        switch pane {
        case .review?: model.beginReview("mail-nordlicht-invite")
        case .email?: model.open("mail-brightwave-invite")
        case .updates?, .addInterview?: model.filter = .updates
        case .all?: model.filter = .allJobMail()
        case .scanning?, nil: break
        }
        return model
    }
}
#endif
