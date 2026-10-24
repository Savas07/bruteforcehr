import Foundation
import Testing
@testable import BFHRCore

/// `packages/core/conformance/apply.json`, decoded.
struct ApplyVectors: Decodable {
    struct TailorCase: Decodable {
        struct Expected: Decodable {
            let content: CvContent
            let applied: [String]
            let skipped: [TailorSkip]
        }

        let name: String
        let content: CvContent
        let edits: [TailorEdit]
        let accepted: [String]
        let expected: Expected
    }

    struct TargetCase: Decodable {
        let op: TailorEditOp
        let path: String
        let intensity: TailorIntensity?
        let allowed: Bool
    }

    struct MergeCase: Decodable {
        struct Expected: Decodable {
            let text: String
            let unresolved: [MergeField]
        }

        let text: String
        let values: [String: String?]
        let expected: Expected
    }

    struct KitCase: Decodable {
        let context: KitContext
        let expected: [KitAnswer]
    }

    let format: Int
    let tailor: [TailorCase]
    let targets: [TargetCase]
    let mergeFields: [MergeCase]
    let answers: [Answer]
    let euCountries: [String]
    let kits: [KitCase]
}

@Suite("Apply conformance (packages/core/conformance/apply.json)")
struct ApplyConformanceTests {
    private func vectors() throws -> ApplyVectors {
        let vectors = try ConformanceFile.decode(ApplyVectors.self, from: ConformanceFile.apply)
        try #require(vectors.format == 1, "Unknown vector format; update the Swift decoder")
        return vectors
    }

    @Test func tailorEditsApplyLikeTypeScript() throws {
        for testCase in try vectors().tailor {
            let result = try Tailoring.apply(testCase.content, edits: testCase.edits, accepted: testCase.accepted)
            #expect(result.content == testCase.expected.content, "\(testCase.name)")
            #expect(result.applied == testCase.expected.applied, "\(testCase.name)")
            #expect(result.skipped == testCase.expected.skipped, "\(testCase.name)")
        }
    }

    @Test func tailorTargetsMatch() throws {
        for target in try vectors().targets {
            #expect(
                Tailoring.isTarget(target.op, path: target.path, intensity: target.intensity) == target.allowed,
                "\(target.op) \(target.path) \(target.intensity?.rawValue ?? "any")"
            )
        }
    }

    @Test func mergeFieldsFillLikeTypeScript() throws {
        for testCase in try vectors().mergeFields {
            var values: [MergeField: String?] = [:]
            for (key, value) in testCase.values {
                let field = try #require(MergeField(rawValue: key))
                values[field] = value
            }
            let result = MergeFields.fill(testCase.text, values: values)
            #expect(result.text == testCase.expected.text)
            #expect(result.unresolved == testCase.expected.unresolved)
        }
    }

    @Test func answersKitMatches() throws {
        let vectors = try vectors()
        #expect(AnswersKit.euCountries == vectors.euCountries)
        for kit in vectors.kits {
            #expect(AnswersKit.answers(vectors.answers, for: kit.context) == kit.expected, "\(kit.context)")
        }
    }
}
