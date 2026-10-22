import XCTest

/// Job detail in design mode (Debug builds): Xcode's accessibility audit on the populated and
/// empty states at the default and the largest accessibility text size, scrolled through the
/// whole screen, plus the match breakdown and Not for me reason sheets.
///
/// `testCaptureJourney` is not a check: with `BFHR_JOB_DETAIL_SHOTS` set (pass it as
/// `TEST_RUNNER_BFHR_JOB_DETAIL_SHOTS` to xcodebuild) it saves the scrolled screen and the sheets
/// as PNGs for the design critique; otherwise it's skipped.
final class JobDetailAccessibilityAuditTests: XCTestCase {
    private let english = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    private let largestText = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    @MainActor
    private func launch(_ design: String, ax: Bool) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += english + ["-BFHRScreen", "job-detail", "-BFHRDesign", design] + (ax ? largestText : [])
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["design.job-detail"].waitForExistence(timeout: 20))
        return app
    }

    /// Audits the current screen, then scrolls and audits again until the end of the list.
    @MainActor
    private func auditWholeScreen(_ app: XCUIApplication, pages: Int) throws {
        let list = app.collectionViews.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 10))
        for _ in 0..<pages {
            try audit(app)
            list.swipeUp(velocity: .slow)
        }
        try audit(app)
    }

    @MainActor
    private func audit(_ app: XCUIApplication) throws {
        try app.performAccessibilityAudit { issue in
            // The system tab bar and navigation bar are Apple's: their Dynamic Type behavior at
            // AX sizes (the large-content viewer instead of growing) is by design.
            if let element = issue.element, element.elementType == .tabBar || element.elementType == .navigationBar {
                return true
            }
            if let element = issue.element, issue.auditType == .dynamicType,
               app.tabBars.firstMatch.exists, app.tabBars.firstMatch.frame.contains(element.frame) {
                return true
            }
            return false
        }
    }

    @MainActor
    func testAuditPopulatedDefaultSize() throws {
        try auditWholeScreen(launch("populated", ax: false), pages: 6)
    }

    @MainActor
    func testAuditPopulatedLargestText() throws {
        try auditWholeScreen(launch("populated", ax: true), pages: 16)
    }

    @MainActor
    func testAuditEmptyDefaultSize() throws {
        try auditWholeScreen(launch("empty", ax: false), pages: 3)
    }

    @MainActor
    func testAuditEmptyLargestText() throws {
        try auditWholeScreen(launch("empty", ax: true), pages: 8)
    }

    @MainActor
    func testAuditSheets() throws {
        let app = launch("populated", ax: false)
        let breakdown = app.buttons["See full breakdown"]
        scrollTo(breakdown, in: app)
        breakdown.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        try audit(app)
        app.buttons["Done"].tap()

        openNotForMeReasons(app)
        XCTAssertTrue(app.navigationBars["What didn't fit?"].waitForExistence(timeout: 5))
        try audit(app)
    }

    // MARK: Critique captures

    @MainActor
    func testCaptureJourney() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let directory = environment["BFHR_JOB_DETAIL_SHOTS"] else {
            throw XCTSkip("Runs only for critique captures")
        }
        let suffix = environment["BFHR_JOB_DETAIL_SUFFIX"] ?? "light"
        let ax = suffix.hasSuffix("-ax")
        let out = URL(fileURLWithPath: directory)
        func shot(_ name: String) throws {
            try XCUIScreen.main.screenshot().pngRepresentation
                .write(to: out.appendingPathComponent("job-detail-\(name)-\(suffix).png"))
        }

        for design in ["populated", "empty"] {
            let app = launch(design, ax: ax)
            Thread.sleep(forTimeInterval: 1.5)
            let list = app.collectionViews.firstMatch
            for page in 1...(ax ? 12 : 5) {
                list.swipeUp(velocity: .slow)
                Thread.sleep(forTimeInterval: 0.6)
                try shot("\(design)-scroll\(page)")
            }
            app.terminate()
        }

        let app = launch("populated", ax: ax)
        let breakdown = app.buttons["See full breakdown"]
        scrollTo(breakdown, in: app)
        breakdown.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 0.8)
        try shot("breakdown1")
        app.collectionViews.firstMatch.swipeUp(velocity: .slow)
        Thread.sleep(forTimeInterval: 0.6)
        try shot("breakdown2")
        app.collectionViews.firstMatch.swipeUp(velocity: .slow)
        Thread.sleep(forTimeInterval: 0.6)
        try shot("breakdown3")
        app.buttons["Done"].tap()

        // Not for me from the More menu: hidden banner + toast, then the reason sheet.
        app.collectionViews.firstMatch.swipeDown(velocity: .fast)
        app.collectionViews.firstMatch.swipeDown(velocity: .fast)
        app.buttons["More"].tap()
        app.buttons["Not for me"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 0.8)
        try shot("hidden")
        app.buttons["Tell us why"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 0.8)
        try shot("reasons")
        app.terminate()
    }

    // MARK: Helpers

    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        let list = app.collectionViews.firstMatch
        var tries = 0
        while !(element.exists && element.isHittable) && tries < 12 {
            list.swipeUp(velocity: .slow)
            tries += 1
        }
    }

    @MainActor
    private func openNotForMeReasons(_ app: XCUIApplication) {
        app.buttons["More"].tap()
        app.buttons["Not for me"].firstMatch.tap()
        let tellUsWhy = app.buttons["Tell us why"].firstMatch
        if !tellUsWhy.waitForExistence(timeout: 3) || !tellUsWhy.isHittable {
            app.collectionViews.firstMatch.swipeDown(velocity: .fast)
        }
        tellUsWhy.tap()
    }
}
