import BFHRCore
import BFHRUI
import FirebaseFirestore
import FirebaseFunctions
import FirebaseStorage
import Foundation

/// `jobsSearch` and `savedSearchRunNow` (@bfhr/core src/jobs/contracts.ts): they write the jobs
/// and matches they find under `users/{uid}`; the feed sees them through its listeners.
final class CloudJobSearch: JobSearchService {
    func search(query: String, filters: SavedSearchFilters) async throws(JobSearchError) -> JobsSearchResponse {
        try await call("jobsSearch", JobsSearchRequest(query: query, filters: filters, limit: nil))
    }

    func runSavedSearch(id: String) async throws(JobSearchError) -> JobsSearchResponse {
        try await call("savedSearchRunNow", SavedSearchRunNowRequest(savedSearchId: id))
    }

    private func call(_ name: String, _ request: some Encodable & Sendable) async throws(JobSearchError) -> JobsSearchResponse {
        do {
            let callable = CVCallables.functions.httpsCallable(name)
            // Every source is asked in turn; a broad search can take most of a minute.
            callable.timeoutInterval = 120
            let payload: [String: Any] = try CallableJSON.object(request)
            let result = try await callable.call(payload)
            return try CallableJSON.decode(JobsSearchResponse.self, result.data)
        } catch {
            throw Self.searchError(error)
        }
    }

    static func searchError(_ error: any Error) -> JobSearchError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        if nsError.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: nsError.code) {
            let reason = (nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any])?["reason"] as? String
            switch (code, reason) {
            case (.unavailable, _), (.deadlineExceeded, _): return .offline
            case (_, "search_rate_limited"), (.resourceExhausted, _): return .rateLimited
            case (_, "no_sources"): return .noSources
            case (_, "saved_search_not_found"), (.notFound, _): return .savedSearchNotFound
            default: return .failed("\(code.rawValue) \(reason ?? nsError.localizedDescription)")
            }
        }
        return .failed("\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
    }
}

/// Apply's data layer: CV revisions from Firestore, PDFs to Cloud Storage
/// (`users/{uid}/rendered/{fileId}`, storage.rules), and `mailSend` / `mailSendCancel`
/// (@bfhr/core src/mail/send.ts) for sending from a connected account.
final class CloudApplyServices: ApplyServices {
    private let uid: String

    init(uid: String) {
        self.uid = uid
    }

    func revision(cvId: String, revisionId: String) async throws -> CvRevision {
        let snapshot = try await Firestore.firestore()
            .collection("users").document(uid).collection("cvs").document(cvId)
            .collection("revisions").document(revisionId)
            .getDocument()
        guard let data = snapshot.data() else { throw CocoaError(.fileReadNoSuchFile) }
        return try FirestoreCVStore.decode(CvRevision.self, data, ids: ["id": revisionId, "cvId": cvId])
    }

    func upload(_ file: ApplyFile) async throws -> String {
        let path = "users/\(uid)/rendered/\(file.id)"
        let metadata = StorageMetadata()
        metadata.contentType = "application/pdf"
        _ = try await Storage.storage().reference(withPath: path).putDataAsync(file.data, metadata: metadata)
        return path
    }

    func sendEmail(_ request: ApplyMailRequest) async throws(ApplySendError) -> (applicationId: String, sendAt: Date) {
        func id(_ value: String?) -> Any { value ?? NSNull() }
        let payload: [String: Any] = [
            "accountId": request.accountId,
            "applicationId": id(request.applicationId),
            "jobId": id(request.jobId),
            "to": [["name": NSNull(), "address": request.to]],
            "cc": [],
            "subject": request.subject,
            "bodyText": request.bodyText,
            "attachments": request.renderedFileIds.map { ["kind": "rendered", "renderedFileId": $0] as [String: Any] }
                + request.uploads.map { ["kind": "upload", "storagePath": $0.storagePath, "fileName": $0.fileName, "contentType": $0.contentType] },
            "pins": [
                "cvId": id(request.pins.cvId),
                "cvRevisionId": id(request.pins.cvRevisionId),
                "cvFileId": id(request.pins.cvFileId),
                "coverLetterId": id(request.pins.coverLetterId),
                "coverLetterFileId": id(request.pins.coverLetterFileId),
            ],
            "replyToMailMessageId": NSNull(),
        ]
        do {
            let result = try await CVCallables.functions.httpsCallable("mailSend").call(payload)
            guard let data = result.data as? [String: Any], let applicationId = data["applicationId"] as? String,
                  let sendAt = (data["sendAt"] as? String).flatMap(CallableJSON.date) else {
                throw ApplySendError.failed("mailSend returned no sendAt")
            }
            return (applicationId, sendAt)
        } catch let error as ApplySendError {
            throw error
        } catch {
            throw Self.sendError(error)
        }
    }

    func cancelEmail(applicationId: String) async throws(ApplySendError) {
        do {
            _ = try await CVCallables.functions.httpsCallable("mailSendCancel").call(["applicationId": applicationId])
        } catch {
            throw Self.sendError(error)
        }
    }

    // MARK: AI (docs/adr/0010-ai.md "Applying")

    func tailor(_ request: CvTailorRequest) async throws(ApplyAIError) -> CvTailorResponse {
        try await aiCall("cvTailor", request, as: CvTailorResponse.self)
    }

    func draftCoverLetter(_ request: CoverLetterDraftRequest) async throws(ApplyAIError) -> CoverLetterDraftResponse {
        try await aiCall("coverLetterDraft", request, as: CoverLetterDraftResponse.self)
    }

