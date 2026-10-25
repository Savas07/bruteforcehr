import XCTest

/// Accessibility audits of Settings (every page) and Connect email (every step) in design mode
/// (Debug builds), at the default text size and the largest accessibility size. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/SettingsMailAccessibilityAuditTests`.
/// Exemptions are listed in `runAudit` and in docs/design/critiques/ios/settings/accessibility.md.
final class SettingsMailAccessibilityAuditTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = true
    }

    private static let settingsPages = ["root", "mail-accounts", "mail-account", "job-sources", "companies", "notifications", "notifications-off", "ai"]
    private static let connectSteps = ["providers", "google", "google-not-configured", "imap", "imap-error", "imap-host-error", "outlook-address", "scanning", "done", "failed"]

    @MainActor
    func testSettingsDefaultSize() throws {
        for page in Self.settingsPages { try audit(screen: "settings", argument: "-BFHRSettingsPage", value: page, contentSize: nil) }
    }

    @MainActor
    func testSettingsAccessibilitySize() throws {
        for page in Self.settingsPages { try audit(screen: "settings", argument: "-BFHRSettingsPage", value: page, contentSize: Self.largest) }
    }

    @MainActor
    func testSettingsEmpty() throws {
        try audit(screen: "settings", argument: "-BFHRSettingsPage", value: "mail-accounts", contentSize: nil, dataset: "empty")
    }

    @MainActor
    func testConnectDefaultSize() throws {
        for step in Self.connectSteps { try audit(screen: "mail-connect", argument: "-BFHRConnectStep", value: step, contentSize: nil) }
    }

    @MainActor
    func testConnectAccessibilitySize() throws {
        for step in Self.connectSteps { try audit(screen: "mail-connect", argument: "-BFHRConnectStep", value: step, contentSize: Self.largest) }
    }

    /// The disconnect confirmation (the destructive dialog's wording and focus).
    @MainActor
    func testDisconnectConfirmation() throws {
        let app = launch(screen: "settings", argument: "-BFHRSettingsPage", value: "mail-account", contentSize: nil, dataset: "populated")
        let disconnect = app.buttons["settings.account.disconnect"]
        var swipes = 0
        while !(disconnect.exists && disconnect.isHittable), swipes < 6 { app.swipeUp(); swipes += 1 }
        disconnect.tap()
        // The alert's safe choice is visible and named as the safe choice.
        let keep = app.alerts.buttons["Keep connected"]
        XCTAssertTrue(keep.waitForExistence(timeout: 5))
        XCTAssertTrue(app.alerts.buttons["Disconnect and delete email data"].exists)
        try runAudit(app, atAccessibilitySize: false)
        keep.tap()
    }

    private static let largest = "UICTContentSizeCategoryAccessibilityXXXL"

    @MainActor
    private func audit(screen: String, argument: String, value: String, contentSize: String?, dataset: String = "populated") throws {
        let app = launch(screen: screen, argument: argument, value: value, contentSize: contentSize, dataset: dataset)
        print("AUDIT screen \(screen) \(value) \(contentSize ?? "default")")
        try runAudit(app, atAccessibilitySize: contentSize != nil)
        app.terminate()
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
    private func runAudit(_ app: XCUIApplication, atAccessibilitySize: Bool) throws {
        app.settleForAudit()
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
    private func launch(screen: String, argument: String, value: String, contentSize: String?, dataset: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-BFHRScreen", screen, "-BFHRDesign", dataset, argument, value]
        if let contentSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        app.launch()
        let sheet = app.descendants(matching: .any).matching(NSPredicate(format: "identifier IN %@", [
            "settings", "connect.providers", "connect.oauth", "connect.appPassword", "connect.scan",
        ])).firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 20), "\(screen) \(value)")
        Thread.sleep(forTimeInterval: 1.5)
        return app
    }
}
