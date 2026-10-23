import BFHRCore
import BFHRUIFixtures
import Foundation
import Testing
@testable import BFHRUI

/// An in-memory `CVWriter` that records writes and answers with a scripted result.
final class FakeCVWriter: CVWriter {
    enum Call: Equatable {
        case create(cvId: String, revisionId: String)
        case update(cvId: String, previousVersion: Int, revisionId: String?, currentRevisionId: String?)
        case revision(revisionId: String)
    }

    var calls: [Call] = []
    /// Results for the next `update` calls, in order; success when empty.
    var updateResults: [CVWriteError?] = []
    var createError: CVWriteError?
    var stored: [String: CvRevision] = [:]
    private var counter = 0

    func makeID() -> String {
        counter += 1
        return "id\(counter)"
    }

    func create(_ cv: Cv, revision: CvRevision) async throws(CVWriteError) {
        calls.append(.create(cvId: cv.id, revisionId: revision.id))
        if let createError { throw createError }
    }

    func update(cvId: String, previousVersion: Int, changes: CVChanges, revision: CvRevision?) async throws(CVWriteError) {
        calls.append(.update(cvId: cvId, previousVersion: previousVersion, revisionId: revision?.id, currentRevisionId: changes.currentRevisionId))
        if !updateResults.isEmpty, let error = updateResults.removeFirst() { throw error }
    }

    func createRevision(_ revision: CvRevision) async throws(CVWriteError) {
        calls.append(.revision(revisionId: revision.id))
    }

    func revision(cvId: String, revisionId: String) async throws -> CvRevision {
        guard let revision = stored[revisionId] else { throw CVWriteError.failed("missing") }
        return revision
    }
}

/// Lets queued tasks (the model's write tasks) run.
private func settle() async {
    for _ in 0..<20 { await Task.yield() }
}

@Suite("CV Studio: saving, conflicts, history, variants, import, render")
struct CVStudioTests {
    private func model(writer: FakeCVWriter? = nil, selecting cvId: String? = "cv-en") throws -> CVEditorModel {
        let document = try FixtureStore.document(.populated)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let model = CVEditorModel(selectedCvId: cvId, now: document.now, calendar: calendar)
        model.writer = writer
        model.load(UserData(document))
        return model
    }

    // MARK: Saving

    @Test("A save is one revision plus a version step, sent through the writer")
    func saveWritesRevision() async throws {
        let writer = FakeCVWriter()
        let model = try model(writer: writer)
        let before = try #require(model.data.cv(id: "cv-en"))
        model.saveSummary("Frontend engineer.")
        await settle()
        #expect(writer.calls == [.update(cvId: "cv-en", previousVersion: before.version, revisionId: "id1", currentRevisionId: "id1")])
        let cv = try #require(model.data.cv(id: "cv-en"))
        #expect(cv.version == before.version + 1 && cv.currentRevisionId == "id1")
        let revision = try #require(model.data.revision(id: "id1"))
        #expect(revision.basedOnRevisionId == before.currentRevisionId && revision.source == .manual)
        #expect(revision.diffSummary == "Edited Summary" && revision.content.basics?.summary == "Frontend engineer.")
        #expect(model.syncStatus == .saved(at: model.now))
    }

    @Test("A rejected save keeps the content; Try again sends it as a new revision")
    func failedSaveAndRetry() async throws {
        let writer = FakeCVWriter()
        writer.updateResults = [.failed("rules")]
        let model = try model(writer: writer)
        model.saveSummary("Kept on this device.")
        await settle()
        #expect(model.syncStatus == .failed && model.failedWriteIDs == ["cv-en"])
        #expect(model.summaryText == "Kept on this device." && model.document?.hasLocalEdits == true)

        // The listener rolls the CV back to the server's version; the draft stays on screen.
        let server = try FixtureStore.document(.populated)
        model.load(UserData(server))
        #expect(model.summaryText == "Kept on this device.")

        // Edits while a save is failed change the draft only.
        var header = model.headerDraft
        header.name = "Deniz A."
        model.saveHeader(header)
        #expect(writer.calls.count == 1)

        model.retrySave()
        await settle()
        #expect(model.failedWriteIDs.isEmpty && model.document?.hasLocalEdits == false)
        guard case .update(_, _, let revisionId?, _) = writer.calls.last else {
            Issue.record("No retry write")
            return
        }
        let revision = try #require(model.data.revision(id: revisionId))
        #expect(revision.content.basics?.summary == "Kept on this device." && revision.content.basics?.name == "Deniz A.")
        #expect(revision.diffSummary == "Saved the version from this device")
    }

