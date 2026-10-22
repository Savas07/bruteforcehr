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
        try audit(app)
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize)
        try snapshot("edit-ax")
        try audit(app)
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        let app = launch(dataset: "empty", contentSize: nil)
        XCTAssertTrue(app.buttons["Start from scratch"].waitForExistence(timeout: 10))
        try audit(app)
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        let app = launch(dataset: "empty", contentSize: largestSize)
        try snapshot("empty-ax")
        try audit(app)
    }

    /// Preview: real text on the page, so the audit and VoiceOver see the CV itself. The page is
    /// print (fixed point sizes, paper colours), so Dynamic Type and contrast checks on it are
    /// excluded; the chrome around it is audited.
    @MainActor
    func testPreview() throws {
        let app = launch(dataset: "populated", contentSize: nil, pane: "preview")
        XCTAssertTrue(app.descendants(matching: .any)["cv.page.1"].waitForExistence(timeout: 10))
        try snapshot("preview")
        try audit(app, ignoringPage: true)
    }

    @MainActor
    func testPreviewAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize, pane: "preview")
        XCTAssertTrue(app.descendants(matching: .any)["cv.page.1"].waitForExistence(timeout: 10))
        try snapshot("preview-ax")
        try audit(app, ignoringPage: true)
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
        try audit(app)
        app.buttons["Cancel"].tap()
        // Nothing was changed, so Cancel closes without asking.
        XCTAssertFalse(app.buttons["Discard changes"].waitForExistence(timeout: 1))
        XCTAssertTrue(app.navigationBars["Experience"].waitForNonExistence(timeout: 5))

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
        try audit(app)
        let blank = app.textFields["Your value for [X%]"]
        scroll(app, to: blank)
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
        XCTAssertTrue(app.navigationBars["Improve with AI"].waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 1)
        try snapshot("assist-ax")
        try audit(app)
        // The actions scroll with the content at this size.
        scroll(app, to: app.buttons["cv.assist.keepMine"])
        try snapshot("assist-ax-actions")
        try audit(app)
    }

    @MainActor
    func testItemSheetAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize, pane: "item")
        XCTAssertTrue(app.navigationBars["Experience"].waitForExistence(timeout: 10))
        try snapshot("item-sheet-ax")
        try audit(app)
    }

    @MainActor
    func testHistoryAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize, pane: "history")
        XCTAssertTrue(app.navigationBars["Version history"].waitForExistence(timeout: 10))
        try snapshot("history-ax")
        try audit(app)
    }

    @MainActor
    func testHistoryAndReorder() throws {
        var app = launch(dataset: "populated", contentSize: nil, pane: "history")
        XCTAssertTrue(app.navigationBars["Version history"].waitForExistence(timeout: 10))
        try snapshot("history")
        try audit(app)
        app.terminate()
        app = launch(dataset: "populated", contentSize: nil, pane: "reorder")
        XCTAssertTrue(app.navigationBars["Reorder sections"].waitForExistence(timeout: 10))
        try snapshot("reorder")
        try audit(app)
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
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "variant of Base CV — English")).firstMatch.waitForExistence(timeout: 5))
        try snapshot("variant")
        try audit(app)
    }

    /// Audits the current screen and logs every issue (appended to `audit-issues.txt` next to the
    /// shots when `BFHR_CV_SHOTS` is set). Exempt, each for a stated reason (accessibility.md):
    /// - system chrome outside this screen: tab bar, status bar, navigation-bar buttons;
    /// - contrast of disabled controls (WCAG 1.4.3 exempts inactive components);
    /// - contrast and clipping of content scrolled under a translucent bar (tab bar, navigation
    ///   bar, the ✦ Improve action bar): it scrolls clear, and the audit measures it against blur;
    /// - with `ignoringPage`, text-size, clipping and contrast checks on the printed page in
    ///   Preview (fixed-size print in paper colours by design; the chrome around it is audited).
    @MainActor
    private func audit(_ app: XCUIApplication, ignoringPage: Bool = false, _ function: String = #function) throws {
        let covers = [app.tabBars.firstMatch, app.navigationBars.firstMatch]
            .filter(\.exists).map(\.frame)
            + (app.buttons["cv.assist.keepMine"].exists && !app.buttons["cv.assist.keepMine"].frame.isEmpty
                ? [CGRect(x: 0, y: app.buttons["cv.assist.keepMine"].frame.minY - 120, width: 10_000, height: 10_000)] : [])
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            var exempt: String?
            if let element {
                if element.elementType == .tabBar || element.elementType == .statusBar {
                    exempt = "system chrome"
                } else if element.elementType == .button, app.navigationBars.firstMatch.exists,
                          app.navigationBars.firstMatch.frame.contains(element.frame) {
                    exempt = "system navigation bar button"
                } else if issue.auditType == .contrast, !element.isEnabled {
                    exempt = "disabled control"
                } else if [.contrast, .textClipped].contains(issue.auditType), covers.contains(where: { $0.intersects(element.frame) }) {
                    exempt = "under a translucent bar"
                } else if ignoringPage, Self.isPageText(element, in: app), [.dynamicType, .textClipped, .contrast].contains(issue.auditType) {
                    exempt = "printed page"
                }
            }
            let line = "\(function): \(exempt.map { "[exempt: \($0)] " } ?? "")\(issue.compactDescription) — \(element.map { "\($0.elementType.rawValue) id=\($0.identifier) label=\($0.label.prefix(80)) frame=\($0.frame.integral)" } ?? "no element")"
            XCTContext.runActivity(named: line) { _ in }
            Self.log(line)
            return exempt != nil
        }
    }

    private static func log(_ line: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CV_SHOTS"], !directory.isEmpty else { return }
        let url = URL(fileURLWithPath: directory).appendingPathComponent("audit-issues.txt")
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(Data((line + "\n").utf8))
            try? handle.close()
        } else {
            try? Data((line + "\n").utf8).write(to: url)
        }
    }

    /// Static text inside a rendered page (`cv.page.N`).
    @MainActor
    private static func isPageText(_ element: XCUIElement, in app: XCUIApplication) -> Bool {
        guard element.elementType == .staticText else { return false }
        let pages = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "cv.page."))
        return pages.allElementsBoundByIndex.contains { $0.frame.contains(element.frame) }
    }

    /// Swipes up until `element` is on screen (lists load rows lazily).
    @MainActor
    private func scroll(_ app: XCUIApplication, to element: XCUIElement) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < 8 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.isHittable, "\(element)")
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
        // Populated pushes the CV over the list, so wait for the tab bar rather than the root.
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1.5)
        return app
    }
}
