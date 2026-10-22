import BFHRCore
import BFHRDesignTokens
import Foundation
import Testing
@testable import BFHRUI
@testable import BFHRUIFixtures

@Suite("Foundation")
struct FoundationTests {
    @Test("Core statuses and phases map onto the token enums one to one")
    func statusTokensMatchCore() {
        #expect(ApplicationStatus.allCases.map(\.rawValue) == BFHRStatus.allCases.map(\.rawValue))
        #expect(StatusPhase.allCases.map(\.rawValue) == BFHRPhase.allCases.map(\.rawValue))
        for status in ApplicationStatus.allCases {
            #expect(status.tokenStatus.rawValue == status.rawValue)
        }
    }

    @Test("Rejected reads Not selected and ghosted reads No response")
    func statusLabels() {
        #expect(String(localized: ApplicationStatus.rejected.label) == "Not selected")
        #expect(String(localized: ApplicationStatus.ghosted.label) == "No response")
        #expect(String(localized: Strings.moved("Acme", to: .screening)) == "Acme · moved to Screening")
        #expect(String(localized: MatchBand.scoreCaption(72)) == "72 of 100")
    }

    @Test("Both fixture datasets decode into UserData", arguments: FixtureDataset.allCases)
    func fixturesDecode(dataset: FixtureDataset) throws {
        let document = try FixtureStore.document(dataset)
        let data = UserData(document)
        #expect(data.profile?.id == document.profile.id)
        #expect(data.applications.count == document.applications.count)
        if dataset == .populated {
            #expect(!data.applications.isEmpty)
            #expect(data.application(id: "app-kervan")?.company == "Kervan Teknoloji")
            #expect(data.events(forApplication: "app-kervan").map(\.occurredAt) == data.events(forApplication: "app-kervan").map(\.occurredAt).sorted())
        } else {
            #expect(data.applications.isEmpty && data.jobs.isEmpty && data.mailMessages.isEmpty)
        }
    }

    @Test("Recorded writes are pending only while offline")
    func pendingWrites() {
        let model = ProbeModel()
        model.recordWrite("a")
        #expect(model.pendingSyncIDs.isEmpty)
        model.connection = .offline(lastSyncedAt: nil)
        model.recordWrite("b")
        #expect(model.pendingSyncIDs == ["b"])
    }

    @Test("Not-found failures don't offer Try again")
    func retryability() {
        #expect(LoadFailure(.network).isRetryable)
        #expect(!LoadFailure(.notFound).isRetryable)
    }
}

@Observable
private final class ProbeModel: ScreenModel {
    var phase: LoadPhase = .loading
    var connection: ConnectionState = .online
    var pendingSyncIDs: Set<String> = []
    func load(_ data: UserData) { phase = .loaded }
}
