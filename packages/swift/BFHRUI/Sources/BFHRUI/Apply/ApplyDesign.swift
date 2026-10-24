#if DEBUG
import BFHRCore
import Foundation

// Design mode for "Tailor for this job", the cover letter editor and the kit (Debug builds only):
// canned `cvTailor` / `coverLetterDraft` answers built from the fixture CV, so the review, the
// draft banner and the states can be captured and audited without Firebase. Release builds
// compile none of this.

/// `cvTailor` / `coverLetterDraft` in design mode: answers after a short pause from the fixture.
public final class DesignApplyServices: ApplyServices {
    private let data: UserData
    /// Every AI request fails with this (the limit and AI-off states).
    var failure: ApplyAIError?

    public init(data: UserData) {
        self.data = data
    }

    public func revision(cvId: String, revisionId: String) async throws -> CvRevision {
        guard let revision = data.cvRevisions.first(where: { $0.id == revisionId }) else { throw ApplyFilesError.noServices }
        return revision
    }

    public func upload(_ file: ApplyFile) async throws -> String { "users/design/rendered/\(file.id)" }

    public func sendEmail(_ request: ApplyMailRequest) async throws(ApplySendError) -> (applicationId: String, sendAt: Date) {
        (request.applicationId ?? "design", .now.addingTimeInterval(10))
    }

    public func cancelEmail(applicationId: String) async throws(ApplySendError) {}

    public func tailor(_ request: CvTailorRequest) async throws(ApplyAIError) -> CvTailorResponse {
        try? await Task.sleep(for: .milliseconds(600))
        if let failure { throw failure }
        guard let revision = data.cvRevisions.first(where: { $0.id == request.revisionId }) else { throw .notFound }
        return Self.tailorResponse(for: revision.content, language: request.locale)
    }

    public func draftCoverLetter(_ request: CoverLetterDraftRequest) async throws(ApplyAIError) -> CoverLetterDraftResponse {
        try? await Task.sleep(for: .milliseconds(600))
        if let failure { throw failure }
        guard let job = data.job(id: request.jobId) else { throw .notFound }
        return Self.letterResponse(job: job, name: data.profile?.fullName ?? "")
    }

    public func uploadAttachment(_ file: ApplyFile, contentType: String) async throws -> String {
        "users/design/mail-attachments/\(file.id)"
    }

    public func download(_ file: RenderedFile) async throws -> Data { Data(count: file.sizeBytes) }

    /// Five suggestions for the English fixture CV (`rev-en-3`): a reworded summary, two reworded
    /// bullets, one with a `[X]` gap, and a new order of skills; one more was dropped.
    static func tailorResponse(for content: CvContent, language: UiLanguage) -> CvTailorResponse {
        let json = (try? JSONEncoder().encode(content)).flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
        let basics = json?["basics"] as? [String: Any]
        let work = json?["work"] as? [[String: Any]] ?? []
        let skills = json?["skills"] as? [[String: Any]] ?? []
        func highlight(_ entry: Int, _ index: Int) -> String? {
            (work.indices.contains(entry) ? work[entry]["highlights"] as? [String] : nil).flatMap { $0.indices.contains(index) ? $0[index] : nil }
        }
        let reasons = reasons(language)
        var edits: [TailorEdit] = []
        if let summary = basics?["summary"] as? String {
            edits.append(TailorEdit(
                id: "e1", path: "/basics/summary", op: .replace, before: summary,
                after: "Frontend engineer with five years of experience building fast, accessible product UIs in React and TypeScript, most recently leading the design-system rebuild at Pazarbox. I care about performance budgets and localization, and like working closely with designers and product managers on measurable outcomes.",
                order: nil, reason: reasons[0], groundedIn: ["/basics/summary", "/work/0/highlights/0"]
            ))
        }
        if let before = highlight(0, 1) {
            edits.append(TailorEdit(
                id: "e2", path: "/work/0/highlights/1", op: .replace, before: before,
                after: "Improved checkout web performance: Largest Contentful Paint from 3.9 s to 1.8 s through code splitting and image budgets.",
                order: nil, reason: reasons[1], groundedIn: ["/work/0/highlights/1", "/skills/1/keywords/1"]
            ))
        }
        if let before = highlight(0, 2) {
            edits.append(TailorEdit(
                id: "e3", path: "/work/0/highlights/2", op: .replace, before: before,
                after: "Introduced Playwright visual regression tests that caught 40+ regressions before release in the first quarter.",
                order: nil, reason: reasons[2], groundedIn: ["/work/0/highlights/2"]
            ))
        }
        if let before = highlight(1, 1) {
            edits.append(TailorEdit(
                id: "e4", path: "/work/1/highlights/1", op: .replace, before: before,
                after: "\(before.hasSuffix(".") ? String(before.dropLast()) : before), used by [X] customers.",
                order: nil, reason: reasons[3], groundedIn: ["/work/1/highlights/1"]
            ))
        }
        if skills.count > 1, let keywords = skills[1]["keywords"] as? [String], keywords.count > 1 {
            var order = Array(keywords.indices)
            order.swapAt(0, 1)
            edits.append(TailorEdit(
                id: "e5", path: "/skills/1/keywords", op: .reorder,
                before: keywords.joined(separator: " · "), after: order.map { keywords[$0] }.joined(separator: " · "),
                order: order, reason: reasons[4], groundedIn: ["/skills/1/keywords"]
            ))
        }
        return CvTailorResponse(edits: edits, dropped: 1, model: "design", promptVersion: "design")
    }

