import Foundation
import Testing
@testable import BFHRCore

/// `packages/core/conformance/job-import.json`: `jobImportUrl` responses built from recorded pages.
struct JobImportVectors: Decodable {
    var responses: [JobImportUrlResponse]
    var errorReasons: [String]
}

@Suite("URL import conformance (packages/core/conformance/job-import.json)")
struct JobImportConformanceTests {
    private func vectors() throws -> JobImportVectors {
        try ConformanceFile.decode(JobImportVectors.self, from: ConformanceFile.jobImport)
    }

    @Test func responsesRoundTripLosslessly() throws {
        let original = try Data(contentsOf: ConformanceFile.jobImport)
        let raw = try #require(try JSONSerialization.jsonObject(with: original) as? [String: Any])
        let responses = try #require(raw["responses"] as? [Any])
        #expect(!responses.isEmpty)
        for item in responses {
            // The path the apps take: Foundation objects from the Functions SDK.
            let response = try JobImportUrlResponse.decode(callableData: item)
            let reencoded = try BFHRJSON.encoder().encode(response)
            #expect(try JSONValue.parse(reencoded) == JSONValue.parse(JSONSerialization.data(withJSONObject: item)))
        }
    }

    @Test func wireJobsBecomeJobsWithDates() throws {
        for response in try vectors().responses {
            let job = try response.job(newID: "new-job")
            #expect(job.id == (response.existingJobId ?? "new-job"))
            #expect(job.title == response.job.title)
            #expect(ISO8601Timestamp.string(from: job.createdAt) == response.job.createdAt)
            #expect(job.sources.first?.source == "url_import")
            #expect(job.sourceKeys == response.job.sources.map { "\($0.source):\($0.sourceId ?? $0.url)" })
            let firstSeen = try #require(job.sources.first?.firstSeenAt)
            #expect(ISO8601Timestamp.string(from: firstSeen) == response.job.sources.first?.firstSeenAt)
        }
    }

    @Test func errorReasonsMatchTheSwiftEnum() throws {
        #expect(try vectors().errorReasons == JobImportErrorReason.allCases.map(\.rawValue))
    }

    @Test func rejectsNonObjects() {
        #expect(throws: JobImportDecodingError.notAnObject) { try JobImportUrlResponse.decode(callableData: "nope") }
    }
}
