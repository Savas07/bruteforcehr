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

/// A CV the user can send.
public struct ApplyCVOption: Identifiable, Hashable, Sendable {
    public let id: String
    public var title: String
    public var language: String
    /// The match score when the job's match is based on this CV.
    public var score: Int?
    public var isDefault: Bool
    public var revisionId: String
}

/// The cover letter row.
public enum CoverLetterChoice: Hashable, Sendable {
    case none
    case existing(String)
    /// The letter typed in the sheet (saved to `coverLetters` when the application goes out).
    case written
}

/// The sheet's pages.
public enum ApplyStep: Hashable, Sendable {
    case checklist
    /// The company site was opened: the kit with "Did you apply?" on top.
    case kit
    /// Review email (with a send-capable account) before Send.
    case email
}

/// A file made on the device for this application.
public struct ApplyFile: Hashable, Sendable, Identifiable {
    public enum Kind: Hashable, Sendable {
        case cv(cvId: String, revisionId: String)
        case coverLetter(coverLetterId: String)
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

    public var sizeBytes: Int { data.count }
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
    public var pins: ApplicationPins
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
}

/// Makes the PDFs on the device (cv-render in JavaScriptCore + WebKit's print path).
public protocol ApplyRenderer: AnyObject {
    func cvPDF(_ revision: CvRevision, language: String) async throws -> (fileName: String, data: Data)
    func letterPDF(title: String, body: String, language: String) async throws -> Data
}
