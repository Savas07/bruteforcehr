import BFHRCore
import BFHRUIFixtures
import Foundation
import Testing
@testable import BFHRUI

@Suite("TrackerBoard model")
struct TrackerBoardModelTests {
    let document: FixtureDocument
    let calendar: Calendar

    init() throws {
        document = try FixtureStore.document(.populated)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        self.calendar = calendar
    }

    private var now: Date { document.now }

    private func makeModel(_ dataset: FixtureDataset = .populated) throws -> TrackerBoardModel {
        let model = TrackerBoardModel(now: now, calendar: calendar)
        model.load(UserData(try FixtureStore.document(dataset)))
        return model
    }

    private func date(_ iso: String) throws -> Date {
        try #require(ISO8601DateFormatter().date(from: iso))
    }

    private func row(_ model: TrackerBoardModel, _ id: String) throws -> PipelineRow {
        try #require(model.sections.flatMap(\.rows).first { $0.id == id })
    }

    private func section(_ model: TrackerBoardModel, _ status: ApplicationStatus) throws -> PipelineSection {
        try #require(model.sections.first { $0.status == status })
    }

    // MARK: Pipeline

    @Test("Active scope: one section per active status, grouped Shortlist / In progress")
    func activeSections() throws {
        let model = try makeModel()
        #expect(model.phase == .loaded)
        #expect(!model.isEmpty)
        #expect(model.sections.map(\.status) == ApplicationStatus.active)
        #expect(model.sections.map(\.count) == [3, 2, 4, 3, 2, 3, 1])
        #expect(model.stageStrip.map(\.count) == [3, 2, 4, 3, 2, 3, 1])
        #expect(model.stageStrip.map(\.status) == ApplicationStatus.active)
        #expect(model.sections.allSatisfy { !$0.collapsedByDefault })
        #expect(model.phaseGroups.map(\.phase) == [.shortlist, .inProgress])
        #expect(model.phaseGroups.map { $0.sections.map(\.status) } == [[.saved, .preparing], [.applied, .acknowledged, .screening, .interviewing, .offer]])
        #expect(model.phaseGroups.map(\.count) == [5, 13])
    }

    @Test("Rows sort by next date soonest, then most recently moved")
    func rowOrder() throws {
        let model = try makeModel()
        #expect(try section(model, .interviewing).rows.map(\.id) == ["app-kervan", "app-thames", "app-brightwave"])
        // No next dates in Applied: newest status change first.
        #expect(try section(model, .applied).rows.map(\.id) == ["app-kumsal", "app-halden", "app-tannenbaum", "app-quill"])
        // Preparing: next actions on 23 and 24 October.
        #expect(try section(model, .preparing).rows.map(\.id) == ["app-northstar", "app-polder"])
    }

    @Test("Closed and All scopes")
    func otherScopes() throws {
        let model = try makeModel()
        model.scope = .closed
        #expect(model.sections.map(\.status) == [.accepted, .declined, .rejected, .withdrawn, .ghosted])
        #expect(model.sections.map(\.count) == [1, 1, 3, 1, 1])
        #expect(model.phaseGroups.map(\.phase) == [.closed])

        model.scope = .all
        #expect(model.sections.count == 12)
        #expect(model.sections.reduce(0) { $0 + $1.count } == 25)
        #expect(model.stageStrip.count == 12)
        #expect(model.phaseGroups.map(\.phase) == [.shortlist, .inProgress, .closed])
    }

    @Test("Saved collapses above 5 rows; empty sections collapse")
    func collapseRules() throws {
        let model = try makeModel()
        for id in ["app-quill", "app-halden", "app-tannenbaum"] {
            try model.move(id, to: .saved)
        }
        #expect(try section(model, .saved).count == 6)
        #expect(try section(model, .saved).collapsedByDefault)

        try model.close("app-lumenpay", outcome: .accepted)
        let offer = try section(model, .offer)
        #expect(offer.isEmpty && offer.collapsedByDefault)
        #expect(model.stageStrip.first { $0.status == .offer }?.isEmpty == true)
        #expect(try !section(model, .applied).collapsedByDefault)
    }

