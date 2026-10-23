#if DEBUG
import Foundation

// Design mode for sign-in (Debug builds only): `-BFHRSignIn <state>` shows the signed-out screen
// in that state without calling Firebase, for captures and audits. Without it, design mode
// (`-BFHRScreen`, `-BFHRDesign`, `-BFHRState`, `-BFHRUpdate`) skips sign-in so the fixture screens
// stay reachable. Release builds compile none of this.

/// The sign-in capture states.
public enum DesignSignInState: String, CaseIterable, Sendable {
    /// The email field, empty.
    case email
    /// After Send with a typo: the inline field error.
    case invalid
    /// Sending failed offline: the alert under the field.
    case offline
    /// "Check your email", 42 s before Resend.
    case check
    /// "Check your email" after a resend, Resend available.
    case resent
    /// Opening the link.
    case finishing
    /// A link opened on another device: the address is asked again.
    case confirm
    /// An expired link.
    case expired
    /// A used or broken link.
    case unusable
    /// The link is fine but the connection failed.
    case retry

    /// Parses `-BFHRSignIn`; nil when absent or unknown.
    public static func parse(arguments: [String]) -> DesignSignInState? {
        guard let index = arguments.firstIndex(of: "-BFHRSignIn"), arguments.indices.contains(index + 1) else { return nil }
        return DesignSignInState(rawValue: arguments[index + 1])
    }

    /// The state this process was launched with, if any.
    public static let launch: DesignSignInState? = parse(arguments: ProcessInfo.processInfo.arguments)

    /// The fixture clock (foundation-ios.md): 2026-10-22 07:30 UTC.
    static let now = Date(timeIntervalSince1970: 1_792_654_200)
    static let address = "deniz.aksoy@example.com"
    static let link = "https://bruteforcehr.firebaseapp.com/__/auth/action?mode=signIn&oobCode=design"

    /// A model in this state that remembers nothing between launches. Its service sends instantly
    /// and refuses every link, so the flow can be clicked through without Firebase.
    public func model() -> SignInModel {
        let model = SignInModel(service: DesignSignInService(), store: SignInStore(defaults: nil), signedInEmail: nil, languageCode: "en") { Self.now }
        switch self {
        case .email:
            model.emailDraft = ""
        case .invalid:
            model.emailDraft = "deniz.aksoy@example"
            model.fieldError = .invalidFormat
        case .offline:
            model.emailDraft = Self.address
            model.sendError = .offline
        case .check:
            model.emailDraft = Self.address
            model.sentAt = Self.now.addingTimeInterval(-18)
            model.step = .checkEmail(address: Self.address)
        case .resent:
            model.emailDraft = Self.address
            model.sentAt = Self.now.addingTimeInterval(-90)
            model.didResend = true
            model.step = .checkEmail(address: Self.address)
        case .finishing:
            model.step = .finishing
        case .confirm:
            model.step = .confirmEmail(actionLink: Self.link)
        case .expired:
            model.step = .linkFailed(.expired)
        case .unusable:
            model.step = .linkFailed(.unusable)
        case .retry:
            model.step = .linkFailed(.retryable(offline: true, email: Self.address, actionLink: Self.link))
        }
        return model
    }
}

/// Design mode's stand-in for Firebase: sending succeeds, every link is refused as used.
final class DesignSignInService: EmailLinkAuthService {
    func sendSignInLink(to email: String, languageCode: String) async throws {}
    func isSignInLink(_ actionLink: String) -> Bool { true }
    func signIn(email: String, actionLink: String) async throws { throw SignInError.unusable }
    func signOut() throws {}
}
#endif
