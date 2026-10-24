import XCTest

/// Accessibility audits of Settings (every page) and Connect email (every step) in design mode
/// (Debug builds), at the default text size and the largest accessibility size. Run with
/// `xcodebuild test -only-testing:BruteForceHRUITests/SettingsMailAccessibilityAuditTests`.
/// Known false positives are listed in `runAudit` and in
/// docs/design/critiques/ios/settings/accessibility.md.
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
        XCTAssertTrue(app.buttons["Keep connected"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Disconnect and delete email data"].exists)
        try runAudit(app, atAccessibilitySize: false)
        app.buttons["Keep connected"].tap()
    }

    private static let largest = "UICTContentSizeCategoryAccessibilityXXXL"

    @MainActor
    private func audit(screen: String, argument: String, value: String, contentSize: String?, dataset: String = "populated") throws {
        let app = launch(screen: screen, argument: argument, value: value, contentSize: contentSize, dataset: dataset)
        print("AUDIT screen \(screen) \(value) \(contentSize ?? "default")")
        try runAudit(app, atAccessibilitySize: contentSize != nil)
        app.terminate()
    }

    /// Every issue fails the test except these known false positives, each logged:
    /// - Dynamic Type / text clipping at the default size: SwiftUI text-style fonts are reported as
    ///   fixed, yet scale; the largest accessibility size is audited too.
    /// - Contrast of system glass toolbar buttons (Cancel, Done): the audit samples the blurred
    ///   backdrop, not the resting background.
    /// - Element detection on an element without a label: the sheet's rounded corner over the
    ///   dimmed screen behind it.
    @MainActor
    private func runAudit(_ app: XCUIApplication, atAccessibilitySize: Bool) throws {
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            let summary = "\(issue.auditType.rawValue) | \(issue.compactDescription) | \(element.map { "\($0.elementType.rawValue) '\($0.label)' \($0.frame)" } ?? "no element")"
            let ignored: Bool = switch issue.auditType {
            case .dynamicType, .textClipped: !atAccessibilitySize
            case .contrast: element?.elementType == .button && app.navigationBars.buttons[element?.label ?? ""].exists
            case .elementDetection: element?.label.isEmpty ?? true
            default: false
            }
            print("AUDIT \(ignored ? "ignored" : "FAILED") \(summary)")
            return ignored
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
