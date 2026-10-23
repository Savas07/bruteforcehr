import XCTest

/// Accessibility audit of Insights in design mode (Debug builds): `performAccessibilityAudit()`
/// on Insights pushed over the Tracker, with populated and empty data at the default and the
/// largest accessibility text size (scrolled page by page), the "How these are counted" sheet,
/// and a drill-down back into the Pipeline. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/InsightsAccessibilityAuditTests`.
///
/// With `BFHR_INSIGHTS_SHOTS` (a directory, as a `TEST_RUNNER_` variable) it also saves the
/// screenshots of these flows for the design critique, plus `audit.log` with every issue found.
final class InsightsAccessibilityAuditTests: XCTestCase {
    private let largestSize = "UICTContentSizeCategoryAccessibilityXXXL"

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testPopulatedDefaultSize() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        try scrollAudit(app, "populated", pages: 4)
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        let app = launch(dataset: "populated", contentSize: largestSize)
        try scrollAudit(app, "populated-ax", pages: 9, defaultSize: false)
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        try audit(launch(dataset: "empty", contentSize: nil), "empty")
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        try audit(launch(dataset: "empty", contentSize: largestSize), "empty-ax", defaultSize: false)
    }

    /// The four tiles and every funnel stage are buttons whose VoiceOver value carries the numbers.
    @MainActor
    func testChartsReadTheirNumbers() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let response = app.buttons["Response rate"]
        XCTAssertTrue(response.waitForExistence(timeout: 5))
        XCTAssertTrue((response.value as? String)?.contains("of") == true, "tile value: \(String(describing: response.value))")
        let applied = app.buttons["Applied"]
        XCTAssertTrue(applied.waitForExistence(timeout: 5))
        XCTAssertTrue((applied.value as? String)?.hasPrefix("Applications: ") == true, "funnel value: \(String(describing: applied.value))")
    }

    @MainActor
    func testAboutSheet() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        app.navigationBars.buttons["How these are counted"].tap()
        XCTAssertTrue(app.navigationBars["How these are counted"].waitForExistence(timeout: 5))
        try snapshot("about")
        try audit(app, "about")
    }

    /// Tapping a funnel stage pops to the Pipeline filtered to those applications, with the
    /// dismissible "From Insights" chip.
    @MainActor
    func testDrillDownFiltersThePipeline() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        let interview = app.buttons["Interview"]
        XCTAssertTrue(interview.waitForExistence(timeout: 5))
        interview.tap()
        let chip = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "From Insights")).firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 5), "From Insights chip")
        try snapshot("drilldown")
        try audit(app, "drilldown")
    }

    @MainActor
    func testLowerCardsAtTheirScrollPosition() throws {
        for card in ["breakdown", "first-response", "activity"] {
            let app = launch(dataset: "populated", contentSize: nil, card: card)
            try snapshot("card-\(card)")
            app.terminate()
        }
    }

    // MARK: Helpers

    /// Ignored issues, each a documented false positive (docs/design/critiques/ios/insights/
    /// accessibility.md): system bars; contrast under the translucent navigation bar or the iOS 26
    /// scroll-edge band above the tab bar; disabled controls; "Dynamic Type unsupported" and
    /// clipping predictions at the default size (the AX run measures them); issues without an
    /// element (nodes XCUITest can't resolve). Scrolled pages skip contrast (the audit re-scrolls
    /// while it measures).
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, defaultSize: Bool = true, contrast: Bool = true) throws {
        let navBottom = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : 0
        let edgeTop = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY - 44 : .greatestFiniteMagnitude
        try snapshot("audit-\(context)")
        let types = contrast ? XCUIAccessibilityAuditType.all : XCUIAccessibilityAuditType.all.subtracting(.contrast)
        try app.performAccessibilityAudit(for: types) { issue in
            let element = issue.element
            let frame = element?.frame ?? .null
            let ignored: String? = {
                if let element, element.elementType == .tabBar || element.elementType == .statusBar { return "system bar" }
                if let element, !element.isEnabled { return "disabled control" }
                if issue.auditType == .contrast, !frame.isNull, frame.minY < navBottom || frame.maxY > edgeTop { return "under a bar or the edge band" }
                if issue.auditType == .dynamicType, defaultSize { return "default size; AX run covers scaling" }
                if element == nil { return "no element" }
                if issue.auditType == .textClipped, defaultSize, issue.detailedDescription.contains("larger Dynamic Type") { return "prediction; AX run measures it" }
                return nil
            }()
            self.log("\(ignored.map { "IGNORED (\($0))" } ?? "KEPT") \(context): \(issue.compactDescription) — \(element?.debugDescription.prefix(240) ?? "no element")")
            return ignored != nil
        }
    }

    @MainActor
    private func scrollAudit(_ app: XCUIApplication, _ context: String, pages: Int, defaultSize: Bool = true) throws {
        try audit(app, "\(context)-top", defaultSize: defaultSize)
        for page in 1...pages {
            app.swipeUp()
            Thread.sleep(forTimeInterval: 1.0)
            try audit(app, "\(context)-page\(page)", defaultSize: defaultSize, contrast: false)
        }
    }

    private var shotsDirectory: URL? {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_INSIGHTS_SHOTS"], !directory.isEmpty else { return nil }
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

    @MainActor
    private func snapshot(_ name: String) throws {
        guard let directory = shotsDirectory else { return }
        Thread.sleep(forTimeInterval: 0.8)
        let suffix = ProcessInfo.processInfo.environment["BFHR_INSIGHTS_SHOTS_SUFFIX"] ?? ""
        let file = directory.appendingPathComponent("insights-\(name)\(suffix).png")
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
    }

    @MainActor
    private func launch(dataset: String, contentSize: String?, card: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", "insights", "-BFHRDesign", dataset]
        if let card { app.launchArguments += ["-BFHRInsightsCard", card] }
        if let contentSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        app.launch()
        XCTAssertTrue(app.navigationBars["Insights"].waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1.5)
        return app
    }
}
