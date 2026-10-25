import BFHRCore
import Foundation
import Observation

// The cover letter editor of the Apply sheet (BRIEF §4.4.2, research/apply.md "Cover letter
// editor"): an editable letter that starts from one of the user's templates or a starter, can be
// drafted with AI (`coverLetterDraft`: tone, language, template; claims about the candidate only
// from the CV, about the company only from the posting), keeps merge fields as `{company}` tokens
// filled by BFHRCore `MergeFields.fill`, and saves as a template. A field without a value, or a
// `[gap]`, blocks sending with the reason.

/// A template the editor can start from: one of the user's (`coverLetters`, `isTemplate`) or a
/// starter (`CoverLetterStarters`).
public struct LetterTemplate: Identifiable, Hashable, Sendable {
    public let id: String
    public var title: String
    public var language: String
    public var body: String
    public var isStarter: Bool
}

/// Why the letter can't go out yet, in the order the user fixes it.
public enum LetterBlocker: Hashable, Sendable {
    case empty
    /// A merge field without a value ("Fill in Hiring manager before sending.").
    case field(MergeField)
    /// A `[gap]` the template or the draft left ("Fill in [X%] before sending.").
    case gap(String)
}

/// "Draft with AI" progress.
public enum LetterDraftPhase: Hashable, Sendable {
    case idle
    case drafting
    case failed(ApplyAIError)
}

/// "Drafted from your CV and this job. Edit anything." with Undo (the text before the draft).
public struct LetterDraftBanner: Hashable, Sendable {
    public var droppedSentences: Int
    public var previousText: String
    public var subject: String?
}

@Observable
public final class CoverLetterEditorModel {
    /// The letter with its merge-field tokens (what "Save as template" stores).
    public var text = ""
    public var tone: CoverLetterTone = .warm
    public var language: CvAssistLanguage
    /// The template the letter started from (and the AI draft follows); nil: a free draft.
    public var templateId: String?
    /// Values typed under "Fields to fill", for fields the job and profile don't know.
    public var typedValues: [MergeField: String] = [:]
    public internal(set) var draftPhase: LetterDraftPhase = .idle
    public private(set) var banner: LetterDraftBanner?
    /// `.ai` once a draft was used (kept on the saved letter).
    public private(set) var author: CoverLetterAuthor = .user
    /// "Use template" / Undo of the AI draft: the text before.
    public private(set) var undoText: String?

    // Inputs from the Apply sheet.
    public private(set) var knownValues: [MergeField: String] = [:]
    public private(set) var templates: [LetterTemplate] = []
    public private(set) var aiEnabled = true
    /// The CV version the draft's claims come from (the Apply sheet's current choice).
    var cvSource: () -> (cvId: String, revisionId: String)? = { nil }
    var jobId: String
    weak var services: (any ApplyServices)?
    /// Stores a new template (`coverLetters`, `isTemplate: true`).
    var onSaveTemplate: ((CoverLetter) -> Void)?
    var clock: @MainActor () -> Date = { .now }
    private var request: Task<Void, Never>?

    init(jobId: String, language: CvAssistLanguage) {
        self.jobId = jobId
        self.language = language
    }

    /// The job, profile and CV this letter is for.
    func update(known: [MergeField: String], templates: [LetterTemplate], aiEnabled: Bool) {
        knownValues = known
        self.templates = templates
        self.aiEnabled = aiEnabled
    }

    // MARK: Merge fields

    public var values: [MergeField: String?] {
        var values: [MergeField: String?] = [:]
        for field in MergeField.allCases {
            let typed = typedValues[field]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            values[field] = typed.isEmpty ? knownValues[field] : typed
        }
        return values
    }

    /// The letter as it goes out, and the fields still without a value.
    public var filled: (text: String, unresolved: [MergeField]) { MergeFields.fill(text, values: values) }

