import XCTest

/// Accessibility audit of the Mail tab in design mode (Debug builds): populated and empty data,
/// at the default text size and at the largest accessibility size. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/MailReviewAccessibilityAuditTests`.
final class MailReviewAccessibilityAuditTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testPopulatedDefaultSize() throws {
        try audit(dataset: "populated", contentSize: nil)
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        try audit(dataset: "populated", contentSize: "UICTContentSizeCategoryAccessibilityXXXL")
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        try audit(dataset: "empty", contentSize: nil)
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        try audit(dataset: "empty", contentSize: "UICTContentSizeCategoryAccessibilityXXXL")
    }

    /// The review sheet (populated, default size): proposal, evidence, fields and actions.
    @MainActor
    func testReviewSheet() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Lena Vogel")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        XCTAssertTrue(app.buttons["Confirm"].waitForExistence(timeout: 10))
        try app.performAccessibilityAudit()
    }

    /// Not an audit: saves the screens behind interactions (Updates, All job mail, the review sheet,
    /// Change…) for the design critique. Runs only with `TEST_RUNNER_BFHR_MAIL_SHOTS=<dir>`.
    @MainActor
    func testCaptureInteractionScreens() throws {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_MAIL_SHOTS"] else {
            throw XCTSkip("Critique screenshots only")
        }
        let ax = ProcessInfo.processInfo.environment["BFHR_MAIL_SHOTS_AX"] != nil
        let app = launch(dataset: "populated", contentSize: ax ? "UICTContentSizeCategoryAccessibilityXXXL" : nil)
        func shot(_ name: String) throws {
            Thread.sleep(forTimeInterval: 0.8)
            let file = URL(fileURLWithPath: directory).appendingPathComponent("\(name)\(ax ? "-ax" : "").png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
        }
        app.swipeUp()
        try shot("queue-scrolled")
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Lena Vogel")).firstMatch
        if !row.waitForExistence(timeout: 5) { print(app.debugDescription) }
        row.tap()
        try shot("sheet-medium")
        app.buttons["Change…"].firstMatch.tap()
        try shot("sheet-change")
        app.buttons["Close"].firstMatch.tap()
        if app.buttons["Close"].exists { app.buttons["Close"].firstMatch.tap() }
        app.swipeDown()
        app.swipeDown()
        app.buttons["Updates"].firstMatch.tap()
        try shot("updates")
        app.buttons["All job mail"].firstMatch.tap()
        try shot("all-job-mail")
        app.swipeUp()
        try shot("all-job-mail-scrolled")
    }

    @MainActor
    private func audit(dataset: String, contentSize: String?) throws {
        let app = launch(dataset: dataset, contentSize: contentSize)
        try app.performAccessibilityAudit()
    }

    @MainActor
    private func launch(dataset: String, contentSize: String?) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", "mail-review", "-BFHRDesign", dataset]
        if let contentSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["design.mail-review"].waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1.0)
        return app
    }
}
