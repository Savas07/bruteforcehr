import BFHRCore
import BFHRUI
import FirebaseFunctions
import FirebaseStorage
import Foundation

/// The AI callables (`@bfhr/core` src/ai.ts, docs/adr/0010-ai.md): Cloud Functions in
/// europe-west1, signed-in + verified email, per-user daily cost cap. Claude never invents
/// content: unknown figures come back as placeholders (`[X%]`) the user fills in, and a server
/// grounding check drops suggestions with entities, numbers or dates not in the source.
enum CVCallables {
    static var functions: Functions { Functions.functions(region: "europe-west1") }
}

/// ✦ Improve through `cvAssist`.
struct CloudCVAssist: CVSuggestionProvider {
    func suggestions(for request: CVAssistRequest) async throws -> [CVSuggestion] {
        let action: String = switch request.mode {
        case .rewrite: "rewrite"
        case .shorten: "shorten"
        case .strongerVerb: "strongerVerb"
        case .translate: "translate"
        }
        var payload: [String: Any] = [
            "text": request.text,
            "action": action,
            "context": ["section": request.section],
        ]
        if request.mode == .translate, let target = request.targetLanguage { payload["targetLanguage"] = target }
        let result = try await CVCallables.functions.httpsCallable("cvAssist").call(payload)
        guard let data = result.data as? [String: Any], let suggestions = data["suggestions"] as? [[String: Any]] else {
            throw CVImportError.other("cvAssist returned no suggestions list")
        }
        return suggestions.enumerated().compactMap { index, suggestion in
            guard let text = suggestion["text"] as? String else { return nil }
            return CVSuggestion(id: "\(index)", text: text, reasons: Self.reasons(request.mode, text: text))
        }
    }

    /// The change tags shown with a suggestion: what the mode does, plus "Shows a result" when it
    /// left a figure to fill in.
    static func reasons(_ mode: CVAssistMode, text: String) -> [CVSuggestionReason] {
        var reasons: [CVSuggestionReason] = switch mode {
        case .rewrite: [.clearer]
        case .shorten: [.shorter]
        case .strongerVerb: [.strongerVerb]
        case .translate: [.translated]
        }
        // Placeholders the server leaves for figures it can't know (`CV_PLACEHOLDER_PATTERN`).
        if text.range(of: #"\[(X%|X|date)\]"#, options: .regularExpression) != nil { reasons.append(.measurableResult) }
        return reasons
    }
}

/// Import: Cloud Storage upload to `users/{uid}/cv-imports/{fileId}`, then `cvImport`.
final class CloudCVImporter: CVImporter {
    private let uid: String

    init(uid: String) {
        self.uid = uid
    }

    func upload(_ data: Data, kind: CVImportFileKind) async throws(CVImportError) -> String {
        let path = "users/\(uid)/cv-imports/\(UUID().uuidString.lowercased())"
        let metadata = StorageMetadata()
        metadata.contentType = kind.contentType
        do {
            _ = try await Storage.storage().reference(withPath: path).putDataAsync(data, metadata: metadata)
        } catch {
            throw Self.importError(error)
        }
        return path
    }

    func read(storagePath: String, kind: CVImportFileKind) async throws(CVImportError) -> CVImportResult {
        let result: HTTPSCallableResult
        do {
            // Reading a long PDF with Claude can take a minute; allow more than the 70 s default.
            let callable = CVCallables.functions.httpsCallable("cvImport")
            callable.timeoutInterval = 180
            result = try await callable.call(["storagePath": storagePath, "kind": kind.rawValue])
        } catch {
            throw Self.importError(error)
        }
        guard let data = result.data as? [String: Any], let resume = data["resume"] as? [String: Any],
              let json = try? JSONSerialization.data(withJSONObject: resume) else {
            throw .other("cvImport returned no resume")
        }
        let confidence = (data["confidence"] as? [String: Any] ?? [:]).compactMapValues { ($0 as? NSNumber)?.doubleValue }
        return CVImportResult(resumeJSON: json, confidence: confidence, warnings: data["warnings"] as? [String] ?? [])
    }

    /// Storage and Functions errors in the review screen's terms.
    static func importError(_ error: any Error) -> CVImportError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        if nsError.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: nsError.code) {
            let reason = (nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any])?["reason"] as? String
            switch (code, reason) {
            case (.unavailable, _), (.deadlineExceeded, _): return .offline
            case (.resourceExhausted, _): return .dailyLimit
            case (.failedPrecondition, "ai_disabled"): return .aiDisabled
            case (.failedPrecondition, _), (.invalidArgument, _), (.notFound, _): return .unreadable
            default: return .other("\(code.rawValue) \(nsError.localizedDescription)")
            }
        }
        if nsError.domain == StorageErrorDomain, nsError.code == StorageErrorCode.retryLimitExceeded.rawValue { return .offline }
        return .other("\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
    }
}
