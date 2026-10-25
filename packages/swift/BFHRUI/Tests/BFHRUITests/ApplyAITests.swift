import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

@Suite("Apply: tailoring, cover letter, kit, attachments")
struct ApplyAITests {
    static let featured = ApplyModelTests.featured

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

    func tailorResponse(for revisionId: String) throws -> CvTailorResponse {
        let revision = try #require(document.cvRevisions.first { $0.id == revisionId })
        return DesignApplyServices.tailorResponse(for: revision.content, language: .en)
    }

    // MARK: Tailor for this job

    @Test("Tailor: accept 2 → an ai_tailor revision based on the CV's, pinned on a new Saved application, selected")
    func tailorSavesAndPins() async throws {
        let (model, services) = model()
        let cv = try #require(model.selectedCV)
        services.tailorResult = .success(try tailorResponse(for: cv.revisionId))
        #expect(model.data.application(forJob: Self.featured) == nil)

        model.beginTailoring()
        #expect(model.step == .tailor)
        let review = try #require(model.tailoring)
        review.intensity = .thorough
        await review.start()
        #expect(review.phase == .review)
        #expect(services.tailorRequests == [CvTailorRequest(cvId: cv.cvId, revisionId: cv.revisionId, jobId: Self.featured, locale: .en, intensity: .thorough)])
        #expect(review.saveBlocker == .nothingAccepted)

        review.decide("e1", .accepted)
        review.decide("e2", .accepted)
        review.decide("e4", .accepted) // has a [X] gap: refused
        #expect(review.acceptedIds == ["e1", "e2"])
        #expect(review.cards.first { $0.id == "e4" }?.gap == "[X]")
        #expect(review.pendingCount == 3)
        review.keepRest()
        #expect(review.pendingCount == 0 && review.keptCount == 3)

        let revision = try #require(review.save())
        #expect(revision.source == .aiTailor && revision.jobId == Self.featured && revision.basedOnRevisionId == cv.revisionId)
        #expect(revision.cvId == cv.cvId)
        #expect(revision.content.basics?.summary?.contains("most recently leading the design-system rebuild") == true)
        #expect(revision.diffSummary == "Tailored for Lighthouse Learning · Senior Frontend Engineer: 2 of 5 suggestions")

        let application = try #require(model.data.application(forJob: Self.featured))
        #expect(application.status == .saved)
        #expect(application.cvId == cv.cvId && application.cvRevisionId == revision.id)
        #expect(model.selectedCV?.revisionId == revision.id && model.selectedCV?.savedForJob == .tailored)
        #expect(model.data.cv(id: cv.cvId)?.currentRevisionId == cv.revisionId, "the CV itself keeps its version")
        model.endTailoring()
        #expect(model.step == .checklist && model.tailoring == nil)
    }

