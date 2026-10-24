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
        "finish-existing", "finish-failed", "finish-nothing",
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
    private func audit(_ app: XCUIApplication, _ context: String, language: String, scrolled: Bool, ax: Bool) throws {
        Thread.sleep(forTimeInterval: 0.8)
        // The sticky bottom bar (Continue / Start searching) on its material.
        let bottomBar = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier IN %@", ["onboarding.continue", "onboarding.finish"])
        ).firstMatch
        let barTop = bottomBar.exists ? bottomBar.frame.minY - 12 : .greatestFiniteMagnitude
        let navigationBars = app.navigationBars.allElementsBoundByIndex.filter(\.exists).map(\.frame)
        // "Audit failed to complete in time" (-56) on long AX pages while the simulator is busy:
        // retry up to twice after letting it settle (JobDetailAccessibilityAuditTests policy).
        for attempt in 0..<3 {
            do {
                try runAudit(app, context, language: language, scrolled: scrolled, ax: ax, barTop: barTop, navigationBars: navigationBars)
                return
            } catch let error as NSError where error.code == -56 && attempt < 2 {
                // A hung audit is usually stuck on one cell mid-layout: settle, and on the second
                // retry move the viewport a little (pages overlap, so nothing is skipped).
                Thread.sleep(forTimeInterval: 2)
                if attempt == 1 {
                    let window = app.windows.firstMatch
                    window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
                        .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)),
                               withVelocity: .slow, thenHoldForDuration: 0.3)
                }
            }
        }
    }

    @MainActor
    private func runAudit(
        _ app: XCUIApplication, _ context: String, language: String, scrolled: Bool, ax: Bool, barTop: CGFloat, navigationBars: [CGRect]
    ) throws {
        let keyboard = app.keyboards.firstMatch
        try app.performAccessibilityAudit { issue in
            guard let live = issue.element else {
                XCTContext.runActivity(named: "IGNORED (no element) \(context): \(issue.compactDescription)") { _ in }
                return true
            }
            // Read once: the element can change while the audit runs (a list cell recycled, the
            // busy button's spinner); a snapshot throws instead of failing the test.
            guard let element = try? live.snapshot() else {
                XCTContext.runActivity(named: "IGNORED (element gone) \(context): \(issue.compactDescription)") { _ in }
                return true
            }
            if [.statusBar, .keyboard, .key].contains(element.elementType) { return true }
            if keyboard.exists, keyboard.frame.intersects(element.frame) { return true }
            if !app.frame.contains(element.frame) {
                XCTContext.runActivity(named: "IGNORED (partly off screen) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            // Same policy as TrackerBoardAccessibilityAuditTests / ShareSheetAccessibilityAuditTests:
            // the system navigation bar's items are capped by iOS by design; a Dynamic Type report
            // or a clipping prediction at the default size is measured by the AX5 run of the state.
            if navigationBars.contains(where: { $0.contains(element.frame) }) {
                XCTContext.runActivity(named: "IGNORED (system navigation bar item) \(context): \(element.label)") { _ in }
                return true
            }
            if issue.auditType == .dynamicType, !ax {
                XCTContext.runActivity(named: "IGNORED (default size; AX run covers scaling) \(context): \(element.label)") { _ in }
                return true
            }
            if issue.auditType == .textClipped, !ax, issue.detailedDescription.contains("larger Dynamic Type") {
                XCTContext.runActivity(named: "IGNORED (prediction; AX run measures it) \(context): \(element.label)") { _ in }
                return true
            }
            // Content scrolled under the bottom bar's material: contrast is measured against the blur.
            if issue.auditType == .contrast, element.frame.maxY > barTop {
                XCTContext.runActivity(named: "IGNORED (under the bottom bar) \(context): \(element.label)") { _ in }
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
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.elementType.rawValue) \(element.identifier) '\(element.label)' \(element.frame)") { _ in }
            return false
        }
    }

    /// Audits the first screen and the pages below it.
    @MainActor
    private func auditScreen(_ app: XCUIApplication, root: String, context: String, language code: String, ax: Bool) throws {
        XCTAssertTrue(element(app, root).waitForExistence(timeout: 20), context)
        try audit(app, context, language: code, scrolled: false, ax: ax)
        for page in 1...(ax ? 6 : 3) {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
            try audit(app, "\(context) page \(page)", language: code, scrolled: true, ax: ax)
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
        let germany = app.descendants(matching: .any)["prefs.market.DE"].firstMatch
        app.scrollUntilVisible(germany)
        germany.tap()
        XCTAssertTrue(germany.isOn, germany.debugDescription)
        let question = app.staticTexts["Can you work in the EU / EEA without sponsorship?"]
        app.scrollUntilVisible(question)
        XCTAssertTrue(question.exists, "an EU pick asks about the EU / EEA")
        app.buttons["onboarding.continue"].tap()

        XCTAssertTrue(element(app, "onboarding.finish.summary").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["onboarding.stepLabel"].label, "Step 3 of 3")
        // Summary rows read as one element each ("Looking for, Platform Engineer").
        let labelled = { (text: String) in app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch }
        XCTAssertTrue(labelled("Platform Engineer").exists, "Finish names the first role")
        XCTAssertTrue(labelled("Germany").exists)
        app.buttons["onboarding.back"].tap()
        XCTAssertTrue(app.textFields["prefs.roles.field"].waitForExistence(timeout: 5))
        app.buttons["onboarding.continue"].tap()
        XCTAssertTrue(app.buttons["Start searching"].waitForExistence(timeout: 5))
    }

    /// D40: with no role and no place, Finish offers Back to preferences, which goes back.
    @MainActor
    func testNothingToSearchGoesBack() throws {
        let app = launch(["-BFHROnboarding", "finish-nothing"])
        XCTAssertTrue(element(app, "onboarding").waitForExistence(timeout: 20))
        XCTAssertFalse(element(app, "onboarding.finish.summary").exists)
        XCTAssertTrue(app.buttons["Go to Today"].exists)
        app.buttons["onboarding.finish.back"].tap()
        XCTAssertTrue(app.textFields["prefs.roles.field"].waitForExistence(timeout: 5))
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
        let principal = app.descendants(matching: .any)["prefs.seniority.principal"].firstMatch
        XCTAssertTrue(principal.waitForExistence(timeout: 5))
        principal.tap()
        XCTAssertTrue(principal.isOn)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(seniority.waitForExistence(timeout: 5))
        XCTAssertTrue(seniority.label.contains("Principal"), seniority.label)
    }
}
