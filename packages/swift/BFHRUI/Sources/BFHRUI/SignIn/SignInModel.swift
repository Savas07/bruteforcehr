import Foundation
import Observation

/// Why a call to the sign-in service failed, in the terms the screens need. The app maps
/// FirebaseAuth's error codes onto these (apps/ios/BruteForceHR/EmailLinkAuth.swift).
public nonisolated enum SignInError: Error, Hashable, Sendable {
    /// No connection, or the request timed out.
    case offline
    /// Firebase rejected the address (on send), or the address doesn't match the link (on sign-in).
    case invalidEmail
    /// Too many links sent to this address, or the project's daily quota is used up.
    case tooManyRequests
    /// The link is past its expiry.
    case expired
    /// The link was used already, replaced, or is malformed.
    case unusable
    /// The account is disabled.
    case accountDisabled
    /// Anything else (configuration, server error).
    case other
}

/// Firebase Authentication's email-link calls (the app implements it with FirebaseAuth; BFHRUI
/// never imports Firebase).
public protocol EmailLinkAuthService: AnyObject {
    /// Sends the sign-in link to `email`, with Firebase's email template in `languageCode`.
    func sendSignInLink(to email: String, languageCode: String) async throws
    /// `isSignIn(withEmailLink:)`: the action link has the shape of a sign-in link.
    func isSignInLink(_ actionLink: String) -> Bool
    /// `signIn(withEmail:link:)`. Returns once signed in.
    func signIn(email: String, actionLink: String) async throws
    func signOut() throws
}

/// What the sign-in flow remembers on this device (UserDefaults; nil defaults = memory only, for
/// design mode, previews and tests).
public final class SignInStore {
    private let defaults: UserDefaults?
    private var memory: [String: Any] = [:]

    static let pendingEmailKey = "bfhr.signIn.pendingEmail"
    static let sentAtKey = "bfhr.signIn.sentAt"
    static let lastEmailKey = "bfhr.signIn.lastEmail"

    public init(defaults: UserDefaults? = .standard) {
        self.defaults = defaults
    }

    private func value(_ key: String) -> Any? { defaults?.object(forKey: key) ?? memory[key] }

    private func set(_ value: Any?, _ key: String) {
        if let defaults {
            defaults.set(value, forKey: key)
        } else {
            memory[key] = value
        }
    }

    /// The address the last link went to (`emailForSignIn`): a link opened on this device signs
    /// in with it without asking again.
    public var pendingEmail: String? {
        get { value(Self.pendingEmailKey) as? String }
        set { set(newValue, Self.pendingEmailKey) }
    }

    /// When the last link was sent (the resend cooldown survives relaunching the app).
    public var sentAt: Date? {
        get { value(Self.sentAtKey) as? Date }
        set { set(newValue, Self.sentAtKey) }
    }

    /// The address of the last successful sign-in: pre-fills the email field after signing out.
    public var lastEmail: String? {
        get { value(Self.lastEmailKey) as? String }
        set { set(newValue, Self.lastEmailKey) }
    }
}

/// Passwordless sign-in with Firebase's email link (ADR 0003, docs/design/research/onboarding-signin.md):
/// email → "Check your email" → the link opens the app → signed in. While signed out the app shows
/// `SignInScreen` instead of the tabs.
@Observable
public final class SignInModel {
    public nonisolated enum Step: Equatable, Sendable {
        /// The email field. Also where "Use a different email" and "Send a new link" lead.
        case enterEmail
        /// A link went to `address`; waiting for the user to open it.
        case checkEmail(address: String)
        /// Signing in with an opened link.
        case finishing
        /// A link opened on a device that didn't ask for it (no pending email): the user enters
        /// the address the link went to.
        case confirmEmail(actionLink: String)
        /// An opened link that can't sign in.
        case linkFailed(LinkFailure)
    }

    public nonisolated enum LinkFailure: Equatable, Sendable {
        case expired
        /// Used, replaced by a newer link, cut off or not a sign-in link.
        case unusable
        case accountDisabled
        /// Offline or a server error: the same link can be tried again.
        case retryable(offline: Bool, email: String, actionLink: String)
    }

