import XCTest

/// Settings › Data & privacy and Delete account: XCUITest's `performAccessibilityAudit()` on every
/// design state (`-BFHRDataPrivacy <state>`, Debug builds) at the default text size and the largest
/// accessibility size, the main states in Turkish and German too, plus the flow's promises: Delete
/// everything stays disabled until the word is typed, and Keep my account goes back.
///
/// Pages after a scroll skip the screenshot-based checks (XCUITest keeps the pre-scroll frames of a
/// scroll view's texts; same limitation as SignInAccessibilityAuditTests). Issues without an
/// element are logged for review (foundation-ios.md, "Accessibility audits").
final class DataPrivacyAccessibilityAuditTests: XCTestCase {
    private let axSize = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    private let allStates = [
        "idle", "preparing", "downloading", "ready", "saved", "downloadError", "tooSoon", "dailyLimit", "tooLarge",
        "exportError", "offline", "deleteEmpty", "deleteTyped", "reauthNeeded", "linkSent", "linkExpired", "reauthDone",
        "deleting", "deleteError", "deleteOffline",
    ]
    private let deleteStates: Set<String> = [
        "deleteEmpty", "deleteTyped", "reauthNeeded", "linkSent", "linkExpired", "reauthDone", "deleting", "deleteError",
        "deleteOffline",
    ]

    override func setUp() {
        continueAfterFailure = true
    }

    private func language(_ code: String) -> [String] {
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        return ["-AppleLanguages", "(\(code))", "-AppleLocale", locale]
    }

    @MainActor
    private func launch(_ state: String, language code: String = "en", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += language(code) + ["-BFHRDataPrivacy", state] + extra
        app.launch()
        return app
    }

    @MainActor
    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String, language: String, scrolled: Bool) throws {
        Thread.sleep(forTimeInterval: 0.8)
        let keyboard = app.keyboards.firstMatch
        try app.performAccessibilityAudit { issue in
            guard let element = issue.element else {
                XCTContext.runActivity(named: "IGNORED (no element) \(context): \(issue.compactDescription)") { _ in }
                return true
            }
            if [.statusBar, .keyboard, .key].contains(element.elementType) { return true }
            if keyboard.exists, keyboard.frame.intersects(element.frame) { return true }
            if !app.frame.contains(element.frame) {
                XCTContext.runActivity(named: "IGNORED (partly off screen) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            if scrolled, [.contrast, .dynamicType, .textClipped].contains(issue.auditType) {
                XCTContext.runActivity(named: "IGNORED (visual check after scroll) \(context): \(issue.compactDescription) — \(element.label)") { _ in }
                return true
            }
            // Same known false positive as the sign-in audit: German clipping predictions for
            // sentences the screenshots show in full.
            if language == "de", issue.auditType == .textClipped {
                XCTContext.runActivity(named: "IGNORED (known false positive, German clipping prediction) \(context): \(element.label)") { _ in }
                return true
            }
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    /// Audits one state and the pages below the first (delete screens and AX sizes scroll).
    @MainActor
    private func auditState(_ state: String, language code: String = "en", ax: Bool) throws {
        let context = "\(state) \(code)\(ax ? " AX" : "")"
        let app = launch(state, language: code, extra: ax ? axSize : [])
        let root = deleteStates.contains(state) ? "delete" : "dataPrivacy"
        XCTAssertTrue(element(app, root).waitForExistence(timeout: 20), context)
        try audit(app, context, language: code, scrolled: false)
        for page in 1...(ax ? 4 : 2) {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
            try audit(app, "\(context) page \(page)", language: code, scrolled: true)
        }
        app.terminate()
    }

    @MainActor
    func testEveryStateDefaultSize() throws {
        for state in allStates { try auditState(state, ax: false) }
    }

    @MainActor
    func testEveryStateAccessibilitySize() throws {
        for state in allStates { try auditState(state, ax: true) }
    }

    @MainActor
    func testTurkishAndGerman() throws {
        for code in ["tr", "de"] {
            for state in ["idle", "ready", "tooLarge", "deleteTyped", "linkSent"] {
                try auditState(state, language: code, ax: false)
            }
        }
    }

    // MARK: Behavior

    /// Delete everything is disabled until the word is typed; Keep my account leaves the screen.
    @MainActor
    func testDeleteNeedsTheWordAndKeepGoesBack() throws {
        let app = launch("deleteEmpty")
        XCTAssertTrue(element(app, "delete").waitForExistence(timeout: 20))
        let submit = app.buttons["delete.submit"]
        let field = app.textFields["delete.confirmField"]
        // The list builds rows lazily: scroll until the buttons under the field exist.
        for _ in 0..<5 where !(submit.exists && submit.isHittable) { app.swipeUp() }
        XCTAssertFalse(submit.isEnabled, "Delete everything is disabled before typing")
        field.tap()
        // Return only closes the keyboard; it never deletes.
        field.typeText("delete\n")
        XCTAssertTrue(element(app, "delete").exists, "Return doesn't delete")
        XCTAssertTrue(submit.isEnabled, "any case of the word enables Delete everything")
        app.buttons["delete.keep"].tap()
        XCTAssertTrue(element(app, "dataPrivacy").waitForExistence(timeout: 5))
    }
}
