#if DEBUG
import BFHRCore
import Foundation

/// The fixture datasets exported by `pnpm --filter @bfhr/fixtures conformance`
/// (`packages/fixtures/conformance/<name>.json`), and the performance budget's scaled one.
public enum FixtureDataset: String, CaseIterable, Sendable {
    /// A realistic mid-search account: 25 applications, 40 jobs, 12 emails, 2 CVs.
    case populated
    /// A signed-in user who finished onboarding and has nothing else yet.
    case empty
    /// `populated` grown to 5,000 jobs and 1,000 applications (docs/runbooks/performance.md),
    /// built in memory like `scaledDataset()` in @bfhr/fixtures; not exported.
    case scaled
}

/// One exported dataset: everything under `users/{uid}` plus the public app configs. `now` is the
/// instant the data was written for; design builds use it as the clock so relative times
/// ("Applied 8 days ago") match the fixtures.
public struct FixtureDocument: Decodable, Sendable {
    public let format: Int
    public let now: Date
    public let appConfigs: [AppConfig]
    public let uid: String
    public let profile: Profile
    public let cvs: [Cv]
    public let cvRevisions: [CvRevision]
    public let renderedFiles: [RenderedFile]
    public let coverLetters: [CoverLetter]
    public internal(set) var jobs: [Job]
    public internal(set) var jobMatches: [JobMatch]
    public let savedSearches: [SavedSearch]
    public internal(set) var applications: [Application]
    public internal(set) var applicationEvents: [ApplicationEvent]
    public internal(set) var interviews: [Interview]
    public let contacts: [Contact]
    public let mailAccounts: [MailAccount]
    public let mailMessages: [MailMessage]
    public let devices: [Device]
}

public enum FixtureError: Error, CustomStringConvertible {
    case notFound(FixtureDataset)

    public var description: String {
        switch self {
        case .notFound(let dataset):
            "\(dataset.rawValue).json is neither in the app bundle (BFHRFixtures/) nor at \(FixtureStore.repositoryURL(for: dataset).path)"
        }
    }
}

/// Loads fixture datasets. Debug builds of the app copy the JSON into `BFHRFixtures/` in the app
/// bundle (a Debug-only build phase in apps/ios); tests, previews and simulator runs without that
/// copy read it from the repository checkout this source file lives in.
public enum FixtureStore {
    private static var cache: [FixtureDataset: FixtureDocument] = [:]

    /// `<repo>/packages/fixtures/conformance/<name>.json`, found from this file
    /// (`packages/swift/BFHRUI/Sources/BFHRUIFixtures/`).
    public nonisolated static func repositoryURL(for dataset: FixtureDataset) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // BFHRUIFixtures
            .deletingLastPathComponent() // Sources
            .deletingLastPathComponent() // BFHRUI
            .deletingLastPathComponent() // swift
            .deletingLastPathComponent() // packages
            .appendingPathComponent("fixtures/conformance/\(dataset.rawValue).json")
    }

    /// The JSON file for `dataset`: the app bundle's copy first, then the repository checkout.
    public static func url(for dataset: FixtureDataset, in bundle: Bundle = .main) -> URL? {
        if let bundled = bundle.url(forResource: dataset.rawValue, withExtension: "json", subdirectory: "BFHRFixtures") {
            return bundled
        }
        let checkout = repositoryURL(for: dataset)
        return FileManager.default.fileExists(atPath: checkout.path) ? checkout : nil
    }

    /// Decodes `dataset` once per process (`scaled`: grows the populated one).
    public static func document(_ dataset: FixtureDataset) throws -> FixtureDocument {
        if let cached = cache[dataset] { return cached }
        let document: FixtureDocument
        if dataset == .scaled {
            document = try self.document(.populated).scaled(jobs: 5_000, applications: 1_000)
        } else {
            guard let url = url(for: dataset) else { throw FixtureError.notFound(dataset) }
            document = try decode(contentsOf: url)
        }
        cache[dataset] = document
        return document
    }

    public static func decode(contentsOf url: URL) throws -> FixtureDocument {
        try BFHRJSON.decoder().decode(FixtureDocument.self, from: Data(contentsOf: url))
    }
}
#endif