    /// Problems shown inline under the email field.
    public nonisolated enum FieldError: Equatable, Sendable {
        /// Not an address (checked on send, never while typing).
        case invalidFormat
        /// Firebase rejected the address.
        case rejected
        /// The link went to another address (confirm step).
        case mismatch
    }

    /// Problems sending a link, shown as an alert under the button.
    public nonisolated enum SendError: Equatable, Sendable {
        case offline
        case tooManyRequests
        case other
    }

    /// A calm note on the email step after leaving the app on purpose (not an error).
    public nonisolated enum Notice: Equatable, Sendable {
        /// The account was deleted (Settings › Data & privacy › Delete account).
        case accountDeleted
    }

    /// Time between two links to the same address.
    public static let resendCooldown: TimeInterval = 60

    public internal(set) var step: Step
    public var emailDraft: String {
        didSet { if emailDraft != oldValue { fieldError = nil } }
    }
    public internal(set) var isSending = false
    public internal(set) var fieldError: FieldError?
    public internal(set) var sendError: SendError?
    /// "We sent another link": set after a resend on the check-email step.
    public internal(set) var didResend = false
    /// The signed-in account's address; nil while signed out.
    public private(set) var signedInEmail: String?
    public internal(set) var sentAt: Date?
    /// Shown once on the email step; cleared by the next send or by closing it.
    public internal(set) var notice: Notice?

    private let service: EmailLinkAuthService
    private let store: SignInStore
    private let languageCode: String
    private let now: () -> Date

    /// - Parameters:
    ///   - signedInEmail: the restored session's address (`Auth.auth().currentUser?.email`).
    ///   - languageCode: the UI language (en, tr, de) for Firebase's email template.
    public init(
        service: EmailLinkAuthService,
        store: SignInStore = SignInStore(),
        signedInEmail: String?,
        languageCode: String,
        now: @escaping () -> Date = Date.init
    ) {
        self.service = service
        self.store = store
        self.signedInEmail = signedInEmail
        self.languageCode = languageCode
        self.now = now
        sentAt = store.sentAt
        if let pending = store.pendingEmail {
            step = .checkEmail(address: pending)
            emailDraft = pending
        } else {
            step = .enterEmail
            emailDraft = store.lastEmail ?? ""
        }
    }

    public var isSignedIn: Bool { signedInEmail != nil }

    /// The model's clock (the resend countdown reads it; fixed in design mode).
    public var currentDate: Date { now() }

    /// When Resend becomes available again; nil when it already is.
    public func resendAvailableAt(_ date: Date) -> Date? {
        guard let sentAt else { return nil }
        let available = sentAt.addingTimeInterval(Self.resendCooldown)
        return available > date ? available : nil
    }

    // MARK: Session

    /// The auth state listener's report (a session restored, signed in, signed out elsewhere).
    public func authStateChanged(email: String?) {
        guard email != signedInEmail else { return }
        signedInEmail = email
        if let email { didSignIn(email) }
    }

    public func signOut() throws(SignInError) {
        do {
            try service.signOut()
        } catch {
            throw (error as? SignInError) ?? .other
        }
        signedInEmail = nil
        step = .enterEmail
        emailDraft = store.lastEmail ?? ""
        fieldError = nil
        sendError = nil
    }

    /// After `accountDelete` succeeded: the Auth user is gone, so this signs out locally, forgets
    /// the address (nothing to sign back into) and shows the deletion notice on the email step.
    public func accountDeleted() {
        try? service.signOut()
        store.pendingEmail = nil
        store.sentAt = nil
        store.lastEmail = nil
        signedInEmail = nil
        sentAt = nil
        didResend = false
        fieldError = nil
        sendError = nil
        emailDraft = ""
        step = .enterEmail
        notice = .accountDeleted
    }

    public func dismissNotice() {
        notice = nil
    }

    private func didSignIn(_ email: String) {
        store.pendingEmail = nil
        store.sentAt = nil
        store.lastEmail = email
        sentAt = nil
        didResend = false
        fieldError = nil
        sendError = nil
        notice = nil
        step = .enterEmail
        emailDraft = email
    }

    // MARK: Sending

