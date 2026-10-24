import XCTest

/// Share Extension sheet: `performAccessibilityAudit()` on every state of `JobImportShareSheet`,
/// hosted by the app in design mode (`-BFHRShareSheet <state>`, Debug builds; the extension itself
/// can't take launch arguments), at the default and the largest accessibility text size, the main
/// states in Turkish and German too, plus the promises: Save works from the form, a failure
/// offers "Add it by hand", hand entry needs role and company.
final class ShareSheetAccessibilityAuditTests: XCTestCase {
    private let axSize = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    private let states = ["reading", "ready", "ai", "existing", "saved", "logged", "blocked", "offline", "signed-out", "manual"]

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor
    private func launch(_ state: String, language code: String = "en", ax: Bool = false) -> XCUIApplication {
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(\(code))", "-AppleLocale", locale, "-BFHRShareSheet", state] + (ax ? axSize : [])
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)["share.sheet"].waitForExistence(timeout: 20), state)
        Thread.sleep(forTimeInterval: 1.0)
        return app
    }

    @MainActor
    private func audit(_ app: XCUIApplication, _ context: String) throws {
        if let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] {
            let name = "share-sheet-audit-\(context.replacingOccurrences(of: " ", with: "-")).png"
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name))
        }
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
            XCTContext.runActivity(named: "ISSUE \(context): \(issue.compactDescription) — \(element.debugDescription.prefix(240))") { _ in }
            return false
        }
    }

    @MainActor
    func testEveryStateDefaultSize() throws {
        for state in states {
            let app = launch(state)
            try audit(app, state)
            app.terminate()
        }
    }

    @MainActor
    func testEveryStateAccessibilitySize() throws {
        for state in states {
            let app = launch(state, ax: true)
            try audit(app, "\(state) AX")
            app.terminate()
        }
    }

    @MainActor
    func testTurkishAndGerman() throws {
        for code in ["tr", "de"] {
            for state in ["ready", "blocked", "saved", "manual"] {
                let app = launch(state, language: code)
                try audit(app, "\(state) \(code)")
                app.terminate()
            }
        }
    }

    @MainActor
    func testSaveFromTheForm() throws {
        let app = launch("ready")
        let save = app.buttons["share.save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.descendants(matching: .any)["share.saved"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["share.done"].exists)
    }

    @MainActor
    func testFailureOffersHandEntry() throws {
        let app = launch("blocked")
        XCTAssertFalse(app.buttons["share.retry"].exists, "a wall doesn't go away on retry")
        app.buttons["share.addByHand"].tap()
        let save = app.buttons["share.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertFalse(save.isEnabled, "role and company are required")
        let role = app.textFields["share.role"]
        role.tap()
        role.typeText("Designer")
        let company = app.textFields["share.company"]
        company.tap()
        company.typeText("Acme")
        XCTAssertTrue(save.isEnabled)
    }
}
