import BFHRCore
import Foundation

// Job actions shared by Today, the Jobs feed, Job detail and Apply (M4). "Save" is one concept
// (decisions.md D02): it writes, in one batch, an application in `saved` with the job's id, its
// `created` event and `jobMatches/{jobId}.state = saved`. Applying moves that application through
// the state machine and pins what was used (docs/adr/0002-data-model.md, BRIEF §4.4).

/// The CV, cover letter and files an application uses: the current choice until it's applied
/// (decisions.md D45), write-once from `appliedAt` on.
public struct ApplicationPins: Hashable, Sendable {
    public var cvId: String?
    public var cvRevisionId: String?
    public var cvFileId: String?
    public var coverLetterId: String?
    public var coverLetterFileId: String?

    public init(
        cvId: String? = nil,
        cvRevisionId: String? = nil,
        cvFileId: String? = nil,
        coverLetterId: String? = nil,
        coverLetterFileId: String? = nil
    ) {
        self.cvId = cvId
        self.cvRevisionId = cvRevisionId
        self.cvFileId = cvFileId
        self.coverLetterId = coverLetterId
        self.coverLetterFileId = coverLetterFileId
    }
}

extension UserData {
    /// The job's place in the Tracker, if it has an application.
    public func trackedStatus(ofJob jobId: String) -> ApplicationStatus? {
        application(forJob: jobId)?.status
    }

    /// Saved: the application sits in Saved, or (before D02) the match alone says so.
    public func isJobSaved(_ jobId: String) -> Bool {
        if let application = application(forJob: jobId) { return application.status == .saved }
        return match(forJob: jobId)?.state == .saved
    }

    /// Unsaving deletes the application only while it is still `saved` and holds nothing but its
    /// `created` event (D02); after that the job is in the Tracker and there's nothing to unsave.
    public func canUnsaveJob(_ jobId: String) -> Bool {
        guard let application = application(forJob: jobId) else { return match(forJob: jobId)?.state == .saved }
        return application.status == .saved && events(forApplication: application.id).allSatisfy { $0.type == .created }
    }

    /// The bookmark is offered while the job isn't tracked yet, or can still be unsaved.
    public func canToggleJobSave(_ jobId: String) -> Bool {
        guard job(id: jobId) != nil else { return false }
        return application(forJob: jobId) == nil || canUnsaveJob(jobId)
    }

    /// Saves a job: a Saved application with the job's company, role, location and source, its
    /// `created` event, and the match's state. Returns the application; nil when the job is
    /// unknown. A job that is already tracked keeps its application.
    @discardableResult
    public mutating func saveJob(_ jobId: String, at date: Date) -> Application? {
        guard let job = job(id: jobId) else { return nil }
        if match(forJob: jobId).map({ $0.state != .saved }) ?? false {
            setMatchState(jobId, to: .saved, at: date)
        }
        if let existing = application(forJob: jobId) { return existing }
        return addApplication(for: job, status: .saved, channel: nil, at: date)
    }

    /// Unsaves a job (D02): deletes its Saved application while that is all it has and puts the
    /// match back to new. Returns false when the job has moved on in the Tracker.
    @discardableResult
    public mutating func unsaveJob(_ jobId: String, at date: Date) -> Bool {
        guard canUnsaveJob(jobId) else { return false }
        if let application = application(forJob: jobId) {
            try? deleteApplication(application.id, now: date)
        }
        if match(forJob: jobId)?.state == .saved { setMatchState(jobId, to: .new, at: date) }
        return true
    }

    /// Opening Apply on a job: its application moves to Preparing (created there when the job
    /// wasn't saved). An application already past Preparing is left alone. Returns its id.
    @discardableResult
    public mutating func startApplying(toJob jobId: String, channel: Channel?, at date: Date) throws -> String? {
        guard let job = job(id: jobId) else { return nil }
        if let application = application(forJob: jobId) {
            if application.status == .saved {
                try moveApplication(application.id, to: .preparing, at: date)
            }
            if let channel, let index = applications.firstIndex(where: { $0.id == application.id }),
               applications[index].appliedAt == nil, applications[index].channel != channel {
                applications[index].channel = channel
                applications[index].updatedAt = date
            }
            return application.id
        }
        if match(forJob: jobId).map({ $0.state == .new }) ?? false {
            setMatchState(jobId, to: .saved, at: date)
        }
        return addApplication(for: job, status: .preparing, channel: channel, at: date).id
    }