    @Test("A version conflict keeps both versions; Keep this version points the CV at this device's")
    func conflictKeepThis() async throws {
        let writer = FakeCVWriter()
        writer.updateResults = [.conflict]
        let model = try model(writer: writer)
        model.saveSummary("Mine.")
        await settle()
        // This device's version was written as a revision of its own.
        #expect(writer.calls.last == .revision(revisionId: "id1"))
        let conflict = try #require(model.conflict)
        #expect(conflict.mineContent.basics?.summary == "Mine.")

        // The server's state arrives: another device saved version + 1 with its own revision.
        var server = UserData(try FixtureStore.document(.populated))
        let index = try #require(server.cvs.firstIndex { $0.id == "cv-en" })
        var other = try #require(server.revision(id: server.cvs[index].currentRevisionId))
        other.id = "other"
        other.content.basics?.summary = "Theirs."
        server.cvRevisions.append(other)
        server.cvs[index].currentRevisionId = "other"
        server.cvs[index].version += 1
        server.cvs[index].updatedAt = model.now.addingTimeInterval(-60)
        server.cvRevisions.append(model.data.revision(id: "id1")!)
        model.load(server)
        #expect(model.conflict?.otherContent?.basics?.summary == "Theirs." && model.summaryText == "Mine.")
        let changes = CVFieldDiff.changes(from: try #require(model.conflict?.otherContent), to: conflict.mineContent)
        #expect(changes.map(\.id) == ["/basics/summary"] && changes.first?.before == "Theirs." && changes.first?.after == "Mine.")

        model.keepThisVersion()
        await settle()
        #expect(model.conflict == nil)
        #expect(writer.calls.last == .update(cvId: "cv-en", previousVersion: server.cvs[index].version, revisionId: nil, currentRevisionId: "id1"))
        #expect(model.summaryText == "Mine.")
    }

    @Test("Use the other version drops this device's draft (it stays in history)")
    func conflictUseOther() async throws {
        let writer = FakeCVWriter()
        writer.updateResults = [.conflict]
        let model = try model(writer: writer)
        model.saveSummary("Mine.")
        await settle()
        model.load(UserData(try FixtureStore.document(.populated)))
        #expect(model.conflict != nil)
        model.useOtherVersion()
        #expect(model.conflict == nil && model.summaryText != "Mine.")
        #expect(!model.restore(revisionId: "missing"))
    }

    @Test("Archiving after another device's write retries once on the newer version")
    func metadataConflictRetries() async throws {
        let writer = FakeCVWriter()
        writer.updateResults = [.conflict, nil]
        let model = try model(writer: writer)
        _ = model.archive(cvId: "cv-de")
        await settle()
        #expect(writer.calls.count == 2 && model.data.cv(id: "cv-de")?.archivedAt != nil && model.conflict == nil)
    }

    // MARK: History

    @Test("Restore writes a new revision based on the restored one")
    func restore() async throws {
        let writer = FakeCVWriter()
        let model = try model(writer: writer)
        let old = try #require(model.revisionDays.flatMap(\.revisions).first { !$0.isCurrent })
        #expect(model.restore(revisionId: old.id))
        await settle()
        let current = try #require(model.data.revision(id: model.document?.currentRevisionId ?? ""))
        #expect(current.basedOnRevisionId == old.id && current.content == model.data.revision(id: old.id)?.content)
        #expect(current.diffSummary?.hasPrefix("Restored the version from") == true)
        #expect(!model.restore(revisionId: current.id))
    }

    @Test("Field changes name the section, item and field, in reading order")
    func fieldDiff() throws {
        let model = try model()
        var content = try #require(model.document?.content)
        let before = content
        content.work?[0].endDate = "2026-09"
        content.work?[0].highlights?[1] = "Changed bullet."
        content.meta.template = "modern"
        let changes = CVFieldDiff.changes(from: before, to: content)
        #expect(changes.map(\.id) == ["/work/0/endDate", "/work/0/highlights/1", "/meta/template"])
        #expect(changes[0].section == .editor(.work) && changes[0].item == "Pazarbox" && changes[0].field == .end && changes[0].before == nil)
        #expect(changes[1].field == .bullet && changes[1].position == 2)
        #expect(changes[2].section == .design && changes[2].after == "modern")
        #expect(CVFieldDiff.changes(from: before, to: before).isEmpty)
    }

    // MARK: Design, copies, variants

    @Test("The design change is one revision that also mirrors template and theme on the CV")
    func applyDesign() async throws {
        let writer = FakeCVWriter()
        let model = try model(writer: writer)
        var theme = try #require(model.document?.theme)
        theme.paperSize = .letter
        model.applyDesign(templateId: "modern", theme: theme, templateName: "Modern")
        await settle()
        let cv = try #require(model.data.cv(id: "cv-en"))
        #expect(cv.templateId == "modern" && cv.theme.paperSize == .letter)
        #expect(model.revisionDays.first?.revisions.first?.diffSummary == "Changed the design · Modern")
        model.applyDesign(templateId: "modern", theme: theme, templateName: "Modern")
        #expect(writer.calls.count == 1)
    }

    @Test("Duplicate and role variants copy the content into new CVs under the right base")
    func duplicateAndRoleVariant() async throws {
        let writer = FakeCVWriter()
        let model = try model(writer: writer)
        let source = try #require(model.document?.content)
        let copyId = try #require(await model.duplicate(cvId: "cv-en"))
        await settle()
        let copy = try #require(model.data.cv(id: copyId))
        #expect(copy.title.hasSuffix("(copy)") && copy.parentCvId == nil && copy.version == 1 && !copy.isDefault)
        #expect(model.document?.content == source && model.selectedCvId == copyId)

        let variantId = try #require(await model.newRoleVariant(of: "cv-de", label: "Frontend"))
        let variant = try #require(model.data.cv(id: variantId))
        // A variant of a variant hangs under the root base.
        #expect(variant.title == "Frontend" && variant.parentCvId == "cv-en" && variant.language == "de")
        #expect(model.data.revision(id: variant.currentRevisionId)?.basedOnRevisionId == model.data.cv(id: "cv-de")?.currentRevisionId)
        await settle()
        #expect(writer.calls.filter { if case .create = $0 { true } else { false } }.count == 2)
        #expect(await model.newRoleVariant(of: "cv-en", label: "  ") == nil)
    }

    @Test("Language variants translate prose field by field, keeping names and dates")
    func languageVariant() async throws {
        struct Translator: CVSuggestionProvider {
            func suggestions(for request: CVAssistRequest) async throws -> [CVSuggestion] {
                #expect(request.mode == .translate && request.targetLanguage == "tr")
                return [CVSuggestion(id: "t", text: "TR: " + request.text, reasons: [.translated])]
            }
        }
        let model = try model()
        model.suggestionProvider = Translator()
        let id = try #require(await model.newLanguageVariant(of: "cv-en", language: "tr", translate: true))
        let cv = try #require(model.data.cv(id: id))
        #expect(cv.language == "tr" && cv.parentCvId == "cv-en" && cv.title.hasSuffix("— Türkçe"))
        let content = try #require(model.document?.content)
        #expect(content.basics?.summary?.hasPrefix("TR: ") == true && content.basics?.name == "Deniz Aksoy")
        #expect(content.work?.first?.highlights?.allSatisfy { $0.hasPrefix("TR: ") } == true)
        #expect(content.work?.first?.name == "Pazarbox" && content.work?.first?.startDate == "2022-03")

        struct Failing: CVSuggestionProvider {
            func suggestions(for request: CVAssistRequest) async throws -> [CVSuggestion] { throw CVImportError.offline }
        }
        model.suggestionProvider = Failing()
        #expect(await model.newLanguageVariant(of: "cv-en", language: "de", translate: true) == nil)
        #expect(model.notice == .translateFailed)
    }

    @Test("A create the server refuses becomes a notice")
    func createFailure() async throws {
        let writer = FakeCVWriter()
        writer.createError = .failed("rules")
        let model = try model(writer: writer)
        model.startFromScratch()
        await settle()
        #expect(model.notice == .createFailed)
    }

    // MARK: Import

    final class FakeImporter: CVImporter {
        var result: Result<CVImportResult, CVImportError>
        init(_ result: Result<CVImportResult, CVImportError>) { self.result = result }
        func upload(_ data: Data, kind: CVImportFileKind) async throws(CVImportError) -> String { "users/u/cv-imports/f1" }
        func read(storagePath: String, kind: CVImportFileKind) async throws(CVImportError) -> CVImportResult { try result.get() }
    }

    @Test("Import: meta is added, low-confidence fields are flagged, Create CV keeps the original attached")
    func importFlow() async throws {
        let resume: [String: Any] = [
            "basics": ["name": "Ada Yılmaz", "summary": "Backend engineer building payment systems for ten years."],
            "work": [["name": "Acme", "position": "Engineer", "startDate": "2020-01", "highlights": ["Built the ledger service."]]],
            "education": [["institution": "ODTÜ", "area": "Computer Engineering"]],
        ]
        let json = try JSONSerialization.data(withJSONObject: resume)
        let importer = FakeImporter(.success(CVImportResult(resumeJSON: json, confidence: ["/work/0/startDate": 0.4, "/basics/name": 0.95], warnings: [])))
        let flow = CVImportFlow(fileName: "Ada_CV.pdf", importer: importer, timezone: "Europe/Istanbul", uiLanguage: "en")
        await flow.run(data: Data("pdf".utf8), kind: .pdf, renderEngine: nil, now: .now)
        #expect(flow.step == .review)
        #expect(flow.fieldCount == 8 && flow.openFlags.map(\.id) == ["/work/0/startDate"])
        #expect(flow.openFlags.first?.field == .date && flow.flags(sectionKey: "work", index: 0).count == 1)
        let review = try #require(flow.review?.document)
        #expect(review.title == "Ada Yılmaz — CV" && review.language == "en")
        #expect(review.content.meta.sectionOrder == ["basics", "work", "education"] && review.content.meta.theme.paperSize == .a4)

        flow.resolve(sectionKey: "work", index: 0)
        #expect(flow.openFlags.isEmpty)

        let editor = try model()
        let id = try #require(flow.create(in: editor))
        let cv = try #require(editor.data.cv(id: id))
        #expect(cv.importedFrom == CvImportedFile(kind: .pdf, storagePath: "users/u/cv-imports/f1", fileName: "Ada_CV.pdf"))
        #expect(editor.data.revision(id: cv.currentRevisionId)?.source == .import)
        #expect(editor.revisionDays.first?.revisions.first?.diffSummary == "Imported from Ada_CV.pdf")
    }

    @Test("Import failures and oversized files end in the failed step")
    func importFailures() async {
        let flow = CVImportFlow(fileName: "scan.pdf", importer: FakeImporter(.failure(.unreadable)), timezone: nil, uiLanguage: "en")
        await flow.run(data: Data("x".utf8), kind: .pdf, renderEngine: nil, now: .now)
        #expect(flow.step == .failed(.unreadable))
        let big = CVImportFlow(fileName: "big.pdf", importer: FakeImporter(.failure(.other(""))), timezone: nil, uiLanguage: "en")
        await big.run(data: Data(count: CVImportFileKind.maxBytes + 1), kind: .pdf, renderEngine: nil, now: .now)
        #expect(big.step == .failed(.tooLarge))
        #expect(CVImportFileKind(fileExtension: "ZIP") == .linkedinZip && CVImportFileKind(fileExtension: "png") == nil)
    }

    @Test("Imported prose is recognised as German or Turkish")
    func importLanguage() throws {
        let german = try CvContent.imported(resumeJSON: JSONSerialization.data(withJSONObject: [
            "basics": ["summary": "Ich entwickle seit acht Jahren Webanwendungen und arbeite gern im Team mit Designern und Produktmanagern."],
        ]), language: "en", timezone: nil)
        #expect(german.detectedLanguage(fallback: "en") == "de")
    }

    // MARK: Render

    /// packages/cv-render/dist/cv-render.iife.js (built by `pnpm --filter @bfhr/cv-render build`).
    nonisolated static let bundleURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "../../cv-render/dist/cv-render.iife.js").standardizedFileURL

