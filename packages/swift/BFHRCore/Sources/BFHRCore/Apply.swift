import Foundation

// Port of @bfhr/core's Apply logic (packages/core/src/{apply,coverLetters,answers}): tailoring edits,
// cover letter merge fields and the answers kit. TypeScript is the source of truth; the
// ApplyConformanceTests replay packages/core/conformance/apply.json.

// MARK: - Tailoring

/// Why `Tailoring.apply` left an accepted edit out (`TAILOR_SKIP_REASONS`).
public enum TailorSkipReason: String, Codable, Hashable, Sendable, CaseIterable {
    /// Not a tailoring path or operation.
    case invalidPath = "invalid_path"
    /// The content no longer matches what the edit was proposed against.
    case stale
    /// Another accepted edit already changes the same value or array order.
    case conflict
}

public struct TailorSkip: Codable, Hashable, Sendable {
    public var id: String
    public var reason: TailorSkipReason

    public init(id: String, reason: TailorSkipReason) {
        self.id = id
        self.reason = reason
    }
}

public struct TailorApplyResult: Hashable, Sendable {
    public var content: CvContent
    /// Ids of the edits applied, in the order given.
    public var applied: [String]
    public var skipped: [TailorSkip]
}

public enum Tailoring {
    /// One `TAILOR_TARGETS` entry: `/`-separated segments, each a `|` list of keys or `#` for an
    /// array index (`0`, or 1–3 digits without a leading zero).
    private struct Target {
        let segments: [[String]]
        let ops: Set<TailorEditOp>
        let thorough: Bool

        init(_ pattern: String, _ ops: Set<TailorEditOp>, thorough: Bool) {
            segments = pattern.split(separator: "/").map { $0.split(separator: "|").map(String.init) }
            self.ops = ops
            self.thorough = thorough
        }

        func matches(_ path: [Substring]) -> Bool {
            guard path.count == segments.count else { return false }
            return zip(segments, path).allSatisfy { allowed, segment in
                allowed == ["#"] ? Tailoring.isIndex(segment) : allowed.contains(String(segment))
            }
        }
    }

    private static let targets: [Target] = [
        Target("work|volunteer/#/summary", [.replace], thorough: false),
        Target("projects/#/description", [.replace], thorough: false),
        Target("work|volunteer|projects/#/highlights/#", [.replace], thorough: false),
        Target("skills|projects/#/keywords/#", [.replace], thorough: false),
        Target("work|volunteer|projects/#/highlights", [.reorder], thorough: false),
        Target("skills|projects/#/keywords", [.reorder], thorough: false),
        Target("basics/label|summary", [.replace], thorough: true),
        Target("skills/#/name", [.replace], thorough: true),
        Target("work|volunteer|projects/#/highlights/#", [.insert, .remove], thorough: true),
        Target("skills|projects/#/keywords/#", [.insert, .remove], thorough: true),
        Target("skills|projects", [.reorder], thorough: true),
        Target("meta/sectionOrder", [.reorder], thorough: true),
    ]

    fileprivate static func isIndex(_ segment: Substring) -> Bool {
        guard (1...3).contains(segment.count), segment.allSatisfy({ $0.isASCII && $0.isNumber }) else { return false }
        return segment == "0" || segment.first != "0"
    }

    /// Whether `op` at `path` is a tailoring edit; with `intensity`, whether that level may propose it.
    public static func isTarget(_ op: TailorEditOp, path: String, intensity: TailorIntensity? = nil) -> Bool {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.first == "", parts.count > 1, !parts.dropFirst().contains(where: \.isEmpty) else { return false }
        let segments = Array(parts.dropFirst())
        return targets.contains { target in
            target.ops.contains(op) && target.matches(segments) && (!target.thorough || intensity != .light)
        }
    }

