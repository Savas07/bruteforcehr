import Foundation
import Observation

// AI suggestions (cv-editor.md "AI suggestions (accept / reject)"): the user picks one
// alternative and decides per text — Keep mine, Use suggestion or Edit. There is no
// "accept all". Suggestions come from a `CVSuggestionProvider` (Claude through the server from
// M2; a canned provider in Debug design mode). Without a provider the ✦ Improve action isn't
// offered at all.

/// The assist the user asked for (mode chips).
public enum CVAssistMode: String, Hashable, Sendable, CaseIterable, Identifiable {
    case rewrite
    case shorten
    case strongerVerb
    case translate

    public var id: Self { self }
}

/// Why a suggestion differs from the original (GoFundMe-style change tags).
public enum CVSuggestionReason: String, Hashable, Sendable, CaseIterable {
    case shorter
    case strongerVerb
    case clearer
    case measurableResult
    case translated
}

/// What the provider is asked to improve.
public struct CVAssistRequest: Hashable, Sendable {
    public var text: String
    public var mode: CVAssistMode
    /// The CV's language (BCP 47).
    public var language: String
    /// Translate only: the target language.
    public var targetLanguage: String?
    /// Where the text sits (`meta.sectionOrder` key: "summary", "work", "projects"…), context
    /// for the model.
    public var section: String

    public init(text: String, mode: CVAssistMode, language: String, targetLanguage: String? = nil, section: String = "other") {
        self.text = text
        self.mode = mode
        self.language = language
        self.targetLanguage = targetLanguage
        self.section = section
    }
}

/// One alternative. Facts the model can't know (numbers, team sizes) come back as placeholders
/// like "[X%]", which the user must fill in before the suggestion can be used.
public struct CVSuggestion: Identifiable, Hashable, Sendable {
    public var id: String
    public var text: String
    public var reasons: [CVSuggestionReason]

    public init(id: String, text: String, reasons: [CVSuggestionReason]) {
        self.id = id
        self.text = text
        self.reasons = reasons
    }

    public var placeholders: [String] { CVPlaceholders.find(in: text) }
}

/// Where suggestions come from.
public protocol CVSuggestionProvider: Sendable {
    /// Up to 3 alternatives; empty when there's nothing to improve.
    func suggestions(for request: CVAssistRequest) async throws -> [CVSuggestion]
}

/// One ✦ Improve sheet: the original text, the chosen mode, the alternatives, the selected one
/// and the values typed into its placeholders.
@Observable
public final class CVAssistSession: Identifiable {
    public enum Phase: Equatable {
        case loading
        case loaded([CVSuggestion])
        case failed
    }

    public let id = UUID()
    public let original: String
    public let language: String
    public private(set) var mode: CVAssistMode
    public private(set) var targetLanguage: String?
    public private(set) var phase: Phase = .loading
    public private(set) var selectedID: String?
    /// One value per placeholder of the selected suggestion, in order.
    public var placeholderValues: [String] = []

    private let provider: any CVSuggestionProvider
    private let section: String
    private var loadTask: Task<Void, Never>?

    public init(original: String, language: String, mode: CVAssistMode = .rewrite, section: String = "other", provider: any CVSuggestionProvider) {
        self.original = original
        self.language = language
        self.mode = mode
        self.section = section
        self.provider = provider
    }

    /// Target languages offered for Translate: the app's CV languages minus the CV's own.
    public var translationTargets: [String] { ["en", "de", "tr"].filter { $0 != language } }

    public var suggestions: [CVSuggestion] {
        if case .loaded(let suggestions) = phase { return suggestions }
        return []
    }

    public var selected: CVSuggestion? { suggestions.first { $0.id == selectedID } }

    /// The selected suggestion's placeholders not yet filled in.
    public var missingPlaceholders: [String] {
        guard let selected else { return [] }
        return selected.placeholders.enumerated().compactMap { index, placeholder in
            index < placeholderValues.count && !placeholderValues[index].trimmed.isEmpty ? nil : placeholder
        }
    }

    /// The selected suggestion with its placeholders filled in so far.
    public var resolvedText: String? {
        selected.map { CVPlaceholders.fill($0.text, with: placeholderValues) }
    }

