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

    /// Audits the first viewport, then each scrolled page down to the end of the list.
    @MainActor
    private func auditWholeScreen(_ app: XCUIApplication, _ context: String, ax: Bool, pages: Int) throws {
        let list = app.collectionViews.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 10))
        try audit(app, "\(context) top", ax: ax)
        for page in 1...pages {
            scrollDown(app)
            try audit(app, "\(context) page \(page)", ax: ax, scrolled: true)
        }
    }

    /// Runs Xcode's audit. Every issue fails the test except these, each logged as an
    /// `IGNORED (…)` activity and an `AUDIT ignored` line (docs/design/critiques/ios/job-detail/accessibility.md):
    /// - system chrome (tab bar, status bar, navigation bar and its glass toolbar buttons);
    /// - elements not fully inside the content area: below the navigation bar, above the sticky
    ///   Apply bar (or the sheet's bottom), minus the 24 pt scroll-edge fade. The audit reads
    ///   contrast and clipping from a screenshot, and iOS 26 blurs content under the bars. The
    ///   Apply bar itself is capped at AX1 on purpose (Large Content Viewer);
    /// - disabled controls ("Save reason" before a reason is picked; WCAG 1.4.3 exempts them);
    /// - issues with no element (the audit can't say what they refer to);
    /// - Dynamic Type / text clipping at the default size: SwiftUI text-style fonts (`Font.bfhr`)
    ///   are reported as fixed yet scale; the same screens are audited at AX5, where these
    ///   checks run against the real layout;
    /// - contrast, Dynamic Type and clipping on scrolled pages: List cells keep stale
    ///   accessibility frames after a scroll, so these screenshot checks measure other pixels.
    ///   They run on the first viewport of every state and size, and the scrolled AX5 captures
    ///   cover the rest;
    /// (each run also lists what it ignored, so new exemptions are never silent).
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, ax: Bool, scrolled: Bool = false, inSheet: Bool = false) throws {
        Thread.sleep(forTimeInterval: 1.0) // let scrolling settle
        let window = app.windows.firstMatch.frame
        // The lowest navigation bar: the screen's, or a presented sheet's.
        let top = app.navigationBars.allElementsBoundByIndex.map(\.frame.maxY).max() ?? window.minY
        var bottom = window.maxY
        if !inSheet {
            let bar = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Apply' OR label == 'View in Tracker'")).firstMatch
            if bar.exists {
                bottom = bar.frame.minY - 8
            } else if app.tabBars.firstMatch.exists {
                bottom = app.tabBars.firstMatch.frame.minY
            }
        }
        let edge: CGFloat = 24
        let content = CGRect(x: window.minX, y: top + edge, width: window.width, height: max(0, bottom - top - 2 * edge))
        do {
            try runAudit(app, context, content: content, ax: ax, scrolled: scrolled)
        } catch let error as NSError where error.code == -56 {
            // "Audit failed to complete in time" on long AX pages: retry once.
            try runAudit(app, context, content: content, ax: ax, scrolled: scrolled)
        }
    }

    @MainActor
    private func runAudit(_ app: XCUIApplication, _ context: String, content: CGRect, ax: Bool, scrolled: Bool) throws {
        let visual: [XCUIAccessibilityAuditType] = [.contrast, .dynamicType, .textClipped]
        try app.performAccessibilityAudit { issue in
            func ignore(_ reason: String) -> Bool {
                let label = issue.element.map { "'\($0.label)' \($0.frame)" } ?? "no element"
                print("AUDIT ignored (\(reason)) \(context): \(issue.compactDescription) — \(label)")
                XCTContext.runActivity(named: "IGNORED (\(reason)) \(context): \(issue.compactDescription) — \(label)") { _ in }
                return true
            }
            guard let element = issue.element, element.exists else { return ignore("no element") }
            if [.tabBar, .statusBar, .navigationBar].contains(element.elementType) { return ignore("system chrome") }
            if element.elementType == .button, app.navigationBars.buttons[element.label].exists { return ignore("system chrome") }
            if !element.isEnabled { return ignore("disabled control") }
            if !ax, [.dynamicType, .textClipped].contains(issue.auditType) { return ignore("default-size Dynamic Type, AX run checks it") }
            if scrolled, visual.contains(issue.auditType) { return ignore("visual check after scroll") }
            if !content.contains(element.frame) { return ignore("under bars / off screen") }
            print("AUDIT FAILED \(context): \(issue.auditType.rawValue) \(issue.compactDescription) — \(element.elementType.rawValue) '\(element.label)' \(element.frame)")
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    @MainActor
    func testAuditPopulatedDefaultSize() throws {
        try auditWholeScreen(launch("populated", ax: false), "populated", ax: false, pages: 6)
    }

    @MainActor
    func testAuditPopulatedLargestText() throws {
        try auditWholeScreen(launch("populated", ax: true), "populated AX", ax: true, pages: 16)
    }

    @MainActor
    func testAuditEmptyDefaultSize() throws {
        try auditWholeScreen(launch("empty", ax: false), "empty", ax: false, pages: 3)
    }

    @MainActor
    func testAuditEmptyLargestText() throws {
        try auditWholeScreen(launch("empty", ax: true), "empty AX", ax: true, pages: 8)
    }

    @MainActor
    func testAuditSheets() throws {
        let app = launch("populated", ax: false)
        let breakdown = app.buttons["See full breakdown"]
        scrollTo(breakdown, in: app)
        breakdown.tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        try audit(app, "breakdown sheet", ax: false, inSheet: true)
        app.buttons["Done"].tap()

        openNotForMeReasons(app)
        XCTAssertTrue(app.navigationBars["What didn't fit?"].waitForExistence(timeout: 5))
        try audit(app, "reason sheet", ax: false, inSheet: true)
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
            try shot("\(design)-scroll0")
            for page in 1...(ax ? 14 : 5) {
                scrollDown(app)
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
        scrollDown(app)
        Thread.sleep(forTimeInterval: 0.6)
        try shot("breakdown2")
        scrollDown(app)
        Thread.sleep(forTimeInterval: 0.6)
        try shot("breakdown3")
        app.buttons["Done"].tap()

        // Not for me from the More menu: hidden banner + toast, then the reason sheet.
        for _ in 0..<(ax ? 8 : 3) { scrollUp(app) }
        app.buttons["More"].tap()
        app.buttons["Not for me"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 0.8)
        try shot("hidden")
        let tellUsWhy = app.buttons["Tell us why"].firstMatch
        if !tellUsWhy.isHittable { scrollUp(app) }
        tellUsWhy.tap()
        Thread.sleep(forTimeInterval: 0.8)
        try shot("reasons")
        app.terminate()
    }

    // MARK: Helpers

    /// Drags the content up by about a third of the screen, starting above the sticky Apply bar
    /// (a centered swipe lands on the bar at AX sizes and doesn't scroll).
    @MainActor
    private func scrollDown(_ app: XCUIApplication) {
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
            .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)), withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    @MainActor
    private func scrollUp(_ app: XCUIApplication) {
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
            .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)), withVelocity: .fast, thenHoldForDuration: 0)
    }

    /// Scrolls until `element` sits fully in the middle band of the screen: below the glass
    /// navigation bar (where a tap would land on the toolbar) and above the sticky Apply bar.
    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        _ = app.collectionViews.firstMatch.waitForExistence(timeout: 5)
        let height = app.windows.firstMatch.frame.height
        func inBand() -> Bool {
            element.exists && element.frame.minY > height * 0.15 && element.frame.maxY < height * 0.7
        }
        var tries = 0
        while !inBand() && tries < 30 {
            if element.exists && element.frame.minY <= height * 0.15 {
                let window = app.windows.firstMatch
                window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
                    .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)), withVelocity: .slow, thenHoldForDuration: 0.1)
            } else {
                scrollDown(app)
            }
            tries += 1
        }
    }

    @MainActor
    private func openNotForMeReasons(_ app: XCUIApplication) {
        app.buttons["More"].tap()
        app.buttons["Not for me"].firstMatch.tap()
        let tellUsWhy = app.buttons["Tell us why"].firstMatch
        if !tellUsWhy.waitForExistence(timeout: 3) || !tellUsWhy.isHittable {
            scrollUp(app)
        }
        tellUsWhy.tap()
    }
}
