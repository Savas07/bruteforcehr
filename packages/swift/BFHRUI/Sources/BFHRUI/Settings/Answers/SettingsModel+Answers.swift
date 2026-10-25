import BFHRCore
import Foundation

// Settings › Application answers (BRIEF §4.4.3, ADR 0002 "M4 Apply addendum"): the answers
// library the application kit copies from (`users/{uid}/answers/{id}`): work authorization,
// notice period, salary expectation, links and free Q&A, each with one text per language, the
// countries it applies to (`EU` = EU/EEA + Switzerland) and an optional currency.

/// The languages the editor offers a text for (`UiLanguage`).
public let answerLanguages = ["en", "tr", "de"]

/// An answer being added or edited. Limits mirror the rules (`answerValid`): a label of 1–200
/// characters, 1–6 texts, up to 30 countries, an ISO 4217 currency.
public struct AnswerDraft: Hashable, Sendable {
    public var id: String?
    public var kind: AnswerKind
    public var label: String
    /// Text per language (`en`, `tr`, `de`, plus any other the answer already had).
    public var texts: [String: String]
    /// "TR, DE, EU" as typed.
    public var countries: String
    public var currency: String?

    public init(kind: AnswerKind) {
        self.kind = kind
        label = ""
        texts = [:]
        countries = ""
        currency = nil
    }

    public init(_ answer: Answer) {
        id = answer.id
        kind = answer.kind
        label = answer.label
        texts = Dictionary(answer.values.map { ($0.language, $0.text) }, uniquingKeysWith: { first, _ in first })
        countries = answer.countries.joined(separator: ", ")
        currency = answer.currency
    }

    /// The country codes typed, upper-cased, each once.
    public var countryCodes: [String] {
        var codes: [String] = []
        for part in countries.split(whereSeparator: { $0 == "," || $0 == " " || $0 == ";" }) {
            let code = part.trimmingCharacters(in: .whitespaces).uppercased()
            if !code.isEmpty, !codes.contains(code) { codes.append(code) }
        }
        return codes
    }

    public var values: [AnswerValue] {
        let ordered = answerLanguages + texts.keys.filter { !answerLanguages.contains($0) }.sorted()
        return ordered.compactMap { language in
            let text = texts[language]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return text.isEmpty ? nil : AnswerValue(language: language, text: text)
        }
    }

    public var problem: AnswerDraftProblem? {
        let label = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if label.isEmpty || label.count > 200 { return .label }
        if values.isEmpty { return .text }
        if values.count > 6 { return .tooManyTexts }
        let codes = countryCodes
        if codes.count > 30 || codes.contains(where: { $0 != "EU" && ($0.count != 2 || !$0.allSatisfy { $0.isASCII && $0.isLetter }) }) {
            return .countries
        }
        return nil
    }
}

public enum AnswerDraftProblem: Hashable, Sendable {
    case label
    case text
    case tooManyTexts
    case countries
}

extension SettingsModel {
    /// The library in kit order: by kind, then position.
    public var answers: [Answer] {
        let kinds = AnswerKind.allCases
        return data.answers.sorted {
            let a = kinds.firstIndex(of: $0.kind) ?? 0, b = kinds.firstIndex(of: $1.kind) ?? 0
            return a != b ? a < b : $0.position < $1.position
        }
    }

    public func answers(of kind: AnswerKind) -> [Answer] { answers.filter { $0.kind == kind } }

    /// Adds or updates an answer; nil while the draft has a problem.
    @discardableResult
    public func saveAnswer(_ draft: AnswerDraft) -> Answer? {
        guard draft.problem == nil else { return nil }
        let at = writeTime
        let label = draft.label.trimmingCharacters(in: .whitespacesAndNewlines)
        let currency = draft.kind == .salaryExpectation ? draft.currency : nil
        if let id = draft.id, let existing = data.answers.first(where: { $0.id == id }) {
            var answer = existing
            if answer.kind != draft.kind { answer.position = nextPosition(draft.kind) }
            answer.kind = draft.kind
            answer.label = label
            answer.values = draft.values
            answer.countries = draft.countryCodes
            answer.currency = currency
            answer.updatedAt = at
            mutate { data in
                if let index = data.answers.firstIndex(where: { $0.id == id }) { data.answers[index] = answer }
            }
            recordWrite(id)
            return answer
        }
        let answer = Answer(
            id: UserData.makeID(), kind: draft.kind, label: label, values: draft.values,
            countries: draft.countryCodes, currency: currency, position: nextPosition(draft.kind),
            createdAt: at, updatedAt: at
        )
        mutate { $0.answers.append(answer) }
        recordWrite(answer.id)
        return answer
    }

    /// Deletes an answer. Undo puts the same document back.
    public func deleteAnswer(_ id: String) -> ToastItem? {
        guard let answer = data.answers.first(where: { $0.id == id }) else { return nil }
        mutate { $0.answers.removeAll { $0.id == id } }
        return ToastItem(glyph: ToastGlyph.removed, message: AnswersStrings.deleted(answer.label), action: .undo { [weak self] in
            guard let self else { return }
            var again = answer
            again.updatedAt = writeTime
            mutate { $0.answers.append(again) }
        })
    }

    /// Reorders the answers of one kind (the kit lists them in this order).
    public func moveAnswers(of kind: AnswerKind, from source: IndexSet, to destination: Int) {
        let current = answers(of: kind)
        var ordered = current.indices.filter { !source.contains($0) }.map { current[$0] }
        let insertAt = destination - source.filter { $0 < destination }.count
        ordered.insert(contentsOf: source.sorted().map { current[$0] }, at: min(max(0, insertAt), ordered.count))
        let at = writeTime
        mutate { data in
            for (position, answer) in ordered.enumerated() {
                guard let index = data.answers.firstIndex(where: { $0.id == answer.id }),
                      data.answers[index].position != position else { continue }
                data.answers[index].position = position
                data.answers[index].updatedAt = at
            }
        }
    }

    private func nextPosition(_ kind: AnswerKind) -> Int {
        (answers(of: kind).map(\.position).max() ?? -1) + 1
    }
}