    @Test("Kervan's row shows today's interview")
    func interviewRow() throws {
        let model = try makeModel()
        let kervan = try row(model, "app-kervan")
        let startsAt = try date("2026-10-22T12:00:00Z")
        #expect(kervan.secondLine == .interview(startsAt: startsAt, kind: .onsite))
        #expect(kervan.nextDate == startsAt)
        #expect(kervan.daysInStage == 12)
        #expect(kervan.company == CompanyIdentity(name: "Kervan Teknoloji", domain: document.applications.first { $0.id == "app-kervan" }?.companyDomain))
        #expect(!kervan.lastMoveAutomatic)
        #expect(!kervan.pendingSync)
    }

    @Test("Second line: next action, staleness, nothing")
    func secondLines() throws {
        let model = try makeModel()
        // The pairing prep (26 Oct) comes before the interview (27 Oct).
        let thames = try row(model, "app-thames")
        let dueAt = try date("2026-10-26T07:30:00Z")
        #expect(thames.secondLine == .nextAction(text: "Prepare the pairing exercise", dueAt: dueAt))
        #expect(thames.nextDate == dueAt)

        // Applied 13 Oct, nothing since: "No reply in 9 days".
        let quill = try row(model, "app-quill")
        #expect(quill.secondLine == .stale(silentDays: 9))
        #expect(quill.nextDate == nil)

        // Kiez: 26 silent days in Screening.
        #expect(try row(model, "app-kiez").secondLine == .stale(silentDays: 26))
        // Halden applied 2 days ago: one line.
        #expect(try row(model, "app-halden").secondLine == .none)
        // Saved rows never go stale.
        #expect(try row(model, "app-sail").secondLine == .none)
    }

    @Test("Automatic last move marks the row; an undone automatic move doesn't")
    func automaticGlyph() throws {
        let model = try makeModel()
        #expect(try row(model, "app-brightwave").lastMoveAutomatic)
        #expect(try row(model, "app-lumenpay").lastMoveAutomatic)
        #expect(try !row(model, "app-kumsal").lastMoveAutomatic)
    }

    // MARK: Actions

    @Test("Move, then Undo appends a revert event and restores the status")
    func moveAndUndo() throws {
        let model = try makeModel()
        let eventsBefore = model.data.applicationEvents.count
        let toast = try model.move("app-kervan", to: .offer)
        #expect(toast.resolvedMessage == "Kervan Teknoloji · moved to Offer")
        #expect(toast.glyph == ToastGlyph.moved)
        #expect(model.data.application(id: "app-kervan")?.status == .offer)
        #expect(try section(model, .interviewing).count == 2)
        #expect(try section(model, .offer).rows.map(\.id).contains("app-kervan"))
        let move = try #require(model.data.applicationEvents.last)
        #expect(move.fromStatus == .interviewing && move.toStatus == .offer && move.actor == .user)

        let undo = try #require(toast.action)
        #expect(undo.role == .undo)
        undo.perform()
        #expect(model.data.application(id: "app-kervan")?.status == .interviewing)
        #expect(model.data.applicationEvents.count == eventsBefore + 2)
        #expect(model.data.applicationEvents.last?.revertsEventId == move.id)
        #expect(try section(model, .interviewing).rows.map(\.id).contains("app-kervan"))
        #expect(model.data.revertCheck(for: move.id) == .denied(.alreadyReverted))
        #expect(model.pendingSyncIDs.isEmpty)
    }

    @Test("Undo after a newer move does nothing")
    func supersededToastUndo() throws {
        let model = try makeModel()
        let first = try model.move("app-halden", to: .acknowledged)
        try model.move("app-halden", to: .screening)
        first.action?.perform()
        #expect(model.data.application(id: "app-halden")?.status == .screening)
    }

