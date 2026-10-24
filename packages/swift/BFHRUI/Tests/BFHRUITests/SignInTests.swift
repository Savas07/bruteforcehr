import Foundation
import Testing
@testable import BFHRUI

/// The link Firebase emails (shape verified against the live API, ADR 0003): the inner action URL's
/// query is percent-encoded inside `link=`, the inner URL itself isn't.
private nonisolated let action = "https://bruteforcehr.firebaseapp.com/__/auth/action?apiKey=KEY&mode=signIn&oobCode=CODE&continueUrl=https://bruteforcehr.web.app/auth/finish&lang=en"
private nonisolated let emailed = "https://bruteforcehr.firebaseapp.com/__/auth/links?link=https://bruteforcehr.firebaseapp.com/__/auth/action?apiKey%3DKEY%26mode%3DsignIn%26oobCode%3DCODE%26continueUrl%3Dhttps://bruteforcehr.web.app/auth/finish%26lang%3Den"

@Suite("Sign-in links")
struct SignInLinkTests {
    private func parse(_ string: String) -> SignInLink? {
        SignInLink(url: URL(string: string)!)
    }

    @Test("Unwraps the emailed Hosting link to Firebase's action URL")
    func emailedLink() {
        #expect(parse(emailed) == .signIn(actionLink: action))
    }

    @Test("Accepts the action URL, the continue URL and the app-scheme handoff", arguments: [
        action,
        "https://bruteforcehr.web.app/auth/finish?apiKey=KEY&oobCode=CODE&mode=signIn&lang=de",
        "https://bruteforcehr.web.app/auth/finish/?apiKey=KEY&oobCode=CODE&mode=signIn",
        "https://BruteForceHR.web.app/__/auth/action?mode=signIn&oobCode=CODE",
    ])
    func directLinks(link: String) {
        guard case .signIn(let actionLink) = parse(link) else {
            Issue.record("not a sign-in link: \(link)")
            return
        }
        #expect(actionLink == link)
    }

    @Test("The desktop page's handoff carries the emailed link, encoded once more")
    func appSchemeHandoff() throws {
        var components = URLComponents(string: "bruteforcehr://auth/finish")!
        components.queryItems = [URLQueryItem(name: "link", value: emailed)]
        let url = try #require(components.url)
        #expect(SignInLink(url: url) == .signIn(actionLink: action))
        let continueURL = "https://bruteforcehr.web.app/auth/finish?apiKey=KEY&oobCode=CODE&mode=signIn&lang=tr"
        components.queryItems = [URLQueryItem(name: "link", value: continueURL)]
        #expect(SignInLink(url: try #require(components.url)) == .signIn(actionLink: continueURL))
    }

    @Test("Auth paths that can't sign in are unusable", arguments: [
        "https://bruteforcehr.web.app/auth/finish?mode=signIn",
        "https://bruteforcehr.web.app/auth/finish",
        "https://bruteforcehr.web.app/auth/finish?mode=resetPassword&oobCode=CODE",
        "https://bruteforcehr.web.app/auth/finish?mode=signIn&oobCode=",
        "https://bruteforcehr.firebaseapp.com/__/auth/links?link=https://evil.example/__/auth/action?mode%3DsignIn%26oobCode%3DX",
        "https://bruteforcehr.firebaseapp.com/__/auth/links?link=not%20a%20url",
        "bruteforcehr://auth/finish",
        "bruteforcehr://auth/finish?link=https://bruteforcehr.web.app/auth/finish",
    ])
    func unusable(link: String) {
        #expect(parse(link) == .unusable)
    }

    @Test("Other URLs are left to other handlers", arguments: [
        "bruteforcehr://mail",
        "bruteforcehr://auth/other",
        "https://bruteforcehr.web.app/",
        "https://bruteforcehr.web.app/connect/google/callback?code=x",
        "http://bruteforcehr.web.app/auth/finish?mode=signIn&oobCode=CODE",
        "https://example.com/auth/finish?mode=signIn&oobCode=CODE",
        "https://bruteforcehr.web.app.example.com/auth/finish?mode=signIn&oobCode=CODE",
    ])
    func notSignIn(link: String) {
        #expect(parse(link) == nil)
    }

    @Test("Stops unwrapping after three levels")
    func depthLimit() throws {
        var link = action
        for _ in 0..<5 {
            var components = URLComponents(string: "https://bruteforcehr.web.app/auth/finish")!
            components.queryItems = [URLQueryItem(name: "link", value: link)]
            link = try #require(components.url).absoluteString
        }
        #expect(parse(link) == .unusable)
    }
}

@Suite("Email addresses")
struct EmailAddressTests {
    @Test("Accepts and trims addresses", arguments: [
        ("deniz@example.com", "deniz@example.com"),
        ("  Deniz.Aksoy+jobs@mail.example.co.uk \n", "Deniz.Aksoy+jobs@mail.example.co.uk"),
        ("a@b.de", "a@b.de"),
    ])
    func accepts(input: String, expected: String) {
        #expect(EmailAddress.normalized(input) == expected)
    }

