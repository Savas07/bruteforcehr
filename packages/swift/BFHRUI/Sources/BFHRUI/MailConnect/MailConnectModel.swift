import BFHRCore
import Foundation
import Observation

// Connect email (docs/design/research/connect-email.md, "Decision — iOS"; ADR 0012): choose a
// provider → Google / Microsoft through `ASWebAuthenticationSession`, or an app password tested
// server-side → the lookback scan's progress and result. Accounts are read-only for clients; every
// change goes through a callable (`MailConnectService`).

/// The callables behind Connect email and Settings › Mail accounts (the app's Firebase Functions;
/// a fake in tests and design mode).
public protocol MailConnectService: AnyObject {
    /// `mailConnectStart`: the `/connect/{provider}?nonce=…` URL to open.
    func startOAuth(provider: OAuthMailProvider, lookbackDays: Int, address: String?) async throws(MailConnectError) -> URL
    /// `mailConnectFinish`: redeems the return link's `handoff` for this signed-in user; nothing is
    /// stored before it succeeds.
    func finishOAuth(nonce: String, handoff: String) async throws(MailConnectError) -> MailConnectFinishResult
    /// `mailConnectImap`: tests IMAP (and SMTP), stores the password encrypted, starts the scan.
    func connectImap(_ request: ImapConnectRequest) async throws(MailConnectError) -> ImapConnectResult
    /// `mailBackfillStart`: scans the last `lookbackDays` again.
    func startBackfill(accountId: String, lookbackDays: Int) async throws(MailConnectError)
    /// `mailSyncNow`: checks for new mail now.
    func syncNow(accountId: String) async throws(MailConnectError)
    /// `mailDisconnect`: revokes access and deletes the account's stored mail. Returns how many
    /// emails were deleted.
    func disconnect(accountId: String) async throws(MailConnectError) -> Int
}

/// Opens the provider's sign-in in a browser session and returns the `bruteforcehr://connected`
/// link it ends on (`ASWebAuthenticationSession` in the app).
public protocol MailOAuthSession: AnyObject {
    func authenticate(url: URL, callbackScheme: String) async throws(MailConnectError) -> URL
}

/// `mailConnectImap`'s request (`MailConnectImapRequestSchema`).
public struct ImapConnectRequest: Hashable, Sendable {
    public var address: String
    public var password: String
    public var preset: String
    public var username: String?
    public var imap: MailEndpoint?
    public var smtp: MailEndpoint?
    public var lookbackDays: Int
    /// Reconnect an existing account instead of adding one.
    public var accountId: String?
}

public struct ImapConnectResult: Hashable, Sendable {
    public var accountId: String
    public var canSend: Bool
    /// Why sending doesn't work while reading does (`SMTP_WARNING_REASONS`), or nil.
    public var smtpWarning: String?

    public init(accountId: String, canSend: Bool, smtpWarning: String?) {
        self.accountId = accountId
        self.canSend = canSend
        self.smtpWarning = smtpWarning
    }
}

/// `mailConnectFinish`'s answer: the connected mailbox, and whether it reconnected an existing
/// account (no new lookback scan then).
public struct MailConnectFinishResult: Hashable, Sendable {
    public var accountId: String
    public var address: String
    public var reconnect: Bool

    public init(accountId: String, address: String, reconnect: Bool) {
        self.accountId = accountId
        self.address = address
        self.reconnect = reconnect
    }
}

/// Connect errors in the form's terms (`MAIL_CONNECT_ERROR_REASONS`, `MAIL_OAUTH_RETURN_REASONS`
/// and the transport).
public enum MailConnectError: Error, Hashable, Sendable {
    /// The OAuth client isn't configured yet (`provider_not_configured`): a calm "not set up yet".
    case providerNotConfigured
    /// The preset signs in with OAuth only (Outlook.com).
    case oauthRequired
    case authFailed
    case imapDisabled
    case hostUnreachable(field: ImapField)
    case tlsFailed(field: ImapField)
    case emailUnverified
    case accountNotFound
    /// The provider screen was closed: no error shown.
    case cancelled
    /// A permission box was unchecked on the provider's screen.
    case scopeMissing
    /// A work account whose organisation must approve the app first.
    case adminConsentRequired
    /// The sign-in took too long or its link was already used: start again.
    case expired
    /// The provider's return link belongs to another BruteForceHR account; nothing was saved.
    case wrongUser
    /// A server port/security pair outside the allowed ones (993/143, 465/587).
    case portNotAllowed(field: ImapField)
    /// Too many connection tests today.
    case tooManyAttempts
    case offline
    /// Anything else, with details for "Copy details".
    case failed(String)