    @Test("Advance moves to the next active status; none from Offer or closed")
    func advance() throws {
        let model = try makeModel()
        #expect(model.advanceTarget(for: "app-sail") == .preparing)
        #expect(model.advanceTarget(for: "app-lumenpay") == nil)
        #expect(model.advanceTarget(for: "app-helio") == nil)

        let toast = try #require(try model.advance("app-kervan"))
        #expect(toast.resolvedMessage == "Kervan Teknoloji · moved to Offer")
        #expect(model.data.application(id: "app-kervan")?.status == .offer)
        #expect(try model.advance("app-lumenpay") == nil)
        #expect(model.data.application(id: "app-lumenpay")?.status == .offer)

        toast.action?.perform()
        #expect(model.data.application(id: "app-kervan")?.status == .interviewing)
    }

    @Test("Close… outcomes: side exits from anywhere, Accepted / Declined only from Offer")
    func close() throws {
        let model = try makeModel()
        #expect(model.outcomeTargets(for: "app-kervan").map(\.status) == [.rejected, .withdrawn, .ghosted, .accepted, .declined])
        #expect(model.outcomeTargets(for: "app-kervan").map(\.isEnabled) == [true, true, true, false, false])
        #expect(model.outcomeTargets(for: "app-kervan").last?.check == .denied(.outcomeRequiresOffer))
        #expect(model.outcomeTargets(for: "app-lumenpay").allSatisfy { $0.isEnabled })
        #expect(model.moveTargets(for: "app-kervan").count == 12)
        #expect(model.moveTargets(for: "app-kervan").first { $0.isCurrent }?.status == .interviewing)

        let toast = try model.close("app-kervan", outcome: .rejected)
        #expect(toast.resolvedMessage == "Kervan Teknoloji · moved to Not selected")
        #expect(model.data.application(id: "app-kervan")?.status == .rejected)
        toast.action?.perform()
        #expect(model.data.application(id: "app-kervan")?.status == .interviewing)

        #expect(throws: TransitionError.self) { try model.close("app-kervan", outcome: .accepted) }
        #expect(throws: TrackerBoardError.notAnOutcome(.screening)) { try model.close("app-kervan", outcome: .screening) }

        try model.close("app-lumenpay", outcome: .accepted)
        #expect(model.data.application(id: "app-lumenpay")?.status == .accepted)
    }

    @Test("An invalid move throws and changes nothing")
    func invalidMove() throws {
        let model = try makeModel()
        let before = model.data
        let error = #expect(throws: TransitionError.self) { try model.move("app-quill", to: .accepted) }
        #expect(error?.code == .outcomeRequiresOffer)
        #expect(model.data == before)
        #expect(throws: TransitionError.self) { try model.move("app-quill", to: .applied) }
    }

    @Test("Timeline Undo of an automatic change restores the status and corrects the email")
    func timelineUndo() throws {
        let model = try makeModel()
        let entry = try #require(model.detail(for: "app-brightwave")?.timeline.flatMap(\.entries).first { $0.id == "evt-brightwave-interviewing" })
        #expect(entry.isAutomatic && entry.undo == .allowed)

        let toast = try model.undo(eventId: "evt-brightwave-interviewing")
        #expect(toast.resolvedMessage == "Brightwave · moved to Screening")
        #expect(toast.action == nil)
        #expect(model.data.application(id: "app-brightwave")?.status == .screening)
        #expect(model.data.mailMessage(id: "mail-brightwave-invite")?.reviewState == .corrected)
        #expect(try !row(model, "app-brightwave").lastMoveAutomatic)
        #expect(model.detail(for: "app-brightwave")?.timeline.flatMap(\.entries).first { $0.id == "evt-brightwave-interviewing" }?.isReverted == true)

        // Superseded moves can't be undone.
        #expect(throws: TransitionError.self) { try model.undo(eventId: "app-kervan-e1") }
    }