    @Test("Rejects what can't be an address", arguments: [
        "", "deniz", "deniz@", "@example.com", "deniz@example", "deniz@example.c", "deniz@@example.com",
        "de niz@example.com", "deniz@.example.com", "deniz@example..com", "deniz@example.com.",
    ])
    func rejects(input: String) {
        #expect(EmailAddress.normalized(input) == nil)
    }
}

/// Records calls and answers with scripted results (test double; production uses FirebaseAuth).
final class FakeEmailLinkService: EmailLinkAuthService {
    var sendResult: SignInError?
    var signInResults: [SignInError?] = []
    var linkShapeValid = true
    private(set) var sent: [(email: String, language: String)] = []
    private(set) var signIns: [(email: String, link: String)] = []
    private(set) var signOuts = 0

    func sendSignInLink(to email: String, languageCode: String) async throws {
        sent.append((email, languageCode))
        if let sendResult { throw sendResult }
    }

    func isSignInLink(_ actionLink: String) -> Bool { linkShapeValid }

    func signIn(email: String, actionLink: String) async throws {
        signIns.append((email, actionLink))
        if !signInResults.isEmpty, let error = signInResults.removeFirst() { throw error }
    }

    func signOut() throws { signOuts += 1 }
}

@Suite("Sign-in model")
struct SignInModelTests {
    final class Clock {
        var date = Date(timeIntervalSince1970: 1_792_654_200)
    }

    let service = FakeEmailLinkService()
    let store = SignInStore(defaults: nil)
    let clock = Clock()

    private func model(signedIn: String? = nil) -> SignInModel {
        let clock = clock
        return SignInModel(service: service, store: store, signedInEmail: signedIn, languageCode: "tr") { clock.date }
    }

    private var emailedURL: URL { URL(string: emailed)! }

    @Test("Sending a link remembers the address and shows Check your email")
    func send() async {
        let model = model()
        model.emailDraft = "  deniz@example.com "
        await model.sendLink()
        #expect(service.sent.map(\.email) == ["deniz@example.com"])
        #expect(service.sent.first?.language == "tr")
        #expect(model.step == .checkEmail(address: "deniz@example.com"))
        #expect(store.pendingEmail == "deniz@example.com")
        #expect(store.sentAt == clock.date)
        #expect(!model.isSending)
    }

    @Test("A malformed address stays on the field with an error and sends nothing")
    func invalidFormat() async {
        let model = model()
        model.emailDraft = "deniz@example"
        await model.sendLink()
        #expect(service.sent.isEmpty)
        #expect(model.step == .enterEmail)
        #expect(model.fieldError == .invalidFormat)
        model.emailDraft = "deniz@example."
        #expect(model.fieldError == nil, "typing clears the error")
    }

    @Test("Send failures map to the alert or the field", arguments: [
        (SignInError.offline, SignInModel.SendError?.some(.offline), SignInModel.FieldError?.none),
        (.tooManyRequests, .some(.tooManyRequests), nil),
        (.other, .some(.other), nil),
        (.invalidEmail, nil, .some(.rejected)),
    ])
    func sendFailures(error: SignInError, alert: SignInModel.SendError?, field: SignInModel.FieldError?) async {
        service.sendResult = error
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        #expect(model.step == .enterEmail)
        #expect(model.sendError == alert)
        #expect(model.fieldError == field)
        #expect(store.pendingEmail == nil)
    }

    @Test("Resend waits for the cooldown, then sends again")
    func resendCooldown() async {
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        clock.date += 20
        #expect(model.resendAvailableAt(clock.date) == clock.date.addingTimeInterval(40))
        await model.resendLink()
        #expect(service.sent.count == 1)
        #expect(!model.didResend)
        clock.date += 40
        #expect(model.resendAvailableAt(clock.date) == nil)
        await model.resendLink()
        #expect(service.sent.count == 2)
        #expect(model.didResend)
        #expect(model.resendAvailableAt(clock.date) != nil, "a resend restarts the cooldown")
    }

    @Test("The cooldown and the pending address survive a relaunch")
    func relaunch() async {
        let first = model()
        first.emailDraft = "deniz@example.com"
        await first.sendLink()
        clock.date += 10
        let second = model()
        #expect(second.step == .checkEmail(address: "deniz@example.com"))
        #expect(second.resendAvailableAt(clock.date) != nil)
    }

    @Test("A link opened on the device that asked signs in with the remembered address")
    func sameDevice() async {
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        await model.open(emailedURL)
        #expect(service.signIns.count == 1)
        #expect(service.signIns.first?.email == "deniz@example.com")
        #expect(service.signIns.first?.link == action)
        #expect(model.signedInEmail == "deniz@example.com")
        #expect(store.pendingEmail == nil)
        #expect(store.sentAt == nil)
        #expect(store.lastEmail == "deniz@example.com")
    }