    @Test("The tailored revision and its pin go out in one batch")
    func tailorOneBatch() async throws {
        let (model, services) = model()
        let writer = RecordingWriter()
        model.writer = writer
        services.tailorResult = .success(try tailorResponse(for: try #require(model.selectedCV).revisionId))
        model.beginTailoring()
        let review = try #require(model.tailoring)
        await review.start()
        review.acceptAll()
        let revision = try #require(review.save())
        var batch = try await writer.next()
        while batch.cvRevisions.isEmpty { batch = try await writer.next() }
        #expect(batch.cvRevisions.map(\.id) == [revision.id])
        #expect(batch.applications.contains { $0.id == model.data.application(forJob: Self.featured)?.id })
    }

    @Test("Accept all (D44) accepts every suggestion without a gap; a gap keeps the original")
    func acceptAll() async throws {
        let (model, services) = model()
        services.tailorResult = .success(try tailorResponse(for: try #require(model.selectedCV).revisionId))
        model.beginTailoring()
        let review = try #require(model.tailoring)
        await review.start()
        #expect(review.acceptableCount == 4)
        review.acceptAll()
        #expect(review.acceptedIds == ["e1", "e2", "e3", "e5"])
        #expect(review.decisions["e4"] == .kept)
        #expect(review.saveBlocker == nil && review.result?.applied.count == 4)
        review.undecide("e1")
        #expect(review.pendingCount == 1)
    }

    @Test("Card locations name the section, the entry and the part")
    func locations() async throws {
        let (model, services) = model()
        services.tailorResult = .success(try tailorResponse(for: try #require(model.selectedCV).revisionId))
        model.beginTailoring()
        let review = try #require(model.tailoring)
        await review.start()
        let labels = review.cards.map { ApplyStrings.location($0.location) }
        #expect(labels == [
            "Summary", "Experience · Pazarbox · bullet 2", "Experience · Pazarbox · bullet 3",
            "Experience · Kuzey Labs · bullet 2", "Skills · Quality · order of keywords",
        ])
        #expect(review.sections == [.summary, .experience, .skills])
        review.sectionFilter = .experience
        #expect(review.visibleCards.count == 3)
    }

    @Test("AI off: no request, the AI-off state; a limit from the server: the limit state")
    func tailorStates() async throws {
        var off = data
        off.profile?.aiEnabled = false
        let (model, services) = model(data: off)
        model.beginTailoring()
        await model.tailoring?.start()
        #expect(model.tailoring?.phase == .failed(.aiDisabled))
        #expect(services.tailorRequests.isEmpty)

        let (limited, limitedServices) = self.model()
        limitedServices.tailorResult = .failure(.dailyLimit)
        limited.beginTailoring()
        await limited.tailoring?.start()
        #expect(limited.tailoring?.phase == .failed(.dailyLimit))
        limited.tailoring?.cancel()
        #expect(limited.tailoring?.phase == .choosing)
    }

    @Test("D45: a pre-apply pin is replaced by what's actually sent; after applying, pins stay")
    func pinsReplaceBeforeApplying() throws {
        let (model, _) = model()
        let original = try #require(model.selectedCV)
        let content = try #require(document.cvRevisions.first { $0.id == original.revisionId }).content
        let revision = CvRevision(
            id: "rev-tailored", cvId: original.cvId, content: content, source: .aiTailor,
            basedOnRevisionId: original.revisionId, jobId: Self.featured, diffSummary: nil, createdAt: document.now
        )
        model.saveTailoredVersion(revision)
        #expect(model.data.application(forJob: Self.featured)?.cvRevisionId == "rev-tailored")
        // Back to the CV as it is, then apply with it: the pin follows.
        model.selectedCvId = original.id
        _ = try model.beginSiteApplication()
        model.returnedFromSite()
        try model.confirmApplied()
        let applied = try #require(model.data.application(forJob: Self.featured))
        #expect(applied.cvRevisionId == original.revisionId)
        // Applied: a later tailored version doesn't touch the pin.
        model.saveTailoredVersion(CvRevision(
            id: "rev-later", cvId: original.cvId, content: content, source: .aiTailor,
            basedOnRevisionId: original.revisionId, jobId: Self.featured, diffSummary: nil, createdAt: document.now
        ))
        #expect(model.data.application(forJob: Self.featured)?.cvRevisionId == original.revisionId)
    }

    @Test("A version pinned on an earlier visit is offered and preselected")
    func pinnedVersionPreselected() throws {
        var data = self.data
        let cv = try #require(data.cvs.first { $0.id == "cv-en" })
        let saved = data.saveJob(Self.featured, at: document.now)
        let application = try #require(saved)
        let index = try #require(data.applications.firstIndex { $0.id == application.id })
        data.applications[index].cvId = cv.id
        data.applications[index].cvRevisionId = "rev-en-2"
        let (model, _) = model(data: data)
        #expect(model.selectedCV?.id == ApplyCVOption.versionID("rev-en-2"))
        #expect(model.selectedCV?.savedForJob == .tailored || model.selectedCV?.savedForJob == .pinned)
        #expect(model.cvOptions.contains { $0.id == cv.id && $0.revisionId == cv.currentRevisionId })
    }

    // MARK: Cover letter

    @Test("Write one starts from the starter in the CV's language; fields fill from the job and profile")
    func letterStarter() throws {
        let (model, _) = model()
        model.editLetter()
        #expect(model.step == .letter && model.coverLetter == .written)
        #expect(model.letter.templateId == "starter-en")
        #expect(model.letter.filled.unresolved.isEmpty)
        #expect(model.letter.filled.text.contains("Senior Frontend Engineer position at Lighthouse Learning"))
        #expect(model.letter.filled.text.hasSuffix("Deniz Aksoy"))
        // The starter's gaps block sending, with the gap named.
        #expect(model.blocker == .letterGap("[Why this role and company appeal to you]"))
        #expect(!model.canContinue)
        #expect(model.letter.starterTemplates.map(\.id) == ["starter-en", "starter-tr", "starter-de"])
        #expect(model.letter.ownTemplates.map(\.id) == ["cl-template-en"])
    }

    @Test("Draft with AI: request with tone, language, template; Undo restores; a missing field blocks until typed")
    func letterDraft() async throws {
        let (model, services) = model()
        let job = try #require(data.job(id: Self.featured))
        services.draftResult = .success(DesignApplyServices.letterResponse(job: job, name: "Deniz Aksoy"))
        model.editLetter()
        let before = model.letter.text
        model.letter.tone = .formal
        model.letter.language = .de
        await model.letter.draft()
        let cv = try #require(model.selectedCV)
        #expect(services.draftRequests == [CoverLetterDraftRequest(
            cvId: cv.cvId, revisionId: cv.revisionId, jobId: Self.featured, tone: .formal, language: .de, templateId: "starter-en"
        )])
        #expect(model.letter.author == .ai && model.letter.banner?.droppedSentences == 1)
        #expect(model.letter.fieldsToFill == [.hiringManager])
        #expect(model.blocker == .letterField(.hiringManager))
        model.letter.typedValues[.hiringManager] = "Ms. Weber"
        #expect(model.blocker == nil && model.canContinue)
        #expect(model.letterBody?.hasPrefix("Dear Ms. Weber,") == true)
        #expect(model.letter.fieldsToFill == [.hiringManager], "the typed field stays editable")
        model.letter.undo()
        #expect(model.letter.text == before && model.letter.author == .user)
    }

    @Test("Draft failures: AI off locally, the daily limit from the server")
    func letterDraftFailures() async throws {
        var off = data
        off.profile?.aiEnabled = false
        let (model, services) = model(data: off)
        model.editLetter()
        await model.letter.draft()
        #expect(model.letter.draftPhase == .failed(.aiDisabled) && services.draftRequests.isEmpty)

        let (limited, limitedServices) = self.model()
        limitedServices.draftResult = .failure(.dailyLimit)
        limited.editLetter()
        await limited.letter.draft()
        #expect(limited.letter.draftPhase == .failed(.dailyLimit))
    }

    @Test("Save as template keeps the fields as tokens; the letter goes out filled")
    func saveAsTemplate() throws {
        let (model, _) = model()
        model.editLetter()
        model.letter.text = "Dear {hiring_manager},\n\nI'd like to join {company} as {role}.\n\n{name}"
        model.letter.typedValues[.hiringManager] = "Alex"
        let template = try #require(model.letter.saveAsTemplate(title: "  Short  "))
        #expect(template.title == "Short" && template.isTemplate && template.jobId == nil)
        #expect(template.body.contains("{company}") && template.body.contains("{hiring_manager}"))
        #expect(model.data.coverLetters.contains { $0.id == template.id })
        #expect(model.letter.ownTemplates.contains { $0.id == template.id })
        #expect(model.letterBody == "Dear Alex,\n\nI'd like to join Lighthouse Learning as Senior Frontend Engineer.\n\nDeniz Aksoy")
        _ = try model.beginSiteApplication()
        let letter = try #require(model.data.coverLetters.first { $0.jobId == Self.featured && !$0.isTemplate })
        #expect(letter.body == model.letterBody)
    }

    // MARK: Kit

    @Test("Kit answers: AnswersKit for the job's currency and language (no country: every answer kind)")
    func kitAnswers() throws {
        let (model, _) = model()
        let job = try #require(data.job(id: Self.featured))
        let expected = AnswersKit.answers(data.answers, for: KitContext(countryCode: nil, currency: "EUR", language: job.language, fallbackLanguage: "en"))
        #expect(model.kitAnswers == expected)
        #expect(model.kitAnswers.map(\.kind).contains(.salaryExpectation))
    }

    // MARK: Attachments

    @Test("Attachments: saved files by reference, files from Files uploaded, the cap and the provider limit")
    func attachments() async throws {
        let (model, services) = model()
        model.useEmail("talent@lighthouse.example")
        try await model.beginEmailApplication()
        #expect(model.attachmentLimitBytes == MailSendLimits.maxAttachmentBytes(.gmail))
        model.attachSaved(["file-cl-thames"])
        #expect(model.attachments.count == 2)
        #expect(!model.attachFromDevice(fileName: "x.zip", data: Data(count: 10), contentType: "application/zip"))
        #expect(model.attachFromDevice(fileName: "Portfolio.pdf", data: Data(count: 1_000), contentType: "application/pdf"))
        #expect(model.attachmentProblem == nil && model.attachmentSlotsLeft == 2)
        #expect(model.problem(adding: 3, bytes: 0) == .tooMany)
        #expect(model.problem(adding: 1, bytes: 19 * 1024 * 1024) == .tooLarge)
        #expect(!model.savedAttachmentOptions.contains { $0.id == "file-cl-thames" })

        _ = try await model.sendFromAccount()
        let request = try #require(services.sends.first)
        #expect(request.renderedFileIds.count == 2 && request.renderedFileIds.last == "file-cl-thames")
        #expect(request.uploads.map(\.fileName) == ["Portfolio.pdf"] && request.uploads.first?.contentType == "application/pdf")
        #expect(services.attachmentUploads.count == 1)
    }

    @Test("Over the limit: Send refuses with the reason")
    func attachmentsTooLarge() async throws {
        let (model, services) = model()
        defer { withExtendedLifetime(services) {} }
        model.useEmail("talent@lighthouse.example")
        try await model.beginEmailApplication()
        model.attachFromDevice(fileName: "Big.pdf", data: Data(count: 19 * 1024 * 1024), contentType: "application/pdf")
        #expect(model.attachmentProblem == .tooLarge)
        await #expect(throws: ApplySendError.attachmentsTooLarge) { try await model.sendFromAccount() }
    }

    // MARK: CV Studio

    @Test("CV Studio: jobs not applied yet, tracked first; saving pins the version on that job")
    func cvStudioTailoring() throws {
        let model = CVTailoringModel(now: document.now)
        model.load(data)
        let jobs = model.jobs
        #expect(!jobs.isEmpty)
        #expect(jobs.allSatisfy { data.application(forJob: $0.id)?.appliedAt == nil })
        let firstUntracked = jobs.firstIndex { $0.status == nil } ?? jobs.count
        #expect(jobs.prefix(firstUntracked).allSatisfy { $0.status != nil })
        let review = try #require(model.reviewModel(cvId: "cv-en", revisionId: "rev-en-3", cvTitle: "Base CV", language: "en", jobId: Self.featured))
        let revision = try #require(document.cvRevisions.first { $0.id == "rev-en-3" })
        review.show(DesignApplyServices.tailorResponse(for: revision.content, language: .en), original: revision.content)
        review.decide("e2", .accepted)
        let saved = try #require(review.save())
        #expect(model.data.application(forJob: Self.featured)?.cvRevisionId == saved.id)
    }
}

@Suite("Settings › Application answers")
struct AnswersSettingsTests {
    let document: FixtureDocument