    /// Fields to fill: used in the letter and unknown, plus the ones the user already typed.
    public var fieldsToFill: [MergeField] {
        let unresolved = filled.unresolved
        let typed = MergeField.allCases.filter { typedValues[$0] != nil && knownValues[$0] == nil && text.contains("{\($0.rawValue)}") }
        return MergeField.allCases.filter { unresolved.contains($0) || typed.contains($0) }
    }

    public var gaps: [String] { CVPlaceholders.find(in: filled.text) }

    public var blocker: LetterBlocker? {
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .empty }
        if let field = filled.unresolved.first { return .field(field) }
        if let gap = gaps.first { return .gap(gap) }
        return nil
    }

    public var wordCount: Int {
        filled.text.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count
    }

    // MARK: Templates

    public var ownTemplates: [LetterTemplate] { templates.filter { !$0.isStarter } }
    public var starterTemplates: [LetterTemplate] { templates.filter(\.isStarter) }

    /// "Use template": the template's text (merge fields kept as tokens); Undo restores the letter.
    public func useTemplate(_ id: String) {
        guard let template = templates.first(where: { $0.id == id }) else { return }
        undoText = text.isEmpty ? nil : text
        text = template.body
        templateId = id
        if let language = CvAssistLanguage(rawValue: String(template.language.prefix(2))) { self.language = language }
        banner = nil
        author = .user
    }

    /// Starts an empty letter from the starter in its language (a new "Write one").
    func startIfEmpty() {
        guard text.isEmpty else { return }
        let starter = starterTemplates.first { $0.language == language.rawValue } ?? starterTemplates.first
        if let starter {
            text = starter.body
            templateId = starter.id
        }
    }

    /// "Save as template": the letter with its tokens, titled by the user.
    @discardableResult
    public func saveAsTemplate(title: String) -> CoverLetter? {
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let at = clock()
        let letter = CoverLetter(
            id: UserData.makeID(), applicationId: nil, jobId: nil, title: name, language: language.rawValue,
            body: text, author: author, isTemplate: true, createdAt: at, updatedAt: at
        )
        onSaveTemplate?(letter)
        templateId = letter.id
        return letter
    }

    // MARK: Draft with AI

    /// `coverLetterDraft` with the tone, language and template; the draft replaces the text (Undo).
    public func draft() async {
        guard aiEnabled else {
            draftPhase = .failed(.aiDisabled)
            return
        }
        guard let services, let (cvId, revisionId) = cvSource() else {
            draftPhase = .failed(.notFound)
            return
        }
        request?.cancel()
        draftPhase = .drafting
        let request = CoverLetterDraftRequest(
            cvId: cvId, revisionId: revisionId, jobId: jobId, tone: tone, language: language, templateId: templateId
        )
        let task = Task { [weak self] in
            do {
                let response = try await services.draftCoverLetter(request)
                guard !Task.isCancelled else { return }
                self?.useDraft(response)
            } catch let error as ApplyAIError {
                guard !Task.isCancelled else { return }
                self?.draftPhase = .failed(error)
            } catch {
                guard !Task.isCancelled else { return }
                self?.draftPhase = .failed(.failed(String(describing: error)))
            }
        }
        self.request = task
        await task.value
    }

    public func cancelDraft() {
        request?.cancel()
        request = nil
        draftPhase = .idle
    }

    func useDraft(_ response: CoverLetterDraftResponse) {
        banner = LetterDraftBanner(droppedSentences: response.droppedSentences, previousText: text, subject: response.subject)
        undoText = nil
        text = response.body
        author = .ai
        draftPhase = .idle
    }

    /// Undo: the draft (or the template) gives way to the text before it.
    public func undo() {
        if let banner {
            text = banner.previousText
            self.banner = nil
            author = .user
        } else if let undoText {
            text = undoText
            self.undoText = nil
        }
    }

    public var canUndo: Bool { banner != nil || undoText != nil }

    public func dismissBanner() {
        banner = nil
    }

    public func dismissFailure() {
        draftPhase = .idle
    }
}
