import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

@Suite("MailReview model")
struct MailReviewModelTests {
    private func model(_ dataset: FixtureDataset = .populated) throws -> MailReviewModel {
        let document = try FixtureStore.document(dataset)
        let model = MailReviewModel(now: document.now, calendar: Self.utc)
        model.load(UserData(document))
        return model
    }

    private static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private func messageRows(_ model: MailReviewModel) -> [MailRow] {
        model.allJobMail.compactMap { if case .message(let row) = $0 { row } else { nil } }
    }

    // MARK: Derivations

    @Test("To review holds the three pending emails, newest first, without the job alert")
    func queue() throws {
        let model = try model()
        #expect(model.phase == .loaded)
        #expect(model.toReview.map(\.id) == ["mail-sail-outreach", "mail-tannenbaum-info", "mail-nordlicht-invite"])
        #expect(!model.toReview.contains { $0.category == .jobAlert })
        #expect(model.badgeCount == 3)
        #expect(model.counts.toReview == 3)
        #expect(model.showsAccountDot)

        let nordlicht = try #require(model.toReview.last)
        #expect(nordlicht.applicationId == "app-nordlicht")
        #expect(nordlicht.currentStatus == .acknowledged)
        #expect(nordlicht.proposedStatus == .screening)
        #expect(nordlicht.isHedged)
    }

