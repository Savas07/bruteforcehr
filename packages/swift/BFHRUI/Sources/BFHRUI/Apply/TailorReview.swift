import BFHRCore
import Foundation
import Observation

// "Tailor for this job" (BRIEF §4.4.1, docs/design/research/apply.md "Tailor review", decisions.md
// D44/D45): Light or Thorough, then one card per edit `cvTailor` proposes (where in the CV,
// before → after, why, what it's based on), Accept / Keep original per card plus "Accept all"
// (suggestions without a gap) and "Keep original for the rest", a preview of the CV with the
// accepted edits applied (BFHRCore `Tailoring.apply`), and "Save as new version": an `ai_tailor`
// revision (`jobId`, `basedOnRevisionId`) pinned on the job's application. The CV itself keeps
// its current version.

public enum TailorDecision: Hashable, Sendable {
    case accepted
    case kept
}

/// Where a JSON pointer points in a CV, typed; the view words it ("Experience · Paynova · bullet 2").
public struct TailorLocation: Hashable, Sendable {
    public enum Section: Hashable, Sendable {
        case headline
        case summary
        case profile
        case experience
        case volunteering
        case projects
        case skills
        case sectionOrder
        /// A path tailoring doesn't name (shown as the raw pointer).
        case other(String)
    }

    public enum Part: Hashable, Sendable {
        /// 1-based.
        case bullet(Int)
        case bullets
        /// 1-based.
        case keyword(Int)
        case keywords
        case summary
        case description
        case groupName
        /// The order of the section's entries.
        case order
    }

    public var section: Section
    /// The entry's own label (employer, project or skill group name).
    public var item: String?
    public var part: Part?

    /// `pointerLabel` of the desktop review, typed: `json` is the CV content as a JSON value.
    init(pointer: String, in json: Any?) {
        let segments = pointer.split(separator: "/", omittingEmptySubsequences: false).dropFirst().map(String.init)
        let first = segments.first ?? ""
        let index = segments.count > 1 ? Int(segments[1]) : nil
        switch first {
        case "basics":
            section = segments.count == 2 && segments[1] == "summary" ? .summary
                : segments.count == 2 && segments[1] == "label" ? .headline : .profile
            return
        case "meta":
            section = .sectionOrder
            return
        case "work": section = .experience
        case "volunteer": section = .volunteering
        case "projects": section = .projects
        case "skills": section = .skills
        default:
            section = .other(pointer)
            return
        }
        guard let index else {
            part = .order
            return
        }
        let entry = ((json as? [String: Any])?[first] as? [Any]).flatMap { $0.indices.contains(index) ? $0[index] : nil }
        item = Self.itemLabel(entry)
        let field = segments.count > 2 ? segments[2] : nil
        let position = segments.count > 3 ? Int(segments[3]) : nil
        switch field {
        case "highlights": part = position.map { .bullet($0 + 1) } ?? .bullets
        case "keywords": part = position.map { .keyword($0 + 1) } ?? .keywords
        case "summary": part = .summary
        case "description": part = .description
        case "name": part = .groupName
        default: part = nil
        }
    }

    /// `tailorItemLabel` (@bfhr/core): the entry's name, position, title or language.
    private static func itemLabel(_ entry: Any?) -> String {
        if let text = entry as? String { return text }
        if let record = entry as? [String: Any] {
            for key in ["name", "position", "title", "language"] {
                if let value = record[key] as? String, !value.isEmpty { return value }
            }
        }
        return "…"
    }
}

/// One suggested edit as the review shows it.
public struct TailorCard: Identifiable, Hashable, Sendable {
    public let id: String
    public let op: TailorEditOp
    public let location: TailorLocation
    /// The original text (nil for an added bullet); for a new order, the old order's labels.
    public let before: String?
    /// The suggestion (nil for a removal).
    public let after: String?
    public let reason: String
    /// Where its facts come from, other than the edited value itself.
    public let groundedIn: [TailorLocation]
    /// A `[X%]`-style gap in the suggestion: it can only be kept as it was.
    public let gap: String?
    public let decision: TailorDecision?
    /// Accepted but not applied (the CV changed, or another accepted edit changes the same place).
    public let skipped: TailorSkipReason?
}

