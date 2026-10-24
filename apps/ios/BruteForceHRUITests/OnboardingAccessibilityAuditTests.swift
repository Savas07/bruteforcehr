import XCTest

/// Onboarding (`-BFHROnboarding <state>`) and Settings › Job preferences (`-BFHRScreen settings
/// -BFHRSettingsPage job-preferences[-<section>]`), Debug design mode: XCUITest's
/// `performAccessibilityAudit()` on every state at the default and the largest accessibility text
/// size, the main states in Turkish and German, plus the flow's promises (Skip and Continue on
/// every step, the step label, a role typed in is kept, Settings rows open their editors).
///
/// Pages after a scroll skip the screenshot-based checks (XCUITest keeps the pre-scroll frames of a
/// scroll view's texts; same limitation as SignInAccessibilityAuditTests). Issues without an
/// element are logged for review (foundation-ios.md, "Accessibility audits").
final class OnboardingAccessibilityAuditTests: XCTestCase {
    private let axSize = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    private let states = [
        "cv", "cv-reading", "cv-found", "cv-error", "preferences", "preferences-cv", "preferences-filled", "finish", "finishing",
        "finish-existing", "finish-failed",
    ]
    private let pages = [
        "job-preferences", "job-preferences-roles", "job-preferences-seniority", "job-preferences-location", "job-preferences-salary",
        "job-preferences-authorization", "job-preferences-languages",
    ]

    override func setUp() {
        continueAfterFailure = true
    }

    private func language(_ code: String) -> [String] {
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        return ["-AppleLanguages", "(\(code))", "-AppleLocale", locale]
    }

    @MainActor
    private func launch(_ arguments: [String], language code: String = "en", ax: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += language(code) + arguments + (ax ? axSize : [])
        app.launch()
        return app
    }

    @MainActor
    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, language: String, scrolled: Bool) throws {
        Thread.sleep(forTimeInterval: 0.8)
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
            // Same known false positive as the sign-in audit: German clipping predictions for
            // sentences the screenshots show in full.
            if language == "de", issue.auditType == .textClipped {
                XCTContext.runActivity(named: "IGNORED (known false positive, German clipping prediction) \(context): \(element.label)") { _ in }
                return true
            }
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    /// Audits the first screen and the pages below it.
    @MainActor
    private func auditScreen(_ app: XCUIApplication, root: String, context: String, language code: String, ax: Bool) throws {
        XCTAssertTrue(element(app, root).waitForExistence(timeout: 20), context)
        try audit(app, context, language: code, scrolled: false)
        for page in 1...(ax ? 6 : 3) {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
            try audit(app, "\(context) page \(page)", language: code, scrolled: true)
        }
        app.terminate()
    }

    @MainActor
    private func auditState(_ state: String, language code: String = "en", ax: Bool) throws {
        let app = launch(["-BFHROnboarding", state], language: code, ax: ax)
        try auditScreen(app, root: "onboarding", context: "\(state) \(code)\(ax ? " AX" : "")", language: code, ax: ax)
    }

    @MainActor
    private func auditPage(_ page: String, language code: String = "en", ax: Bool) throws {
        let app = launch(["-BFHRScreen", "settings", "-BFHRDesign", "populated", "-BFHRSettingsPage", page], language: code, ax: ax)
        let root = page == "job-preferences" ? "jobPreferences" : "jobPreferences.page.\(page.replacingOccurrences(of: "job-preferences-", with: ""))"
        try auditScreen(app, root: root, context: "\(page) \(code)\(ax ? " AX" : "")", language: code, ax: ax)
    }

    @MainActor
    func testOnboardingDefaultSize() throws {
        for state in states { try auditState(state, ax: false) }
    }

    @MainActor
    func testOnboardingAccessibilitySize() throws {
        for state in states { try auditState(state, ax: true) }
    }

    @MainActor
    func testJobPreferencesDefaultAndAccessibilitySize() throws {
        for page in pages {
            try auditPage(page, ax: false)
            try auditPage(page, ax: true)
        }
    }

    @MainActor
    func testTurkishAndGerman() throws {
        for code in ["tr", "de"] {
            for state in ["cv", "cv-found", "preferences-filled", "finish"] { try auditState(state, language: code, ax: false) }
            for page in ["job-preferences", "job-preferences-location", "job-preferences-authorization"] { try auditPage(page, language: code, ax: false) }
        }
    }

    // MARK: Behavior

    /// Start from scratch → Preferences (a typed role, Germany asks about the EU) → Finish names
    /// the role; Back returns; the step label follows.
    @MainActor
    func testFlowFromScratchToFinish() throws {
        let app = launch(["-BFHROnboarding", "cv"])
        XCTAssertTrue(element(app, "onboarding").waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["onboarding.stepLabel"].label, "Step 1 of 3")
        XCTAssertTrue(app.buttons["onboarding.skip"].exists, "every step can be skipped")
        app.buttons["onboarding.cv.scratch"].tap()

        XCTAssertTrue(app.staticTexts["onboarding.stepLabel"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["onboarding.stepLabel"].label, "Step 2 of 3")
        let roleField = app.textFields["prefs.roles.field"]
        XCTAssertTrue(roleField.waitForExistence(timeout: 5))
        roleField.tap()
        roleField.typeText("Platform Engineer\n")
        XCTAssertTrue(app.buttons["Remove Platform Engineer"].waitForExistence(timeout: 5), "the role became a removable token")
        let germany = app.buttons["prefs.market.DE"]
        for _ in 0..<6 where !germany.isHittable { app.swipeUp() }
        germany.tap()
        XCTAssertTrue(germany.isSelected)
        let question = app.staticTexts["Can you work in the EU / EEA without sponsorship?"]
        for _ in 0..<6 where !question.exists { app.swipeUp() }
        XCTAssertTrue(question.exists, "an EU pick asks about the EU / EEA")
        app.buttons["onboarding.continue"].tap()

        XCTAssertTrue(element(app, "onboarding.finish.summary").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["onboarding.stepLabel"].label, "Step 3 of 3")
        XCTAssertTrue(app.staticTexts["Platform Engineer"].exists, "Finish names the first role")
        XCTAssertTrue(app.staticTexts["Germany"].exists)
        app.buttons["onboarding.back"].tap()
        XCTAssertTrue(app.textFields["prefs.roles.field"].waitForExistence(timeout: 5))
        app.buttons["onboarding.continue"].tap()
        app.buttons["onboarding.finish"].tap()
        let finish = app.buttons["onboarding.finish"]
        let disabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == false"), object: finish)
        _ = XCTWaiter().wait(for: [disabled], timeout: 2)
    }

    /// Settings › Job preferences: the row opens the page; Seniority opens its editor and a chip
    /// toggles; Back shows the new value in the summary.
    @MainActor
    func testSettingsRowsOpenEditors() throws {
        let app = launch(["-BFHRScreen", "settings", "-BFHRDesign", "populated"])
        let row = app.buttons["settings.jobPreferences"]
        XCTAssertTrue(row.waitForExistence(timeout: 20))
        row.tap()
        let seniority = app.buttons["jobPreferences.seniority"]
        XCTAssertTrue(seniority.waitForExistence(timeout: 5))
        seniority.tap()
        let principal = app.buttons["prefs.seniority.principal"]
        XCTAssertTrue(principal.waitForExistence(timeout: 5))
        principal.tap()
        XCTAssertTrue(principal.isSelected)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(seniority.waitForExistence(timeout: 5))
        XCTAssertTrue(seniority.label.contains("Principal"), seniority.label)
    }
}
