import XCTest

/// Not part of normal runs: the CV Studio against the live Firebase project with a throwaway
/// test user (docs/design/foundation-ios.md, "Live check"). Driven by a shell:
///
/// 1. `SignInEndToEndTests.testSendsLink` (`BFHR_E2E_EMAIL`), then the shell creates the sign-in
///    link with the Identity Toolkit API.
/// 2. `testSignsInAndEditsCV` (`BFHR_E2E_LINK`): signs in, starts a CV from scratch, writes the
///    summary (a revision), asks Claude for suggestions (`cvAssist`), changes the template,
///    restores the first version, renders the Preview and opens the PDF share sheet.
/// 3. `testImportsJSONResume` (`BFHR_E2E_IMPORT`, a JSON Resume file on the Mac): uploads it to
///    Cloud Storage, reads it with `cvImport` and creates the CV from the review screen.
/// 4. The shell reads `users/{uid}/cvs` and the revisions through the Firestore REST API, then
///    deletes the data, the Storage objects and the user.
final class CVStudioEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"] + extra
        app.launch()
        return app
    }

    @MainActor
    private func shot(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("cv-e2e-\(name).png"))
    }

    @MainActor
    private func openCVsTab(_ app: XCUIApplication) {
        let tab = app.tabBars.buttons["CVs"]
        XCTAssertTrue(tab.waitForExistence(timeout: 30), "signed in")
        tab.tap()
    }

    @MainActor
    private func waitSaved(_ app: XCUIApplication) {
        let saved = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Saved ·")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 30), "the server confirmed the write")
    }

    @MainActor
    func testSignsInAndEditsCV() throws {
        let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
        let app = launch()
        if !app.tabBars.firstMatch.waitForExistence(timeout: 5) { app.open(link) }
        openCVsTab(app)

        // Empty account: Start from scratch creates CV + first revision.
        let scratch = app.buttons["Start from scratch"]
        XCTAssertTrue(scratch.waitForExistence(timeout: 30), "empty state from live Firestore")
        shot("empty")
        scratch.tap()
        waitSaved(app)

        // Summary sheet: type, then ✦ Improve through cvAssist, then save.
        app.buttons["Add a short summary"].tap()
        let field = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText("Backend engineer who builds payment systems in Go and keeps them reliable.")
        app.buttons["Improve with AI"].tap()
        let suggestion = app.descendants(matching: .any)["cv.assist.suggestion.1"]
        let failed = app.staticTexts["We couldn't get suggestions. Check your connection, then try again."]
        let none = app.staticTexts["No suggestions for this text. Try another option above."]
        let deadline = Date().addingTimeInterval(60)
        while Date() < deadline, !(suggestion.exists || failed.exists || none.exists) { Thread.sleep(forTimeInterval: 1) }
        shot("assist")
        XCTAssertTrue(suggestion.exists || none.exists, "cvAssist answered (failed: \(failed.exists))")
        app.buttons["cv.assist.keepMine"].tap()
        app.buttons["Save"].tap()
        waitSaved(app)

        // Template: Modern, one design revision.
        app.buttons["cv.template"].tap()
        let modern = app.buttons["cv.template.modern"]
        XCTAssertTrue(modern.waitForExistence(timeout: 10))
        modern.tap()
        app.buttons["cv.template.done"].tap()
        waitSaved(app)

        // Preview renders cv-render's HTML; Share PDF builds the file and opens the share sheet.
        app.buttons["Preview"].tap()
        XCTAssertTrue(app.webViews["cv.preview.web"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Pages: 1")).firstMatch.waitForExistence(timeout: 15))
        shot("preview")
        app.buttons["cv.preview.share"].tap()
        XCTAssertTrue(app.otherElements["ActivityListView"].waitForExistence(timeout: 15) || app.navigationBars.containing(NSPredicate(format: "identifier CONTAINS %@", "PDF")).firstMatch.exists)
        shot("share")
        app.swipeDown(velocity: .fast)

        // History: three versions; restore the first one.
        app.buttons["Edit"].firstMatch.tap()
        app.buttons["cv.more"].tap()
        app.buttons["Version history"].tap()
        let created = app.staticTexts["Created this CV"]
        XCTAssertTrue(created.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Edited Summary"].exists && app.staticTexts["Changed the design · Modern"].exists)
        shot("history")
        created.tap()
        app.buttons["cv.history.restore"].tap()
        app.buttons["Restore"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Restored the version from")).firstMatch.waitForExistence(timeout: 10))
        app.buttons["Done"].tap()
        waitSaved(app)
        shot("restored")
    }

    @MainActor
    func testImportsJSONResume() throws {
        let file = try environment("BFHR_E2E_IMPORT")
        let app = launch(["-BFHRImportFile", file])
        openCVsTab(app)
        let create = app.buttons["cv.import.create"]
        XCTAssertTrue(create.waitForExistence(timeout: 90), "uploaded and read by cvImport")
        XCTAssertTrue(app.navigationBars["Did we read your CV correctly?"].exists)
        shot("import-review")
        create.tap()
        waitSaved(app)
        app.buttons["cv.more"].tap()
        app.buttons["Version history"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Imported from")).firstMatch.waitForExistence(timeout: 10))
        shot("import-history")
    }
}