    init() throws {
        document = try FixtureStore.document(.populated)
    }

    func model() -> SettingsModel {
        let model = SettingsModel(now: document.now)
        model.load(UserData(document))
        return model
    }

    @Test("Drafts are checked like the rules: label, a text, country codes")
    func draftProblems() {
        var draft = AnswerDraft(kind: .noticePeriod)
        #expect(draft.problem == .label)
        draft.label = "Notice period"
        #expect(draft.problem == .text)
        draft.texts["en"] = "  One month  "
        #expect(draft.problem == nil && draft.values == [AnswerValue(language: "en", text: "One month")])
        draft.countries = "de, eu; Turkey"
        #expect(draft.problem == .countries)
        draft.countries = "de, eu,TR"
        #expect(draft.countryCodes == ["DE", "EU", "TR"] && draft.problem == nil)
    }

    @Test("Add, edit, reorder and delete with Undo")
    func lifecycle() throws {
        let model = model()
        let before = model.answers.count
        var draft = AnswerDraft(kind: .link)
        draft.label = "Portfolio"
        draft.texts = ["en": "https://deniz.example"]
        let added = try #require(model.saveAnswer(draft))
        #expect(model.answers.count == before + 1)
        #expect(model.answers(of: .link).last?.id == added.id)
        #expect(added.position == (model.answers(of: .link).dropLast().map(\.position).max() ?? -1) + 1)

        var edit = AnswerDraft(added)
        edit.texts["de"] = "https://deniz.example/de"
        edit.kind = .salaryExpectation
        edit.currency = "EUR"
        let edited = try #require(model.saveAnswer(edit))
        #expect(edited.values.map(\.language) == ["en", "de"] && edited.currency == "EUR" && edited.kind == .salaryExpectation)

        let links = model.answers(of: .salaryExpectation)
        model.moveAnswers(of: .salaryExpectation, from: IndexSet(integer: links.count - 1), to: 0)
        #expect(model.answers(of: .salaryExpectation).first?.id == added.id)
        #expect(model.answers(of: .salaryExpectation).map(\.position) == Array(0..<links.count))

        let toast = try #require(model.deleteAnswer(added.id))
        #expect(!model.answers.contains { $0.id == added.id })
        toast.action?.perform()
        #expect(model.answers.contains { $0.id == added.id })
    }

    @Test("bruteforcehr://settings/answers opens the page")
    func deepLink() {
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings/answers")!) == [.answers])
    }
}
