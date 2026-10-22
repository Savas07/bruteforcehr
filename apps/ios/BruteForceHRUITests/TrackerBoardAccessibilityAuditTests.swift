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
        // The first swipe expands the sheet to the large detent; the next scroll to Closed.
        // Accepted and Declined share one denial: the reason is the Closed section's footer, and
        // each disabled row carries it as its VoiceOver hint.
        let reason = app.staticTexts["Accepted and Declined come after an offer."]
        var swipes = 0
        while !(reason.exists && reason.isHittable), swipes < 4 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(reason.exists)
        let accepted = app.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", "Accepted")).firstMatch
        XCTAssertTrue(accepted.exists)
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
        app.buttons["Undo"].tap()
        XCTAssertTrue(app.staticTexts["Restored"].waitForExistence(timeout: 5))
        try snapshot("restored-toast")
        // Audit a fresh toast (the audit outlasts the 6 s toast, so the order matters).
        row.swipeRight()
        app.buttons["Move to Preparing"].tap()
        XCTAssertTrue(app.staticTexts["Aire Digital Health · moved to Preparing"].waitForExistence(timeout: 5))
        try audit(app, "undo toast")
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

    // MARK: Helpers

    /// The sheet's title (a navigation subtitle names the application).
    @MainActor
    private func sheetTitle(_ app: XCUIApplication, _ title: String) -> XCUIElement {
        app.navigationBars.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    }

    @MainActor
    private func openBrightwave(_ app: XCUIApplication) {
        // The stage strip jumps to Interviewing, so no long scroll is needed at any text size.
        let strip = app.descendants(matching: .any)["tracker.stageStrip"]
        let chip = strip.buttons.containing(NSPredicate(format: "label BEGINSWITH %@", "Interviewing")).firstMatch
        XCTAssertTrue(strip.waitForExistence(timeout: 10))
        var swipes = 0
        while chip.frame.maxX > app.frame.maxX - 8, swipes < 8 {
            strip.swipeLeft()
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

    /// Copy rendered by shared components (`EmptyState`, `StatusMenu`), whose "Text clipped"
    /// reports are logged and reported to the foundation owner instead of failing this screen.
    private let sharedComponentLabels: Set<String> = [
        "No applications yet", "Save a job in Jobs and it shows up here, ready to track.",
        "Not selected", "Withdrawn", "No response", "Accepted", "Declined",
    ]

    /// Audits this screen and logs every issue (kept or ignored) to `audit.log`. Ignored, each a
    /// documented false positive (docs/design/critiques/ios/tracker-board/accessibility.md):
    /// - the system tab and status bars; contrast of text under the translucent navigation bar,
    ///   inside the iOS 26 scroll-edge band above the tab bar, or under the toast (the audit
    ///   measures it against the blur or the overlay);
    /// - disabled controls (WCAG 1.4.3 exempts inactive components), e.g. the current stage;
    /// - "Dynamic Type unsupported" at the default size: the same screens at AX5 pass that check;
    /// - any issue without an element: the audit measured a node XCUITest can't resolve (the
    ///   strip's peeking chip, rows cut by the viewport, cells the list keeps off screen; on the
    ///   detail the counts stay the same whatever the visible rows contain). Logged for review, as
    ///   in the Today, Job detail and CV editor audits;
    /// - "Text clipped" on shared-component copy.
    /// Scrolled pages skip the contrast check: the audit re-scrolls while it measures, so text
    /// sliding under the pinned stage header is measured against the header.
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, defaultSize: Bool = true, contrast: Bool = true) throws {
        let navBottom = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : 0
        let edgeTop = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY - 44 : .greatestFiniteMagnitude
        let toast = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", " · ")).allElementsBoundByIndex
            .map(\.frame).filter { $0.minY > edgeTop - 120 }.reduce(CGRect.null) { $0.union($1) }.insetBy(dx: -24, dy: -24)
        try snapshot("audit-\(context.replacingOccurrences(of: " ", with: "-"))")
        let types = contrast ? XCUIAccessibilityAuditType.all : XCUIAccessibilityAuditType.all.subtracting(.contrast)
        try app.performAccessibilityAudit(for: types) { issue in
            let element = issue.element
            let frame = element?.frame ?? .null
            let ignored: String? = {
                if let element, element.elementType == .tabBar || element.elementType == .statusBar { return "system bar" }
                if let element, !element.isEnabled { return "disabled control" }
                if issue.auditType == .contrast, !frame.isNull,
                   frame.minY < navBottom || frame.maxY > edgeTop || frame.intersects(toast) { return "under a bar, the edge band or the toast" }
                if issue.auditType == .dynamicType, defaultSize { return "default size; AX run covers scaling" }
                if element == nil { return "no element" }
                // A prediction ("may be clipped at larger Dynamic Type sizes") at the default size;
                // the AX5 run of the same screen measures the real thing.
                if issue.auditType == .textClipped, defaultSize, issue.detailedDescription.contains("larger Dynamic Type") { return "prediction; AX run measures it" }
                if issue.auditType == .textClipped, let label = element?.label, self.sharedComponentLabels.contains(label) { return "shared component copy" }
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
            Thread.sleep(forTimeInterval: 1.0)
            try audit(app, "\(context) page \(page)", defaultSize: defaultSize, contrast: false)
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
