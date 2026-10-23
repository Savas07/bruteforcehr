import XCTest

/// The update gate in design mode (Debug builds, `-BFHRUpdate available|required`):
/// XCUITest's `performAccessibilityAudit()` on the "Update available" banner (over Today) and the
/// blocking "Update required" screen, at the default text size and at the largest accessibility
/// size, in English, Turkish and German, plus the behavior both surfaces promise (the banner
/// closes, the blocking screen doesn't).
///
/// The banner audit only judges the banner's own elements: Today underneath has its own audit
/// (TodayAccessibilityAuditTests), and its rows behind the banner stay in the accessibility tree,
/// so the screenshot-based checks would measure them against the banner's pixels. On the blocking
/// screen, pages after a scroll skip the screenshot-based checks (contrast, Dynamic Type,
/// clipping): XCUITest keeps the pre-scroll frames of the scroll view's texts, so those checks would
/// measure the wrong pixels (the same limitation as TodayAccessibilityAuditTests); the scrolled
/// pages are saved for review with `BFHR_CAPTURE_DIR`. Issues without an element are logged for
/// review instead of failing (foundation-ios.md, "Accessibility audits").
final class UpdateGateAccessibilityAuditTests: XCTestCase {
    private let axSize = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    override func setUp() {
        continueAfterFailure = true
    }

    private func language(_ code: String) -> [String] {
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        return ["-AppleLanguages", "(\(code))", "-AppleLocale", locale]
    }

    @MainActor
    private func launch(_ state: String, language code: String = "en", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += language(code) + ["-BFHRScreen", "today", "-BFHRDesign", "populated", "-BFHRUpdate", state] + extra
        app.launch()
        return app
    }

