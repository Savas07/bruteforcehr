import Foundation
import Testing
@testable import BFHRCore

@Suite("State machine conformance (packages/core/conformance/state-machine.json)")
struct StateMachineConformanceTests {
    let vectors: StateMachineVectors

    init() throws {
        vectors = try ConformanceFile.decode(StateMachineVectors.self, from: ConformanceFile.stateMachine)
        try #require(vectors.format == 1, "Unknown vector format; update the Swift decoder")
    }

    @Test func statusTableMatchesRankAndPhase() {
        #expect(vectors.statuses.map(\.status) == ApplicationStatus.allCases)
        for row in vectors.statuses {
            #expect(statusRank(row.status) == row.rank, "rank of \(row.status)")
            #expect(statusPhase(row.status) == row.phase, "phase of \(row.status)")
        }
    }

    @Test func canTransitionCoversEveryTriple() {
        let statuses = ApplicationStatus.allCases.count
        #expect(vectors.actors == EventActor.allCases)
        #expect(vectors.canTransition.count == statuses * statuses * EventActor.allCases.count)
        for vector in vectors.canTransition {
            #expect(
                canTransition(from: vector.from, to: vector.to, actor: vector.actor) == vector.expected,
                "\(vector.actor) \(vector.from) → \(vector.to)"
            )
        }
    }

    @Test func transitionMatchesResultsAndErrors() {
        #expect(!vectors.transition.isEmpty)
        for vector in vectors.transition {
            let actual = Outcome {
                try transition(
                    vector.application,
                    to: vector.to,
                    actor: vector.actor,
                    at: vector.at,
                    confidence: vector.confidence,
                    evidence: vector.evidence,
                    text: vector.text
                )
            }
            #expect(actual == vector.expected, "\(vector.name)")
        }
    }

    @Test func canRevertAndRevertMatch() {
        #expect(!vectors.revert.isEmpty)
        for vector in vectors.revert {
            #expect(
                canRevert(vector.event, of: vector.application, events: vector.events) == vector.expectedCanRevert,
                "canRevert: \(vector.name)"
            )
            let actual = Outcome {
                try revert(vector.event, of: vector.application, events: vector.events, at: vector.at, text: vector.text)
            }
            #expect(actual == vector.expected, "revert: \(vector.name)")
        }
    }

    @Test func suggestionsMatch() throws {
        #expect(!vectors.suggestions.cases.isEmpty)
        for vector in vectors.suggestions.cases {
            let events = try #require(vectors.suggestions.histories[vector.history], "history \(vector.history)")
            let ghosted = Outcome {
                try suggestGhosted(
                    vector.application,
                    events: events,
                    now: vector.now,
                    days: vector.days ?? defaultGhostedAfterDays
                )
            }
            let followUp = Outcome {
                try followUpDue(
                    vector.application,
                    events: events,
                    now: vector.now,
                    days: vector.days ?? defaultFollowUpAfterDays
                )
            }
            let label = "\(vector.name), now \(ISO8601Timestamp.string(from: vector.now)), days \(vector.days.map(String.init) ?? "default")"
            #expect(ghosted == vector.expectedGhosted, "suggestGhosted: \(label)")
            #expect(followUp == vector.expectedFollowUp, "followUpDue: \(label)")
        }
    }

    @Test func visibleSuggestionsMatch() throws {
        #expect(!vectors.visibleSuggestions.isEmpty)
        for vector in vectors.visibleSuggestions {
            let events = try #require(vectors.suggestions.histories[vector.history], "history \(vector.history)")
            let actual = try visibleSuggestions(vector.application, events: events, now: vector.now, settings: vector.settings)
            #expect(actual == vector.expected, "visibleSuggestions: \(vector.name), now \(ISO8601Timestamp.string(from: vector.now))")
        }
    }

    @Test func matchBandMatches() {
        for vector in vectors.matchBand {
            #expect(matchBand(vector.score) == vector.band, "score \(vector.score)")
        }
    }

    @Test func persistedDraftRevertsByIdentity() throws {
        let application = Subject(
            id: "app-1",
            status: .applied,
            appliedAt: nil,
            statusChangedAt: ISO8601Timestamp.date(from: "2026-10-01T09:00:00.000Z")!
        )
        let at = ISO8601Timestamp.date(from: "2026-10-02T09:00:00.000Z")!
        let moved = try transition(application, to: .screening, actor: .user, at: at).event.event(id: "ev-1")
        let undone = Subject(id: "app-1", status: .screening, appliedAt: nil, statusChangedAt: at)
        let undo = try revert(moved, of: undone, events: [moved], at: at.addingTimeInterval(60)).event.event(id: "ev-2")
        #expect(revertedBy(moved.id, events: [moved, undo]) == undo.id)
        #expect(revertedBy(undo.id, events: [moved, undo]) == nil)
    }
}