    /// The form field an error belongs to.
    public enum ImapField: String, Hashable, Sendable {
        case password
        case imapHost
        case smtpHost
    }

    /// `details.reason` of a callable error, or a `status=error&reason=` return link.
    public static func reason(_ reason: String?, field: String? = nil) -> MailConnectError {
        let field = field.flatMap(ImapField.init(rawValue:))
        switch reason {
        case "provider_not_configured": return .providerNotConfigured
        case "oauth_required": return .oauthRequired
        case "auth_failed": return .authFailed
        case "imap_disabled": return .imapDisabled
        case "host_unreachable": return .hostUnreachable(field: field ?? .imapHost)
        case "tls_failed": return .tlsFailed(field: field ?? .imapHost)
        case "email_unverified": return .emailUnverified
        case "account_not_found": return .accountNotFound
        case "cancelled": return .cancelled
        case "scope_missing": return .scopeMissing
        case "admin_consent_required": return .adminConsentRequired
        case "nonce_invalid", "connect_expired": return .expired
        case "connect_wrong_user": return .wrongUser
        case "port_not_allowed": return .portNotAllowed(field: field ?? .imapHost)
        case "too_many_attempts": return .tooManyAttempts
        default: return .failed(reason ?? "unknown")
        }
    }
}

/// Where the OAuth return link says the round trip ended.
public enum MailOAuthReturn: Hashable, Sendable {
    /// Signed in at the provider; `mailConnectFinish(nonce, handoff)` stores the account.
    case connected(OAuthMailProvider, nonce: String, handoff: String)
    case failed(MailConnectError)

    /// Parses `bruteforcehr://connected?nonce=&provider=&intent=&status=ok&handoff=` or
    /// `…&status=error&reason=`.
    public init?(_ url: URL) {
        guard url.scheme?.lowercased() == "bruteforcehr", url.host()?.lowercased() == "connected",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        let value = { (name: String) in items.first { $0.name == name }?.value }
        switch value("status") {
        case "ok":
            guard let provider = value("provider").flatMap(OAuthMailProvider.init(rawValue:)),
                  let nonce = value("nonce"), !nonce.isEmpty,
                  let handoff = value("handoff"), !handoff.isEmpty else { return nil }
            self = .connected(provider, nonce: nonce, handoff: handoff)
        case "error":
            self = .failed(.reason(value("reason")))
        default:
            return nil
        }
    }
}

@Observable
public final class MailConnectModel: ScreenModel {
    public var phase: LoadPhase = .loaded
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    /// The pushed steps over the provider list.
    public enum Step: Hashable {
        /// Pre-permission screen of an OAuth provider (Screen B).
        case oauth(OAuthMailProvider)
        /// App-password form for a preset id or `other` (Screen C).
        case appPassword(String)
        /// Lookback scan of the new account (Screen D/E). nil until the account document arrives.
        case scanning
    }

    public enum OAuthState: Hashable, Sendable {
        case idle
        /// `mailConnectStart` and the browser session are running.
        case working
        /// The provider isn't set up on the server yet (calm, with the app-password route when
        /// there is one).
        case notConfigured
        case failed(MailConnectError)
    }

    public enum FormState: Hashable, Sendable {
        case editing
        /// "Testing connection…" over the form.
        case testing
        case failed(MailConnectError)
    }

    public var path: [Step] = []
    public var lookbackDays = defaultMailLookbackDays
    public var oauthState: OAuthState = .idle
    /// Providers this session learned aren't configured (their rows say so).
    public internal(set) var unavailableProviders: Set<OAuthMailProvider> = []

    // App-password form
    public var presetId: String = ImapPreset.otherID
    public var address = "" {
        didSet { detectPreset() }
    }
    public var password = ""
    public var username = ""
    public var imap = MailEndpoint(host: "", port: 993, security: .tls)
    public var smtp = MailEndpoint(host: "", port: 587, security: .starttls)
    public var showsServerSettings = false
    public internal(set) var formState: FormState = .editing
    /// "Connected for reading" after an SMTP failure.
    public private(set) var smtpWarning: String?