    /// Sends a link to the draft address and moves to "Check your email".
    public func sendLink() async {
        guard !isSending else { return }
        guard let email = EmailAddress.normalized(emailDraft) else {
            fieldError = .invalidFormat
            return
        }
        emailDraft = email
        notice = nil
        if await send(to: email) {
            step = .checkEmail(address: email)
            didResend = false
        }
    }

    /// Sends another link to the same address once the cooldown is over.
    public func resendLink() async {
        guard case .checkEmail(let address) = step, resendAvailableAt(now()) == nil else { return }
        if await send(to: address) { didResend = true }
    }

    private func send(to email: String) async -> Bool {
        isSending = true
        sendError = nil
        fieldError = nil
        defer { isSending = false }
        do {
            try await service.sendSignInLink(to: email, languageCode: languageCode)
        } catch {
            switch (error as? SignInError) ?? .other {
            case .offline: sendError = .offline
            case .tooManyRequests: sendError = .tooManyRequests
            case .invalidEmail: fieldError = .rejected
            default: sendError = .other
            }
            return false
        }
        let date = now()
        store.pendingEmail = email
        store.sentAt = date
        sentAt = date
        return true
    }

    /// Back to the email field, pre-filled, to correct or change the address. Forgets the pending
    /// address, so an older link asks which address it went to.
    public func useDifferentEmail() {
        store.pendingEmail = nil
        store.sentAt = nil
        sentAt = nil
        didResend = false
        sendError = nil
        fieldError = nil
        step = .enterEmail
    }

    /// From a failed link: the email field with the last address, to send a fresh link.
    public func startOver() {
        if let address = store.pendingEmail ?? store.lastEmail { emailDraft = address }
        useDifferentEmail()
    }

    // MARK: Opening a link

    /// Whether `url` is for sign-in (`open(_:)` takes it); other handlers take the rest.
    public static func handles(_ url: URL) -> Bool {
        SignInLink(url: url) != nil
    }

    /// Opens a sign-in URL: signs in with the pending address, or asks for the address when this
    /// device didn't ask for the link. Signed in, the link is ignored: it can't switch accounts
    /// silently.
    public func open(_ url: URL) async {
        guard let link = SignInLink(url: url), !isSignedIn, step != .finishing else { return }
        guard case .signIn(let actionLink) = link, service.isSignInLink(actionLink) else {
            step = .linkFailed(.unusable)
            return
        }
        sendError = nil
        fieldError = nil
        if let email = store.pendingEmail {
            await finish(email: email, actionLink: actionLink)
        } else {
            emailDraft = store.lastEmail ?? ""
            step = .confirmEmail(actionLink: actionLink)
        }
    }

    /// Confirm step: signs in with the typed address.
    public func confirmEmail() async {
        guard case .confirmEmail(let actionLink) = step, !isSending else { return }
        guard let email = EmailAddress.normalized(emailDraft) else {
            fieldError = .invalidFormat
            return
        }
        isSending = true
        defer { isSending = false }
        await finish(email: email, actionLink: actionLink, confirming: true)
    }

    /// Retries a link that failed for a connection or server problem.
    public func retry() async {
        guard case .linkFailed(.retryable(_, let email, let actionLink)) = step else { return }
        await finish(email: email, actionLink: actionLink)
    }

    private func finish(email: String, actionLink: String, confirming: Bool = false) async {
        if !confirming { step = .finishing }
        do {
            try await service.signIn(email: email, actionLink: actionLink)
        } catch {
            switch (error as? SignInError) ?? .other {
            case .expired: step = .linkFailed(.expired)
            case .unusable: step = .linkFailed(.unusable)
            case .accountDisabled: step = .linkFailed(.accountDisabled)
            case .invalidEmail:
                // The link went to another address than the one remembered or typed.
                store.pendingEmail = nil
                emailDraft = confirming ? email : ""
                fieldError = confirming ? .mismatch : nil
                step = .confirmEmail(actionLink: actionLink)
            case .offline: step = .linkFailed(.retryable(offline: true, email: email, actionLink: actionLink))
            case .tooManyRequests, .other: step = .linkFailed(.retryable(offline: false, email: email, actionLink: actionLink))
            }
            return
        }
        signedInEmail = email
        didSignIn(email)
    }
}