/// Why "Save as new version" is unavailable.
public enum TailorSaveBlocker: Hashable, Sendable {
    case nothingAccepted
    case nothingApplied
}

@Observable
public final class TailorReviewModel {
    public enum Phase: Hashable, Sendable {
        /// Light / Thorough, then "Suggest edits".
        case choosing
        /// "Reading the job description…" (cancellable).
        case loading
        case review
        case failed(ApplyAIError)
        /// Saved and pinned; the host goes back to the checklist.
        case saved
    }

    public let cvId: String
    /// The revision the edits are proposed against (and the new one is based on).
    public let revisionId: String
    public let jobId: String
    public let company: String
    public let role: String
    public let cvTitle: String
    public let language: String
    /// `profile.aiEnabled`; off shows the AI-off state without asking the server.
    public let aiEnabled: Bool
    public var intensity: TailorIntensity = .light
    public internal(set) var phase: Phase = .choosing
    public private(set) var original: CvContent?
    public private(set) var response: CvTailorResponse?
    public private(set) var decisions: [String: TailorDecision] = [:]
    public private(set) var savedRevision: CvRevision?
    /// The cards' filter by CV section (nil: all).
    public var sectionFilter: TailorLocation.Section?
    /// Changes / Preview.
    public var showsPreview = false

    public weak var services: (any ApplyServices)?
    public var renderer: (any ApplyRenderer)?
    /// Stores the revision with its pin (the Apply sheet's or CV Studio's `UserData` batch).
    public var onSave: ((CvRevision) -> Void)?
    /// The language `cvTailor` writes its reasons in.
    public var locale: UiLanguage = .en
    var clock: @MainActor () -> Date = { .now }
    private var request: Task<Void, Never>?
    private var json: Any?

    public init(
        cvId: String, revisionId: String, jobId: String, company: String, role: String,
        cvTitle: String, language: String, aiEnabled: Bool
    ) {
        self.cvId = cvId
        self.revisionId = revisionId
        self.jobId = jobId
        self.company = company
        self.role = role
        self.cvTitle = cvTitle
        self.language = language
        self.aiEnabled = aiEnabled
    }

    // MARK: Asking

    /// "Suggest edits": reads the revision, asks `cvTailor`, shows the cards.
    public func start() async {
        guard aiEnabled else {
            phase = .failed(.aiDisabled)
            return
        }
        request?.cancel()
        phase = .loading
        decisions = [:]
        let task = Task { [weak self] in
            guard let self else { return }
            do {
                guard let services else { throw ApplyAIError.failed("No services") }
                let revision = try await loadOriginal(services)
                let response = try await services.tailor(CvTailorRequest(
                    cvId: cvId, revisionId: revisionId, jobId: jobId, locale: locale, intensity: intensity
                ))
                guard !Task.isCancelled else { return }
                show(response, original: revision.content)
            } catch let error as ApplyAIError {
                guard !Task.isCancelled else { return }
                phase = .failed(error)
            } catch {
                guard !Task.isCancelled else { return }
                phase = .failed(.failed(String(describing: error)))
            }
        }
        request = task
        await task.value
    }

    /// Cancel while loading: back to the choice, nothing asked again.
    public func cancel() {
        request?.cancel()
        request = nil
        phase = .choosing
    }

    /// Another round with the other intensity (or after a failure).
    public func startOver() {
        request?.cancel()
        response = nil
        decisions = [:]
        phase = .choosing
    }

    private func loadOriginal(_ services: any ApplyServices) async throws -> CvRevision {
        do {
            return try await services.revision(cvId: cvId, revisionId: revisionId)
        } catch {
            throw ApplyAIError.notFound
        }
    }

    /// The answer on screen (tests and design mode set it directly).
    func show(_ response: CvTailorResponse, original: CvContent) {
        self.original = original
        self.response = response
        json = (try? JSONEncoder().encode(original)).flatMap { try? JSONSerialization.jsonObject(with: $0) }
        decisions = [:]
        sectionFilter = nil
        phase = .review
    }

    // MARK: Deciding

    public func decide(_ id: String, _ decision: TailorDecision) {
        guard let edit = response?.edits.first(where: { $0.id == id }) else { return }
        if decision == .accepted, Self.gap(in: edit) != nil { return }
        decisions[id] = decision
    }

