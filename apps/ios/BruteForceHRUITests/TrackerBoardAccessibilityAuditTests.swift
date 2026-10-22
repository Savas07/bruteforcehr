import XCTest

/// Accessibility audit of the Tracker tab in design mode (Debug builds): the Pipeline with
/// populated and empty data at the default and the largest accessibility text size, plus the
/// pushed Application detail and the Move to… sheet. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/TrackerBoardAccessibilityAuditTests`.
final class TrackerBoardAccessibilityAuditTests: XCTestCase {
    private let largestSize = "UICTContentSizeCategoryAccessibilityXXXL"

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testPopulatedDefaultSize() throws {
        try launch(dataset: "populated", contentSize: nil).performAccessibilityAudit()
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        try launch(dataset: "populated", contentSize: largestSize).performAccessibilityAudit()
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        try launch(dataset: "empty", contentSize: nil).performAccessibilityAudit()
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        try launch(dataset: "empty", contentSize: largestSize).performAccessibilityAudit()
    }

    /// Brightwave's detail: an automatic move from an email with its reason, View source and Undo.
    @MainActor
    func testApplicationDetail() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        openBrightwave(app)
        XCTAssertTrue(app.staticTexts["Activity"].waitForExistence(timeout: 10))
        try snapshot("detail")
        app.swipeUp()
        try snapshot("detail-scrolled")
        try app.performAccessibilityAudit()
    }

    @MainActor
    func testApplicationDetailAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize)
        openBrightwave(app)
        XCTAssertTrue(app.navigationBars["Brightwave"].waitForExistence(timeout: 10))
        try snapshot("detail-ax")
        try app.performAccessibilityAudit()
    }

    /// The row's "Move to…" VoiceOver action is the same path as the long-press menu: it opens
    /// the sheet with every status, invalid ones disabled with their reason.
    @MainActor
    func testMoveToSheet() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Aire Digital Health")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.press(forDuration: 1.2)
        let move = app.buttons["Move to…"]
        XCTAssertTrue(move.waitForExistence(timeout: 5))
        try snapshot("context-menu")
        move.tap()
        XCTAssertTrue(app.staticTexts["Accepted and Declined come after an offer."].firstMatch.waitForExistence(timeout: 5))
        try snapshot("move-sheet")
        try app.performAccessibilityAudit()
    }

    /// Leading swipe advances one stage and shows the Undo toast; Undo restores the row.
    @MainActor
    func testSwipeAdvanceShowsUndo() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Aire Digital Health")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.swipeRight()
        let advance = app.buttons["Move to Preparing"]
        XCTAssertTrue(advance.waitForExistence(timeout: 5))
        try snapshot("swipe-leading")
        advance.tap()
        let toast = app.staticTexts["Aire Digital Health · moved to Preparing"]
        XCTAssertTrue(toast.waitForExistence(timeout: 5))
        try snapshot("undo-toast")
        try app.performAccessibilityAudit()
        app.buttons["Undo"].tap()
        XCTAssertTrue(app.staticTexts["Restored"].waitForExistence(timeout: 5))
    }

    /// Saves a screenshot for the design critique when run with `TEST_RUNNER_BFHR_TRACKER_SHOTS`.
    @MainActor
    private func snapshot(_ name: String) throws {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_TRACKER_SHOTS"] else { return }
        Thread.sleep(forTimeInterval: 0.6)
        let suffix = ProcessInfo.processInfo.environment["BFHR_TRACKER_SHOTS_SUFFIX"] ?? ""
        let file = URL(fileURLWithPath: directory).appendingPathComponent("tracker-board-\(name)\(suffix).png")
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
    }

    @MainActor
    private func openBrightwave(_ app: XCUIApplication) {
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Brightwave")).firstMatch
        var swipes = 0
        while !(row.exists && row.isHittable), swipes < 12 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(row.isHittable)
        row.tap()
    }

    @MainActor
    private func launch(dataset: String, contentSize: String?) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", "tracker-board", "-BFHRDesign", dataset]
        if let contentSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["design.tracker-board"].waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1.0)
        return app
    }
}
