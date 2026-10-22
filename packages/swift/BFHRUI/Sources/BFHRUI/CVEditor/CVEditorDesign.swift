#if DEBUG
import BFHRCore
import Foundation

extension DesignScenario {
    /// The CV editor in this scenario. Populated opens the default base CV (`cv-en`); empty has no
    /// CVs, so nothing is selected and the list shows its empty state. Design mode adds canned AI
    /// suggestions (`CVDesignSuggestions`) so ✦ Improve can be reviewed without a server.
    public func cvEditorModel() -> CVEditorModel {
        let data = self.data
        let active = data.cvs.filter { $0.archivedAt == nil }
        let selected = data.profile?.defaultCvId.flatMap { id in active.first { $0.id == id } }
            ?? active.first { $0.isDefault }
            ?? active.filter { $0.parentCvId == nil }.min { $0.id < $1.id }
        let model = CVEditorModel(selectedCvId: selected?.id, now: now)
        model.suggestionProvider = CVDesignSuggestions()
        apply(to: model)
        return model
    }
}

/// Design-mode panes for critique captures and UI tests: `-BFHRCVPane preview|item|assist|
/// summary|history|reorder` opens that pane over the selected CV once per launch.
enum CVDesignPane: String {
    case preview
    case item
    case assist
    case summary
    case history
    case reorder

    private static let requested: CVDesignPane? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRCVPane"), arguments.indices.contains(index + 1) else { return nil }
        return CVDesignPane(rawValue: arguments[index + 1])
    }()

    private static var paneTaken = false
    private static var assistTaken = false

    /// The launch pane, once.
    static func takeLaunchPane() -> CVDesignPane? {
        guard !paneTaken else { return nil }
        paneTaken = true
        return requested
    }

    /// Whether the item sheet should open ✦ Improve on its first bullet (the `assist` pane), once.
    static func takeLaunchAssist() -> Bool {
        guard requested == .assist, !assistTaken else { return false }
        assistTaken = true
        return true
    }
}

/// Canned suggestions for design mode: plausible rewrites of whatever text is passed, including
/// one with a "[X%]" blank, so the diff, reasons and blank-filling can be reviewed. Never in
/// Release builds.
struct CVDesignSuggestions: CVSuggestionProvider {
    func suggestions(for request: CVAssistRequest) async throws -> [CVSuggestion] {
        try await Task.sleep(for: .milliseconds(400))
        let text = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let words = text.split(separator: " ").map(String.init)
        guard words.count > 3 else { return [] }
        switch request.mode {
        case .rewrite, .strongerVerb:
            let rest = words.dropFirst().joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: "."))
            return [
                CVSuggestion(id: "a", text: "Drove \(rest), cutting review time by [X%].", reasons: [.strongerVerb, .measurableResult]),
                CVSuggestion(id: "b", text: "Owned \(rest).", reasons: [.strongerVerb]),
                CVSuggestion(id: "c", text: "\(words[0]) \(rest) across the company.", reasons: [.clearer]),
            ]
        case .shorten:
            let short = words.prefix(max(4, words.count * 2 / 3)).joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: ",;"))
            return [CVSuggestion(id: "s", text: short + ".", reasons: [.shorter])]
        case .translate:
            return [CVSuggestion(id: "t", text: "Leitete den Neuaufbau des Designsystems (62 Komponenten, React + TypeScript, Storybook), das 7 Produktteams übernommen haben.", reasons: [.translated])]
        }
    }
}
#endif