    /// Applies the accepted edits to `content` (the revision they were proposed against), exactly
    /// like `applyTailorEdits` in @bfhr/core: replacements first, then each array's inserts,
    /// removals and reorder (deepest arrays first), all addressed by original index.
    public static func apply(
        _ content: CvContent,
        edits: [TailorEdit],
        accepted acceptedIds: some Sequence<String>
    ) throws -> TailorApplyResult {
        let accepted = Set(acceptedIds)
        let original = try JSONNode(encoding: content)
        var applied: [String] = []
        var skipped: [TailorSkip] = []
        var replaced = Set<String>(), removed = Set<String>(), reordered = Set<String>()
        var replacements: [TailorEdit] = []
        var arrays: [(pointer: String, edits: [TailorEdit])] = []

        for edit in edits where accepted.contains(edit.id) {
            guard isTarget(edit.op, path: edit.path) else {
                skipped.append(TailorSkip(id: edit.id, reason: .invalidPath))
                continue
            }
            let current = original.value(at: edit.path)
            switch edit.op {
            case .replace, .remove:
                guard case .string(let text) = current, text == edit.before else {
                    skipped.append(TailorSkip(id: edit.id, reason: .stale))
                    continue
                }
                let isReplace = edit.op == .replace
                guard !(isReplace ? replaced : removed).contains(edit.path) else {
                    skipped.append(TailorSkip(id: edit.id, reason: .conflict))
                    continue
                }
                if isReplace { replaced.insert(edit.path) } else { removed.insert(edit.path) }
            case .insert:
                let (parent, index) = splitPointer(edit.path)
                guard case .array(let items) = original.value(at: parent), let index, index <= items.count else {
                    skipped.append(TailorSkip(id: edit.id, reason: .stale))
                    continue
                }
            case .reorder:
                guard case .array(let items) = current, let order = edit.order, order.count == items.count,
                      Set(order) == Set(0..<items.count)
                else {
                    skipped.append(TailorSkip(id: edit.id, reason: .stale))
                    continue
                }
                guard !reordered.contains(edit.path) else {
                    skipped.append(TailorSkip(id: edit.id, reason: .conflict))
                    continue
                }
                reordered.insert(edit.path)
            }
            applied.append(edit.id)
            if edit.op == .replace {
                replacements.append(edit)
            } else {
                let pointer = edit.op == .reorder ? edit.path : splitPointer(edit.path).parent
                if let slot = arrays.firstIndex(where: { $0.pointer == pointer }) {
                    arrays[slot].edits.append(edit)
                } else {
                    arrays.append((pointer, [edit]))
                }
            }
        }

        var next = original
        for edit in replacements {
            next.set(.string(edit.after ?? ""), at: edit.path)
        }
        let depth = { (pointer: String) in pointer.split(separator: "/", omittingEmptySubsequences: false).count }
        for group in arrays.enumerated().sorted(by: {
            depth($0.element.pointer) != depth($1.element.pointer)
                ? depth($0.element.pointer) > depth($1.element.pointer) : $0.offset < $1.offset
        }).map(\.element) {
            guard case .array(let items) = next.value(at: group.pointer) else { continue }
            let order = group.edits.first(where: { $0.op == .reorder })?.order ?? Array(items.indices)
            var drop = Set<Int>()
            var inserts: [Int: [String]] = [:]
            for edit in group.edits {
                guard let index = splitPointer(edit.path).index else { continue }
                if edit.op == .remove { drop.insert(index) }
                if edit.op == .insert, let text = edit.after { inserts[index, default: []].append(text) }
            }
            var result: [JSONNode] = []
            for index in order {
                result += (inserts[index] ?? []).map(JSONNode.string)
                if !drop.contains(index) { result.append(items[index]) }
            }
            result += (inserts[items.count] ?? []).map(JSONNode.string)
            next.set(.array(result), at: group.pointer)
        }

        return TailorApplyResult(content: try next.decode(CvContent.self), applied: applied, skipped: skipped)
    }