    /// "Yes, I applied" / an email sent from the device: Applied (through the state machine), the
    /// channel, and the pins of what was used. Returns the status event to undo; nil when the
    /// application already was Applied or later (only the missing pins are filled then).
    @discardableResult
    public mutating func markApplied(
        _ applicationId: String, channel: Channel, pins: ApplicationPins, at date: Date
    ) throws -> ApplicationEvent? {
        guard let index = applications.firstIndex(where: { $0.id == applicationId }) else {
            throw UserDataError.missingApplication(applicationId)
        }
        // Before applying a pin is the current choice and is replaced by what was used (D45).
        let replacesPins = applications[index].appliedAt == nil
        var event: ApplicationEvent?
        if let rank = statusRank(applications[index].status), let applied = statusRank(.applied), rank < applied {
            event = try moveApplication(applicationId, to: .applied, at: date)
        }
        applications[index].channel = channel
        setPins(pins, onApplication: index, replacing: replacesPins)
        applications[index].updatedAt = date
        return event
    }

    /// "Save as new version" in the tailoring review: the tailored revision (create-only; the CV
    /// itself keeps its current version) and its pin on the job's application, in one batch. A job
    /// without an application is saved first (D02). Once applied the pins are kept, so only the
    /// revision is written. Returns the application's id; nil when the job is unknown.
    @discardableResult
    public mutating func saveTailoredRevision(_ revision: CvRevision, forJob jobId: String, at date: Date) -> String? {
        guard let application = saveJob(jobId, at: date),
              let index = applications.firstIndex(where: { $0.id == application.id }) else { return nil }
        if !cvRevisions.contains(where: { $0.id == revision.id }) { cvRevisions.append(revision) }
        if applications[index].appliedAt == nil {
            setPins(ApplicationPins(cvId: revision.cvId, cvRevisionId: revision.id), onApplication: index, replacing: true)
            applications[index].updatedAt = date
        }
        return application.id
    }

    /// Adds the stored files to an application's pins (replacing them before it's applied, D45;
    /// write-once after).
    public mutating func pinFiles(_ applicationId: String, cvFileId: String?, coverLetterFileId: String?, at date: Date) {
        guard let index = applications.firstIndex(where: { $0.id == applicationId }) else { return }
        setPins(
            ApplicationPins(cvFileId: cvFileId, coverLetterFileId: coverLetterFileId),
            onApplication: index,
            replacing: applications[index].appliedAt == nil
        )
        applications[index].updatedAt = date
    }

    /// "I'm not applying": back to Saved (a backward move only the user makes).
    @discardableResult
    public mutating func stopApplying(_ applicationId: String, at date: Date) throws -> ApplicationEvent? {
        guard let application = application(id: applicationId), application.status == .preparing else { return nil }
        return try moveApplication(applicationId, to: .saved, at: date)
    }

    /// Sets the given (non-nil) pins: all of them while `replacing` (before `appliedAt`, D45),
    /// otherwise only the empty ones (the rules keep set pins write-once once applied).
    private mutating func setPins(_ pins: ApplicationPins, onApplication index: Int, replacing: Bool) {
        func set(_ field: WritableKeyPath<Application, String?>, _ value: String?) {
            guard let value, replacing || applications[index][keyPath: field] == nil else { return }
            applications[index][keyPath: field] = value
        }
        // A replaced CV or letter takes its file pin with it: the old PDF isn't what goes out.
        if replacing, let revision = pins.cvRevisionId, revision != applications[index].cvRevisionId {
            applications[index].cvFileId = nil
        }
        if replacing, let letter = pins.coverLetterId, letter != applications[index].coverLetterId {
            applications[index].coverLetterFileId = nil
        }
        set(\.cvId, pins.cvId)
        set(\.cvRevisionId, pins.cvRevisionId)
        set(\.cvFileId, pins.cvFileId)
        set(\.coverLetterId, pins.coverLetterId)
        set(\.coverLetterFileId, pins.coverLetterFileId)
    }

    private mutating func addApplication(for job: Job, status: ApplicationStatus, channel: Channel?, at date: Date) -> Application {
        let application = Application(
            id: Self.makeID(),
            jobId: job.id,
            company: job.company,
            companyDomain: job.companyDomain,
            role: job.title,
            location: job.locations.first?.label ?? job.remoteEligibility,
            status: status,
            statusChangedAt: date,
            channel: channel,
            source: job.sources.first?.source,
            appliedAt: nil,
            cvId: nil,
            cvRevisionId: nil,
            cvFileId: nil,
            coverLetterId: nil,
            coverLetterFileId: nil,
            fromAccountId: nil,
            threadRefs: [],
            nextAction: nil,
            nextActionAt: nil,
            priority: .normal,
            notes: "",
            followUpSnoozedUntil: nil,
            followUpDismissedAt: nil,
            ghostedSnoozedUntil: nil,
            ghostedDismissedAt: nil,
            emailSend: nil,
            createdAt: date,
            updatedAt: date
        )
        applications.append(application)
        applicationEvents.append(ApplicationEvent(
            id: Self.makeID(),
            applicationId: application.id,
            type: .created,
            fromStatus: nil,
            toStatus: status,
            actor: .user,
            confidence: nil,
            evidence: nil,
            text: nil,
            revertsEventId: nil,
            occurredAt: date,
            createdAt: date
        ))
        return application
    }
}
