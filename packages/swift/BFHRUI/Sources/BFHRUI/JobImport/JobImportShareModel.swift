import BFHRCore
import Foundation
import Observation

/// Why the import stopped (the callable's `details.reason`, or no connection).
public enum JobImportShareFailure: Error, Equatable, Sendable {
    case reason(JobImportErrorReason)
    case offline
    case unexpected
}

/// Everything one confirmed share writes, in one batch (docs/design/decisions.md D02).
public struct JobImportSave: Sendable {
    /// The job to create (`isNewJob`) or to update with the merged listing; nil when added by hand.
    public var job: Job?
    public var isNewJob: Bool
    /// The application (Saved, or Applied for "log as applied") and its `created` event.
    public var application: Application
    public var event: ApplicationEvent
}

/// The Firebase side of the share sheet; the extension implements it, tests and design mode fake it.
public protocol JobImportShareService: Sendable {
    var isSignedIn: Bool { get }
    /// `jobImportUrl` (throws `JobImportShareFailure`).
    func importJob(url: String) async throws -> JobImportUrlResponse
    /// Writes `save`; returns false when the job already had an application, so none was added.
    func save(_ save: JobImportSave) async throws -> Bool
}

/// The Share Extension's compact confirm sheet: read the shared link, let the user check role,
/// company and location, then Save (Jobs › Saved + Tracker Saved) or Save and log as applied.
@MainActor
@Observable
public final class JobImportShareModel {
    public enum Phase: Equatable {
        case reading
        case ready
        case saving(logs: Bool)
        case saved(logged: Bool, addedApplication: Bool)
        case failed(JobImportShareFailure)
        case signedOut
        /// Hand entry after a failure: company, role, location; the link goes into the notes.
        case manual
    }

    public private(set) var phase: Phase
    public private(set) var response: JobImportUrlResponse?
    public private(set) var saveFailed = false
    public var title = ""
    public var company = ""
    public var location = ""
    public let sharedText: String
    private let service: any JobImportShareService
    private let now: () -> Date
    private let makeID: () -> String

    public init(
        sharedText: String,
        service: any JobImportShareService,
        now: @escaping () -> Date = Date.init,
        makeID: @escaping () -> String = { UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() }
    ) {
        self.sharedText = sharedText
        self.service = service
        self.now = now
        self.makeID = makeID
        phase = service.isSignedIn ? .reading : .signedOut
    }

    /// Design and tests: a sheet already in `phase` with `response` loaded.
    public init(preview phase: Phase, response: JobImportUrlResponse?, sharedText: String, service: any JobImportShareService) {
        self.sharedText = sharedText
        self.service = service
        now = Date.init
        makeID = { "preview" }
        self.phase = phase
        if let response { apply(response) }
        if phase == .manual { company = ""; title = ""; location = "" }
    }

    /// Reads the shared link (call once when the sheet appears, and from Try again).
    public func start() async {
        guard service.isSignedIn else { phase = .signedOut; return }
        phase = .reading
        do {
            apply(try await service.importJob(url: sharedText))
            phase = .ready
        } catch let failure as JobImportShareFailure {
            phase = .failed(failure)
        } catch {
            phase = .failed(.unexpected)
        }
    }

    private func apply(_ response: JobImportUrlResponse) {
        self.response = response
        title = response.job.title
        company = response.job.company
        location = response.job.locations.map(\.label).joined(separator: " · ")
    }

    /// The posting already exists in the user's jobs: the fields are the saved job's and read-only.
    public var isExisting: Bool { response?.existingJobId != nil }
    public var readByAI: Bool { response?.method == .ai }

    /// Host of the page the job was read from ("linkedin.com").
    public var sourceHost: String {
        let url = response?.finalUrl ?? sharedText
        let host = URL(string: url)?.host() ?? url
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    public var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !company.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public func enterManually() {
        title = ""
        company = ""
        location = ""
        saveFailed = false
        phase = .manual
    }

    /// Writes the job (unless added by hand) and an application: Saved, or Applied today.
    public func save(logApplication: Bool) async {
        guard canSave else { return }
        let manual = phase == .manual
        let at = now()
        var job: Job?
        if !manual, let response {
            do { job = try edited(response.job(newID: makeID()), at: at) } catch { phase = .failed(.unexpected); return }
        }
        var data = UserData()
        let trimmedLocation = location.trimmingCharacters(in: .whitespacesAndNewlines)
        var application = data.addApplication(
            ApplicationDraft(
                company: company,
                role: title,
                location: trimmedLocation,
                status: logApplication ? .applied : .saved,
                date: at,
                notes: manual ? sharedText : ""
            ),
            now: at
        )
        application.jobId = job?.id
        if let job { application.source = job.sources.first?.source ?? application.source }
        guard let event = data.applicationEvents.last else { return }
        phase = .saving(logs: logApplication)
        saveFailed = false
        do {
            let added = try await service.save(JobImportSave(job: job, isNewJob: !isExisting, application: application, event: event))
            phase = .saved(logged: logApplication, addedApplication: added)
        } catch {
            saveFailed = true
            phase = manual ? .manual : .ready
        }
    }

    /// The user's edits on a new job (an existing job keeps its saved values). The fingerprint stays
    /// the extracted one, so a later import of the same posting still finds it.
    private func edited(_ job: Job, at: Date) -> Job {
        guard !isExisting else { return job }
        var job = job
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let company = company.trimmingCharacters(in: .whitespacesAndNewlines)
        let location = location.trimmingCharacters(in: .whitespacesAndNewlines)
        job.title = title
        job.company = company
        if location != job.locations.map(\.label).joined(separator: " · ") {
            job.locations = location.isEmpty ? [] : [JobLocation(label: location, city: nil, countryCode: nil)]
            if !job.sources.isEmpty { job.sources[0].locationText = location.isEmpty ? nil : location }
        }
        if !job.sources.isEmpty { job.sources[0].title = title }
        job.updatedAt = at
        return job
    }
}
