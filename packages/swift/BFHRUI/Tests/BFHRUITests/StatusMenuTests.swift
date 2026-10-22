import BFHRCore
import Testing
@testable import BFHRUI

@Suite("Status menu")
struct StatusMenuTests {
    private func targets(from current: ApplicationStatus, _ statuses: [ApplicationStatus]) -> [MoveTarget] {
        statuses.map { MoveTarget(status: $0, check: canTransition(from: current, to: $0, actor: .user), isCurrent: $0 == current) }
    }

    @Test("A reason shared by several rows moves to the footer once")
    func sharedReasonGoesToFooter() {
        let closed = targets(from: .applied, ApplicationStatus.terminal)
        #expect(StatusMenu.sharedDenials(in: closed) == [.outcomeRequiresOffer])
    }

    @Test("A reason on one row stays under that row; the current row has none")
    func singleReasonStaysInline() {
        let rows = targets(from: .applied, [.applied, .accepted, .rejected])
        #expect(StatusMenu.sharedDenials(in: rows).isEmpty)
        #expect(StatusMenu.denial(of: rows[0]) == nil)
        #expect(StatusMenu.denial(of: rows[1]) == .outcomeRequiresOffer)
    }

    @Test("From an offer, nothing is disabled")
    func offerHasNoDenials() {
        #expect(StatusMenu.sharedDenials(in: targets(from: .offer, ApplicationStatus.terminal)).isEmpty)
    }
}
