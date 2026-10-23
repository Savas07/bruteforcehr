import BFHRUI
import FirebaseAuth
import Foundation

/// Firebase Authentication's passwordless email link (ADR 0003) behind `SignInModel`. Firebase
/// sends the email from its own mailer, in `Auth.languageCode`.
///
/// The emailed link is `https://bruteforcehr.firebaseapp.com/__/auth/links?link=<action URL>`; the
/// app receives it as a universal link (Associated Domains `bruteforcehr.firebaseapp.com` and
/// `bruteforcehr.web.app`, AASA served by Firebase Hosting) or, when it opened in a browser, as
/// `bruteforcehr://auth/finish?link=…` from the `/auth/finish` page. `SignInLink` unwraps both to
/// the action URL before it reaches Firebase.
final class FirebaseEmailLinkService: EmailLinkAuthService {
    /// Where Firebase's action handler continues to (the website's `/auth/finish` page). No
    /// `linkDomain`: Firebase rejects the default Hosting domains there and uses the project's
    /// default Hosting domain for mobile links.
    static let continueURL = URL(string: "https://bruteforcehr.web.app/auth/finish")!

    private var auth: Auth { Auth.auth() }

    func sendSignInLink(to email: String, languageCode: String) async throws {
        let settings = ActionCodeSettings()
        settings.url = Self.continueURL
        // The sign-in completes in the app, which keeps the session (Firebase requires true).
        settings.handleCodeInApp = true
        settings.setIOSBundleID(Bundle.main.bundleIdentifier ?? "com.savas07.bruteforcehr")
        auth.languageCode = languageCode
        do {
            try await auth.sendSignInLink(toEmail: email, actionCodeSettings: settings)
        } catch {
            throw Self.signInError(error)
        }
    }

    func isSignInLink(_ actionLink: String) -> Bool {
        auth.isSignIn(withEmailLink: actionLink)
    }

    func signIn(email: String, actionLink: String) async throws {
        do {
            _ = try await auth.signIn(withEmail: email, link: actionLink)
        } catch {
            throw Self.signInError(error)
        }
    }

    func signOut() throws {
        do {
            try auth.signOut()
        } catch {
            throw SignInError.other
        }
    }

    /// FirebaseAuth's error codes in the terms the screens need.
    static func signInError(_ error: Error) -> SignInError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        guard nsError.domain == AuthErrors.domain, let code = AuthErrorCode(rawValue: nsError.code) else { return .other }
        switch code {
        case .networkError, .webNetworkRequestFailed: return .offline
        case .invalidEmail, .invalidRecipientEmail, .missingEmail: return .invalidEmail
        case .tooManyRequests, .quotaExceeded: return .tooManyRequests
        case .expiredActionCode: return .expired
        case .invalidActionCode: return .unusable
        case .userDisabled: return .accountDisabled
        default: return .other
        }
    }

    /// The UI language the app runs in (en, tr or de), for Firebase's email template.
    static var languageCode: String {
        Bundle.main.preferredLocalizations.first ?? "en"
    }

    /// The model for this launch: the restored session's address, if any.
    static func makeModel() -> SignInModel {
        SignInModel(
            service: FirebaseEmailLinkService(),
            signedInEmail: Auth.auth().currentUser?.email,
            languageCode: languageCode
        )
    }

    /// Reports sign-in and sign-out (including a revoked session) to `model` for the app's
    /// lifetime.
    static func observe(_ model: SignInModel) -> AuthStateDidChangeListenerHandle {
        Auth.auth().addStateDidChangeListener { _, user in
            model.authStateChanged(email: user?.email)
        }
    }
}
