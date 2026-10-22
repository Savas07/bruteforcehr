import Foundation
import Testing

/// Every `.bfhr("key", default: …, table: …)` in the sources has an entry in its string catalog
/// with en, tr and de values carrying the same format specifiers. Keeps screen work from
/// shipping an English-only or broken string.
@Suite("String catalogs")
struct StringCatalogTests {
    private static let sources = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // BFHRUITests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // BFHRUI
        .appendingPathComponent("Sources/BFHRUI")

    private struct Usage: Hashable {
        let key: String
        let table: String
        let file: String
    }

    private static func usages() throws -> [Usage] {
        let pattern = try NSRegularExpression(
            pattern: #"\.bfhr\(\s*"([^"]+)"\s*,\s*default:\s*"(?:[^"\\]|\\.|\\\((?:[^()]|\([^()]*\))*\))*"([^)]{0,200})"#
        )
        let tablePattern = try NSRegularExpression(pattern: #"table:\s*"([^"]+)""#)
        var usages: [Usage] = []
        let files = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)!
        for case let url as URL in files where url.pathExtension == "swift" {
            let text = try String(contentsOf: url, encoding: .utf8)
            let range = NSRange(text.startIndex..., in: text)
            for match in pattern.matches(in: text, range: range) {
                let key = String(text[Range(match.range(at: 1), in: text)!])
                let rest = String(text[Range(match.range(at: 2), in: text)!])
                let table = tablePattern.firstMatch(in: rest, range: NSRange(rest.startIndex..., in: rest))
                    .map { String(rest[Range($0.range(at: 1), in: rest)!]) } ?? "Localizable"
                usages.append(Usage(key: key, table: table, file: url.lastPathComponent))
            }
        }
        return usages
    }

    private static func catalog(_ table: String) throws -> [String: Any] {
        let url = table == "Localizable"
            ? sources.appendingPathComponent("Resources/Localizable.xcstrings")
            : sources.appendingPathComponent("\(table)/\(table).xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return json?["strings"] as? [String: Any] ?? [:]
    }

    private static func specifiers(_ value: String) -> [String] {
        let regex = try! NSRegularExpression(pattern: #"%(?:\d\$)?(?:lld|ld|d|@)"#)
        return regex.matches(in: value, range: NSRange(value.startIndex..., in: value))
            .map { String(value[Range($0.range, in: value)!]) }
            .sorted()
    }

    @Test("Every key used in code is in its catalog in en, tr and de")
    func catalogsAreComplete() throws {
        let usages = try Self.usages()
        #expect(usages.count > 100)
        var catalogs: [String: [String: Any]] = [:]
        for usage in usages {
            if catalogs[usage.table] == nil { catalogs[usage.table] = try Self.catalog(usage.table) }
            let entry = catalogs[usage.table]?[usage.key] as? [String: Any]
            let localizations = entry?["localizations"] as? [String: Any] ?? [:]
            let values = ["en", "tr", "de"].compactMap { language -> String? in
                ((localizations[language] as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String
            }
            #expect(values.count == 3, "\(usage.key) (table \(usage.table), \(usage.file)) needs en, tr and de")
            if let english = values.first {
                for value in values.dropFirst() {
                    #expect(Self.specifiers(value) == Self.specifiers(english), "\(usage.key): \(value) vs \(english)")
                }
            }
        }
    }
}
