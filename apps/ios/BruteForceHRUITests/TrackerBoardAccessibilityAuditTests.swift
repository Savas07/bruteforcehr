import XCTest

/// Accessibility audit of the Tracker tab in design mode (Debug builds): XCUITest's
/// `performAccessibilityAudit()` on the Pipeline with populated and empty data at the default and
/// the largest accessibility text size (scrolled page by page), the Closed scope, the pushed
/// Application detail, the Move to… sheet and the swipe → Undo toast path. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/TrackerBoardAccessibilityAuditTests`.
///
/// With `BFHR_TRACKER_SHOTS` (a directory, as a `TEST_RUNNER_` variable) it also saves the
/// screenshots of these flows for the design critique, plus `audit.log` with every issue found.
final class TrackerBoardAccessibilityAuditTests: XCTestCase {
    private let largestSize = "UICTContentSizeCategoryAccessibilityXXXL"

    override func setUp() {
        continueAfterFailure = true
    }

    // MARK: Pipeline

    @MainActor
    func testPopulatedDefaultSize() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        try snapshot("pipeline")
        try scrollAudit(app, "populated", pages: 4)
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize)
        try snapshot("pipeline-ax")
        try scrollAudit(app, "populated AX", pages: 6, defaultSize: false)
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        try audit(launch(dataset: "empty", contentSize: nil), "empty")
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        try audit(launch(dataset: "empty", contentSize: largestSize), "empty AX", defaultSize: false)
    }

    /// Closed scope: outcomes in the grey tone, rejected reads "Not selected".
    @MainActor
    func testClosedScope() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        app.buttons["Closed"].tap()
        XCTAssertTrue(app.staticTexts["Not selected"].firstMatch.waitForExistence(timeout: 5))
        try snapshot("closed")
        try scrollAudit(app, "closed", pages: 1)
    }

    // MARK: Detail

    /// Brightwave's detail: an automatic move from an email with its reason, View source and Undo.
    @MainActor
    func testApplicationDetail() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        openBrightwave(app)
        try snapshot("detail")
        app.swipeUp()
        try snapshot("detail-scrolled")
        app.swipeUp()
        try snapshot("detail-scrolled-2")
        app.swipeDown()
        app.swipeDown()
        try scrollAudit(app, "detail", pages: 3)
    }

    @MainActor
    func testApplicationDetailAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize)
        openBrightwave(app)
        try snapshot("detail-ax")
        try scrollAudit(app, "detail AX", pages: 6, defaultSize: false)
    }

    // MARK: Moves

    /// Long-press → Move to… opens the sheet with every status, invalid ones disabled with the
    /// reason. The same action is the row's VoiceOver custom action.
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
        XCTAssertTrue(sheetTitle(app, "Move to…").waitForExistence(timeout: 5))
        try snapshot("move-sheet")
        app.swipeUp()
        let accepted = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "come after an offer")).firstMatch
        XCTAssertTrue(accepted.waitForExistence(timeout: 5))
        XCTAssertFalse(accepted.isEnabled)
        try snapshot("move-sheet-large")
        try audit(app, "move sheet")
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
        XCTAssertTrue(app.staticTexts["Aire Digital Health · moved to Preparing"].waitForExistence(timeout: 5))
        try snapshot("undo-toast")
        try audit(app, "undo toast")
        app.buttons["Undo"].tap()
        XCTAssertTrue(app.staticTexts["Restored"].waitForExistence(timeout: 5))
    }

    /// Trailing swipe → Close… → Not selected: the calm toast, the row in the grey Closed tone.
    @MainActor
    func testCloseAsNotSelected() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Aire Digital Health")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.swipeLeft()
        let close = app.buttons["Close…"]
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        try snapshot("swipe-trailing")
        close.tap()
        XCTAssertTrue(sheetTitle(app, "Close application").waitForExistence(timeout: 5))
        try snapshot("close-sheet")
        try audit(app, "close sheet")
        app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Not selected")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Aire Digital Health · marked as not selected. Your notes stay here."].waitForExistence(timeout: 5))
        try snapshot("not-selected-toast")
    }

    /// Drag a row onto the drop panel's stage targets (pinned over the top of the list while
    /// dragging): the move happens and the Undo toast names it.
    @MainActor
    func testDragOntoStageTarget() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Aire Digital Health")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        // Panel layout: 8 pt below the bar, 12 pt padding, the title line, 8 pt, then the first row
        // of chips (Saved ✓ · Preparing · Applied …). Aim at the second chip.
        let top = app.navigationBars.firstMatch.frame.maxY
        let target = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 175, dy: top + 72))
        row.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 1.0, thenDragTo: target, withVelocity: .slow, thenHoldForDuration: 1.0)
        let toast = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Aire Digital Health · moved to")).firstMatch
        XCTAssertTrue(toast.waitForExistence(timeout: 5))
        try snapshot("drag-dropped")
    }

    // MARK: Helpers

    /// The sheet's title (the principal item also names the application).
    @MainActor
    private func sheetTitle(_ app: XCUIApplication, _ title: String) -> XCUIElement {
        app.navigationBars.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    }

    @MainActor
    private func openBrightwave(_ app: XCUIApplication) {
        // The stage strip jumps to Interviewing, so no long scroll is needed at any text size.
        let chip = app.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", "Interviewing")).firstMatch
        let firstChip = app.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", "Saved")).firstMatch
        XCTAssertTrue(firstChip.waitForExistence(timeout: 10))
        var swipes = 0
        while !chip.isHittable, swipes < 8 {
            (firstChip.isHittable ? firstChip : chip).swipeLeft()
            swipes += 1
        }
        chip.tap()
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Brightwave")).firstMatch
        swipes = 0
        while !(row.exists && row.isHittable), swipes < 8 {
            app.swipeUp()
            swipes += 1
        }
        row.tap()
        XCTAssertTrue(app.navigationBars["Brightwave"].waitForExistence(timeout: 10))
    }

    /// Audits this screen and logs every issue (kept or ignored) to `audit.log`. Ignored, each a
    /// documented false positive (docs/design/critiques/ios/tracker-board/accessibility.md):
    /// - the system tab and status bars, and contrast of rows passing under the translucent
    ///   navigation / tab bars (the audit measures them against the blur);
    /// - disabled controls (WCAG 1.4.3 exempts inactive components), e.g. the current stage in
    ///   Move to…;
    /// - "Dynamic Type unsupported" at the default size: the same screens at AX5 pass that check;
    /// - "Text clipped" without an element: the stage strip's peeking chip and rows cut by the
    ///   viewport edge (checked in the page screenshots).
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, defaultSize: Bool = true) throws {
        let navBottom = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : 0
        let tabTop = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : .greatestFiniteMagnitude
        try snapshot("audit-\(context.replacingOccurrences(of: " ", with: "-"))")
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            let ignored: String? = {
                if let element, element.elementType == .tabBar || element.elementType == .statusBar { return "system bar" }
                if let element, !element.isEnabled { return "disabled control" }
                if issue.auditType == .contrast, let frame = element?.frame,
                   frame.minY < navBottom || frame.maxY > tabTop { return "under a translucent bar" }
                if issue.auditType == .dynamicType, defaultSize { return "default size; AX run covers scaling" }
                if issue.auditType == .textClipped, element == nil { return "viewport / strip peek" }
                return nil
            }()
            self.log("\(ignored.map { "IGNORED (\($0))" } ?? "KEPT") \(context): \(issue.compactDescription) — \(element?.debugDescription.prefix(240) ?? "no element")")
            return ignored != nil
        }
    }

    @MainActor
    private func scrollAudit(_ app: XCUIApplication, _ context: String, pages: Int, defaultSize: Bool = true) throws {
        try audit(app, "\(context) top", defaultSize: defaultSize)
        for page in 1...pages {
            app.swipeUp()
            try audit(app, "\(context) page \(page)", defaultSize: defaultSize)
        }
    }

    private var shotsDirectory: URL? {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_TRACKER_SHOTS"], !directory.isEmpty else { return nil }
        return URL(fileURLWithPath: directory)
    }

    private func log(_ line: String) {
        guard let file = shotsDirectory?.appendingPathComponent("audit.log") else { return }
        let data = Data((line.replacingOccurrences(of: "\n", with: " ") + "\n").utf8)
        if let handle = try? FileHandle(forWritingTo: file) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: file)
        }
    }

    /// Saves a screenshot for the design critique when `BFHR_TRACKER_SHOTS` is set.
    @MainActor
    private func snapshot(_ name: String) throws {
        guard let directory = shotsDirectory else { return }
        Thread.sleep(forTimeInterval: 0.8)
        let suffix = ProcessInfo.processInfo.environment["BFHR_TRACKER_SHOTS_SUFFIX"] ?? ""
        let file = directory.appendingPathComponent("tracker-board-\(name)\(suffix).png")
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
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
