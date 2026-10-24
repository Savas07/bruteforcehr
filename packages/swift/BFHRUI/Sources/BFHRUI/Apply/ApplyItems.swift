import BFHRCore
import Foundation

// Value types and services of the Apply sheet (docs/design/research/apply.md "Decision — iOS",
// BRIEF §4.4): a review-first checklist (CV · cover letter · send via), then the company site
// in SFSafariViewController with "Did you apply?", or an email with the CV PDF and the cover
// letter attached.

/// How the application goes out (decisions.md D23 order: direct ATS → company site → apply
/// email → aggregator).
public enum ApplyChannel: Hashable, Sendable, Identifiable {
    /// The posting's own form (ATS or company site), or a job board's page.
    case site(url: URL, board: String?)
    /// An email to `address`; `fromPosting` = the job lists it, else the user typed it.
    case email(address: String, fromPosting: Bool)

    public var id: String {
        switch self {
        case .site(let url, _): "site:\(url.absoluteString)"
        case .email(let address, _): "email:\(address.lowercased())"
        }
    }

    public var isEmail: Bool { if case .email = self { true } else { false } }

    var trackerChannel: Channel { isEmail ? .email : .externalLink }
}

/// A CV the user can send: a CV's current version, or a version saved for this job ("Tailor for
/// this job", or what an earlier visit pinned).
public struct ApplyCVOption: Identifiable, Hashable, Sendable {
    /// The CV's id for its current version; `version:<revisionId>` for a version saved for this job.
    public let id: String
    public var cvId: String
    public var title: String
    public var language: String
    /// The match score when the job's match is based on this CV.
    public var score: Int?
    public var isDefault: Bool
    public var revisionId: String
    /// Not the CV's current version: one saved for this job (tailored, or pinned earlier).
    public var savedForJob: SavedVersionKind?

    public enum SavedVersionKind: Hashable, Sendable {
        /// "Tailor for this job" (`source: ai_tailor`).
        case tailored
        /// A version an earlier visit pinned (the CV has changed since).
        case pinned
    }

    public init(
        id: String, cvId: String, title: String, language: String, score: Int?, isDefault: Bool,
        revisionId: String, savedForJob: SavedVersionKind? = nil
    ) {
        self.id = id
        self.cvId = cvId
        self.title = title
        self.language = language
        self.score = score
        self.isDefault = isDefault
        self.revisionId = revisionId
        self.savedForJob = savedForJob
    }

    static func versionID(_ revisionId: String) -> String { "version:\(revisionId)" }
}

/// The cover letter row.
public enum CoverLetterChoice: Hashable, Sendable {
    case none
    case existing(String)
    /// The letter written (or drafted with AI) in the cover letter editor, saved to
    /// `coverLetters` when the application goes out.
    case written
}

/// The sheet's pages.
public enum ApplyStep: Hashable, Sendable {
    case checklist
    /// "Tailor for this job": Light / Thorough, the suggested edits, the preview, Save.
    case tailor
    /// The cover letter editor: template, tone, language, Draft with AI, fields to fill.
    case letter
    /// The company site was opened: the kit (files, cover letter, answers) and, back from
    /// Safari, "Did you apply?".
    case kit
    /// Review email (with a send-capable account) before Send.
    case email
}

/// A file made on the device for this application, or an extra attachment (one of the user's
/// saved files, or one picked in Files).
public struct ApplyFile: Hashable, Sendable, Identifiable {
    public enum Kind: Hashable, Sendable {
        case cv(cvId: String, revisionId: String)
        case coverLetter(coverLetterId: String)
        /// A file already stored (`renderedFiles/{id}`): sent by reference, no upload.
        case saved(renderedFileId: String)
        /// A file from Files: uploaded to `users/{uid}/mail-attachments/{id}` before sending.
        case device(contentType: String)
    }

    public let id: String
    public var kind: Kind
    public var fileName: String
    public var data: Data

    public init(id: String, kind: Kind, fileName: String, data: Data) {
        self.id = id
        self.kind = kind
        self.fileName = fileName
        self.data = data
    }

    /// The size of a saved file whose bytes aren't on the device yet is known from its record.
    public var knownSize: Int?

    public init(id: String, kind: Kind, fileName: String, data: Data, knownSize: Int?) {
        self.init(id: id, kind: kind, fileName: fileName, data: data)
        self.knownSize = knownSize
    }

    public var sizeBytes: Int { data.isEmpty ? knownSize ?? 0 : data.count }

    /// The MIME type Mail's compose sheet attaches it with.
    public var mimeType: String {
        switch kind {
        case .cv, .coverLetter: "application/pdf"
        case .device(let contentType): contentType
        case .saved:
            fileName.lowercased().hasSuffix(".docx")
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf"
        }
    }

