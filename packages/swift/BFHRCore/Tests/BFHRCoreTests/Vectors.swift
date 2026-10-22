import Foundation
@testable import BFHRCore

/// Conformance inputs exported by `pnpm --filter @bfhr/core conformance` and
/// `pnpm --filter @bfhr/fixtures conformance`, read in place from the repository.
enum ConformanceFile {
    /// `<repo>/packages/`, found from this source file (`packages/swift/BFHRCore/Tests/BFHRCoreTests/`).
    private static let packages = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    static let stateMachine = packages.appendingPathComponent("core/conformance/state-machine.json")
    static let populated = packages.appendingPathComponent("fixtures/conformance/populated.json")
    static let empty = packages.appendingPathComponent("fixtures/conformance/empty.json")

    static func decode<T: Decodable>(_ type: T.Type, from url: URL) throws -> T {
        try BFHRJSON.decoder().decode(type, from: Data(contentsOf: url))
    }
}

/// `{ "result": value }` or `{ "error": code }`; TypeScript `RangeError`s are `invalid_argument`.
enum Outcome<Value: Decodable & Equatable>: Decodable, Equatable, CustomStringConvertible {
    case value(Value)
    case error(String)

    private enum CodingKeys: String, CodingKey {
        case result, error
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let code = try container.decodeIfPresent(String.self, forKey: .error) {
            self = .error(code)
        } else {
            self = .value(try container.decode(Value.self, forKey: .result))
        }
    }

    init(_ body: () throws -> Value) {
        do {
            self = .value(try body())
        } catch let error as TransitionError {
            self = .error(error.code.rawValue)
        } catch is StatusArgumentError {
            self = .error("invalid_argument")
        } catch {
            self = .error("unexpected: \(error)")
        }
    }

    var description: String {
        switch self {
        case .value(let value): "result \(value)"
        case .error(let code): "error \(code)"
        }
    }
}

struct Subject: StatusTracked, Decodable, Equatable {
    let id: String
    let status: ApplicationStatus
    let appliedAt: Date?
    let statusChangedAt: Date
}

struct StateMachineVectors: Decodable {
    struct StatusRow: Decodable {
        let status: ApplicationStatus
        let rank: Int?
        let phase: StatusPhase
    }

    struct CanTransitionCase: Decodable {
        let from: ApplicationStatus
        let to: ApplicationStatus
        let actor: EventActor
        let expected: TransitionCheck
    }

    struct TransitionCase: Decodable {
        let name: String
        let application: Subject
        let to: ApplicationStatus
        let actor: EventActor
        let at: Date
        let confidence: Double?
        let evidence: EventEvidence?
        let text: String?
        let expected: Outcome<TransitionResult>
    }

    struct RevertCase: Decodable {
        let name: String
        let application: Subject
        let event: ApplicationEvent
        let events: [ApplicationEvent]
        let at: Date
        let text: String?
        let expectedCanRevert: RevertCheck
        let expected: Outcome<TransitionResult>
    }

    struct Suggestions: Decodable {
        struct Case: Decodable {
            let name: String
            let application: Subject
            let history: String
            let now: Date
            let days: Int?
            let expectedGhosted: Outcome<GhostedSuggestion?>
            let expectedFollowUp: Outcome<FollowUpSuggestion?>
        }

        let histories: [String: [ApplicationEvent]]
        let cases: [Case]
    }

    struct MatchBandCase: Decodable {
        let score: Int
        let band: MatchBand
    }

    let format: Int
    let statuses: [StatusRow]
    let actors: [EventActor]
    let canTransition: [CanTransitionCase]
    let transition: [TransitionCase]
    let revert: [RevertCase]
    let suggestions: Suggestions
    let matchBand: [MatchBandCase]
}

/// One exported fixture dataset: everything under `users/{uid}` plus the public app configs.
struct FixtureDocument: Codable {
    let format: Int
    let now: Date
    let appConfigs: [AppConfig]
    let uid: String
    let profile: Profile
    let cvs: [Cv]
    let cvRevisions: [CvRevision]
    let renderedFiles: [RenderedFile]
    let coverLetters: [CoverLetter]
    let jobs: [Job]
    let jobMatches: [JobMatch]
    let savedSearches: [SavedSearch]
    let applications: [Application]
    let applicationEvents: [ApplicationEvent]
    let interviews: [Interview]
    let contacts: [Contact]
    let mailAccounts: [MailAccount]
    let mailMessages: [MailMessage]
    let devices: [Device]
}

/// Untyped JSON for structural comparison (numbers compare as Double).
enum JSONValue: Decodable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    static func parse(_ data: Data) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: data)
    }
}
