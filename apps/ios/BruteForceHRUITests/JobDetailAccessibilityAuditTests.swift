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
            scrollDown(app)
        }
        try audit(app)
    }

    /// The band legend under `MatchBandBar` stops at xLarge on purpose (the band is named above it
    /// at full size): JobDetailMatchViews.swift `MatchScoreCard`.
    private let cappedLegend: Set<String> = ["Stretch", "Partial", "Good", "Strong"]

    /// Runs Xcode's audit and fails on every issue of the screen's own content, fully visible
    /// between the navigation bar and the sticky Apply bar (or the bottom of a sheet).
    ///
    /// Not failed, but attached as "audit-unattributed": issues on elements outside that band or
    /// with no resolvable element. The bars are translucent glass over scrolling content, so
    /// contrast and Dynamic Type measurements there describe the blend (or the deliberately
    /// capped Apply bar, which stops at AX1 and offers the Large Content Viewer), not the element.
    @MainActor
    private func audit(_ app: XCUIApplication, inSheet: Bool = false) throws {
        Thread.sleep(forTimeInterval: 1.0) // let scrolling settle
        let window = app.windows.firstMatch.frame
        // The lowest navigation bar: the screen's, or a presented sheet's.
        let top = app.navigationBars.allElementsBoundByIndex.map(\.frame.maxY).max() ?? window.minY
        var bottom = window.maxY
        if !inSheet {
            let bar = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Apply' OR label == 'View in Tracker'")).firstMatch
            if bar.exists {
                bottom = bar.frame.minY - 16
            } else if app.tabBars.firstMatch.exists {
                bottom = app.tabBars.firstMatch.frame.minY
            }
        }
        var unattributed: [String] = []
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            let line = "\(issue.auditType.rawValue) \(issue.compactDescription) | type \(element?.elementType.rawValue ?? 0) "
                + "label '\(element?.label ?? "")' frame \(element.map { "\($0.frame)" } ?? "-")"
            guard let element, element.exists, element.frame.minY >= top, element.frame.maxY <= bottom else {
                unattributed.append(line)
                return true
            }
            if issue.auditType == .dynamicType, self.cappedLegend.contains(element.label) {
                unattributed.append("capped legend: " + line)
                return true
            }
            return false
        }
        if !unattributed.isEmpty {
            let attachment = XCTAttachment(string: unattributed.joined(separator: "\n"))
            attachment.name = "audit-unattributed"
            attachment.lifetime = .keepAlways
            add(attachment)
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
        try audit(app, inSheet: true)
        app.buttons["Done"].tap()

        openNotForMeReasons(app)
        XCTAssertTrue(app.navigationBars["What didn't fit?"].waitForExistence(timeout: 5))
        try audit(app, inSheet: true)
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
