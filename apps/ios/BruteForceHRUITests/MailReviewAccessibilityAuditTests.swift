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

    /// Runs the full audit. Every issue fails the test except these known false positives, each
    /// logged (docs/design/critiques/ios/mail-review/accessibility.md):
    /// - Dynamic Type / text clipping at the default size: SwiftUI text-style fonts (`Font.bfhr`)
    ///   are reported as fixed, yet scale; the same screens are audited at the largest
    ///   accessibility size, where clipping is checked against the real layout and passes.
    /// - Contrast of content under the floating tab bar's scroll-edge blur, and of system glass
    ///   toolbar buttons: the audit samples the blurred backdrop, not the resting background.
    /// - Element detection on an element without a label: the sheet's rounded corner over the
    ///   dimmed tab root (no text in it).
    @MainActor
    private func runAudit(_ app: XCUIApplication, atAccessibilitySize: Bool = false) throws {
        let tabBar = app.tabBars.firstMatch
        let bottomEdge = tabBar.exists ? tabBar.frame.minY - 72 : .greatestFiniteMagnitude
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            let summary = "\(issue.auditType.rawValue) | \(issue.compactDescription) | \(element.map { "\($0.elementType.rawValue) '\($0.label)' \($0.frame)" } ?? "no element")"
            let ignored: Bool = switch issue.auditType {
            case .dynamicType, .textClipped: !atAccessibilitySize
            case .contrast:
                (element.map { $0.frame.maxY > bottomEdge } ?? false)
                    || element?.elementType == .button && app.navigationBars.buttons[element?.label ?? ""].exists
            case .elementDetection: element?.label.isEmpty ?? true
            default: false
            }
            print("AUDIT \(ignored ? "ignored" : "FAILED") \(summary)")
            return ignored
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