    private func aiCall<Response: Decodable>(_ name: String, _ request: some Encodable, as type: Response.Type) async throws(ApplyAIError) -> Response {
        do {
            let callable = CVCallables.functions.httpsCallable(name)
            // Claude reads the whole CV and posting; allow more than the 70 s default.
            callable.timeoutInterval = 120
            let result = try await callable.call(try CallableJSON.object(request))
            return try CallableJSON.decode(type, result.data)
        } catch {
            throw Self.aiError(error)
        }
    }

    /// The AI callables' errors (`AI_ERROR_REASONS`) in the review's terms.
    static func aiError(_ error: any Error) -> ApplyAIError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        guard nsError.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: nsError.code) else {
            return .failed("\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
        }
        let reason = (nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any])?["reason"] as? String
        switch (code, reason) {
        case (_, "ai_disabled"): return .aiDisabled
        case (_, "daily_cap"), (.resourceExhausted, _): return .dailyLimit
        case (_, "email_unverified"): return .emailUnverified
        case (_, "cv_not_found"), (_, "job_not_found"), (_, "template_not_found"), (.notFound, _): return .notFound
        case (.unavailable, nil), (.deadlineExceeded, _): return .offline
        default: return .failed("\(code.rawValue) \(reason ?? nsError.localizedDescription)")
        }
    }

    // MARK: Attachments

    func uploadAttachment(_ file: ApplyFile, contentType: String) async throws -> String {
        let path = "users/\(uid)/mail-attachments/\(file.id)"
        let metadata = StorageMetadata()
        metadata.contentType = contentType
        _ = try await Storage.storage().reference(withPath: path).putDataAsync(file.data, metadata: metadata)
        return path
    }

    func download(_ file: RenderedFile) async throws -> Data {
        // MailSendLimits caps an email at 18 MB; a stored file is never larger.
        try await Storage.storage().reference(withPath: file.storagePath).data(maxSize: 20 * 1024 * 1024)
    }

    static func sendError(_ error: any Error) -> ApplySendError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        if nsError.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: nsError.code) {
            let reason = (nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any])?["reason"] as? String
            switch (code, reason) {
            case (.unavailable, _), (.deadlineExceeded, _): return .offline
            case (_, "daily_send_cap"): return .dailyCap
            case (_, "needs_reauth"), (_, "cannot_send"), (_, "account_not_found"): return .accountUnavailable
            case (_, "attachments_too_large"): return .attachmentsTooLarge
            case (_, "already_sent"): return .alreadySent
            default: return .failed("\(code.rawValue) \(reason ?? nsError.localizedDescription)")
            }
        }
        return .failed("\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
    }
}

/// Codable ↔ the plain JSON values callables take and return (dates as ISO-8601 strings, the
/// wire format of @bfhr/core's contracts).
enum CallableJSON {
    nonisolated static func object(_ value: some Encodable) throws -> [String: Any] {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let object = try JSONSerialization.jsonObject(with: encoder.encode(value)) as? [String: Any] else {
            throw EncodingError.invalidValue(value, .init(codingPath: [], debugDescription: "Not a JSON object"))
        }
        return object
    }

    static func decode<T: Decodable>(_ type: T.Type, _ value: Any) throws -> T {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = date(text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Not an ISO-8601 date: \(text)"))
        }
        return try decoder.decode(type, from: JSONSerialization.data(withJSONObject: value))
    }

    /// An ISO-8601 instant, with or without fractional seconds.
    static func date(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}

/// "Add a job from a link": `jobImportUrl` (@bfhr/core src/jobImport/contract.ts) reads the page
/// and returns a draft; nothing is written until the user confirms it.
final class CloudJobLinkImporter: JobLinkImporter {
    func lookUp(_ url: String) async throws(JobImportError) -> JobImportDraft {
        do {
            let callable = CVCallables.functions.httpsCallable("jobImportUrl")
            // Fetching the page and, when it has no structured data, reading it with AI.
            callable.timeoutInterval = 90
            let result = try await callable.call(["url": url])
            let response = try JobImportUrlResponse.decode(callableData: result.data)
            return JobImportDraft(
                job: try response.job(newID: ""),
                existingJobId: response.existingJobId,
                confidence: response.confidence,
                warnings: response.warnings,
                finalURL: URL(string: response.finalUrl)
            )
        } catch let error as JobImportError {
            throw error
        } catch {
            throw Self.importError(error)
        }
    }

    static func importError(_ error: any Error) -> JobImportError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        guard nsError.domain == FunctionsErrorDomain else { return .failed("\(nsError.domain) \(nsError.code)") }
        let reason = ((nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any])?["reason"] as? String)
            .flatMap(JobImportErrorReason.init(rawValue:))
        switch reason {
        case .invalidUrl?, .blockedUrl?: return .invalidURL
        case .notFound?: return .notFound
        case .blockedBySite?, .noJobFound?, .notHtml?, .tooLarge?, .aiDisabled?, .aiUnavailable?: return .unreadable
        case .dailyCap?, .rateLimited?: return .limit
        case .fetchFailed?: return .failed("fetch_failed")
        case .emailUnverified?, nil:
            if FunctionsErrorCode(rawValue: nsError.code) == .unavailable { return .offline }
            return .failed("\(nsError.code) \(nsError.localizedDescription)")
        }
    }
}
