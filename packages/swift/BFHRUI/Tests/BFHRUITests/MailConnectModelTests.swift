import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

final class FakeMailService: MailConnectService {
    var oauthError: MailConnectError?
    var imapResult: Result<ImapConnectResult, MailConnectError> = .success(ImapConnectResult(accountId: "acc-new", canSend: true, smtpWarning: nil))
    var imapRequests: [ImapConnectRequest] = []
    var backfills: [(String, Int)] = []
    var syncs: [String] = []
    var disconnects: [String] = []

    func startOAuth(provider: OAuthMailProvider, lookbackDays: Int, address: String?) async throws(MailConnectError) -> URL {
        if let oauthError { throw oauthError }
        return URL(string: "https://bruteforcehr.web.app/connect/\(provider.rawValue)?nonce=abc")!
    }

    var finishResult: Result<String, MailConnectError> = .success("acc-g")
    var finishes: [(String, String)] = []

    func finishOAuth(nonce: String, handoff: String) async throws(MailConnectError) -> String {
        finishes.append((nonce, handoff))
        return try finishResult.get()
    }

    func connectImap(_ request: ImapConnectRequest) async throws(MailConnectError) -> ImapConnectResult {
        imapRequests.append(request)
        return try imapResult.get()
    }

    func startBackfill(accountId: String, lookbackDays: Int) async throws(MailConnectError) {
        backfills.append((accountId, lookbackDays))
    }

    func syncNow(accountId: String) async throws(MailConnectError) {
        syncs.append(accountId)
    }

    func disconnect(accountId: String) async throws(MailConnectError) -> Int {
        disconnects.append(accountId)
        return 3
    }
}

final class FakeOAuthSession: MailOAuthSession {
    var result: Result<URL, MailConnectError>

    init(_ result: Result<URL, MailConnectError>) {
        self.result = result
    }

    func authenticate(url: URL, callbackScheme: String) async throws(MailConnectError) -> URL {
        try result.get()
    }
}

@Suite("Connect email model")
struct MailConnectModelTests {
    private static let now = Date(timeIntervalSince1970: 1_793_000_000)

    private func account(_ id: String, provider: MailProvider, updatedAt: Date, backfill: MailBackfillState? = .running) throws -> MailAccount {
        var account = try #require(FixtureStore.document(.populated).mailAccounts.first)
        account.id = id
        account.provider = provider
        account.updatedAt = updatedAt
        account.backfill = backfill.map {
            MailBackfill(
                state: $0, stage: .classifying, lookbackDays: 90, since: updatedAt, scanned: 120, total: nil,
                jobMessages: 4, applications: 2, interviewInvites: 1, jobAlerts: 0, pendingReview: 1,
                startedAt: updatedAt, finishedAt: nil, error: nil
            )
        }
        return account
    }

    @Test("Google isn't configured: a calm state, the provider row says so, and Gmail's app password is offered")
    func providerNotConfigured() async {
        let service = FakeMailService()
        service.oauthError = .providerNotConfigured
        let model = MailConnectModel(service: service, oauthSession: FakeOAuthSession(.failure(.cancelled)), now: { Self.now })
        model.chooseOAuth(.google)
        #expect(model.path == [.oauth(.google)])
        await model.continueOAuth(.google)
        #expect(model.oauthState == .notConfigured)
        #expect(model.unavailableProviders == [.google])
        model.chooseAppPassword("gmail")
        #expect(model.path == [.oauth(.google), .appPassword("gmail")])
        #expect(model.imap == MailEndpoint.tls("imap.gmail.com"))
        // Coming back to Google later shows the calm state at once.
        model.path = []
        model.chooseOAuth(.google)
        #expect(model.oauthState == .notConfigured)
    }

    @Test("OAuth return links: connected with a handoff, cancelled and errors")
    func oauthReturn() async throws {
        #expect(MailOAuthReturn(URL(string: "bruteforcehr://connected?nonce=n1&provider=google&intent=read&status=ok&handoff=h1")!) == .connected(.google, nonce: "n1", handoff: "h1"))
        #expect(MailOAuthReturn(URL(string: "bruteforcehr://connected?nonce=n1&provider=google&intent=read&status=ok")!) == nil)
        #expect(MailOAuthReturn(URL(string: "bruteforcehr://connected?nonce=a&provider=microsoft&intent=read&status=error&reason=admin_consent_required")!) == .failed(.adminConsentRequired))
        #expect(MailOAuthReturn(URL(string: "bruteforcehr://connected?status=error&reason=cancelled")!) == .failed(.cancelled))
        #expect(MailOAuthReturn(URL(string: "bruteforcehr://mail")!) == nil)

        // ok → mailConnectFinish(nonce, handoff) → the scan of the account it returns.
        let ok = URL(string: "bruteforcehr://connected?nonce=n1&provider=google&intent=read&status=ok&handoff=h1")!
        let service = FakeMailService()
        let model = MailConnectModel(service: service, oauthSession: FakeOAuthSession(.success(ok)), now: { Self.now })
        await model.continueOAuth(.google)
        #expect(service.finishes.map(\.0) == ["n1"] && service.finishes.map(\.1) == ["h1"])
        #expect(model.path == [.scanning])
        #expect(model.connectedAccountId == "acc-g")
        model.load([try account("acc-g", provider: .gmail, updatedAt: Self.now)])
        #expect(model.connectedAccount?.id == "acc-g")

        // Another BruteForceHR account's link, or a used one: nothing saved, calm errors.
        service.finishResult = .failure(.reason("connect_wrong_user"))
        let wrong = MailConnectModel(service: service, oauthSession: FakeOAuthSession(.success(ok)), now: { Self.now })
        await wrong.continueOAuth(.google)
        #expect(wrong.oauthState == .failed(.wrongUser) && wrong.path.isEmpty)
        service.finishResult = .failure(.reason("connect_expired"))
        let expired = MailConnectModel(service: service, oauthSession: FakeOAuthSession(.success(ok)), now: { Self.now })
        await expired.continueOAuth(.google)
        #expect(expired.oauthState == .failed(.expired))

        let scope = MailConnectModel(service: FakeMailService(), oauthSession: FakeOAuthSession(.success(URL(string: "bruteforcehr://connected?provider=google&status=error&reason=scope_missing")!)), now: { Self.now })
        await scope.continueOAuth(.google)
        #expect(scope.oauthState == .failed(.scopeMissing))
        let cancelled = MailConnectModel(service: FakeMailService(), oauthSession: FakeOAuthSession(.failure(.cancelled)), now: { Self.now })
        await cancelled.continueOAuth(.microsoft)
        #expect(cancelled.oauthState == .idle && cancelled.path.isEmpty)
    }

