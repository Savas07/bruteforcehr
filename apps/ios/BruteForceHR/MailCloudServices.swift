import AuthenticationServices
import BFHRCore
import BFHRUI
import FirebaseFunctions
import Foundation
import UIKit

/// The mail callables (docs/adr/0012-mail-sync.md, docs/runbooks/mail.md): Cloud Functions in
/// europe-west1, signed-in + verified email. Errors carry `details.reason` (and `details.field`
/// for form errors), mapped to `MailConnectError`.
final class CloudMailService: MailConnectService {
    private var functions: Functions { Functions.functions(region: "europe-west1") }

    func startOAuth(provider: OAuthMailProvider, lookbackDays: Int, address: String?) async throws(MailConnectError) -> URL {
        var payload: [String: Any] = ["provider": provider.rawValue, "intent": "read", "lookbackDays": lookbackDays]
        if let address { payload["address"] = address }
        let data = try await call("mailConnectStart", payload)
        guard let url = (data?["url"] as? String).flatMap(URL.init(string:)) else { throw .failed("mailConnectStart returned no url") }
        return url
    }

    func finishOAuth(nonce: String, handoff: String) async throws(MailConnectError) -> MailConnectFinishResult {
        let data = try await call("mailConnectFinish", ["nonce": nonce, "handoff": handoff])
        guard let accountId = data?["accountId"] as? String, let address = data?["address"] as? String else {
            throw .failed("mailConnectFinish returned no account")
        }
        return MailConnectFinishResult(accountId: accountId, address: address, reconnect: data?["reconnect"] as? Bool ?? false)
    }

    func connectImap(_ request: ImapConnectRequest) async throws(MailConnectError) -> ImapConnectResult {
        var payload: [String: Any] = [
            "address": request.address,
            "password": request.password,
            "preset": request.preset,
            "lookbackDays": request.lookbackDays,
        ]
        if let username = request.username { payload["username"] = username }
        if let imap = request.imap { payload["imap"] = Self.endpoint(imap) }
        if let smtp = request.smtp { payload["smtp"] = Self.endpoint(smtp) }
        if let accountId = request.accountId { payload["accountId"] = accountId }
        let data = try await call("mailConnectImap", payload, timeout: 90)
        guard let accountId = data?["accountId"] as? String else { throw .failed("mailConnectImap returned no accountId") }
        return ImapConnectResult(accountId: accountId, canSend: data?["canSend"] as? Bool ?? false, smtpWarning: data?["smtpWarning"] as? String)
    }

    func startBackfill(accountId: String, lookbackDays: Int) async throws(MailConnectError) {
        _ = try await call("mailBackfillStart", ["accountId": accountId, "lookbackDays": lookbackDays])
    }

    func syncNow(accountId: String) async throws(MailConnectError) {
        _ = try await call("mailSyncNow", ["accountId": accountId])
    }

    func disconnect(accountId: String) async throws(MailConnectError) -> Int {
        let data = try await call("mailDisconnect", ["accountId": accountId], timeout: 300)
        return data?["deletedMessages"] as? Int ?? 0
    }

    private static func endpoint(_ endpoint: MailEndpoint) -> [String: Any] {
        ["host": endpoint.host, "port": endpoint.port, "security": endpoint.security.rawValue]
    }

    private func call(_ name: String, _ payload: sending [String: Any], timeout: TimeInterval = 70) async throws(MailConnectError) -> [String: Any]? {
        let callable = functions.httpsCallable(name)
        callable.timeoutInterval = timeout
        do {
            return try await callable.call(payload).data as? [String: Any]
        } catch {
            throw Self.connectError(error)
        }
    }

    /// Functions and network errors in the form's terms.
    static func connectError(_ error: any Error) -> MailConnectError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        guard nsError.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: nsError.code) else {
            return .failed("\(nsError.domain) \(nsError.code)")
        }
        let details = nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any]
        if let reason = details?["reason"] as? String {
            return .reason(reason, field: details?["field"] as? String)
        }
        switch code {
        case .unavailable, .deadlineExceeded: return .offline
        default: return .failed("\(code.rawValue) \(nsError.localizedDescription)")
        }
    }
}

/// `ASWebAuthenticationSession` for the `/connect/{provider}` handoff: iOS shows its "Wants to Use
/// … to Sign In" alert, the provider's consent runs in the session, and the Cloud Function ends it
/// on `bruteforcehr://connected?…`.
final class WebAuthSession: NSObject, MailOAuthSession, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func authenticate(url: URL, callbackScheme: String) async throws(MailConnectError) -> URL {
        let result: Result<URL, MailConnectError> = await withCheckedContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme)) { url, error in
                if let url {
                    continuation.resume(returning: .success(url))
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(returning: .failure(.cancelled))
                } else {
                    continuation.resume(returning: .failure(.failed(error.map { "\($0)" } ?? "no callback")))
                }
            }
            session.presentationContextProvider = self
            // Shares Safari's cookies, so a signed-in Google or Microsoft account is offered.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(returning: .failure(.failed("The sign-in window couldn't open")))
            }
        }
        session = nil
        return try result.get()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
