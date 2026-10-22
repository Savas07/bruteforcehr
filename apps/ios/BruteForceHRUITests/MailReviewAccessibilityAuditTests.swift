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
        app.swipeUp()
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Lena Vogel")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        XCTAssertTrue(app.buttons["Confirm"].waitForExistence(timeout: 10))
        try runAudit(app)
    }

    /// Not an audit: saves the screens behind interactions (the scrolled queue, the review sheet,
    /// Change…, Updates, All job mail) at the default and the largest text size for the design
    /// critique. Runs only with `TEST_RUNNER_BFHR_MAIL_SHOTS=<dir>`.
    @MainActor
    func testCaptureInteractionScreens() throws {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_MAIL_SHOTS"] else {
            throw XCTSkip("Critique screenshots only")
        }
        for ax in [false, true] {
            let app = launch(dataset: "populated", contentSize: ax ? "UICTContentSizeCategoryAccessibilityXXXL" : nil)
            func shot(_ name: String) throws {
                Thread.sleep(forTimeInterval: 0.8)
                let file = URL(fileURLWithPath: directory).appendingPathComponent("\(name)\(ax ? "-ax" : "").png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            }
            func element(_ label: String) -> XCUIElement {
                app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
            }
            element("Updates").tap()
            try shot("updates")
            element("All job mail").tap()
            try shot("all-job-mail")
            app.swipeUp()
            try shot("all-job-mail-scrolled")
            app.terminate()

            let queue = launch(dataset: "populated", contentSize: ax ? "UICTContentSizeCategoryAccessibilityXXXL" : nil)
            queue.swipeUp()
            try shot("queue-scrolled")
            let row = queue.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Lena Vogel")).firstMatch
            guard row.waitForExistence(timeout: 5) else { continue }
            row.tap()
            try shot("sheet-medium")
            queue.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Change…")).firstMatch.tap()
            try shot("sheet-change")
            queue.terminate()
        }
    }

    @MainActor
    private func audit(dataset: String, contentSize: String?) throws {
        let app = launch(dataset: dataset, contentSize: contentSize)
        try runAudit(app)
    }

    /// Every issue fails the test; each is logged with its element so the report can name it.
    @MainActor
    private func runAudit(_ app: XCUIApplication) throws {
        try app.performAccessibilityAudit { issue in
            print("AUDIT \(issue.auditType) | \(issue.compactDescription) | \(issue.element.map { "\($0.elementType.rawValue) '\($0.label)' \($0.frame)" } ?? "no element")")
            return false
        }
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
