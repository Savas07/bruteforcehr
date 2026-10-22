import Foundation
import Testing
@testable import BFHRCore

@Suite("Model conformance (packages/fixtures/conformance/*.json)")
struct ModelConformanceTests {
    @Test(arguments: [ConformanceFile.populated, ConformanceFile.empty])
    func fixtureDocumentsRoundTripLosslessly(_ url: URL) throws {
        let original = try Data(contentsOf: url)
        let document = try BFHRJSON.decoder().decode(FixtureDocument.self, from: original)
        #expect(document.format == 1)
        // Re-encoding reproduces the exact JSON: no dropped fields, explicit nulls, identical timestamps.
        let reencoded = try BFHRJSON.encoder().encode(document)
        #expect(try JSONValue.parse(reencoded) == JSONValue.parse(original))
    }

    @Test func populatedFixturesExerciseTheModels() throws {
        let document = try ConformanceFile.decode(FixtureDocument.self, from: ConformanceFile.populated)
        #expect(!document.applications.isEmpty)
        #expect(!document.applicationEvents.isEmpty)
        #expect(!document.jobs.isEmpty)
        #expect(!document.jobMatches.isEmpty)
        #expect(!document.mailMessages.isEmpty)
        #expect(!document.cvRevisions.isEmpty)
        // Every application's events reference it; every status_changed event is a legal user move or
        // carries automation evidence, as the TypeScript schema requires.
        let applicationIds = Set(document.applications.map(\.id))
        for event in document.applicationEvents {
            #expect(applicationIds.contains(event.applicationId), "event \(event.id)")
            if event.actor != .user {
                #expect(event.confidence != nil && event.evidence != nil, "event \(event.id)")
            }
        }
    }

    @Test func emptyFixturesHaveOnlyProfileAndDevice() throws {
        let document = try ConformanceFile.decode(FixtureDocument.self, from: ConformanceFile.empty)
        #expect(document.applications.isEmpty && document.jobs.isEmpty && document.cvs.isEmpty)
        #expect(document.devices.count == 1)
        #expect(document.profile.defaultCvId == nil)
    }

    @Test(arguments: [
        ("2026-10-22T07:30:00.000Z", "2026-10-22T07:30:00.000Z"),
        ("2026-10-22T07:30:00Z", "2026-10-22T07:30:00.000Z"),
        ("2026-10-22T10:30:00.5+03:00", "2026-10-22T07:30:00.500Z"),
        ("2024-02-29T23:59:59.999-01:00", "2024-03-01T00:59:59.999Z"),
        ("1969-12-31T23:59:59.123456Z", "1969-12-31T23:59:59.123Z"),
        ("2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z"),
    ])
    func timestampsNormalizeLikeJavaScript(_ input: String, _ expected: String) throws {
        let date = try #require(ISO8601Timestamp.date(from: input))
        #expect(ISO8601Timestamp.string(from: date) == expected)
    }

    @Test(arguments: [
        "2026-10-22", "2026-13-01T00:00:00Z", "2025-02-29T00:00:00Z", "2026-10-22T24:00:00Z",
        "2026-10-22T07:30:00", "2026-10-22T07:30:00.Z", "2026-10-22T07:30:00Zjunk",
    ])
    func malformedTimestampsAreRejected(_ input: String) {
        #expect(ISO8601Timestamp.date(from: input) == nil)
    }
}
