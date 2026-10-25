import BFHRCore
import Foundation

/// Everything the signed-in user owns (`users/{uid}/**` in the Firestore layout) as one value.
/// View models are built from it. M0 fills it from fixtures in design builds; later milestones
/// fill it from Firestore snapshot listeners.
public struct UserData: Hashable, Sendable {
    public var profile: Profile?
    public var cvs: [Cv]
    public var cvRevisions: [CvRevision]
    public var renderedFiles: [RenderedFile]
    public var coverLetters: [CoverLetter]
    /// The answers library of the application kit (`users/{uid}/answers`).
    public var answers: [Answer]
    public var jobs: [Job]
    public var jobMatches: [JobMatch]
    public var savedSearches: [SavedSearch]
    public var applications: [Application]
    public var applicationEvents: [ApplicationEvent]
    public var interviews: [Interview]
    public var contacts: [Contact]
    public var mailAccounts: [MailAccount]
    public var mailMessages: [MailMessage]
    /// "Companies you follow" (`users/{uid}/watchlist`).
    public var watchlist: [WatchedCompany]
    /// Project-wide job source health (`jobSources`, client read-only).
    public var jobSources: [JobSourceStatus]

    public init(
        profile: Profile? = nil,
        cvs: [Cv] = [],
        cvRevisions: [CvRevision] = [],
        renderedFiles: [RenderedFile] = [],
        coverLetters: [CoverLetter] = [],
        answers: [Answer] = [],
        jobs: [Job] = [],
        jobMatches: [JobMatch] = [],
        savedSearches: [SavedSearch] = [],
        applications: [Application] = [],
        applicationEvents: [ApplicationEvent] = [],
        interviews: [Interview] = [],
        contacts: [Contact] = [],
        mailAccounts: [MailAccount] = [],
        mailMessages: [MailMessage] = [],
        watchlist: [WatchedCompany] = [],
        jobSources: [JobSourceStatus] = []
    ) {
        self.profile = profile
        self.cvs = cvs
        self.cvRevisions = cvRevisions
        self.renderedFiles = renderedFiles
        self.coverLetters = coverLetters
        self.answers = answers
        self.jobs = jobs
        self.jobMatches = jobMatches
        self.savedSearches = savedSearches
        self.applications = applications
        self.applicationEvents = applicationEvents
        self.interviews = interviews
        self.contacts = contacts
        self.mailAccounts = mailAccounts
        self.mailMessages = mailMessages
        self.watchlist = watchlist
        self.jobSources = jobSources
    }

    public static let empty = UserData()
}

// MARK: - Lookups

extension UserData {
    public func application(id: String) -> Application? { applications.first { $0.id == id } }
    public func job(id: String) -> Job? { jobs.first { $0.id == id } }
    /// `jobMatches/{jobId}` shares its id with the job.
    public func match(forJob jobId: String) -> JobMatch? { jobMatches.first { $0.id == jobId } }
    public func cv(id: String) -> Cv? { cvs.first { $0.id == id } }
    public func revision(id: String) -> CvRevision? { cvRevisions.first { $0.id == id } }
    public func mailAccount(id: String) -> MailAccount? { mailAccounts.first { $0.id == id } }
    public func mailMessage(id: String) -> MailMessage? { mailMessages.first { $0.id == id } }

    /// The application created from a job, if any.
    public func application(forJob jobId: String) -> Application? { applications.first { $0.jobId == jobId } }

    /// The application's events, oldest first.
    public func events(forApplication applicationId: String) -> [ApplicationEvent] {
        applicationEvents
            .filter { $0.applicationId == applicationId }
            .sorted { ($0.occurredAt, $0.createdAt) < ($1.occurredAt, $1.createdAt) }
    }

    /// The application's interviews, earliest first.
    public func interviews(forApplication applicationId: String) -> [Interview] {
        interviews.filter { $0.applicationId == applicationId }.sorted { $0.startsAt < $1.startsAt }
    }

    public func contacts(forApplication applicationId: String) -> [Contact] {
        contacts.filter { $0.applicationIds.contains(applicationId) }
    }

    /// The application's emails, newest first.
    public func mailMessages(forApplication applicationId: String) -> [MailMessage] {
        mailMessages.filter { $0.applicationId == applicationId }.sorted { $0.receivedAt > $1.receivedAt }
    }
}