    /// Use suggestion: a suggestion is selected and every placeholder is filled.
    public var canUse: Bool { selected != nil && missingPlaceholders.isEmpty }

    public func select(_ suggestion: CVSuggestion?) {
        guard selectedID != suggestion?.id else { return }
        selectedID = suggestion?.id
        placeholderValues = Array(repeating: "", count: suggestion?.placeholders.count ?? 0)
    }

    /// Changes the mode (Translate needs a target; it defaults to the first offered language).
    public func setMode(_ mode: CVAssistMode, targetLanguage: String? = nil) {
        let target = mode == .translate ? (targetLanguage ?? self.targetLanguage ?? translationTargets.first) : nil
        guard mode != self.mode || target != self.targetLanguage || phase == .failed else { return }
        self.mode = mode
        self.targetLanguage = target
        Task { await load() }
    }

    /// Asks the provider for this mode's alternatives; the first is preselected.
    public func load() async {
        loadTask?.cancel()
        phase = .loading
        select(nil)
        let request = CVAssistRequest(text: original, mode: mode, language: language, targetLanguage: targetLanguage, section: section)
        let provider = provider
        let task = Task {
            do {
                let result = try await provider.suggestions(for: request)
                guard !Task.isCancelled else { return }
                phase = .loaded(Array(result.prefix(3)))
                select(result.first)
            } catch {
                guard !Task.isCancelled else { return }
                phase = .failed
            }
        }
        loadTask = task
        await task.value
    }
}

// MARK: - Word-level diff

/// A run of words in a diff.
public struct CVDiffSegment: Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case same
        case removed
        case added
    }

    public var kind: Kind
    public var text: String
}

/// Word-level diff of an original and a suggestion (longest common subsequence over
/// whitespace-separated words). Removals come before additions at each change.
public enum CVWordDiff {
    public static func diff(_ old: String, _ new: String) -> [CVDiffSegment] {
        let a = old.split(whereSeparator: \.isWhitespace).map(String.init)
        let b = new.split(whereSeparator: \.isWhitespace).map(String.init)
        // lcs[i][j] = LCS length of a[i...] and b[j...]
        var lcs = Array(repeating: Array(repeating: 0, count: b.count + 1), count: a.count + 1)
        for i in stride(from: a.count - 1, through: 0, by: -1) {
            for j in stride(from: b.count - 1, through: 0, by: -1) {
                lcs[i][j] = a[i] == b[j] ? lcs[i + 1][j + 1] + 1 : max(lcs[i + 1][j], lcs[i][j + 1])
            }
        }
        var words: [(CVDiffSegment.Kind, String)] = []
        var i = 0, j = 0
        var removed: [String] = [], added: [String] = []
        func flush() {
            words += removed.map { (.removed, $0) } + added.map { (.added, $0) }
            removed = []
            added = []
        }
        while i < a.count || j < b.count {
            if i < a.count, j < b.count, a[i] == b[j] {
                flush()
                words.append((.same, a[i]))
                i += 1
                j += 1
            } else if j < b.count, i == a.count || lcs[i][j + 1] >= lcs[i + 1][j] {
                added.append(b[j])
                j += 1
            } else {
                removed.append(a[i])
                i += 1
            }
        }
        flush()
        var segments: [CVDiffSegment] = []
        for (kind, word) in words {
            if segments.last?.kind == kind {
                segments[segments.count - 1].text += " " + word
            } else {
                segments.append(CVDiffSegment(kind: kind, text: word))
            }
        }
        return segments
    }

    /// The changes as (removed, added) pairs, for the VoiceOver description.
    public static func changes(_ segments: [CVDiffSegment]) -> [(removed: String?, added: String?)] {
        var result: [(removed: String?, added: String?)] = []
        var removed: String?
        for segment in segments {
            switch segment.kind {
            case .same:
                if let pending = removed { result.append((pending, nil)) }
                removed = nil
            case .removed:
                removed = segment.text
            case .added:
                result.append((removed, segment.text))
                removed = nil
            }
        }
        if let pending = removed { result.append((pending, nil)) }
        return result
    }
}