    @MainActor
    private func banner(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)["update.banner"]
    }

    @MainActor
    private func gate(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)["update.required"]
    }

    /// Fails on every issue of an element in `scope` (labels of the elements to judge; the whole
    /// screen when nil); system bars and element-less issues are logged.
    @MainActor
    private func audit(
        _ app: XCUIApplication, _ context: String, language: String = "en", scope: Set<String>?, scrolled: Bool = false
    ) throws {
        // Past the banner's fade-in and the cover's slide-up.
        Thread.sleep(forTimeInterval: 1.2)
        if let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] {
            let name = "update-gate-audit-\(context.replacingOccurrences(of: " ", with: "-")).png"
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
        }
        try app.performAccessibilityAudit { issue in
            guard let element = issue.element else {
                XCTContext.runActivity(named: "IGNORED (no element) \(context): \(issue.compactDescription)") { _ in }
                return true
            }
            if [.tabBar, .statusBar, .navigationBar].contains(element.elementType) { return true }
            // Partly scrolled out of view: the screenshot-based checks (clipping, contrast) can't
            // judge it here; the scrolled pass audits the rest of the page.
            if !app.frame.contains(element.frame) {
                XCTContext.runActivity(named: "IGNORED (partly off screen) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            if let scope, !scope.contains(element.label) {
                XCTContext.runActivity(named: "IGNORED (not the banner) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            // Known false positive, logged: in German the audit predicts "Text … may be clipped at
            // larger Dynamic Type sizes" for the blocking screen's texts, including a one-line
            // footnote, while the same layout passes in English and Turkish (also with the German
            // locale) and the German captures at the default size and AX5 show every line in full
            // on both devices (accessibility.md, "Known false positive").
            if language == "de", issue.auditType == .textClipped, scope == nil {
                XCTContext.runActivity(named: "IGNORED (known false positive, German clipping prediction) \(context): \(element.label)") { _ in }
                return true
            }
            if scrolled, [.contrast, .dynamicType, .textClipped].contains(issue.auditType) {
                XCTContext.runActivity(named: "IGNORED (visual check after scroll) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    // MARK: Banner

    @MainActor
    private func auditBanner(language code: String, extra: [String] = [], context: String) throws {
        let app = launch("available", language: code, extra: extra)
        let banner = banner(app)
        XCTAssertTrue(banner.waitForExistence(timeout: 20), context)
        let labels = Set(banner.descendants(matching: .any).allElementsBoundByIndex.map(\.label).filter { !$0.isEmpty })
        XCTAssertFalse(labels.isEmpty, context)
        try audit(app, context, language: code, scope: labels)
    }

    @MainActor
    func testBannerDefaultSize() throws {
        try auditBanner(language: "en", context: "banner")
    }

    @MainActor
    func testBannerAccessibilitySize() throws {
        try auditBanner(language: "en", extra: axSize, context: "banner AX")
    }

    @MainActor
    func testBannerTurkishAndGerman() throws {
        try auditBanner(language: "tr", context: "banner tr")
        try auditBanner(language: "tr", extra: axSize, context: "banner tr AX")
        try auditBanner(language: "de", context: "banner de")
        try auditBanner(language: "de", extra: axSize, context: "banner de AX")
    }

    @MainActor
    func testBannerNamesTheVersionAndCloses() throws {
        let app = launch("available")
        let banner = banner(app)
        XCTAssertTrue(banner.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Update available"].exists)
        XCTAssertTrue(app.staticTexts["Version 0.2.0 is ready in TestFlight."].exists)
        XCTAssertTrue(app.buttons["Open TestFlight"].isHittable)
        // Today stays usable under the banner.
        XCTAssertTrue(app.tabBars.buttons["Jobs"].isHittable)
        app.buttons["Close"].firstMatch.tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: banner)
        XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 5), .completed)
        // The banner is app-wide: not on another tab either once closed.
        app.tabBars.buttons["Jobs"].tap()
        XCTAssertFalse(banner.exists)
    }

    @MainActor
    func testBannerOnEveryTab() throws {
        let app = launch("available")
        XCTAssertTrue(banner(app).waitForExistence(timeout: 20))
        for tab in ["Jobs", "Tracker", "CVs", "Mail"] {
            app.tabBars.buttons[tab].tap()
            XCTAssertTrue(banner(app).waitForExistence(timeout: 5), tab)
        }
    }

    // MARK: Blocking screen

    /// Audits the top of the blocking screen, then, at accessibility sizes where it scrolls, the
    /// following pages down to the buttons.
    @MainActor
    private func auditGate(language code: String, extra: [String] = [], context: String) throws {
        let app = launch("required", language: code, extra: extra)
        XCTAssertTrue(gate(app).waitForExistence(timeout: 20), context)
        try audit(app, context, language: code, scope: nil)
        guard extra == axSize else { return }
        for page in 1...3 {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
            try audit(app, "\(context) page \(page)", language: code, scope: nil, scrolled: true)
        }
        // Both actions are in the accessibility tree (VoiceOver reaches them by swiping).
        let help = ["en": "Get help", "tr": "Yardım", "de": "Hilfe"][code] ?? "Get help"
        XCTAssertTrue(app.buttons[help].exists, "\(context): \(help)")
    }

    @MainActor
    func testRequiredDefaultSize() throws {
        try auditGate(language: "en", context: "required")
    }

    @MainActor
    func testRequiredAccessibilitySize() throws {
        try auditGate(language: "en", extra: axSize, context: "required AX")
    }

    @MainActor
    func testRequiredTurkishAndGerman() throws {
        try auditGate(language: "tr", context: "required tr")
        try auditGate(language: "tr", extra: axSize, context: "required tr AX")
        try auditGate(language: "de", context: "required de")
        try auditGate(language: "de", extra: axSize, context: "required de AX")
    }

    @MainActor
    func testRequiredBlocksTheApp() throws {
        let app = launch("required")
        let gate = gate(app)
        XCTAssertTrue(gate.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Update required"].exists)
        XCTAssertTrue(app.staticTexts["Installed: 0.1.0 · Required: 0.3.0 or later"].exists)
        XCTAssertTrue(app.buttons["Open TestFlight"].isHittable)
        XCTAssertTrue(app.buttons["Get help"].isHittable)
        // Nothing behind it is reachable, and a swipe down doesn't dismiss it.
        XCTAssertFalse(app.tabBars.buttons["Jobs"].isHittable)
        app.swipeDown(velocity: .fast)
        Thread.sleep(forTimeInterval: 1.0)
        XCTAssertTrue(gate.exists)
        XCTAssertFalse(app.descendants(matching: .any)["update.banner"].exists)
    }

    // MARK: Critique captures

    /// Not a check: with `BFHR_CAPTURE_DIR` / `BFHR_CAPTURE_SUFFIX` (as `TEST_RUNNER_` variables)
    /// saves the banner and the blocking screen in Turkish and German for the copy critique.
    @MainActor
    func testCaptureTranslations() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let directory = environment["BFHR_CAPTURE_DIR"], let suffix = environment["BFHR_CAPTURE_SUFFIX"] else {
            throw XCTSkip("Runs only with BFHR_CAPTURE_DIR")
        }
        let ax = suffix.hasSuffix("-ax")
        for code in ["tr", "de"] {
            for state in ["available", "required"] {
                let app = launch(state, language: code, extra: ax ? axSize : [])
                XCTAssertTrue((state == "available" ? banner(app) : gate(app)).waitForExistence(timeout: 20))
                Thread.sleep(forTimeInterval: 1.5)
                let file = URL(fileURLWithPath: directory).appendingPathComponent("update-gate-\(state)-\(suffix)-\(code).png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
                app.terminate()
            }
        }
    }
}
