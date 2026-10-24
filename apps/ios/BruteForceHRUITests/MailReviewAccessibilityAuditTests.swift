import XCTest

/// Accessibility audit of the Mail tab in design mode (Debug builds): populated and empty data,
/// at the default text size and at the largest accessibility size. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/MailReviewAccessibilityAuditTests`.
final class MailReviewAccessibilityAuditTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    func testPopulatedDefaultSize() throws {
        try audit(dataset: "populated", contentSize: nil)
    }

    @MainActor
    func testPopulatedAccessibilitySize() throws {
        try audit(dataset: "populated", contentSize: "UICTContentSizeCategoryAccessibilityXXXL")
    }

    @MainActor
    func testEmptyDefaultSize() throws {
        try audit(dataset: "empty", contentSize: nil)
    }

    @MainActor
    func testEmptyAccessibilitySize() throws {
        try audit(dataset: "empty", contentSize: "UICTContentSizeCategoryAccessibilityXXXL")
    }

    /// The review sheet (populated, default size): proposal, evidence, fields and actions.
    @MainActor
    func testReviewSheet() throws {
        let app = launch(dataset: "populated", contentSize: nil)
        app.swipeUp()
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Lena Vogel")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        XCTAssertTrue(app.buttons["Confirm"].waitForExistence(timeout: 10))
        try runAudit(app)
    }

    /// M5: the review sheet with a suggested interview, the email sheet with Add interview,
    /// Updates with Add interview and the scanning card, default and largest size.
    @MainActor
    func testLivePanes() throws {
        for pane in ["review", "email", "add-interview", "scanning"] {
            for size in [nil, "UICTContentSizeCategoryAccessibilityXXXL"] {
                let app = launch(dataset: "populated", contentSize: size, extra: ["-BFHRMailPane", pane])
                print("AUDIT pane \(pane) \(size ?? "default")")
                try runAudit(app, atAccessibilitySize: size != nil)
                app.terminate()
            }
        }
    }

    /// Not an audit: saves the screens behind interactions (the scrolled queue, the review sheet,
    /// Change…, Updates, All job mail) at the default and the largest text size for the design
    /// critique. Runs only with `TEST_RUNNER_BFHR_MAIL_SHOTS=<dir>`.
    @MainActor
    func testCaptureInteractionScreens() throws {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_MAIL_SHOTS"] else {
            throw XCTSkip("Critique screenshots only")
        }
        for ax in [false, true] {
            let app = launch(dataset: "populated", contentSize: ax ? "UICTContentSizeCategoryAccessibilityXXXL" : nil)
            func shot(_ name: String) throws {
                Thread.sleep(forTimeInterval: 0.8)
                let file = URL(fileURLWithPath: directory).appendingPathComponent("\(name)\(ax ? "-ax" : "").png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            }
            func element(_ label: String) -> XCUIElement {
                app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
            }
            element("Updates").tap()
            try shot("updates")
            element("All job mail").tap()
            try shot("all-job-mail")
            app.swipeUp()
            try shot("all-job-mail-scrolled")
            app.terminate()

            let queue = launch(dataset: "populated", contentSize: ax ? "UICTContentSizeCategoryAccessibilityXXXL" : nil)
            queue.swipeUp()
            try shot("queue-scrolled")
            let row = queue.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Lena Vogel")).firstMatch
            guard row.waitForExistence(timeout: 5) else { continue }
            row.tap()
            try shot("sheet-medium")
            queue.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Change…")).firstMatch.tap()
            try shot("sheet-change")
            queue.terminate()
        }
    }

    /// Not an audit: the M5 live-mail states behind a scroll or a sheet (review sheet with the
    /// suggested interview at the large detent, the email sheet with Add interview, Updates with
    /// Add interview, the scanning card, the application timeline's linked email) for the
    /// critique. Runs only with `TEST_RUNNER_BFHR_MAIL_SHOTS=<dir>`.
    @MainActor
    func testCaptureLiveScreens() throws {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_MAIL_SHOTS"] else {
            throw XCTSkip("Critique screenshots only")
        }
        let theme = ProcessInfo.processInfo.environment["BFHR_MAIL_SHOTS_SUFFIX"] ?? ""
        for ax in [false, true] {
            let size = ax ? "UICTContentSizeCategoryAccessibilityXXXL" : nil
            func shot(_ name: String) throws {
                Thread.sleep(forTimeInterval: 1.0)
                let file = URL(fileURLWithPath: directory).appendingPathComponent("live-\(name)\(theme)\(ax ? "-ax" : "").png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            }
            let review = launch(dataset: "populated", contentSize: size, extra: ["-BFHRMailPane", "review"])
            review.swipeUp()
            try shot("review-large")
            review.swipeUp()
            try shot("review-large-scrolled")
            review.terminate()

            let email = launch(dataset: "populated", contentSize: size, extra: ["-BFHRMailPane", "email"])
            try shot("email")
            email.swipeUp()
            try shot("email-large")
            email.terminate()

            let updates = launch(dataset: "populated", contentSize: size, extra: ["-BFHRMailPane", "add-interview"])
            updates.swipeUp()
            try shot("updates-add-interview")
            updates.terminate()

            let scanning = launch(dataset: "populated", contentSize: size, extra: ["-BFHRMailPane", "scanning"])
            try shot("scanning")
            scanning.terminate()

            let timeline = XCUIApplication()
            timeline.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", "tracker-board", "-BFHRTrackerPane", "detail"]
            if let size { timeline.launchArguments += ["-UIPreferredContentSizeCategoryName", size] }
            timeline.launch()
            let email2 = timeline.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", "Email from")).firstMatch
            var swipes = 0
            while !(email2.exists && email2.isHittable), swipes < 12 { timeline.swipeUp(); swipes += 1 }
            try shot("timeline-email")
            timeline.terminate()
        }
    }

    @MainActor
    private func audit(dataset: String, contentSize: String?) throws {
        let app = launch(dataset: dataset, contentSize: contentSize)
        try runAudit(app, atAccessibilitySize: contentSize != nil)
    }

    /// Runs Xcode's audit with the exemptions of JobsAccessibilityAuditTests (docs/design/critiques/
    /// ios/job-detail/accessibility.md), each logged as `AUDIT ignored (…)`:
    /// - issues with no element (the audit can't say what they refer to);
    /// - system chrome (tab bar, status bar, navigation bar and its glass toolbar buttons);
    /// - disabled controls (WCAG 1.4.3 exempts them);
    /// - Dynamic Type / text clipping at the default size (text styles scale; the AX runs check);
    /// - elements not fully inside the content area: below the navigation bar, above the tab bar or
    ///   a sheet's sticky bottom bar (`sheet.bar`, capped at AX1 on purpose), minus the 24 pt
    ///   scroll-edge fade. The audit reads contrast and clipping from a screenshot, and iOS 26
    ///   blurs content under the bars.
    @MainActor
    private func runAudit(_ app: XCUIApplication, atAccessibilitySize: Bool = false) throws {
        Thread.sleep(forTimeInterval: 0.5)
        let window = app.windows.firstMatch.frame
        let top = app.navigationBars.allElementsBoundByIndex.map(\.frame.maxY).max() ?? window.minY
        var bottom = window.maxY
        let bar = app.descendants(matching: .any)["sheet.bar"].firstMatch
        if bar.exists {
            bottom = bar.frame.minY - 8
        } else if app.tabBars.firstMatch.exists {
            bottom = app.tabBars.firstMatch.frame.minY
        }
        let edge: CGFloat = 24
        let content = CGRect(x: window.minX, y: top + edge, width: window.width, height: max(0, bottom - top - 2 * edge))
        try app.performAccessibilityAudit { issue in
            func ignore(_ reason: String) -> Bool {
                print("AUDIT ignored (\(reason)): \(issue.compactDescription) — \(issue.element.map { "'\($0.label)' \($0.frame)" } ?? "no element")")
                return true
            }
            guard let element = issue.element, element.exists else { return ignore("no element") }
            if [.tabBar, .statusBar, .navigationBar].contains(element.elementType) { return ignore("system chrome") }
            if element.elementType == .button, app.navigationBars.buttons[element.label].exists { return ignore("system chrome") }
            if !element.isEnabled { return ignore("disabled control") }
            if !atAccessibilitySize, [.dynamicType, .textClipped].contains(issue.auditType) { return ignore("default-size Dynamic Type, AX run checks it") }
            if !content.contains(element.frame) { return ignore("under bars / off screen") }
            print("AUDIT FAILED \(issue.auditType.rawValue) | \(issue.compactDescription) | \(element.elementType.rawValue) '\(element.label)' \(element.frame)")
            return false
        }
    }

    @MainActor
    private func launch(dataset: String, contentSize: String?, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", "mail-review", "-BFHRDesign", dataset] + extra
        if let contentSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["design.mail-review"].waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1.0)
        return app
    }
}