    private static func splitPointer(_ pointer: String) -> (parent: String, index: Int?) {
        guard let cut = pointer.lastIndex(of: "/") else { return ("", nil) }
        let last = pointer[pointer.index(after: cut)...]
        let isDigits = !last.isEmpty && last.allSatisfy { $0.isASCII && $0.isNumber }
        return (String(pointer[..<cut]), isDigits ? Int(last) : nil)
    }
}

/// A JSON value, for editing `CvContent` by JSON pointer.
private indirect enum JSONNode: Codable, Hashable {
    case object([String: JSONNode])
    case array([JSONNode])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init<T: Encodable>(encoding value: T) throws {
        self = try BFHRJSON.decoder().decode(JSONNode.self, from: BFHRJSON.encoder().encode(value))
    }

    func decode<T: Decodable>(_ type: T.Type) throws -> T {
        try BFHRJSON.decoder().decode(type, from: BFHRJSON.encoder().encode(self))
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONNode].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONNode].self))
        }
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    private static func segments(_ pointer: String) -> [Substring] {
        Array(pointer.split(separator: "/", omittingEmptySubsequences: false).dropFirst())
    }

    func value(at pointer: String) -> JSONNode? {
        var node: JSONNode? = self
        for segment in Self.segments(pointer) {
            switch node {
            case .array(let items):
                guard segment.allSatisfy({ $0.isASCII && $0.isNumber }), let index = Int(segment),
                      items.indices.contains(index)
                else { return nil }
                node = items[index]
            case .object(let fields):
                guard !segment.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
                node = fields[String(segment)]
            default:
                return nil
            }
        }
        return node
    }

    /// Sets the value at an existing container's key or index (callers check the path first).
    mutating func set(_ value: JSONNode, at pointer: String) {
        set(value, segments: Self.segments(pointer)[...])
    }

    private mutating func set(_ value: JSONNode, segments: ArraySlice<Substring>) {
        guard let first = segments.first else {
            self = value
            return
        }
        switch self {
        case .array(var items):
            guard let index = Int(first), items.indices.contains(index) else { return }
            items[index].set(value, segments: segments.dropFirst())
            self = .array(items)
        case .object(var fields):
            var child = fields[String(first)] ?? .null
            child.set(value, segments: segments.dropFirst())
            fields[String(first)] = child
            self = .object(fields)
        default:
            return
        }
    }
}

// MARK: - Cover letter merge fields

public enum MergeFields {
    /// Replaces every `{field}` token whose value is known (non-blank) and keeps the others,
    /// returning the fields left unresolved in order of first appearance (`fillMergeFields`).
    public static func fill(_ text: String, values: [MergeField: String?]) -> (text: String, unresolved: [MergeField]) {
        var output = ""
        var unresolved: [MergeField] = []
        var rest = text[...]
        while let open = rest.firstIndex(of: "{") {
            output += rest[..<open]
            let afterOpen = rest.index(after: open)
            if let close = rest[afterOpen...].firstIndex(of: "}"),
               let field = MergeField(rawValue: String(rest[afterOpen..<close]))
            {
                let value = (values[field] ?? nil)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if value.isEmpty {
                    if !unresolved.contains(field) { unresolved.append(field) }
                    output += rest[open...close]
                } else {
                    output += value
                }
                rest = rest[rest.index(after: close)...]
            } else {
                output += "{"
                rest = rest[afterOpen...]
            }
        }
        output += rest
        return (output, unresolved)
    }
}

// MARK: - Answers kit

/// One row of the application kit (`KitAnswer`).
public struct KitAnswer: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var kind: AnswerKind
    public var label: String
    public var text: String
    public var language: String
    /// The answer names the job's country (or the EU for an EU job), not just "everywhere".
    public var countrySpecific: Bool
}

/// What the kit knows about the job (`KitContext`).
public struct KitContext: Codable, Hashable, Sendable {
    public var countryCode: String?
    public var currency: String?
    public var language: String?
    public var fallbackLanguage: String

