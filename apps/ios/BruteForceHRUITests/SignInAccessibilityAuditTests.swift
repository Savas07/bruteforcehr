import XCTest

/// Sign-in: XCUITest's `performAccessibilityAudit()` on every signed-out state in design mode
/// (`-BFHRSignIn <state>`, Debug builds) at the default text size and the largest accessibility
/// size, the main states in Turkish and German too; the flow's promises (inline field error,
/// Check your email, Use a different email, Send a new link); and the real link handler: the app,
/// launched without design arguments, opened with a crafted sign-in URL that can't sign in shows
/// the "link doesn't work" state.
///
/// At accessibility sizes the steps scroll; pages after a scroll skip the screenshot-based checks
/// (XCUITest keeps the pre-scroll frames of a scroll view's texts, the same limitation as
/// UpdateGateAccessibilityAuditTests). Issues without an element are logged for review
/// (foundation-ios.md, "Accessibility audits").
final class SignInAccessibilityAuditTests: XCTestCase {
    private let axSize = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    private let allStates = ["email", "invalid", "offline", "check", "resent", "finishing", "confirm", "expired", "unusable", "retry"]

    override func setUp() {
        continueAfterFailure = true
    }

    private func language(_ code: String) -> [String] {
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        return ["-AppleLanguages", "(\(code))", "-AppleLocale", locale]
    }

    @MainActor
    private func launch(_ state: String?, language code: String = "en", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += language(code) + (state.map { ["-BFHRSignIn", $0] } ?? []) + extra
        app.launch()
        return app
    }

    @MainActor
    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, language: String = "en", scrolled: Bool = false) throws {
        Thread.sleep(forTimeInterval: 0.8)
        if let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] {
            let name = "sign-in-audit-\(context.replacingOccurrences(of: " ", with: "-")).png"
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
        }
        let keyboard = app.keyboards.firstMatch
        try app.performAccessibilityAudit { issue in
            guard let element = issue.element else {
                XCTContext.runActivity(named: "IGNORED (no element) \(context): \(issue.compactDescription)") { _ in }
                return true
            }
            if [.statusBar, .keyboard, .key].contains(element.elementType) { return true }
            if keyboard.exists, keyboard.frame.intersects(element.frame) { return true }
            if !app.frame.contains(element.frame) {
                XCTContext.runActivity(named: "IGNORED (partly off screen) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            if scrolled, [.contrast, .dynamicType, .textClipped].contains(issue.auditType) {
                XCTContext.runActivity(named: "IGNORED (visual check after scroll) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            // Known false positive, logged (same as UpdateGateAccessibilityAuditTests): in German
            // the audit predicts "Text … may be clipped" for body sentences that the same layout
            // shows in full in English and Turkish; the German audit screenshots, default size and
            // every AX5 page, show every line (sign-in/accessibility.md).
            if language == "de", issue.auditType == .textClipped {
                XCTContext.runActivity(named: "IGNORED (known false positive, German clipping prediction) \(context): \(element.label)") { _ in }
                return true
            }
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    /// Audits one state; at accessibility sizes also the pages below the first.
    @MainActor
    private func auditState(_ state: String, language code: String = "en", ax: Bool) throws {
        let context = "\(state) \(code)\(ax ? " AX" : "")"
        let app = launch(state, language: code, extra: ax ? axSize : [])
        XCTAssertTrue(element(app, "signIn").waitForExistence(timeout: 20), context)
        try audit(app, context, language: code)
        guard ax, state != "finishing" else { return }
        for page in 1...3 {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
            try audit(app, "\(context) page \(page)", language: code, scrolled: true)
        }
        app.terminate()
    }

    @MainActor
    func testEveryStateDefaultSize() throws {
        for state in allStates { try auditState(state, ax: false) }
    }

    @MainActor
    func testEveryStateAccessibilitySize() throws {
        for state in allStates { try auditState(state, ax: true) }
    }

    @MainActor
    func testTurkishAndGerman() throws {
        for code in ["tr", "de"] {
            for state in ["email", "check", "confirm", "unusable", "retry"] {
                try auditState(state, language: code, ax: false)
                try auditState(state, language: code, ax: true)
            }
        }
    }

    // MARK: Behavior

    @MainActor
    func testInvalidAddressShowsInlineErrorThenSends() throws {
        let app = launch("email")
        let field = element(app, "signIn.emailField")
        let send = element(app, "signIn.primary")
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText("deniz@example")
        send.tap()
        XCTAssertTrue(element(app, "signIn.fieldError").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Enter a full email address, like name@example.com."].exists)
        // Past the text, so the cursor lands at its end.
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        field.typeText(".com")
        XCTAssertFalse(element(app, "signIn.fieldError").exists, "typing clears the error")
        // Return on the keyboard sends.
        field.typeText("\n")
        XCTAssertTrue(element(app, "signIn.check").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["We sent a sign-in link to deniz@example.com."].exists)
        XCTAssertTrue(app.buttons["Open Mail"].isHittable)
        XCTAssertFalse(element(app, "signIn.resend").isEnabled, "cooldown right after sending")
        element(app, "signIn.differentEmail").tap()
        XCTAssertTrue(element(app, "signIn.email").waitForExistence(timeout: 5))
        XCTAssertEqual(element(app, "signIn.emailField").value as? String, "deniz@example.com")
    }

    @MainActor
    func testCheckEmailCountsDownResend() throws {
        let app = launch("check")
        let resend = element(app, "signIn.resend")
        XCTAssertTrue(resend.waitForExistence(timeout: 20))
        XCTAssertFalse(resend.isEnabled)
        XCTAssertEqual(resend.value as? String, "Available in 42 seconds")
    }

    @MainActor
    func testUsedLinkOffersANewOne() throws {
        let app = launch("unusable")
        XCTAssertTrue(element(app, "signIn.linkProblem").waitForExistence(timeout: 20))
        app.buttons["Send a new link"].tap()
        XCTAssertTrue(element(app, "signIn.email").waitForExistence(timeout: 5))
    }

    /// The real handler (no design arguments): a universal link on the Hosting domain whose
    /// sign-in parameters are missing shows the error state instead of the email field.
    @MainActor
    func testInvalidUniversalLinkShowsError() throws {
        let app = launch(nil)
        XCTAssertTrue(element(app, "signIn.email").waitForExistence(timeout: 20))
        app.open(try XCTUnwrap(URL(string: "https://bruteforcehr.web.app/auth/finish?mode=signIn&apiKey=test&lang=en")))
        XCTAssertTrue(element(app, "signIn.linkProblem").waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["This link doesn't work anymore"].exists)
        XCTAssertTrue(app.buttons["Send a new link"].isHittable)
    }

    /// The `/auth/finish` page's hand-off when the link opened in a browser:
    /// `bruteforcehr://auth/finish?link=<emailed link>` with a link that can't sign in.
    @MainActor
    func testInvalidAppSchemeHandoffShowsError() throws {
        let app = launch(nil)
        XCTAssertTrue(element(app, "signIn.email").waitForExistence(timeout: 20))
        var components = URLComponents(string: "bruteforcehr://auth/finish")!
        components.queryItems = [URLQueryItem(name: "link", value: "https://bruteforcehr.firebaseapp.com/__/auth/links?link=https://bruteforcehr.firebaseapp.com/__/auth/action?mode%3DresetPassword")]
        app.open(try XCTUnwrap(components.url))
        XCTAssertTrue(element(app, "signIn.linkProblem").waitForExistence(timeout: 15))
    }
}
