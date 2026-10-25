import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

/// Apply's data layer in memory: revisions from the fixture, uploads and sends recorded.
final class FakeApplyServices: ApplyServices {
    let revisions: [CvRevision]
    var uploads: [ApplyFile] = []
    var sends: [ApplyMailRequest] = []
    var cancels: [String] = []
    var sendError: ApplySendError?
    var tailorRequests: [CvTailorRequest] = []
    var tailorResult: Result<CvTailorResponse, ApplyAIError> = .failure(.failed("not set"))
    var draftRequests: [CoverLetterDraftRequest] = []
    var draftResult: Result<CoverLetterDraftResponse, ApplyAIError> = .failure(.failed("not set"))
    var attachmentUploads: [(ApplyFile, String)] = []

    init(revisions: [CvRevision]) {
        self.revisions = revisions
    }

    func revision(cvId: String, revisionId: String) async throws -> CvRevision {
        guard let revision = revisions.first(where: { $0.id == revisionId }) else { throw CocoaError(.fileReadNoSuchFile) }
        return revision
    }

    func upload(_ file: ApplyFile) async throws -> String {
        uploads.append(file)
        return "users/u/rendered/\(file.id)"
    }

    func sendEmail(_ request: ApplyMailRequest) async throws(ApplySendError) -> (applicationId: String, sendAt: Date) {
        if let sendError { throw sendError }
        sends.append(request)
        return (request.applicationId ?? "server-app", Date().addingTimeInterval(10))
    }

    func cancelEmail(applicationId: String) async throws(ApplySendError) {
        cancels.append(applicationId)
    }

    func tailor(_ request: CvTailorRequest) async throws(ApplyAIError) -> CvTailorResponse {
        tailorRequests.append(request)
        return try tailorResult.get()
    }

    func draftCoverLetter(_ request: CoverLetterDraftRequest) async throws(ApplyAIError) -> CoverLetterDraftResponse {
        draftRequests.append(request)
        return try draftResult.get()
    }

    func uploadAttachment(_ file: ApplyFile, contentType: String) async throws -> String {
        attachmentUploads.append((file, contentType))
        return "users/u/mail-attachments/\(file.id)"
    }

    func download(_ file: RenderedFile) async throws -> Data { Data(count: file.sizeBytes) }
}

final class FakeApplyRenderer: ApplyRenderer {
    func cvHTML(_ content: CvContent, language: String) throws -> CVRenderedHTML {
        CVRenderedHTML(
            html: "<p>\(content.basics?.summary ?? "")</p>", title: "CV",
            page: CVPageGeometry(paper: "A4", widthPt: 595.28, heightPt: 841.89, widthMm: 210, heightMm: 297, marginsMm: .init(top: 20, right: 20, bottom: 20, left: 20))
        )
    }

    func cvPDF(_ revision: CvRevision, language: String) async throws -> (fileName: String, data: Data) {
        ("Deniz-Aksoy-CV.pdf", Data("%PDF-cv".utf8))
    }

    func letterPDF(title: String, body: String, language: String) async throws -> Data {
        Data("%PDF-letter".utf8)
    }
}

@Suite("Apply model")
struct ApplyModelTests {
    static let featured = "job-lighthouse-senior-frontend"

    let document: FixtureDocument
    let data: UserData

    init() throws {
        document = try FixtureStore.document(.populated)
        data = UserData(document)
    }

    func model(_ jobId: String = featured, data: UserData? = nil) -> (ApplyModel, FakeApplyServices) {
        let model = ApplyModel(jobId: jobId, now: document.now)
        let services = FakeApplyServices(revisions: document.cvRevisions)
        model.services = services
        model.renderer = FakeApplyRenderer()
        model.load(data ?? self.data)
        return (model, services)
    }

    @Test("Defaults: the CV the match is based on, no letter, the posting's own route first")
    func defaults() throws {
        let (model, _) = model()
        let match = try #require(data.match(forJob: Self.featured))
        #expect(model.selectedCvId == match.basedOnCvId)
        #expect(model.selectedCV?.score == match.score)
        #expect(model.coverLetter == .none)
        #expect(model.channel == .site(url: URL(string: "https://apply.workable.com/lighthouse-learning/j/5E7A9C1B3D/")!, board: nil))
        #expect(model.canContinue && model.blocker == nil)
        #expect(model.sendingAccounts.map(\.address) == ["deniz.aksoy@example.com"])
        #expect(model.letterOptions.allSatisfy { $0.isTemplate || $0.jobId == Self.featured })
    }

    @Test("Routes follow D23: direct, then the apply email, then job boards")
    func routeOrder() throws {
        var job = try #require(data.job(id: Self.featured))
        job.applyEmail = "talent@lighthouse.example"
        let channels = ApplyModel.channels(for: job)
        let firstEmail = try #require(channels.firstIndex { $0.isEmail })
        #expect(channels.prefix(firstEmail).allSatisfy { if case .site(_, nil) = $0 { true } else { false } })
        #expect(channels.suffix(from: firstEmail + 1).allSatisfy { if case .site(_, _?) = $0 { true } else { false } })
    }