    /// Made for this application (the CV or the cover letter PDF), not an extra attachment.
    public var isMadeHere: Bool {
        switch kind {
        case .cv, .coverLetter: true
        case .saved, .device: false
        }
    }
}

/// Where preparing the attachments stands.
public enum ApplyFilesState: Hashable, Sendable {
    case idle
    case preparing
    case ready([ApplyFile])
    case failed(String)

    public var files: [ApplyFile] { if case .ready(let files) = self { files } else { [] } }
}

/// The email the user reviews (with a send-capable account) or that Mail opens prefilled.
public struct ApplyEmailDraft: Hashable, Sendable {
    public var accountId: String?
    public var to: String
    public var subject: String
    public var body: String

    public init(accountId: String? = nil, to: String = "", subject: String = "", body: String = "") {
        self.accountId = accountId
        self.to = to
        self.subject = subject
        self.body = body
    }

    /// One plausible address.
    public var hasValidRecipient: Bool {
        let parts = to.trimmingCharacters(in: .whitespaces).split(separator: "@")
        return parts.count == 2 && parts[1].contains(".") && !parts[0].isEmpty
    }
}

/// `mailSend` (MailBackend): sends from a connected account after a 10-second undo window and
/// moves the application to Applied with its pins when it went out.
public struct ApplyMailRequest: Hashable, Sendable {
    public var accountId: String
    public var applicationId: String?
    public var jobId: String?
    public var to: String
    public var subject: String
    public var bodyText: String
    public var renderedFileIds: [String]
    /// Files from the device, uploaded to `mail-attachments` (`kind: "upload"`).
    public var uploads: [ApplyUpload] = []
    public var pins: ApplicationPins
}

/// A file uploaded to `users/{uid}/mail-attachments/{id}` for one email.
public struct ApplyUpload: Hashable, Sendable {
    public var storagePath: String
    public var fileName: String
    public var contentType: String
}

/// Why an AI request (tailoring, a cover letter draft) gave no result (`AI_ERROR_REASONS`).
public enum ApplyAIError: Error, Hashable, Sendable {
    /// `ai_disabled` (and `profile.aiEnabled == false` before asking).
    case aiDisabled
    /// `daily_cap`: the per-user daily AI limit; it resets at 00:00 UTC.
    case dailyLimit
    case offline
    /// `email_unverified`.
    case emailUnverified
    /// `cv_not_found`, `job_not_found`, `template_not_found`.
    case notFound
    /// `ai_unavailable`, `ai_invalid_output`, anything else.
    case failed(String)
}

public enum ApplySendError: Error, Hashable, Sendable {
    case offline
    /// `daily_send_cap`.
    case dailyCap
    /// `needs_reauth`, `cannot_send`, `account_not_found`.
    case accountUnavailable
    /// `attachments_too_large`.
    case attachmentsTooLarge
    /// `already_sent` (Undo came too late).
    case alreadySent
    case failed(String)
}

/// The data-layer side of Apply (the app's Firestore / Storage / Functions client; nil in tests
/// and design mode).
public protocol ApplyServices: AnyObject {
    /// The CV revision's content (revisions are a subcollection the feed doesn't listen to).
    func revision(cvId: String, revisionId: String) async throws -> CvRevision
    /// Uploads the bytes to `users/{uid}/rendered/{file.id}`; returns the storage path.
    func upload(_ file: ApplyFile) async throws -> String
    /// `mailSend`: returns when the server will send (the 10-second undo window ends).
    func sendEmail(_ request: ApplyMailRequest) async throws(ApplySendError) -> (applicationId: String, sendAt: Date)
    /// `mailSendCancel`.
    func cancelEmail(applicationId: String) async throws(ApplySendError)
    /// `cvTailor`: proposed edits against `request.revisionId`.
    func tailor(_ request: CvTailorRequest) async throws(ApplyAIError) -> CvTailorResponse
    /// `coverLetterDraft`.
    func draftCoverLetter(_ request: CoverLetterDraftRequest) async throws(ApplyAIError) -> CoverLetterDraftResponse
    /// Uploads a file picked in Files to `users/{uid}/mail-attachments/{fileId}`; returns the path.
    func uploadAttachment(_ file: ApplyFile, contentType: String) async throws -> String
    /// The bytes of a stored file (an extra attachment opened in Mail's compose sheet).
    func download(_ file: RenderedFile) async throws -> Data
}

/// Makes the PDFs on the device (cv-render in JavaScriptCore + WebKit's print path).
public protocol ApplyRenderer: AnyObject {
    /// The CV page as cv-render HTML (the tailoring preview).
    func cvHTML(_ content: CvContent, language: String) throws -> CVRenderedHTML
    func cvPDF(_ revision: CvRevision, language: String) async throws -> (fileName: String, data: Data)
    func letterPDF(title: String, body: String, language: String) async throws -> Data
}
