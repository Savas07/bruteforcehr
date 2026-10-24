import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
@testable import BFHRUIFixtures

@Suite("Today model")
struct TodayModelTests {
    private static func populated() throws -> (TodayModel, UserData) {
        let document = try FixtureStore.document(.populated)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Istanbul")!
        let model = TodayModel(now: document.now, calendar: calendar)
        let data = UserData(document)
        model.load(data)
        return (model, data)
    }

    @Test("Next up is today's Kervan on-site, not yet joinable")
    func nextUp() throws {
        let (model, _) = try Self.populated()
        #expect(model.phase == .loaded)
        let nextUp = try #require(model.nextUp)
        #expect(nextUp.id == "int-kervan-2")
        #expect(nextUp.company.name == "Kervan Teknoloji")
        #expect(nextUp.timeZone == TimeZone(identifier: "Europe/Istanbul"))
        #expect(!nextUp.isJoinable)
    }

    @Test("To review lists the three pending emails, newest first, plus unacknowledged auto changes")
    func toReview() throws {
        let (model, _) = try Self.populated()
        #expect(model.toReview.map(\.id) == ["mail-sail-outreach", "mail-tannenbaum-info", "mail-nordlicht-invite"])
        #expect(model.toReviewCount == 3)
        #expect(model.toReview.allSatisfy { $0.isHedged })
        // The Kumsal auto-reject was undone, so it's not offered again.
        #expect(model.autoChanges.map(\.id) == ["evt-lumenpay-offer", "evt-brightwave-interviewing", "evt-grachten-screening"])
        #expect(model.autoChanges.allSatisfy { $0.canUndo })
    }

    @Test("Sections keep the fixed order and hide empty ones")
    func sections() throws {
        let (model, _) = try Self.populated()
        let order = TodayModel.Section.allCases
        #expect(model.sections == order.filter(model.sections.contains))
        #expect(model.sections.first == .nextUp)
        #expect(model.newMatches.count == TodayModel.newMatchLimit)
        #expect(model.newMatches.map(\.score) == model.newMatches.map(\.score).sorted(by: >))
        #expect(model.deadlines.map(\.dueAt) == model.deadlines.map(\.dueAt).sorted())
        #expect(model.deadlines.allSatisfy { $0.dueAt >= model.now })
        #expect(!model.isCaughtUp)
        #expect(model.accountNeedsAttention) // acc-icloud needs reauth
    }

    @Test("Empty dataset: caught up with the connect-mail card")
    func empty() throws {
        let document = try FixtureStore.document(.empty)
        let model = TodayModel(now: document.now)
        model.load(UserData(document))
        #expect(model.sections.isEmpty)
        #expect(model.isCaughtUp)
        #expect(model.showsConnectMailCard)
        #expect(model.isFirstRun)
        model.dismissConnectMailCard()
        #expect(!model.showsConnectMailCard)
    }

    @Test("Snooze all hides every listed suggestion as one bulk change with Undo")
    func snoozeAll() throws {
        let (model, _) = try Self.populated()
        #expect(!model.isFirstRun)
        let ids = (model.followUps + model.olderFollowUps).map(\.id)
        try #require(!ids.isEmpty)
        let toast = model.snoozeAll(ids, until: model.now.addingTimeInterval(86_400))
        #expect(toast.isBulk)
        #expect(model.followUps.isEmpty && model.olderFollowUps.isEmpty)
        #expect(!model.sections.contains(.followUps))
        toast.action?.perform()
        #expect((model.followUps + model.olderFollowUps).map(\.id) == ids)
    }

    @Test("Confirm files the email (the server moves the application); Undo puts it back")
    func confirmAndUndo() throws {
        let (model, _) = try Self.populated()
        let before = model.data.mailMessage(id: "mail-nordlicht-invite")
        let toast = try model.confirm("mail-nordlicht-invite")
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite")?.reviewState == .confirmed)
        #expect(model.data.application(id: "app-nordlicht")?.status == .acknowledged)
        #expect(!model.toReview.contains { $0.id == "mail-nordlicht-invite" })
        #expect(model.done.first?.id == "mail-nordlicht-invite")
        #expect(String(localized: toast.message) == "Confirmed: Nordlicht Mobility moved to Screening")
        toast.action?.perform()
        #expect(model.data.mailMessage(id: "mail-nordlicht-invite") == before)
        #expect(model.toReview.contains { $0.id == "mail-nordlicht-invite" })
        #expect(model.done.isEmpty)
    }