    @Test("App password: preset servers, detection from the address, Outlook routes to OAuth")
    func appPasswordForm() {
        let model = MailConnectModel(service: FakeMailService(), oauthSession: nil, now: { Self.now })
        model.chooseAppPassword(ImapPreset.otherID)
        #expect(model.showsServerSettings && model.imap.host.isEmpty)
        model.address = "deniz@icloud.com"
        #expect(model.presetId == "icloud")
        #expect(model.imap == MailEndpoint.tls("imap.mail.me.com") && model.smtp == MailEndpoint.starttls("smtp.mail.me.com"))
        #expect(!model.canConnect)
        model.password = "abcd-efgh-ijkl-mnop"
        #expect(model.canConnect)
        model.address = "deniz@hotmail.com"
        #expect(model.addressNeedsOAuth && !model.canConnect)
        model.address = "deniz@"
        #expect(!model.isAddressValid)
    }

    @Test("Connect sends the preset without servers, clears the password and opens the scan")
    func connectImap() async throws {
        let service = FakeMailService()
        let model = MailConnectModel(service: service, oauthSession: nil, now: { Self.now })
        model.chooseAppPassword("icloud")
        model.address = " Deniz@iCloud.com "
        model.password = "abcd-efgh-ijkl-mnop"
        model.lookbackDays = 30
        await model.connectImap()
        let request = try #require(service.imapRequests.first)
        #expect(request.address == "deniz@icloud.com" && request.preset == "icloud" && request.imap == nil && request.smtp == nil)
        #expect(request.lookbackDays == 30 && request.accountId == nil && request.username == nil)
        #expect(model.password.isEmpty)
        #expect(model.path.last == .scanning)

        let failing = FakeMailService()
        failing.imapResult = .failure(.authFailed)
        let wrong = MailConnectModel(service: failing, oauthSession: nil, now: { Self.now })
        wrong.chooseAppPassword("yahoo")
        wrong.address = "deniz@yahoo.com"
        wrong.password = "x"
        await wrong.connectImap()
        #expect(wrong.formState == .failed(.authFailed) && wrong.errorField == .password)
        wrong.password = "y"
        wrong.editedForm()
        #expect(wrong.formState == .editing)

        failing.imapResult = .failure(.hostUnreachable(field: .imapHost))
        wrong.showsServerSettings = false
        await wrong.connectImap()
        #expect(wrong.errorField == .imapHost && wrong.showsServerSettings)
    }

    @Test("Reconnect starts at the account's step with its servers; a failed scan retries")
    func reconnect() async throws {
        let document = try FixtureStore.document(.populated)
        let icloud = try #require(document.mailAccounts.first { $0.id == "acc-icloud" })
        let service = FakeMailService()
        service.imapResult = .success(ImapConnectResult(accountId: "acc-icloud", canSend: true, smtpWarning: nil))
        let model = MailConnectModel(service: service, oauthSession: nil, reconnecting: icloud, now: { Self.now })
        #expect(model.rootStep == .appPassword("icloud"))
        #expect(model.address == icloud.address && model.imap.host == "imap.mail.me.com")
        model.password = "new-app-password"
        await model.connectImap()
        #expect(service.imapRequests.first?.accountId == "acc-icloud")

        let gmail = try #require(document.mailAccounts.first { $0.id == "acc-gmail" })
        #expect(MailConnectModel(service: service, oauthSession: nil, reconnecting: gmail).rootStep == .oauth(.google))

        model.load([try account("acc-icloud", provider: .imap, updatedAt: Self.now, backfill: .failed)])
        await model.retryScan()
        #expect(service.backfills.first?.0 == "acc-icloud")
    }

    @Test("Callable error reasons map to form errors")
    func errorReasons() {
        #expect(MailConnectError.reason("auth_failed", field: "password") == .authFailed)
        #expect(MailConnectError.reason("host_unreachable", field: "smtpHost") == .hostUnreachable(field: .smtpHost))
        #expect(MailConnectError.reason("provider_not_configured") == .providerNotConfigured)
        #expect(MailConnectError.reason("nonce_invalid") == .expired)
        #expect(MailConnectError.reason(nil) == .failed("unknown"))
    }
}
