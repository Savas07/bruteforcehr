import XCTest

/// Accessibility audit of Today in design mode (Debug builds): XCUITest's
/// `performAccessibilityAudit()` on the populated and empty datasets, at the default text size
/// and at the largest accessibility size, with the ReviewSheet open as well.
///
/// `testCaptureBelowTheFold` is not a check: run with `BFHR_CAPTURE_DIR` / `BFHR_CAPTURE_SUFFIX`
/// (as `TEST_RUNNER_` variables) it saves scrolled screenshots and the open ReviewSheet for the
/// critique, which the one-viewport captures of `capture.sh` don't show.
final class TodayAccessibilityAuditTests: XCTestCase {
    private let english = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    private let axSize = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    private func launch(_ dataset: String, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += english + ["-BFHRScreen", "today", "-BFHRDesign", dataset] + extra
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["design.today"].waitForExistence(timeout: 20))
        return app
    }

    /// Runs the audit on what's on screen. Filtered, with the reason logged in the test report:
    /// - system chrome (tab bar, status bar, navigation bar) is outside this screen;
    /// - elements that aren't fully inside the content area (between the navigation bar and the
    ///   floating tab bar, minus the 24 pt scroll-edge fade): the audit measures contrast and
    ///   clipping from a screenshot, so text under the translucent bars or off screen reports
    ///   false failures;
    /// - contrast on scrolled pages: List cells keep stale accessibility frames after a scroll, so
    ///   the audit measures the wrong pixels. Contrast is checked on the first viewport of every
    ///   state and size, and by token ratios (docs/design/critiques/ios/today/accessibility.md);
    /// - issues with no element (the audit can't say what they are; logged for review).
    /// Everything else fails the test.
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, scrolled: Bool = false) throws {
        let top = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : 0
        let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.maxY
        // iOS 26 fades content into the bars (scroll edge effect); keep a band clear of both.
        let edge: CGFloat = 24
        let content = CGRect(x: app.frame.minX, y: top + edge, width: app.frame.width, height: bottom - top - 2 * edge)
        if let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] {
            let name = "today-audit-\(context.replacingOccurrences(of: " ", with: "-")).png"
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
        }
        do {
            try runAudit(app, context, content: content, scrolled: scrolled)
        } catch let error as NSError where error.code == -56 {
            // "Audit failed to complete in time" on long AX pages: retry once.
            try runAudit(app, context, content: content, scrolled: scrolled)
        }
    }

    @MainActor
    private func runAudit(_ app: XCUIApplication, _ context: String, content: CGRect, scrolled: Bool) throws {
        try app.performAccessibilityAudit { issue in
            guard let element = issue.element else {
                XCTContext.runActivity(named: "IGNORED (no element) \(context): \(issue.compactDescription)") { _ in }
                return true
            }
            if [.tabBar, .statusBar, .navigationBar].contains(element.elementType) { return true }
            // After a scroll, SwiftUI List cells keep stale accessibility frames that point at other
            // content (verified with the audit's own screenshots), so contrast is only measured on
            // the unscrolled viewport; scrolled pages check every other audit type.
            if scrolled, issue.auditType == .contrast {
                XCTContext.runActivity(named: "IGNORED (contrast after scroll) \(context): \(element.label)") { _ in }
                return true
            }
            if !content.contains(element.frame) {
                XCTContext.runActivity(named: "IGNORED (under bars / off screen) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    @MainActor
    private func scrollAudit(_ app: XCUIApplication, _ context: String, pages: Int) throws {
        try audit(app, "\(context) top")
        for page in 1...pages {
            scrollOnePage(app)
            try audit(app, "\(context) page \(page)", scrolled: true)
        }
    }

    /// Drags up by most of a screen and holds at the end, so the list stops without momentum
    /// (the audit's contrast check reads a screenshot; moving text reports false failures). The
    /// short initial press stays below the context-menu long press.
    @MainActor
    private func scrollOnePage(_ app: XCUIApplication) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22))
        start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
        Thread.sleep(forTimeInterval: 1.0)
    }

    @MainActor
    func testPopulatedDefaultSize() throws {
        let app = launch("populated")
        try scrollAudit(app, "populated", pages: 5)
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        let app = launch("populated", extra: axSize)
        try scrollAudit(app, "populated AX", pages: 10)
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        let app = launch("empty")
        try audit(app, "empty")
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        let app = launch("empty", extra: axSize)
        try scrollAudit(app, "empty AX", pages: 1)
    }

    @MainActor
    func testReviewSheet() throws {
        let app = launch("populated")
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Looks like'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
        XCTAssertTrue(app.buttons["Confirm"].waitForExistence(timeout: 5))
        try audit(app, "review sheet")
    }

    // MARK: Critique captures

    @MainActor
    func testCaptureBelowTheFold() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let directory = environment["BFHR_CAPTURE_DIR"], let suffix = environment["BFHR_CAPTURE_SUFFIX"] else {
            throw XCTSkip("Runs only with BFHR_CAPTURE_DIR")
        }
        let out = URL(fileURLWithPath: directory)
        let ax = suffix.hasSuffix("-ax")
        let app = launch("populated", extra: ax ? axSize : [])
        Thread.sleep(forTimeInterval: 1.5)
        for page in 1...(ax ? 8 : 3) {
            app.swipeUp()
            Thread.sleep(forTimeInterval: 0.8)
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: out.appendingPathComponent("today-populated-scroll\(page)-\(suffix).png"))
        }
        app.terminate()

        let sheetApp = launch("populated", extra: ax ? axSize : [])
        let row = sheetApp.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Looks like'")).firstMatch
        if row.waitForExistence(timeout: 5) {
            row.tap()
            Thread.sleep(forTimeInterval: 1.2)
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: out.appendingPathComponent("today-review-sheet-\(suffix).png"))
        }
        sheetApp.terminate()
    }
}