    @Test("Updates are automatic email changes of the last 14 days, newest first")
    func updatesWindow() throws {
        let model = try model()
        #expect(model.updates.map(\.id) == [
            "evt-lumenpay-offer", "evt-brightwave-interviewing", "evt-grachten-screening",
            "evt-cadence-reject", "evt-brisk-ack",
        ])
        // evt-fjordline-reject is older than 14 days; evt-kumsal-auto-reject was undone.
        #expect(!model.updates.contains { $0.id == "evt-fjordline-reject" || $0.id == "evt-kumsal-auto-reject" })
        #expect(model.updates.allSatisfy { $0.mailMessageId != nil })
        #expect(model.counts.updates == 5)
        let brightwave = try #require(model.updates.first { $0.id == "evt-brightwave-interviewing" })
        #expect(brightwave.from == .screening && brightwave.to == .interviewing)
        #expect(brightwave.canUndo)

        model.markAllUpdatesSeen()
        #expect(model.updates.isEmpty)
        #expect(model.toReview.count == 3)
    }

    @Test("All job mail collapses job alerts into one bundle row, newest first")
    func bundleRow() throws {
        let model = try model()
        let items = model.allJobMail
        #expect(items.count == 12) // 11 emails + the bundle
        #expect(items.map(\.receivedAt) == items.map(\.receivedAt).sorted(by: >))
        let bundles = items.compactMap { if case .jobAlerts(let bundle) = $0 { bundle } else { nil } }
        #expect(bundles.count == 1)
        #expect(bundles.first?.messageIds == ["mail-job-alert"])
        #expect(bundles.first?.senders.map(\.address) == ["jobalerts-noreply@linkedin.com"])
        #expect(!messageRows(model).contains { $0.category == .jobAlert })

        let brisk = try #require(messageRows(model).first { $0.id == "mail-brisk-received" })
        #expect(brisk.company?.name == "Brisk Payments")
        #expect(brisk.reviewState == .autoApplied)
        #expect(brisk.applicationStatus == .acknowledged)
        #expect(model.categoryCounts[.rejection] == 2)

        model.filter = .allJobMail(category: .rejection)
        #expect(Set(model.allJobMail.map(\.id)) == ["mail-fjordline-rejection", "mail-cadence-rejection"])
        model.filter = .allJobMail(category: .jobAlert)
        #expect(model.allJobMail.map(\.id) == [MailListItem.jobAlertsID])
        #expect(model.filter.chip == .allJobMail)
    }

    @Test("Account health, sync line and the account filter")
    func accountHealth() throws {
        let model = try model()
        #expect(model.hasAccounts)
        #expect(model.accounts.map(\.id) == ["acc-gmail", "acc-icloud"])
        #expect(model.needsAttention.map(\.id) == ["acc-icloud"])
        #expect(model.needsAttention.first?.status == .needsReauth)
        let document = try FixtureStore.document(.populated)
        #expect(model.lastChecked == document.now.addingTimeInterval(-6 * 60))

        model.accountFilter = "acc-icloud"
        #expect(model.accountFilter == "acc-icloud")
        #expect(model.toReview.isEmpty)
        #expect(model.badgeCount == 3) // the tab badge counts every account
        #expect(model.updates.isEmpty)
        #expect(Set(messageRows(model).map(\.id)) == ["mail-ada-received", "mail-kumsal-update"])
        #expect(model.lastChecked == model.accounts.first { $0.id == "acc-icloud" }?.lastSyncedAt)

        model.accountFilter = "acc-gmail"
        #expect(model.needsAttention.isEmpty)
        #expect(model.toReview.count == 3)

        model.accountFilter = "acc-unknown"
        #expect(model.accountFilter == nil)
    }

    @Test("Chip defaults to To review when it has items, else Updates, and keeps the user's pick")
    func chipDefault() throws {
        #expect(try model().filter == .toReview)

        var data = UserData(try FixtureStore.document(.populated))
        for index in data.mailMessages.indices where data.mailMessages[index].reviewState == .pending {
            data.mailMessages[index].reviewState = .confirmed
        }
        let caughtUp = MailReviewModel(now: try FixtureStore.document(.populated).now)
        caughtUp.load(data)
        #expect(caughtUp.filter == .updates)

        let picked = try model()
        picked.filter = .allJobMail()
        picked.load(data)
        #expect(picked.filter == .allJobMail(category: nil))

        // A later snapshot doesn't move the chip under the user.
        let first = try model()
        first.load(data)
        #expect(first.filter == .toReview)
        #expect(first.toReview.isEmpty)
    }

    @Test("Review draft: required fields, allowed moves, application picker")
    func reviewDraft() throws {
        let model = try model()
        let draft = try #require(model.beginReview("mail-nordlicht-invite"))
        #expect(draft == ReviewDraft(messageId: "mail-nordlicht-invite", category: .interviewInvite, applicationId: "app-nordlicht", status: .screening))
        #expect(model.draft == draft)
        #expect(model.reviewing?.id == "mail-nordlicht-invite")
        #expect(model.canConfirm)

        let accepted = try #require(model.statusTargets.first { $0.status == .accepted })
        #expect(!accepted.isEnabled)
        #expect(accepted.check == .denied(.outcomeRequiresOffer))
        #expect(model.statusTargets.first { $0.isCurrent }?.status == .acknowledged)
        #expect(model.statusTargets.count == ApplicationStatus.allCases.count)

        model.draft?.status = .accepted
        #expect(!model.canConfirm)
        model.draft?.status = .acknowledged // files the email without a move
        #expect(model.canConfirm)
        model.draft?.applicationId = nil
        #expect(!model.canConfirm)
        #expect(model.statusTargets.isEmpty)
        model.draft?.applicationId = "app-nordlicht"
        model.draft?.category = nil
        #expect(!model.canConfirm)

        #expect(model.applicationOptions.count == 25)
        let names = model.applicationOptions.map(\.company.name)
        #expect(names == names.sorted { $0.localizedStandardCompare($1) != .orderedDescending })
        #expect(!model.categoryOptions.contains(.notJob))

        model.endReview()
        #expect(model.draft == nil && model.reviewing == nil)
    }

    // MARK: Actions

    @Test("Confirm moves the application; Undo restores the status and the queue")
    func confirmAndUndo() throws {
        let model = try model()
        let toast = try model.confirm("mail-nordlicht-invite")
        #expect(toast.resolvedMessage == "Confirmed: Nordlicht Mobility moved to Screening")
        #expect(toast.glyph == ToastGlyph.confirmed)
        #expect(model.data.application(id: "app-nordlicht")?.status == .screening)
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite")?.reviewState == .confirmed)
        #expect(model.toReview.map(\.id) == ["mail-sail-outreach", "mail-tannenbaum-info"])
        #expect(model.badgeCount == 2)
        #expect(model.pendingSyncIDs.isEmpty)

        let undo = try #require(toast.action)
        #expect(undo.role == .undo)
        undo.perform()
        #expect(model.data.application(id: "app-nordlicht")?.status == .acknowledged)
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite")?.reviewState == .pending)
        #expect(model.toReview.map(\.id) == ["mail-sail-outreach", "mail-tannenbaum-info", "mail-nordlicht-invite"])
        #expect(model.badgeCount == 3)
    }

    @Test("Confirm with a corrected draft writes the correction")
    func confirmCorrected() throws {
        let model = try model()
        var draft = try #require(model.beginReview("mail-nordlicht-invite"))
        draft.status = .interviewing
        let toast = try model.confirm("mail-nordlicht-invite", draft: draft)
        #expect(toast.resolvedMessage == "Confirmed: Nordlicht Mobility moved to Interviewing")
        #expect(model.data.application(id: "app-nordlicht")?.status == .interviewing)
        let message = try #require(model.data.mailMessage(id: "mail-nordlicht-invite"))
        #expect(message.reviewState == .corrected)
        #expect(message.suggestedStatus == .interviewing)
        #expect(model.draft == nil)

        toast.action?.perform()
        #expect(model.data.application(id: "app-nordlicht")?.status == .acknowledged)
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite")?.suggestedStatus == .screening)
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite")?.reviewState == .pending)
    }

    @Test("The sheet shows the draft: corrections update the proposal and confirmDraft writes them")
    func draftProposal() throws {
        let model = try model()
        #expect(model.draftProposal == nil)
        #expect(throws: MailReviewError.noOpenReview) { try model.confirmDraft() }

        model.beginReview("mail-nordlicht-invite")
        #expect(!model.isDraftEdited)
        #expect(model.draftProposal == model.reviewing)

        model.draft?.status = .interviewing
        model.draft?.category = .assessment
        #expect(model.isDraftEdited)
        let edited = try #require(model.draftProposal)
        #expect(edited.proposedStatus == .interviewing)
        #expect(edited.category == .assessment)
        #expect(!edited.isHedged)
        #expect(edited.canConfirm)

        let toast = try model.confirmDraft()
        #expect(toast.resolvedMessage == "Confirmed: Nordlicht Mobility moved to Interviewing")
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite")?.reviewState == .corrected)
        #expect(model.draft == nil)
    }

    @Test("Without an application the sheet can't confirm; linking one makes it confirmable")
    func linkApplication() throws {
        let model = try model()
        model.beginReview("mail-sail-outreach")
        model.draft?.applicationId = nil
        let unlinked = try #require(model.draftProposal)
        #expect(unlinked.applicationId == nil && unlinked.currentStatus == nil)
        #expect(!unlinked.canConfirm && !model.canConfirm)

        let option = try #require(model.applicationOptions.first)
        model.draft?.applicationId = option.id
        model.draft?.status = nil
        let linked = try #require(model.draftProposal)
        #expect(linked.applicationId == option.id)
        #expect(linked.company == option.company)
        #expect(linked.currentStatus == option.status)
        #expect(linked.canConfirm && model.canConfirm)
    }

    @Test("Confirm without a status move files the email; an incomplete draft throws")
    func confirmWithoutMove() throws {
        let model = try model()
        let toast = try model.confirm("mail-sail-outreach")
        #expect(toast.resolvedMessage == "Confirmed: email linked to Sail Analytics")
        #expect(model.data.application(id: "app-sail")?.status == .saved)
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.reviewState == .confirmed)

        let incomplete = ReviewDraft(messageId: "mail-tannenbaum-info", category: .infoRequest, applicationId: nil, status: nil)
        #expect(throws: MailReviewError.incompleteDraft(messageId: "mail-tannenbaum-info")) {
            try model.confirm("mail-tannenbaum-info", draft: incomplete)
        }
        let invalid = ReviewDraft(messageId: "mail-tannenbaum-info", category: .infoRequest, applicationId: "app-tannenbaum", status: .accepted)
        #expect(throws: TransitionError.self) {
            try model.confirm("mail-tannenbaum-info", draft: invalid)
        }
        #expect(model.data.mailMessage(id: "mail-tannenbaum-info")?.reviewState == .pending)
        #expect(model.data.application(id: "app-tannenbaum")?.status == .applied)
    }

    @Test("Not job mail removes the email everywhere; Undo restores it")
    func notJobMail() throws {
        let model = try model()
        let toast = try model.markNotJobMail("mail-sail-outreach")
        #expect(toast.resolvedMessage == "Marked as not job mail")
        #expect(toast.glyph == ToastGlyph.hidden)
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.reviewState == .dismissed)
        #expect(!model.toReview.contains { $0.id == "mail-sail-outreach" })
        #expect(!model.allJobMail.contains { $0.id == "mail-sail-outreach" })
        #expect(model.badgeCount == 2)

        toast.action?.perform()
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.reviewState == .pending)
        #expect(model.toReview.first?.id == "mail-sail-outreach")
        #expect(model.allJobMail.contains { $0.id == "mail-sail-outreach" })
    }

    @Test("Review later keeps the email pending at the bottom of To review")
    func reviewLater() throws {
        let model = try model()
        model.reviewLater("mail-sail-outreach")
        #expect(model.toReview.map(\.id) == ["mail-tannenbaum-info", "mail-nordlicht-invite", "mail-sail-outreach"])
        #expect(model.reviewLaterIDs == ["mail-sail-outreach"])
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.reviewState == .pending)
        #expect(model.badgeCount == 3)

        _ = try model.confirm("mail-sail-outreach")
        #expect(model.reviewLaterIDs.isEmpty)
    }

    @Test("Undo on an Updates row reverts the move and sends the email back to To review")
    func undoUpdate() throws {
        let model = try model()
        let toast = try model.undoUpdate("evt-brightwave-interviewing")
        #expect(toast.resolvedMessage == "Brightwave · moved to Screening")
        #expect(toast.action == nil)
        #expect(model.data.application(id: "app-brightwave")?.status == .screening)
        #expect(model.data.applicationEvents.contains { $0.revertsEventId == "evt-brightwave-interviewing" })
        #expect(model.data.mailMessage(id: "mail-brightwave-invite")?.reviewState == .pending)
        #expect(!model.updates.contains { $0.id == "evt-brightwave-interviewing" })
        #expect(model.toReview.contains { $0.id == "mail-brightwave-invite" })
        #expect(model.badgeCount == 4)
        #expect(model.draft?.messageId == "mail-brightwave-invite")

        #expect(throws: TransitionError.self) { try model.undoUpdate("evt-brightwave-interviewing") }
    }

    @Test("Empty dataset: no accounts, nothing in any list")
    func emptyDataset() throws {
        let model = try model(.empty)
        #expect(model.phase == .loaded)
        #expect(!model.hasAccounts)
        #expect(model.accounts.isEmpty && model.needsAttention.isEmpty)
        #expect(model.lastChecked == nil)
        #expect(model.toReview.isEmpty && model.updates.isEmpty && model.allJobMail.isEmpty)
        #expect(model.badgeCount == 0)
        #expect(model.counts == MailFilterCounts())
        #expect(model.filter == .updates)
        #expect(model.beginReview("mail-nordlicht-invite") == nil)
    }

    @Test("Offline writes mark the email as waiting to sync")
    func offlinePending() throws {
        let model = try model()
        model.connection = .offline(lastSyncedAt: nil)
        _ = try model.confirm("mail-tannenbaum-info")
        #expect(model.pendingSyncIDs == ["mail-tannenbaum-info"])
        let row = try #require(messageRows(model).first { $0.id == "mail-tannenbaum-info" })
        #expect(row.isPendingSync)
        #expect(row.reviewState == .confirmed)
        #expect(row.applicationStatus == .acknowledged)

        _ = try model.markNotJobMail("mail-sail-outreach")
        _ = try model.undoUpdate("evt-grachten-screening")
        #expect(model.pendingSyncIDs == ["mail-tannenbaum-info", "mail-sail-outreach", "mail-grachten-assessment"])
    }

    @Test("Design scenario builds the screen in every capture state")
    func designScenario() {
        let populated = DesignScenario(screen: .mailReview).mailReviewModel()
        #expect(populated.filter == .toReview && populated.toReview.count == 3)
        #expect(!DesignScenario(screen: .mailReview, dataset: .empty).mailReviewModel().hasAccounts)
        #expect(DesignScenario(state: "loading", screen: .mailReview)?.mailReviewModel().phase == .loading)
        let offline = DesignScenario(state: "offline", screen: .mailReview)?.mailReviewModel()
        #expect(offline?.connection.isOffline == true && offline?.isLoaded == true)
    }
}
