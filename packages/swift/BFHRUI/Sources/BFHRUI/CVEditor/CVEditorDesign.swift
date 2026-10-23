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
        let model = CVEditorModel(selectedCvId: CVDesignPane.opensList ? nil : selected?.id, now: now)
        model.suggestionProvider = CVDesignSuggestions()
        model.renderEngine = try? CVRenderEngine.bundled()
        // The empty dataset imports the populated fixture's base CV, so its empty state offers Import.
        let populated = DesignScenario(dataset: .populated).data
        if let base = populated.cv(id: "cv-en").flatMap({ populated.revision(id: $0.currentRevisionId) }) {
            model.importer = CVDesignImporter(content: base.content)
        }
        apply(to: model)
        return model
    }
}

extension CVEditorModel {
    /// Design mode: the selected CV in a version conflict (this device edited the summary while
    /// another device saved), for the banner and Compare captures.
    func simulateConflict() {
        guard let cv = document.flatMap({ data.cv(id: $0.id) }), let current = data.revision(id: cv.currentRevisionId) else { return }
        var mine = current.content
        let summary = mine.basics?.summary ?? ""
        mine.basics?.summary = summary + " Open to relocation within the EU."
        mine.meta.theme.density = .compact
        let revision = CvRevision(id: "design-conflict", cvId: cv.id, content: mine, source: .manual,
                                  basedOnRevisionId: current.id, jobId: nil, diffSummary: nil, createdAt: now)
        drafts[cv.id] = CVDraft(content: mine, state: .conflict(mine: revision))
        recompute()
    }
}

/// Design mode's importer: "reads" the fixture's base CV back, with two fields the reader wasn't
/// sure about, so the review screen can be captured without a server. Never in Release builds.
final class CVDesignImporter: CVImporter {
    private let content: CvContent

    init(content: CvContent) {
        self.content = content
    }

    func upload(_ data: Data, kind: CVImportFileKind) async throws(CVImportError) -> String {
        "users/design/cv-imports/design"
    }

    func read(storagePath: String, kind: CVImportFileKind) async throws(CVImportError) -> CVImportResult {
        try? await Task.sleep(for: .milliseconds(600))
        guard let data = try? BFHRJSON.encoder().encode(content),
              var object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw .unreadable }
        object["meta"] = nil
        guard let json = try? JSONSerialization.data(withJSONObject: object) else { throw .unreadable }
        return CVImportResult(resumeJSON: json, confidence: ["/work/0/startDate": 0.55, "/education/0/institution": 0.62, "/basics/name": 0.99], warnings: [])
    }
}

/// Design-mode panes for critique captures and UI tests: `-BFHRCVPane preview|item|assist|
/// summary|history|revision|reorder|template|export|conflict|compare|import|languageVariant`
/// opens that pane once per launch.
enum CVDesignPane: String {
    case preview
    case item
    case assist
    case summary
    case history
    case revision
    case reorder
    case template
    case export
    case conflict
    case compare
    case `import`
    case languageVariant

    /// Panes shown over the CV list rather than over an open CV.
    static var opensList: Bool { requested == .import }
    /// The history sheet opens the newest older version (`revision` pane).
    static var opensRevision: Bool { requested == .revision }

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
