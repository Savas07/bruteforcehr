import XCTest

/// The Jobs tab in design mode (Debug builds): Xcode's accessibility audit on the feed (populated
/// and first use) at the default and the largest accessibility text size, Saved searches, the
/// Apply sheet (checklist, kit with "Did you apply?", email review) and the paste-a-link review,
/// plus the feed's interactions: Not for me → inline hidden row → Undo, the Work mode chip,
/// the Saved scope, and "Get alerts for this search" creating a saved-search chip.
final class JobsAccessibilityAuditTests: XCTestCase {
    private let english = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    private let largestText = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    /// Launches design mode on `screen` and waits for `ready` (an accessibility identifier).
    @MainActor
    private func launch(_ screen: String, design: String = "populated", ax: Bool = false, extra: [String] = [], ready: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += english + ["-BFHRScreen", screen, "-BFHRDesign", design] + extra + (ax ? largestText : [])
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)[ready].firstMatch.waitForExistence(timeout: 20), "\(screen) shows \(ready)")
        return app
    }

    // MARK: Audits

    @MainActor
    func testAuditFeedPopulatedDefaultSize() throws {
        let app = launch("jobs", ready: "jobs.feed")
        try auditWholeScreen(app, "feed", ax: false, pages: 6)
    }

    @MainActor
    func testAuditFeedPopulatedLargestText() throws {
        let app = launch("jobs", ax: true, ready: "jobs.feed")
        try auditWholeScreen(app, "feed AX", ax: true, pages: 12)
    }

    @MainActor
    func testAuditFeedEmptyDefaultSize() throws {
        let app = launch("jobs", design: "empty", ready: "jobs.feed")
        try auditWholeScreen(app, "feed empty", ax: false, pages: 1)
    }

    @MainActor
    func testAuditFeedEmptyLargestText() throws {
        let app = launch("jobs", design: "empty", ax: true, ready: "jobs.feed")
        try auditWholeScreen(app, "feed empty AX", ax: true, pages: 4)
    }

    @MainActor
    func testAuditSavedSearches() throws {
        let app = launch("saved-searches", ready: "screen.savedSearches")
        try auditWholeScreen(app, "saved searches", ax: false, pages: 2)
    }

    @MainActor
    func testAuditSavedSearchesLargestText() throws {
        let app = launch("saved-searches", ax: true, ready: "screen.savedSearches")
        try auditWholeScreen(app, "saved searches AX", ax: true, pages: 6)
    }

    @MainActor
    func testAuditApplyChecklist() throws {
        let app = launch("apply", extra: ["-BFHRApplyStep", "checklist"], ready: "apply.continue")
        try auditSheet(app, "apply checklist", bar: app.buttons["apply.continue"], pages: 3)
    }

    @MainActor
    func testAuditApplyChecklistLargestText() throws {
        let app = launch("apply", ax: true, extra: ["-BFHRApplyStep", "checklist"], ready: "apply.continue")
        try auditSheet(app, "apply checklist AX", bar: app.buttons["apply.continue"], ax: true, pages: 8)
    }

    @MainActor
    func testAuditApplyKitWithPrompt() throws {
        let app = launch("apply", extra: ["-BFHRApplyStep", "prompt"], ready: "apply.openSite")
        XCTAssertTrue(app.buttons["Yes, I applied"].waitForExistence(timeout: 5), "Did you apply? on the kit")
        try auditSheet(app, "apply kit + prompt", bar: app.buttons["apply.openSite"], pages: 2)
    }

    @MainActor
    func testAuditApplyEmail() throws {
        let app = launch("apply", extra: ["-BFHRApplyStep", "email"], ready: "apply.send")
        try auditSheet(app, "apply email", bar: app.buttons["apply.send"], pages: 3)
    }

    @MainActor
    func testAuditImportReview() throws {
        let app = launch("jobs", extra: ["-BFHRJobsImport", "review"], ready: "import.sheet")
        XCTAssertTrue(app.descendants(matching: .any)["import.title"].firstMatch.waitForExistence(timeout: 10), "review fields")
        try auditSheet(app, "import review", bar: nil, pages: 2)
    }

    // MARK: Interactions

    /// Trailing swipe → Not for me leaves "Hidden: … · Undo · Tell us why" in place; Undo brings
    /// the job back.
    @MainActor
    func testNotForMeLeavesInlineUndo() throws {
        let app = launch("jobs", ready: "jobs.feed")
        let row = firstRow(app)
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        let id = row.identifier
        row.swipeLeft()
        let notForMe = app.buttons["Not for me"].firstMatch
        XCTAssertTrue(notForMe.waitForExistence(timeout: 5), "trailing swipe shows Not for me")
        notForMe.tap()
        let undo = app.buttons["jobs.hidden.undo"].firstMatch
        XCTAssertTrue(undo.waitForExistence(timeout: 5), "inline hidden row")
        XCTAssertFalse(app.descendants(matching: .any)[id].firstMatch.exists, "the row is replaced")
        XCTAssertTrue(contains(app, "Hidden: ").exists)
        undo.tap()
        XCTAssertTrue(app.descendants(matching: .any)[id].firstMatch.waitForExistence(timeout: 5), "Undo restores the row")
        XCTAssertFalse(app.buttons["jobs.hidden.undo"].firstMatch.exists)
    }

    /// Work mode → Remote → Show results: fewer jobs, every row remote, the chip shows the value.
    @MainActor
    func testWorkModeFilter() throws {
        let app = launch("jobs", ready: "jobs.feed")
        let before = try jobCount(app)
        applyRemoteFilter(app)
        let chip = app.buttons["jobs.filter.remote"]
        XCTAssertTrue(chip.waitForExistence(timeout: 5))
        XCTAssertEqual(chip.label, "Work mode: Remote")
        XCTAssertTrue(chip.isSelected, "active chip")
        let after = try jobCount(app)
        XCTAssertGreaterThan(after, 0)
        XCTAssertLessThan(after, before)
        let rows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'jobs.row.'")).allElementsBoundByIndex
        XCTAssertFalse(rows.isEmpty)
        for row in rows where row.isHittable {
            XCTAssertTrue(row.label.contains("Remote"), "remote row: \(row.label)")
        }
    }

    /// The Saved scope lists the saved jobs only.
    @MainActor
    func testSavedScope() throws {
        let app = launch("jobs", ready: "jobs.feed")
        let all = try jobCount(app)
        let saved = app.buttons["jobs.scope.saved"]
        XCTAssertTrue(saved.waitForExistence(timeout: 5))
        saved.tap()
        XCTAssertTrue(saved.isSelected, "Saved selected")
        XCTAssertFalse(app.buttons["jobs.scope.all"].isSelected)
        let count = try jobCount(app)
        XCTAssertGreaterThan(count, 0)
        XCTAssertNotEqual(count, all)
        XCTAssertTrue(firstRow(app).exists)
        app.buttons["jobs.scope.all"].tap()
        XCTAssertEqual(try jobCount(app), all)
    }

    /// "Get alerts for this search" saves the filtered search at once: a new selected chip and
    /// "Search saved · Edit".
    @MainActor
    func testSaveSearchBannerCreatesChip() throws {
        let app = launch("jobs", ready: "jobs.feed")
        XCTAssertFalse(app.switches["jobs.saveSearch"].exists, "no banner without a query or filter")
        applyRemoteFilter(app)
        let banner = app.switches["jobs.saveSearch"].firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 5), "banner after filtering")
        banner.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        XCTAssertTrue(app.staticTexts["Search saved"].waitForExistence(timeout: 5), "toast")
        let chip = app.buttons.matching(NSPredicate(format: "label == 'Remote' AND identifier == ''")).firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 5), "saved-search chip named after the filter")
        XCTAssertTrue(chip.isSelected, "the feed is scoped to the new search")
        XCTAssertFalse(app.switches["jobs.saveSearch"].exists, "banner gone once saved")
    }

    // MARK: Audit helpers

    @MainActor
    private func auditWholeScreen(_ app: XCUIApplication, _ context: String, ax: Bool, pages: Int) throws {
        try audit(app, "\(context) top", ax: ax, bar: nil)
        for page in 0..<pages {
            scrollDown(app)
            try audit(app, "\(context) page \(page + 1)", ax: ax, bar: nil, scrolled: true)
        }
    }

    @MainActor
    private func auditSheet(_ app: XCUIApplication, _ context: String, bar: XCUIElement?, ax: Bool = false, pages: Int) throws {
        try audit(app, "\(context) top", ax: ax, bar: bar, inSheet: true)
        for page in 0..<pages {
            scrollDown(app)
            try audit(app, "\(context) page \(page + 1)", ax: ax, bar: bar, scrolled: true, inSheet: true)
        }
    }

    /// Runs Xcode's audit. Every issue fails the test except these, each logged as an
    /// `IGNORED (…)` activity and an `AUDIT ignored` line (same exemptions as
    /// JobDetailAccessibilityAuditTests, docs/design/critiques/ios/job-detail/accessibility.md):
    /// - system chrome (tab bar, status bar, navigation bar and its glass toolbar buttons);
    /// - elements not fully inside the content area: below the navigation bar, above the tab bar
    ///   or a sheet's sticky bottom bar (capped at AX1 on purpose, Large Content Viewer), minus the
    ///   24 pt scroll-edge fade. The audit reads contrast and clipping from a screenshot, and
    ///   iOS 26 blurs content under the bars;
    /// - disabled controls (WCAG 1.4.3 exempts them);
    /// - issues with no element (the audit can't say what they refer to);
    /// - Dynamic Type / text clipping at the default size: SwiftUI text-style fonts (`Font.bfhr`)
    ///   are reported as fixed yet scale; the AX runs check these against the real layout;
    /// - contrast, Dynamic Type and clipping on scrolled pages: List cells keep stale
    ///   accessibility frames after a scroll, so these screenshot checks measure other pixels.
    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, ax: Bool, bar: XCUIElement?, scrolled: Bool = false, inSheet: Bool = false) throws {
        Thread.sleep(forTimeInterval: 1.0) // let scrolling settle
        let window = app.windows.firstMatch.frame
        let top = app.navigationBars.allElementsBoundByIndex.map(\.frame.maxY).max() ?? window.minY
        var bottom = window.maxY
        if let bar, bar.exists {
            bottom = bar.frame.minY - 8
        } else if !inSheet, app.tabBars.firstMatch.exists {
            bottom = app.tabBars.firstMatch.frame.minY
        }
        let edge: CGFloat = 24
        let content = CGRect(x: window.minX, y: top + edge, width: window.width, height: max(0, bottom - top - 2 * edge))
        // "Audit failed to complete in time" (-56) happens on long AX pages when the simulator is
        // busy: retry up to twice after letting it settle.
        for attempt in 0..<3 {
            do {
                try runAudit(app, context, content: content, ax: ax, scrolled: scrolled)
                return
            } catch let error as NSError where error.code == -56 && attempt < 2 {
                // A hung audit is usually stuck on one cell mid-layout: settle, and on the second
                // retry move the viewport a little (pages overlap, so nothing is skipped).
                Thread.sleep(forTimeInterval: 2)
                if attempt == 1 {
                    let window = app.windows.firstMatch
                    window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
                        .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)), withVelocity: .slow, thenHoldForDuration: 0.3)
                }
            }
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

    // MARK: Helpers

    @MainActor
    private func firstRow(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'jobs.row.'")).firstMatch
    }

    /// The result header's "Jobs: N".
    @MainActor
    private func jobCount(_ app: XCUIApplication) throws -> Int {
        let header = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Jobs: '")).firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 5), "result header")
        return try XCTUnwrap(Int(header.label.dropFirst("Jobs: ".count)), header.label)
    }

    /// Work mode chip → Remote → Show results.
    @MainActor
    private func applyRemoteFilter(_ app: XCUIApplication) {
        let chip = app.buttons["jobs.filter.remote"]
        XCTAssertTrue(chip.waitForExistence(timeout: 5))
        chip.tap()
        XCTAssertTrue(app.navigationBars["Work mode"].waitForExistence(timeout: 5), "Work mode sheet")
        let remote = app.switches["Remote"].exists ? app.switches["Remote"] : app.buttons["Remote"].firstMatch
        XCTAssertTrue(remote.waitForExistence(timeout: 5))
        remote.tap()
        let show = app.buttons["filters.show"]
        XCTAssertTrue(show.waitForExistence(timeout: 5))
        show.tap()
        XCTAssertTrue(app.navigationBars["Work mode"].waitForNonExistence(timeout: 5), "sheet closed")
    }

    @MainActor
    private func contains(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    /// Drags the content up by about a third of the screen, above any sticky bottom bar.
    @MainActor
    private func scrollDown(_ app: XCUIApplication) {
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)), withVelocity: .slow, thenHoldForDuration: 0.1)
    }
}