    // MARK: Suggestions

    @Test("Nudges: dismiss with Undo, mark as no response")
    func nudges() throws {
        let model = try makeModel()
        #expect(model.nudges.map(\.id) == ["app-kiez.noResponse", "app-quill.followUp"])
        let quill = try #require(model.nudges.last)

        let toast = model.dismissNudge(quill)
        #expect(toast.resolvedMessage == "Quill Docs · suggestion dismissed")
        #expect(model.nudges.map(\.id) == ["app-kiez.noResponse"])
        #expect(model.detail(for: "app-quill")?.nudges.isEmpty == true)
        toast.action?.perform()
        #expect(model.nudges.map(\.id) == ["app-kiez.noResponse", "app-quill.followUp"])

        let kiez = try #require(model.nudges.first)
        #expect(model.detail(for: "app-kiez")?.nudges == [kiez])
        let moved = try model.markNoResponse(kiez)
        #expect(moved.resolvedMessage == "Kiez Health · moved to No response")
        #expect(model.data.application(id: "app-kiez")?.status == .ghosted)
        #expect(model.nudges.map(\.id) == ["app-quill.followUp"])
        moved.action?.perform()
        #expect(model.data.application(id: "app-kiez")?.status == .screening)
    }

    // MARK: Detail

    @Test("Kumsal's detail: progress, day-grouped timeline with its undo, documents")
    func kumsalDetail() throws {
        let model = try makeModel()
        let detail = try #require(model.detail(for: "app-kumsal"))
        #expect(detail.header.company.name == "Kumsal Games")
        #expect(detail.header.status == .applied)
        #expect(detail.header.source == "lever")
        #expect(detail.header.channel == .externalLink)
        #expect(detail.header.appliedAt == (try date("2026-10-14T07:30:00Z")))
        #expect(!detail.header.lastMoveAutomatic)

        #expect(detail.progress.map(\.status) == ApplicationStatus.active)
        #expect(detail.progress.map(\.state) == [.done, .done, .current, .upcoming, .upcoming, .upcoming, .upcoming])

        #expect(detail.timeline.map(\.day) == [
            try date("2026-10-21T00:00:00Z"), try date("2026-10-20T00:00:00Z"),
            try date("2026-10-14T00:00:00Z"), try date("2026-10-13T00:00:00Z"),
        ])
        #expect(detail.timeline.map { $0.entries.map(\.id) } == [
            ["app-kumsal-undo-2"],
            ["evt-kumsal-auto-reject", "app-kumsal-x1"],
            ["app-kumsal-e1"],
            ["app-kumsal-created"],
        ])
        let undo = try #require(detail.timeline.first?.entries.first)
        #expect(undo.kind == .reverted(to: .applied))
        let autoReject = try #require(detail.timeline[1].entries.first)
        #expect(autoReject.isReverted && autoReject.isAutomatic)
        #expect(autoReject.undo == .denied(.alreadyReverted))

        #expect(detail.cv == ApplicationDetail.DocumentRef(id: "cv-en", title: "Base CV — English"))
        #expect(detail.coverLetter == nil)
        #expect(detail.nudges.isEmpty)
        #expect(detail.nextStep == .none)
    }

    @Test("Detail facts: interviews, contacts, cover letter, next step")
    func thamesDetail() throws {
        let model = try makeModel()
        let detail = try #require(model.detail(for: "app-thames"))
        #expect(detail.header.location == "London (hybrid)")
        #expect(detail.interviews.map(\.id) == ["int-thames-2"])
        #expect(detail.contacts.map(\.id) == ["contact-priya"])
        #expect(detail.coverLetter == ApplicationDetail.DocumentRef(id: "cl-thames", title: "Thames Ledger — Frontend Engineer"))
        #expect(detail.nextStep == .nextAction(text: "Prepare the pairing exercise", dueAt: try date("2026-10-26T07:30:00Z")))
        #expect(model.detail(for: "app-missing") == nil)
    }

    @Test("Closed detail: the strip ends at the last active status, then the outcome")
    func closedProgress() throws {
        let model = try makeModel()
        let helio = try #require(model.detail(for: "app-helio"))
        #expect(helio.progress.map(\.status) == [.saved, .preparing, .applied, .acknowledged, .screening, .interviewing, .rejected])
        #expect(helio.progress.map(\.state) == Array(repeating: .done, count: 6) + [.current])
        #expect(helio.progress.last?.isOutcome == true)

        let atlas = try #require(model.detail(for: "app-atlas"))
        #expect(atlas.progress.map(\.status) == ApplicationStatus.active + [.declined])

        try model.close("app-quill", outcome: .withdrawn)
        let quill = try #require(model.detail(for: "app-quill"))
        #expect(quill.progress.map(\.status) == [.saved, .preparing, .applied, .withdrawn])
    }

    // MARK: Empty, offline, design

    @Test("Empty dataset: empty Pipeline with every section collapsed")
    func emptyDataset() throws {
        let model = try makeModel(.empty)
        #expect(model.phase == .loaded)
        #expect(model.isEmpty)
        #expect(model.sections.map(\.status) == ApplicationStatus.active)
        #expect(model.sections.allSatisfy { $0.isEmpty && $0.collapsedByDefault })
        #expect(model.stageStrip.allSatisfy { $0.isEmpty })
        #expect(model.nudges.isEmpty)
        #expect(model.detail(for: "app-kervan") == nil)
        #expect(model.advanceTarget(for: "app-kervan") == nil)
        #expect(model.outcomeTargets(for: "app-kervan").isEmpty)
        #expect(throws: UserDataError.missingApplication("app-kervan")) { try model.move("app-kervan", to: .offer) }
    }

    @Test("Offline moves are pending sync on the row and the detail")
    func offlinePending() throws {
        let model = try makeModel()
        try model.move("app-halden", to: .acknowledged)
        #expect(model.pendingSyncIDs.isEmpty)

        model.connection = .offline(lastSyncedAt: now)
        let toast = try model.advance("app-kervan")
        #expect(model.pendingSyncIDs == ["app-kervan"])
        #expect(try row(model, "app-kervan").pendingSync)
        #expect(try !row(model, "app-halden").pendingSync)
        #expect(model.detail(for: "app-kervan")?.header.pendingSync == true)

        toast?.action?.perform()
        #expect(model.data.application(id: "app-kervan")?.status == .interviewing)
        #expect(try row(model, "app-kervan").pendingSync)

        model.pendingSyncIDs = []
        #expect(try !row(model, "app-kervan").pendingSync)
    }

    @Test("Design scenario drives the model into each state")
    func designScenario() {
        let populated = DesignScenario(screen: .trackerBoard).trackerBoardModel()
        #expect(populated.phase == .loaded)
        #expect(populated.sections.reduce(0) { $0 + $1.count } == 18)
        #expect(populated.now == document.now)

        #expect(DesignScenario(screen: .trackerBoard, dataset: .empty).trackerBoardModel().isEmpty)
        #expect(DesignScenario(screen: .trackerBoard, condition: .loading).trackerBoardModel().phase == .loading)
        #expect(DesignScenario(screen: .trackerBoard, condition: .offline).trackerBoardModel().connection.isOffline)
        if case .failed = DesignScenario(screen: .trackerBoard, condition: .error).trackerBoardModel().phase {} else {
            Issue.record("error scenario should fail the load")
        }
    }

    @Test("Scope labels resolve")
    func scopeLabels() {
        #expect(PipelineScope.allCases.map { String(localized: $0.label) } == ["Active", "Closed", "All"])
    }
}