    public init(countryCode: String?, currency: String?, language: String?, fallbackLanguage: String) {
        self.countryCode = countryCode
        self.currency = currency
        self.language = language
        self.fallbackLanguage = fallbackLanguage
    }
}

public enum AnswersKit {
    /// EU/EEA + Switzerland: the countries an answer tagged `EU` applies to (`EU_AUTHORIZATION_COUNTRIES`).
    public static let euCountries: [String] = [
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
        "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
    ]

    private static func baseLanguage(_ tag: String) -> String {
        String(tag.lowercased().split(separator: "-", omittingEmptySubsequences: false).first ?? "")
    }

    /// The answers that apply to a job, in kit order (`answersForJob`).
    public static func answers(_ answers: [Answer], for context: KitContext) -> [KitAnswer] {
        let country = context.countryCode
        let matches = { (region: String) in
            region == country || (region == "EU" && country.map(euCountries.contains) == true)
        }
        let wanted = [context.language, context.fallbackLanguage].compactMap { $0 }.map(baseLanguage)
        var rows: [(row: KitAnswer, position: Int)] = []
        for answer in answers {
            if country != nil, !answer.countries.isEmpty, !answer.countries.contains(where: matches) { continue }
            if let currency = context.currency, let own = answer.currency, own != currency { continue }
            let value = wanted.lazy
                .compactMap { base in answer.values.first { baseLanguage($0.language) == base } }
                .first ?? answer.values.first
            guard let value else { continue }
            rows.append((
                KitAnswer(
                    id: answer.id,
                    kind: answer.kind,
                    label: answer.label,
                    text: value.text,
                    language: value.language,
                    countrySpecific: country != nil && answer.countries.contains(where: matches)
                ),
                answer.position
            ))
        }
        let kinds = AnswerKind.allCases
        return rows.sorted { a, b in
            let kindA = kinds.firstIndex(of: a.row.kind) ?? 0, kindB = kinds.firstIndex(of: b.row.kind) ?? 0
            if kindA != kindB { return kindA < kindB }
            if a.row.countrySpecific != b.row.countrySpecific { return a.row.countrySpecific }
            if a.position != b.position { return a.position < b.position }
            return Array(a.row.id.utf16).lexicographicallyPrecedes(Array(b.row.id.utf16))
        }.map(\.row)
    }
}

// MARK: - Cover letter starters

/// A built-in template ("Starter templates" in the template picker), one per language
/// (`STARTER_COVER_LETTER_TEMPLATES`). Bracketed gaps are what the user (or the AI draft) writes.
public struct StarterCoverLetter: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var language: String
    public var title: String
    public var body: String
}

public enum CoverLetterStarters {
    public static let all: [StarterCoverLetter] = [
        StarterCoverLetter(
            id: "starter-en", language: "en", title: "Classic",
            body: "Dear Hiring Team,\n\nI'm applying for the {role} position at {company}. [Why this role and company appeal to you]\n\n[A relevant result and its impact]\n\nI'd welcome the chance to talk about how I can help.\n\nKind regards,\n{name}"
        ),
        StarterCoverLetter(
            id: "starter-tr", language: "tr", title: "Klasik",
            body: "Sayın Yetkili,\n\n{company} bünyesindeki {role} pozisyonu için başvuruyorum. [Bu pozisyon sizi neden ilgilendiriyor]\n\n[İlgili bir çalışmanız ve sonucu]\n\nNasıl katkı sağlayabileceğimi konuşmaktan memnuniyet duyarım.\n\nSaygılarımla,\n{name}"
        ),
        StarterCoverLetter(
            id: "starter-de", language: "de", title: "Klassisch",
            body: "Sehr geehrte Damen und Herren,\n\nhiermit bewerbe ich mich um die Stelle als {role} bei {company}. [Warum dich die Stelle reizt]\n\n[Ein passendes Projekt und sein Ergebnis]\n\nÜber die Gelegenheit zu einem persönlichen Gespräch freue ich mich.\n\nMit freundlichen Grüßen\n{name}"
        ),
    ]
}