    @Test("cv-render runs in JavaScriptCore: HTML, catalog, file name and DOCX",
          .enabled(if: FileManager.default.fileExists(atPath: CVStudioTests.bundleURL.path)))
    func renderEngine() async throws {
        let engine = try CVRenderEngine(scriptURL: Self.bundleURL)
        let model = try model()
        model.renderEngine = engine
        let rendered = try #require(try? model.renderedDocument?.get())
        #expect(rendered.html.contains("Deniz Aksoy") && rendered.html.contains("Pazarbox"))
        #expect(rendered.page.paper == "a4" && abs(rendered.page.widthPt - 595.28) < 0.5 && rendered.page.marginsMm.top > 0)

        model.select(cvId: "cv-de")
        let german = try #require(try? model.renderedDocument?.get())
        #expect(german.html.localizedCaseInsensitiveContains("Berufserfahrung") && german.html.contains("lang=\"de\""))

        let catalog = try engine.catalog(locale: "en")
        #expect(Set(catalog.templates.map(\.id)) == ["classic", "modern", "compact"])
        #expect(catalog.fontPairs.contains { $0.id == CVTemplateCatalog.defaultFontPair })
        #expect(catalog.accents.contains { $0.id.caseInsensitiveCompare(CVTemplateCatalog.defaultAccent) == .orderedSame })
        #expect(try engine.catalog(locale: "de").templates.count == 3)

        #expect(try engine.fileName(name: "Deniz Aksoy", company: "Acme GmbH", ext: "pdf") == "Deniz-Aksoy-CV-Acme-GmbH.pdf")
        #expect(try engine.fileName(name: "Deniz Aksoy", company: nil, ext: "pdf") == "Deniz-Aksoy-CV.pdf")
        #expect(model.exportFileName(format: .docx).hasSuffix("-CV.docx"))

        #expect(engine.buildsDocx)
        let docx = try await model.docxExport(paper: .letter)
        #expect(docx.count > 2_000 && docx.prefix(2) == Data("PK".utf8))
        let json = try model.jsonExport()
        let decoded = try BFHRJSON.decoder().decode(CvContent.self, from: json)
        #expect(decoded == model.document?.content)
    }

    @Test("A missing or broken bundle is reported, not crashed on")
    func renderEngineMissing() throws {
        #expect(throws: CVRenderError.bundleMissing) { try CVRenderEngine(scriptURL: URL(fileURLWithPath: "/nonexistent.js")) }
        let model = try model()
        if case .failure(.bundleMissing) = model.renderedDocument {} else { Issue.record("Expected bundleMissing") }
    }
}
