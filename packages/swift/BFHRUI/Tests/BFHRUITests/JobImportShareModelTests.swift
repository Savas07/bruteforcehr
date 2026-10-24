import BFHRCore
import Foundation
import Testing
@testable import BFHRUI

/// Records writes; answers imports from a script.
private final class FakeShareService: JobImportShareService, @unchecked Sendable {
    let isSignedIn: Bool
    var result: Result<JobImportUrlResponse, JobImportShareFailure>
    var saves: [JobImportSave] = []
    var saveError: Error?
    var hadApplication = false

    init(signedIn: Bool = true, result: Result<JobImportUrlResponse, JobImportShareFailure>) {
        isSignedIn = signedIn
        self.result = result
    }

    func importJob(url: String) async throws -> JobImportUrlResponse { try result.get() }

    func save(_ save: JobImportSave) async throws -> Bool {
        if let saveError { throw saveError }
        saves.append(save)
        return !hadApplication
    }
}

@MainActor
@Suite("Share sheet (JobImportShareModel)")
struct JobImportShareModelTests {
    private let now = Date(timeIntervalSince1970: 1_792_800_000)
    private let response = JobImportShareDesignState.response(existing: false, ai: false)

    private func model(_ service: FakeShareService) -> JobImportShareModel {
        JobImportShareModel(sharedText: "Look https://jobs.ashbyhq.com/ramp/x", service: service, now: { self.now }, makeID: { "new-job" })
    }

    @Test func readsTheSharedLinkIntoEditableFields() async {
        let model = model(FakeShareService(result: .success(response)))
        #expect(model.phase == .reading)
        await model.start()
        #expect(model.phase == .ready)
        #expect(model.title == "Security Engineer, Cloud")
        #expect(model.company == "Ramp")
        #expect(model.location == "New York City, NY, USA")
        #expect(model.sourceHost == "jobs.ashbyhq.com")
        #expect(!model.isExisting && !model.readByAI)
    }

    @Test func saveWritesTheEditedJobAndASavedApplication() async throws {
        let service = FakeShareService(result: .success(response))
        let model = model(service)
        await model.start()
        model.title = "Cloud Security Engineer"
        model.location = "Remote"
        await model.save(logApplication: false)
        #expect(model.phase == .saved(logged: false, addedApplication: true))
        let save = try #require(service.saves.first)
        let job = try #require(save.job)
        #expect(save.isNewJob && job.id == "new-job")
        #expect(job.title == "Cloud Security Engineer" && job.sources.first?.title == "Cloud Security Engineer")
        #expect(job.locations == [JobLocation(label: "Remote", city: nil, countryCode: nil)])
        #expect(job.fingerprint == response.job.fingerprint)
        #expect(save.application.status == .saved && save.application.jobId == "new-job")
        #expect(save.application.source == "url_import" && save.application.appliedAt == nil)
        #expect(save.event.applicationId == save.application.id && save.event.toStatus == .saved && save.event.actor == .user)
    }

    @Test func saveAndLogAddsAnAppliedApplicationDatedToday() async throws {
        let service = FakeShareService(result: .success(response))
        let model = model(service)
        await model.start()
        await model.save(logApplication: true)
        let save = try #require(service.saves.first)
        #expect(save.application.status == .applied && save.application.appliedAt == now)
        #expect(model.phase == .saved(logged: true, addedApplication: true))
    }

    @Test func anExistingJobKeepsItsValuesAndIsUpdated() async throws {
        let service = FakeShareService(result: .success(JobImportShareDesignState.response(existing: true, ai: false)))
        service.hadApplication = true
        let model = model(service)
        await model.start()
        #expect(model.isExisting)
        model.title = "Ignored edit"
        await model.save(logApplication: false)
        let save = try #require(service.saves.first)
        #expect(!save.isNewJob && save.job?.id == "job-ramp" && save.job?.title == "Security Engineer, Cloud")
        #expect(model.phase == .saved(logged: false, addedApplication: false))
    }

    @Test func failuresOfferHandEntryWhichKeepsTheLink() async throws {
        let service = FakeShareService(result: .failure(.reason(.blockedBySite)))
        let model = model(service)
        await model.start()
        #expect(model.phase == .failed(.reason(.blockedBySite)))
        #expect(!JobImportShareFailure.reason(.blockedBySite).isRetryable)
        #expect(JobImportShareFailure.offline.isRetryable)
        model.enterManually()
        #expect(model.phase == .manual && !model.canSave)
        model.company = "Acme"
        model.title = "Designer"
        await model.save(logApplication: false)
        let save = try #require(service.saves.first)
        #expect(save.job == nil && save.application.jobId == nil)
        #expect(save.application.notes == "Look https://jobs.ashbyhq.com/ramp/x")
    }

    @Test func aFailedWriteStaysOnTheFormWithANote() async {
        let service = FakeShareService(result: .success(response))
        service.saveError = URLError(.notConnectedToInternet)
        let model = model(service)
        await model.start()
        await model.save(logApplication: false)
        #expect(model.phase == .ready && model.saveFailed)
    }

    @Test func signedOutNeverCallsTheServer() async {
        let model = model(FakeShareService(signedIn: false, result: .success(response)))
        #expect(model.phase == .signedOut)
        await model.start()
        #expect(model.phase == .signedOut)
    }
}