    @Test("A link from another device asks for the address, then signs in")
    func otherDevice() async {
        let model = model()
        await model.open(emailedURL)
        #expect(model.step == .confirmEmail(actionLink: action))
        #expect(service.signIns.isEmpty)
        model.emailDraft = "deniz@example.com"
        await model.confirmEmail()
        #expect(service.signIns.first?.email == "deniz@example.com")
        #expect(model.isSignedIn)
    }

    @Test("A wrong address on the confirm step says the link went elsewhere")
    func confirmMismatch() async {
        service.signInResults = [.invalidEmail]
        let model = model()
        await model.open(emailedURL)
        model.emailDraft = "other@example.com"
        await model.confirmEmail()
        #expect(model.step == .confirmEmail(actionLink: action))
        #expect(model.fieldError == .mismatch)
        #expect(model.emailDraft == "other@example.com")
        #expect(!model.isSignedIn)
    }

    @Test("A remembered address that doesn't match the link asks for the right one")
    func pendingMismatch() async {
        service.signInResults = [.invalidEmail]
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        await model.open(emailedURL)
        #expect(model.step == .confirmEmail(actionLink: action))
        #expect(model.fieldError == nil)
        #expect(store.pendingEmail == nil)
    }

    @Test("Link failures show their state", arguments: [
        (SignInError.expired, SignInModel.LinkFailure.expired),
        (.unusable, .unusable),
        (.accountDisabled, .accountDisabled),
        (.inviteOnly, .inviteOnly),
        (.offline, .retryable(offline: true, email: "deniz@example.com", actionLink: action)),
        (.other, .retryable(offline: false, email: "deniz@example.com", actionLink: action)),
    ])
    func linkFailures(error: SignInError, failure: SignInModel.LinkFailure) async {
        service.signInResults = [error]
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        await model.open(emailedURL)
        #expect(model.step == .linkFailed(failure))
        #expect(!model.isSignedIn)
    }

    @Test("Try again reuses the same link and address")
    func retry() async {
        service.signInResults = [.offline, nil]
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        await model.open(emailedURL)
        await model.retry()
        #expect(service.signIns.count == 2)
        #expect(service.signIns.last?.link == action)
        #expect(model.isSignedIn)
    }

    @Test("A broken link shows the unusable state without calling Firebase")
    func brokenLink() async {
        let model = model()
        await model.open(URL(string: "https://bruteforcehr.web.app/auth/finish?mode=signIn")!)
        #expect(model.step == .linkFailed(.unusable))
        service.linkShapeValid = false
        let other = self.model()
        await other.open(emailedURL)
        #expect(other.step == .linkFailed(.unusable))
        #expect(service.signIns.isEmpty)
    }

    @Test("Send a new link goes back to the field with the last address")
    func startOver() async {
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        service.signInResults = [.expired]
        await model.open(emailedURL)
        model.emailDraft = ""
        model.startOver()
        #expect(model.step == .enterEmail)
        #expect(model.emailDraft == "deniz@example.com")
        #expect(store.pendingEmail == nil)
        #expect(model.resendAvailableAt(clock.date) == nil)
    }

    @Test("Use a different email forgets the pending address")
    func differentEmail() async {
        let model = model()
        model.emailDraft = "deniz@example.com"
        await model.sendLink()
        model.useDifferentEmail()
        #expect(model.step == .enterEmail)
        #expect(model.emailDraft == "deniz@example.com")
        #expect(store.pendingEmail == nil)
        await model.open(emailedURL)
        #expect(model.step == .confirmEmail(actionLink: action), "an older link now asks for the address")
    }

    @Test("Signed in, sign-in links are ignored")
    func signedInIgnoresLinks() async {
        let model = model(signedIn: "deniz@example.com")
        await model.open(emailedURL)
        #expect(service.signIns.isEmpty)
        #expect(model.signedInEmail == "deniz@example.com")
        #expect(SignInModel.handles(emailedURL))
        #expect(!SignInModel.handles(URL(string: "bruteforcehr://mail")!))
    }

    @Test("Sign out returns to the field with the last address")
    func signOut() async throws {
        let model = model()
        model.authStateChanged(email: "deniz@example.com")
        #expect(model.isSignedIn)
        #expect(store.lastEmail == "deniz@example.com")
        try model.signOut()
        #expect(service.signOuts == 1)
        #expect(!model.isSignedIn)
        #expect(model.step == .enterEmail)
        #expect(model.emailDraft == "deniz@example.com")
    }

    @Test("Signed out elsewhere (token revoked) shows the field")
    func signedOutElsewhere() {
        let model = model(signedIn: "deniz@example.com")
        model.authStateChanged(email: nil)
        #expect(!model.isSignedIn)
        #expect(model.step == .enterEmail)
    }
}