    /// The "why" of each design suggestion, in the UI language (the callable writes them in `locale`).
    private static func reasons(_ language: UiLanguage) -> [String] {
        switch language {
        case .tr:
            [
                "İlan önce tasarım sistemlerini ve performansı istiyor; özet bunlarla başlıyor.",
                "İlan web performansını istiyor; bu madde onu öne çıkarıyor.",
                "İlandaki \"visual regression testing\" ifadesini kullanıyor.",
                "İlan ölçeği soruyor; bir sayı bunu somutlaştırır.",
                "İlan önce web performansından söz ediyor.",
            ]
        case .de:
            [
                "Die Stelle nennt Designsysteme und Performance zuerst; die Zusammenfassung beginnt damit.",
                "Die Stelle verlangt Web-Performance; dieser Punkt stellt sie nach vorn.",
                "Verwendet den Begriff „visual regression testing“ aus der Anzeige.",
                "Die Stelle fragt nach Größenordnung; eine Zahl macht das greifbar.",
                "Die Anzeige nennt Web-Performance zuerst.",
            ]
        case .en:
            [
                "The posting lists design systems and performance first; the summary now leads with them.",
                "The job asks for web performance; this bullet puts it first.",
                "Uses the posting's term \"visual regression testing\".",
                "The job asks about scale; a number makes this concrete.",
                "The posting mentions web performance first.",
            ]
        }
    }

    static func letterResponse(job: Job, name: String) -> CoverLetterDraftResponse {
        let body = """
        Dear {hiring_manager},

        I'm applying for the \(job.title) position at \(job.company). Your team's focus on fast, accessible product interfaces matches the work I enjoy most.

        At Pazarbox I led the rebuild of our design system, adopted by 7 product teams, and cut checkout Largest Contentful Paint from 3.9 s to 1.8 s.

        I'd welcome the chance to talk about how I can help.

        Kind regards,
        \(name)
        """
        return CoverLetterDraftResponse(
            subject: "Application: \(job.title)", body: body, placeholders: [], unresolvedFields: [.hiringManager],
            droppedSentences: 1, model: "design", promptVersion: "design"
        )
    }
}

extension TailorReviewModel {
    /// Design mode: the review with some cards decided.
    func designReview(_ response: CvTailorResponse, original: CvContent, decided: Bool) {
        show(response, original: original)
        if decided {
            decide("e1", .accepted)
            decide("e3", .kept)
        }
    }

    func designFailure(_ error: ApplyAIError) {
        phase = .failed(error)
    }

    func designLoading() {
        phase = .loading
    }
}

extension CoverLetterEditorModel {
    func designDraft(_ response: CoverLetterDraftResponse) {
        useDraft(response)
    }

    func designFailure(_ error: ApplyAIError) {
        draftPhase = .failed(error)
    }
}
#endif