    @Test("Company site: Preparing, then Yes pins the CV revision, marks Applied, and Undo reverts")
    func companySite() throws {
        let (model, _) = model()
        let url = try #require(try model.beginSiteApplication())
        #expect(url.host() == "apply.workable.com")
        let application = try #require(model.data.application(forJob: Self.featured))
        #expect(application.status == .preparing && application.channel == .externalLink)
        #expect(model.step == .kit)

        model.returnedFromSite()
        #expect(model.asksIfSubmitted)
        let toast = try #require(try model.confirmApplied())
        let applied = try #require(model.data.application(id: application.id))
        #expect(applied.status == .applied && applied.appliedAt == document.now)
        #expect(applied.cvId == model.selectedCV?.id && applied.cvRevisionId == model.selectedCV?.revisionId)
        #expect(model.data.events(forApplication: application.id).map(\.toStatus) == [.preparing, .applied])
        #expect(toast.resolvedMessage == "Lighthouse Learning · marked as Applied")
        toast.action?.perform()
        #expect(model.data.application(id: application.id)?.status == .preparing)
    }

    @Test("Not yet keeps Preparing; I'm not applying moves back to Saved")
    func notApplying() throws {
        let (model, _) = model()
        _ = try model.beginSiteApplication()
        model.returnedFromSite()
        model.notYet()
        #expect(!model.asksIfSubmitted && model.deferredAnswer)
        let toast = try #require(try model.notApplying())
        #expect(toast.resolvedMessage == "Lighthouse Learning · back in Saved")
        #expect(model.data.application(forJob: Self.featured)?.status == .saved)
    }

    @Test("A written cover letter is saved with the application and pinned")
    func writtenLetter() throws {
        let (model, _) = model()
        model.coverLetter = .written
        #expect(!model.canContinue && model.blocker == .emptyLetter)
        model.letter.text = "Dear team,\n\nI'd love to help."
        _ = try model.beginSiteApplication()
        let letter = try #require(model.data.coverLetters.first { $0.jobId == Self.featured })
        #expect(letter.body == "Dear team,\n\nI'd love to help." && letter.author == .user && !letter.isTemplate)
        model.returnedFromSite()
        try model.confirmApplied()
        #expect(model.data.application(forJob: Self.featured)?.coverLetterId == letter.id)
    }

    @Test("Email from an account: PDFs made, stored as renderedFiles, sent with the pins")
    func emailFromAccount() async throws {
        let (model, services) = model()
        model.useEmail("talent@lighthouse.example")
        #expect(model.channel == .email(address: "talent@lighthouse.example", fromPosting: false))
        try await model.beginEmailApplication()
        #expect(model.step == .email)
        #expect(model.email.to == "talent@lighthouse.example")
        #expect(model.email.subject == "Application: Senior Frontend Engineer")
        #expect(model.files.files.count == 1)
        // No cover letter: the draft names the CV only.
        #expect(model.email.body.contains("My CV is attached.") && !model.email.body.contains("cover letter"))

        let toast = try await model.sendFromAccount()
        #expect(toast.action?.role == .undo)
        let request = try #require(services.sends.first)
        #expect(request.accountId == model.sendingAccounts.first?.id)
        #expect(request.applicationId == model.data.application(forJob: Self.featured)?.id)
        #expect(request.renderedFileIds.count == 1)
        #expect(request.pins.cvFileId == request.renderedFileIds.first)
        #expect(services.uploads.count == 1)
        let stored = try #require(model.data.renderedFiles.first { $0.id == request.renderedFileIds.first })
        #expect(stored.kind == .pdf && stored.cvRevisionId == model.selectedCV?.revisionId && stored.sha256.count == 64)
    }

    @Test("An untouched draft follows the cover letter choice; an edited one is kept")
    func emailBodyFollowsLetter() async throws {
        let (model, _) = model()
        model.useEmail("talent@lighthouse.example")
        try await model.beginEmailApplication()
        #expect(model.email.body.contains("My CV is attached."))
        model.step = .checklist
        model.coverLetter = .written
        model.letter.text = "Dear team,\n\nI'd love to help."
        try await model.beginEmailApplication()
        #expect(model.email.body.contains("My CV and cover letter are attached."))
        model.email.body = "Hi, my own words."
        model.step = .checklist
        model.coverLetter = .none
        try await model.beginEmailApplication()
        #expect(model.email.body == "Hi, my own words.")
    }

    @Test("A refused send stays on the review with the reason")
    func sendRefused() async throws {
        let (model, services) = model()
        services.sendError = .dailyCap
        model.useEmail("talent@lighthouse.example")
        try await model.beginEmailApplication()
        await #expect(throws: ApplySendError.dailyCap) { try await model.sendFromAccount() }
        #expect(model.sendError == .dailyCap)
    }

    @Test("Without a CV the sheet says to add one")
    func noCV() throws {
        var data = self.data
        data.cvs = []
        let (model, _) = model(data: data)
        #expect(model.blocker == .noCV && !model.canContinue)
    }
}