    // Result
    /// The account being scanned (both callables return it).
    public internal(set) var connectedAccountId: String?
    /// The mailbox `mailConnectFinish` named, shown before the account's document arrives.
    public private(set) var connectedAddress: String?
    /// The connect replaced an existing account's credentials: no new lookback scan.
    public private(set) var reconnected = false
    public private(set) var accounts: [MailAccount] = []
    public private(set) var backfillRetryFailed = false

    /// Reconnect: the account whose credentials are being replaced.
    public let reconnecting: MailAccount?
    /// The first screen when reconnecting (the provider's step instead of the provider list).
    public private(set) var rootStep: Step?

    /// Called once an account is connected (the app asks for push permission in context).
    public var onConnected: (() -> Void)?

    public let service: (any MailConnectService)?
    public let oauthSession: (any MailOAuthSession)?
    public let now: () -> Date

    public init(
        service: (any MailConnectService)?,
        oauthSession: (any MailOAuthSession)?,
        reconnecting: MailAccount? = nil,
        now: @escaping () -> Date = { .now }
    ) {
        self.service = service
        self.oauthSession = oauthSession
        self.reconnecting = reconnecting
        self.lookbackDays = reconnecting?.backfill?.lookbackDays ?? defaultMailLookbackDays
        self.now = now
        if let account = reconnecting {
            switch account.provider {
            case .gmail: rootStep = .oauth(.google)
            case .microsoft: rootStep = .oauth(.microsoft)
            case .imap:
                let preset = account.server?.preset ?? ImapPreset.preset(for: account.address)?.id ?? ImapPreset.otherID
                choosePreset(preset)
                address = account.address
                if let server = account.server {
                    username = server.username == account.address ? "" : server.username
                    imap = server.imap
                    if let smtp = server.smtp { self.smtp = smtp }
                }
                rootStep = .appPassword(preset)
            }
        }
    }

    /// The data layer's snapshot: only the accounts matter here.
    public func load(_ data: UserData) {
        load(data.mailAccounts)
    }

    /// The accounts snapshot (progress of the scan).
    public func load(_ accounts: [MailAccount]) {
        self.accounts = accounts
    }

    /// The account under scan, once known.
    public var connectedAccount: MailAccount? {
        connectedAccountId.flatMap { id in accounts.first { $0.id == id } }
    }

    /// Addresses already connected (Settings shows them with ✓ and Add skips nothing: a second
    /// Gmail address is fine).
    public var connectedAddresses: [String] { accounts.filter { $0.status != .disconnected }.map(\.address) }

    /// The absolute start of the lookback window ("since 26 Jul").
    public var lookbackStart: Date {
        Calendar.current.date(byAdding: .day, value: -lookbackDays, to: now()) ?? now()
    }

    // MARK: OAuth

    public func chooseOAuth(_ provider: OAuthMailProvider) {
        oauthState = unavailableProviders.contains(provider) ? .notConfigured : .idle
        path.append(.oauth(provider))
    }

    /// Continue to Google / Microsoft: `mailConnectStart`, the browser session, `mailConnectFinish`
    /// with the return link's handoff, then the scan.
    public func continueOAuth(_ provider: OAuthMailProvider) async {
        guard let service, let oauthSession else { return }
        oauthState = .working
        do {
            let url = try await service.startOAuth(
                provider: provider,
                lookbackDays: lookbackDays,
                address: reconnecting?.address
            )
            let callback = try await oauthSession.authenticate(url: url, callbackScheme: "bruteforcehr")
            switch MailOAuthReturn(callback) {
            case .connected(_, let nonce, let handoff):
                let result = try await service.finishOAuth(nonce: nonce, handoff: handoff)
                connectedAccountId = result.accountId
                connectedAddress = result.address
                reconnected = result.reconnect
                oauthState = .idle
                path.append(.scanning)
                onConnected?()
            case .failed(.cancelled):
                oauthState = .idle
            case .failed(let error):
                fail(error, provider: provider)
            case nil:
                oauthState = .failed(.failed("Unexpected return link"))
            }
        } catch .cancelled {
            oauthState = .idle
        } catch {
            fail(error, provider: provider)
        }
    }

    private func fail(_ error: MailConnectError, provider: OAuthMailProvider) {
        if error == .providerNotConfigured {
            unavailableProviders.insert(provider)
            oauthState = .notConfigured
        } else {
            oauthState = .failed(error)
        }
    }

