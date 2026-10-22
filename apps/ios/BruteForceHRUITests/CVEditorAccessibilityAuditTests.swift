import XCTest

/// Accessibility audit of the CVs tab in design mode (Debug builds): the CV screen with populated
/// data (Edit and Preview) and the empty list, at the default and the largest accessibility text
/// size, plus the item edit sheet and the ✦ Improve sheet. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/CVEditorAccessibilityAuditTests`.
///
/// With `TEST_RUNNER_BFHR_CV_SHOTS=<dir>` (and optionally `TEST_RUNNER_BFHR_CV_SHOTS_SUFFIX`) it
/// also saves screenshots of the panes for the design critique.
final class CVEditorAccessibilityAuditTests: XCTestCase {
    private let largestSize = "UICTContentSizeCategoryAccessibilityXXXL"

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testPopulatedDefaultSize() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        XCTAssertTrue(app.buttons["cv.header"].waitForExistence(timeout: 10))
        try app.performAccessibilityAudit()
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize)
        try snapshot("edit-ax")
        try app.performAccessibilityAudit()
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        let app = launch(dataset: "empty", contentSize: nil)
        XCTAssertTrue(app.buttons["Start from scratch"].waitForExistence(timeout: 10))
        try app.performAccessibilityAudit()
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        try launch(dataset: "empty", contentSize: largestSize).performAccessibilityAudit()
    }

    /// Preview: real text on the page, so the audit and VoiceOver see the CV itself. The page is
    /// print (fixed point sizes, paper colours), so Dynamic Type and contrast checks on it are
    /// excluded; the chrome around it is audited.
    @MainActor
    func testPreview() throws {
        let app = launch(dataset: "populated", contentSize: nil, pane: "preview")
        XCTAssertTrue(app.descendants(matching: .any)["cv.page.1"].waitForExistence(timeout: 10))
        try snapshot("preview")
        try app.performAccessibilityAudit { issue in
            Self.isOnPage(issue) && [.dynamicType, .textClipped, .contrast].contains(issue.auditType)
        }
    }

    @MainActor
    func testPreviewAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize, pane: "preview")
        XCTAssertTrue(app.descendants(matching: .any)["cv.page.1"].waitForExistence(timeout: 10))
        try snapshot("preview-ax")
        try app.performAccessibilityAudit { issue in
            Self.isOnPage(issue) && [.dynamicType, .textClipped, .contrast].contains(issue.auditType)
        }
    }

    /// Tapping an item opens its edit sheet; swiping it offers Remove, whose toast has Undo.
    @MainActor
    func testItemSheetAndRemoveUndo() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let item = app.buttons["cv.item.work.0"]
        XCTAssertTrue(item.waitForExistence(timeout: 10))
        item.tap()
        XCTAssertTrue(app.navigationBars["Experience"].waitForExistence(timeout: 5))
        try snapshot("item-sheet")
        try app.performAccessibilityAudit()
        app.buttons["Cancel"].tap()

        XCTAssertTrue(item.waitForExistence(timeout: 5))
        item.swipeLeft()
        let remove = app.buttons["Remove"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        remove.tap()
        XCTAssertTrue(app.staticTexts["Removed “Pazarbox — Frontend Engineer”"].waitForExistence(timeout: 5))
        try snapshot("remove-toast")
        app.buttons["Undo"].tap()
        XCTAssertTrue(app.staticTexts["Restored"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["cv.item.work.0"].exists)
    }

    /// ✦ Improve: the first suggestion has a [X%] blank, so Use suggestion stays off until it's
    /// filled; Keep mine is always available.
    @MainActor
    func testAssistSheetBlocksUntilBlankFilled() throws {
        let app = launch(dataset: "populated", contentSize: nil, pane: "assist")
        let use = app.buttons["cv.assist.use"]
        XCTAssertTrue(use.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["cv.assist.suggestion.1"].waitForExistence(timeout: 5))
        XCTAssertFalse(use.isEnabled)
        try snapshot("assist")
        try app.performAccessibilityAudit()
        let blank = app.textFields.matching(NSPredicate(format: "label CONTAINS %@", "[X%]")).firstMatch
        XCTAssertTrue(blank.waitForExistence(timeout: 5))
        blank.tap()
        blank.typeText("35%")
        XCTAssertTrue(use.isEnabled)
        try snapshot("assist-filled")
        use.tap()
        XCTAssertTrue(app.staticTexts["Suggestion applied"].waitForExistence(timeout: 5))
        try snapshot("assist-applied")
    }

    @MainActor
    func testAssistSheetAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize, pane: "assist")
        XCTAssertTrue(app.buttons["cv.assist.keepMine"].waitForExistence(timeout: 10))
        try snapshot("assist-ax")
        try app.performAccessibilityAudit()
    }

    @MainActor
    func testHistoryAndReorder() throws {
        var app = launch(dataset: "populated", contentSize: nil, pane: "history")
        XCTAssertTrue(app.navigationBars["Version history"].waitForExistence(timeout: 10))
        try snapshot("history")
        try app.performAccessibilityAudit()
        app.terminate()
        app = launch(dataset: "populated", contentSize: nil, pane: "reorder")
        XCTAssertTrue(app.navigationBars["Reorder sections"].waitForExistence(timeout: 10))
        try snapshot("reorder")
        try app.performAccessibilityAudit()
    }

    /// Opens the DE variant from the "…" menu (versions of this CV).
    @MainActor
    func testVariantSwitch() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let more = app.buttons["cv.more"]
        XCTAssertTrue(more.waitForExistence(timeout: 10))
        more.tap()
        let variant = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Lebenslauf — Deutsch")).firstMatch
        XCTAssertTrue(variant.waitForExistence(timeout: 5))
        try snapshot("more-menu")
        variant.tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Variant of Base CV — English")).firstMatch.waitForExistence(timeout: 5))
        try snapshot("variant")
        try app.performAccessibilityAudit()
    }

    private static func isOnPage(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        guard let element = issue.element else { return false }
        return !element.identifier.hasPrefix("cv.segment") && element.elementType == .staticText
    }

    @MainActor
    private func snapshot(_ name: String) throws {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CV_SHOTS"], !directory.isEmpty else { return }
        Thread.sleep(forTimeInterval: 0.8)
        let suffix = ProcessInfo.processInfo.environment["BFHR_CV_SHOTS_SUFFIX"] ?? ""
        let file = URL(fileURLWithPath: directory).appendingPathComponent("cv-editor-\(name)\(suffix).png")
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
    }

    @MainActor
    private func launch(dataset: String, contentSize: String?, pane: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", "cv-editor", "-BFHRDesign", dataset]
        if let pane { app.launchArguments += ["-BFHRCVPane", pane] }
        if let contentSize { app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize] }
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["design.cv-editor"].waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1.5)
        return app
    }
}