    @Test("Add interview on an automatically applied invite confirms the email")
    func addInterview() throws {
        let (model, _) = try Self.populated()
        var data = model.data
        let index = try #require(data.mailMessages.firstIndex { $0.id == "mail-brightwave-invite" })
        data.mailMessages[index].interviewSuggestion?.interviewId = nil
        model.load(data)
        let item = try #require(model.autoChanges.first { $0.id == "evt-brightwave-interviewing" })
        #expect(item.interviewSuggestion != nil)
        let toast = try #require(model.acknowledge(item.id))
        #expect(String(localized: toast.message) == "Interview added: Brightwave")
        #expect(model.data.mailMessage(id: "mail-brightwave-invite")?.reviewState == .confirmed)
    }

    @Test("Undoing an automatic change reverts it and marks the email corrected")
    func undoAutoChange() throws {
        let (model, _) = try Self.populated()
        _ = try model.undoAutoChange("evt-brightwave-interviewing")
        #expect(model.data.application(id: "app-brightwave")?.status == .screening)
        #expect(model.data.mailMessage(id: "mail-brightwave-invite")?.reviewState == .corrected)
        #expect(!model.autoChanges.contains { $0.id == "evt-brightwave-interviewing" })
    }

    @Test("Acknowledge, snooze, not needed and match actions, each with Undo")
    func listActions() throws {
        let (model, _) = try Self.populated()
        let acknowledged = try #require(model.acknowledge("evt-grachten-screening"))
        #expect(!model.autoChanges.contains { $0.id == "evt-grachten-screening" })
        #expect(model.done.first?.id == "evt-grachten-screening")
        acknowledged.action?.perform()
        #expect(model.autoChanges.contains { $0.id == "evt-grachten-screening" })
        #expect(model.done.isEmpty)

        let notJobMail = try model.notJobMail("mail-sail-outreach")
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.reviewState == .corrected)
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.category == .notJob)
        #expect(!model.toReview.contains { $0.id == "mail-sail-outreach" })
        notJobMail.action?.perform()
        #expect(model.data.mailMessage(id: "mail-sail-outreach")?.reviewState == .pending)
        #expect(model.toReview.contains { $0.id == "mail-sail-outreach" })

        #expect(model.applicationId(for: "evt-brightwave-interviewing") == "app-brightwave")
        #expect(model.applicationId(for: "mail-nordlicht-invite") == "app-nordlicht")

        let snooze = model.snooze("mail-sail-outreach", until: model.now.addingTimeInterval(3600))
        #expect(!model.toReview.contains { $0.id == "mail-sail-outreach" })
        snooze.action?.perform()
        #expect(model.toReview.contains { $0.id == "mail-sail-outreach" })

        let match = try #require(model.newMatches.first)
        let save = model.saveMatch(match.id)
        #expect(model.data.match(forJob: match.id)?.state == .saved)
        #expect(!model.newMatches.contains { $0.id == match.id })
        save.action?.perform()
        #expect(model.data.match(forJob: match.id)?.state == .new)

        let hide = model.notForMe(match.id)
        #expect(model.data.match(forJob: match.id)?.state == .dismissed)
        hide.action?.perform()
        #expect(model.newMatches.first?.id == match.id)

        if let nudge = (model.followUps + model.olderFollowUps).first {
            let notNeeded = model.notNeeded(nudge.id)
            #expect(!(model.followUps + model.olderFollowUps).contains { $0.id == nudge.id })
            notNeeded.action?.perform()
            #expect((model.followUps + model.olderFollowUps).contains { $0.id == nudge.id })
        }
    }

    @Test("Changes made offline wait to sync")
    func offline() throws {
        let (model, _) = try Self.populated()
        model.connection = .offline(lastSyncedAt: model.now)
        _ = model.snooze("mail-sail-outreach", until: model.now.addingTimeInterval(3600))
        #expect(model.pendingSyncIDs == ["mail-sail-outreach"])
    }

    @Test("Design scenarios drive the five states")
    func designStates() throws {
        for state in DesignScenario.captureStates {
            let scenario = try #require(DesignScenario(state: state, screen: .today))
            let model = TodayModel(now: scenario.now)
            scenario.apply(to: model)
            switch state {
            case "loading": #expect(model.phase == .loading)
            case "error": #expect(model.phase == .failed(LoadFailure(.network, details: "Design scenario (-BFHRState error)")))
            case "offline": #expect(model.connection.isOffline && model.phase == .loaded)
            case "empty": #expect(model.isCaughtUp)
            default: #expect(!model.isCaughtUp)
            }
        }
        #expect(DesignScenario.parse(arguments: ["app", "-BFHRDesign", "empty", "-BFHRScreen", "mail-review"])
            == DesignScenario(screen: .mailReview, dataset: .empty))
        #expect(DesignScenario.parse(arguments: ["app"]) == nil)
    }
}