    /// "Decide again".
    public func undecide(_ id: String) {
        decisions[id] = nil
    }

    /// "Accept all" (D44): every suggestion without a gap; the ones with a gap keep the original.
    public func acceptAll() {
        for edit in response?.edits ?? [] {
            decisions[edit.id] = Self.gap(in: edit) == nil ? .accepted : .kept
        }
    }

    /// "Keep original for the rest": every undecided card keeps the CV as it was.
    public func keepRest() {
        for edit in response?.edits ?? [] where decisions[edit.id] == nil {
            decisions[edit.id] = .kept
        }
    }

    // MARK: Derived

    public var acceptedIds: [String] {
        (response?.edits ?? []).filter { decisions[$0.id] == .accepted }.map(\.id)
    }

    /// The CV with the accepted edits applied (the preview and what is saved).
    public var result: TailorApplyResult? {
        guard let original, let response else { return nil }
        return try? Tailoring.apply(original, edits: response.edits, accepted: acceptedIds)
    }

    public var cards: [TailorCard] {
        guard let response else { return [] }
        let skipped = Dictionary(
            (result?.skipped ?? []).map { ($0.id, $0.reason) }, uniquingKeysWith: { first, _ in first }
        )
        return response.edits.map { edit in
            let location = TailorLocation(pointer: edit.path, in: json)
            var grounded: [TailorLocation] = []
            for pointer in edit.groundedIn where pointer != edit.path {
                let label = TailorLocation(pointer: pointer, in: json)
                if label != location, !grounded.contains(label) { grounded.append(label) }
            }
            return TailorCard(
                id: edit.id, op: edit.op, location: location, before: edit.before, after: edit.after,
                reason: edit.reason, groundedIn: grounded, gap: Self.gap(in: edit),
                decision: decisions[edit.id], skipped: skipped[edit.id]
            )
        }
    }

    /// The sections the cards touch, in CV order (the filter chips).
    public var sections: [TailorLocation.Section] {
        var seen: [TailorLocation.Section] = []
        for card in cards where !seen.contains(card.location.section) { seen.append(card.location.section) }
        return seen
    }

    public var visibleCards: [TailorCard] {
        guard let sectionFilter else { return cards }
        return cards.filter { $0.location.section == sectionFilter }
    }

    public var acceptedCount: Int { acceptedIds.count }
    public var keptCount: Int { decisions.values.filter { $0 == .kept }.count }
    public var pendingCount: Int { (response?.edits.count ?? 0) - decisions.count }
    /// Suggestions "Accept all" would accept that aren't accepted yet.
    public var acceptableCount: Int {
        (response?.edits ?? []).filter { Self.gap(in: $0) == nil && decisions[$0.id] != .accepted }.count
    }

    public var saveBlocker: TailorSaveBlocker? {
        if acceptedIds.isEmpty { return .nothingAccepted }
        if result?.applied.isEmpty ?? true { return .nothingApplied }
        return nil
    }

    /// The tailored CV as cv-render HTML (Changes / Preview).
    public func previewHTML() -> CVRenderedHTML? {
        guard let content = result?.content ?? original, let renderer else { return nil }
        return try? renderer.cvHTML(content, language: language)
    }

    // MARK: Saving

    /// "Save as new version": the `ai_tailor` revision with the accepted edits, handed to `onSave`
    /// (which pins it). Returns it; nil while `saveBlocker` says why not.
    @discardableResult
    public func save() -> CvRevision? {
        guard saveBlocker == nil, let result, let response else { return nil }
        let summary = String(localized: ApplyStrings.tailorDiffSummary(
            company: company, role: role, applied: result.applied.count, total: response.edits.count
        ))
        let revision = CvRevision(
            id: UserData.makeID(), cvId: cvId, content: result.content, source: .aiTailor,
            basedOnRevisionId: revisionId, jobId: jobId, diffSummary: summary, createdAt: clock()
        )
        onSave?(revision)
        savedRevision = revision
        phase = .saved
        return revision
    }

    /// `[X%]`, `[number]`: the CV placeholder pattern (BRIEF §2.4).
    static func gap(in edit: TailorEdit) -> String? {
        edit.after.flatMap { CVPlaceholders.find(in: $0).first }
    }
}