    // MARK: App password

    /// Opens the app-password form for a preset (or `other`).
    public func chooseAppPassword(_ preset: String) {
        choosePreset(preset)
        path.append(.appPassword(preset))
    }

    private func choosePreset(_ id: String) {
        presetId = id
        formState = .editing
        if let preset = ImapPreset.preset(id: id) {
            imap = preset.imap
            smtp = preset.smtp
            showsServerSettings = false
        } else {
            imap = MailEndpoint(host: "", port: 993, security: .tls)
            smtp = MailEndpoint(host: "", port: 587, security: .starttls)
            showsServerSettings = true
        }
    }

    /// "Other" picks up a known provider from the address and fills in its servers.
    private func detectPreset() {
        guard presetId == ImapPreset.otherID, let detected = ImapPreset.preset(for: address), detected.oauthOnly == nil else { return }
        let typed = showsServerSettings
        choosePreset(detected.id)
        showsServerSettings = typed && imap.host.isEmpty
    }

    public var preset: ImapPreset? { ImapPreset.preset(id: presetId) }

    /// The address belongs to a provider that only allows OAuth (Outlook.com).
    public var addressNeedsOAuth: Bool { ImapPreset.preset(for: address)?.oauthOnly != nil }

    public var isAddressValid: Bool {
        let trimmed = address.trimmingCharacters(in: .whitespaces)
        guard let at = trimmed.firstIndex(of: "@"), at != trimmed.startIndex else { return false }
        let domain = trimmed[trimmed.index(after: at)...]
        return domain.contains(".") && !domain.hasSuffix(".") && !trimmed.contains(" ")
    }

    public var canConnect: Bool {
        guard formState != .testing, isAddressValid, !password.isEmpty, !addressNeedsOAuth, portProblem == nil else { return false }
        return !imap.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// A typed port/security pair the server won't accept (checked before Connect).
    public var portProblem: MailConnectError.ImapField? {
        if !imap.isAllowed(as: .imap) { return .imapHost }
        if !smtp.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !smtp.isAllowed(as: .smtp) { return .smtpHost }
        return nil
    }

    /// The field an error marks.
    public var errorField: MailConnectError.ImapField? {
        guard case .failed(let error) = formState else { return nil }
        switch error {
        case .authFailed, .imapDisabled: return .password
        case .hostUnreachable(let field), .tlsFailed(let field), .portNotAllowed(let field): return field
        default: return nil
        }
    }

    /// Connect: `mailConnectImap`, then the scan.
    public func connectImap() async {
        guard let service, canConnect else { return }
        formState = .testing
        let custom = presetId == ImapPreset.otherID || showsServerSettings
        let request = ImapConnectRequest(
            address: address.trimmingCharacters(in: .whitespaces).lowercased(),
            password: password,
            preset: presetId,
            username: username.trimmingCharacters(in: .whitespaces).isEmpty ? nil : username.trimmingCharacters(in: .whitespaces),
            imap: custom ? trimmed(imap) : nil,
            smtp: custom ? (smtp.host.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : trimmed(smtp)) : nil,
            lookbackDays: lookbackDays,
            accountId: reconnecting?.id
        )
        do {
            let result = try await service.connectImap(request)
            password = ""
            formState = .editing
            smtpWarning = result.smtpWarning
            connectedAccountId = result.accountId
            connectedAddress = request.address
            reconnected = reconnecting != nil
            path.append(.scanning)
            onConnected?()
        } catch {
            formState = .failed(error)
            if errorField == .imapHost || errorField == .smtpHost { showsServerSettings = true }
        }
    }

    /// Clears a shown error once the user edits the form.
    public func editedForm() {
        if case .failed = formState { formState = .editing }
    }

    private func trimmed(_ endpoint: MailEndpoint) -> MailEndpoint {
        let host = endpoint.host.filter { !$0.isWhitespace && !$0.isNewline }.lowercased()
        return MailEndpoint(host: host, port: endpoint.port, security: endpoint.security)
    }

    // MARK: Scan

    /// "Try the scan again" after a failed lookback scan.
    public func retryScan() async {
        guard let service, let account = connectedAccount else { return }
        backfillRetryFailed = false
        do {
            try await service.startBackfill(accountId: account.id, lookbackDays: account.backfill?.lookbackDays ?? lookbackDays)
        } catch {
            backfillRetryFailed = true
        }
    }
}
