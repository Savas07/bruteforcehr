import XCTest

/// First-run onboarding on live Firebase (apps/ios/scripts/onboarding-live-check.sh): a new
/// account signs in, imports a JSON Resume through `cvImport` (`-BFHRImportFile`, Debug), edits
/// the pre-filled preferences, starts its first search, lands on Today, then changes Seniority in
/// Settings › Job preferences. The script reads the documents back and deletes the user.
/// Skipped without its variables (`BFHR_E2E_LINK`, `BFHR_E2E_EMAIL`, `BFHR_E2E_IMPORT`).
final class OnboardingEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Set TEST_RUNNER_\(name) (apps/ios/scripts/onboarding-live-check.sh)")
        }
        return value
    }

    @MainActor
    private func capture(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("onboarding-live-\(name).png"))
    }

    @MainActor
    private func scroll(to element: XCUIElement, in app: XCUIApplication) {
        // Short drags without momentum, so an element never jumps past the visible area.
        for _ in 0..<14 where !(element.exists && element.isHittable) {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
    }

    @MainActor
    func testOnboardingOnLiveData() throws {
        let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
        let email = try environment("BFHR_E2E_EMAIL")
        let resume = try environment("BFHR_E2E_IMPORT")
        let role = "iOS Engineer"

        let app = XCUIApplication()
        // Region DE: the salary floor defaults to EUR per year.
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_DE", "-BFHRImportFile", resume]
        app.launch()
        let onboarding = app.descendants(matching: .any)["onboarding"]
        if !onboarding.waitForExistence(timeout: 5) {
            app.open(link)
            // The link wasn't requested on this simulator: the app asks which address it went to.
            let field = app.descendants(matching: .any)["signIn.emailField"]
            if field.waitForExistence(timeout: 15) {
                field.tap()
                field.typeText(email + "\n")
            }
        }
        XCTAssertTrue(onboarding.waitForExistence(timeout: 45), "a new account starts with onboarding, not the tabs")
        XCTAssertFalse(app.tabBars.firstMatch.exists)

        // Step 1: the file goes through cvImport; Continue works while it's read.
        XCTAssertTrue(app.descendants(matching: .any)["onboarding.cv.file"].waitForExistence(timeout: 20), "the import started")
        capture("1-reading")
        let found = app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "Found ")).firstMatch
        XCTAssertTrue(found.waitForExistence(timeout: 120), "cvImport read the CV")
        capture("2-found")
        app.buttons["onboarding.continue"].tap()

        // Step 2: pre-filled from the CV; add a role, a market, remote, a salary floor, an answer.
        XCTAssertTrue(app.staticTexts["We filled in what we could from your CV. Adjust anything that's off."].waitForExistence(timeout: 10))
        capture("3-preferences")
        let roleField = app.textFields["prefs.roles.field"]
        XCTAssertTrue(roleField.waitForExistence(timeout: 5))
        roleField.tap()
        roleField.typeText(role + "\n")
        XCTAssertTrue(app.buttons["Remove \(role)"].waitForExistence(timeout: 5))
        let remote = app.descendants(matching: .any)["prefs.workplace.remote"].firstMatch
        scroll(to: remote, in: app)
        if !remote.isSelected { remote.tap() }
        let netherlands = app.descendants(matching: .any)["prefs.market.NL"].firstMatch
        scroll(to: netherlands, in: app)
        if !netherlands.isSelected { netherlands.tap() }
        let amount = app.textFields["prefs.salary.amount"]
        scroll(to: amount, in: app)
        amount.tap()
        amount.typeText("65000")
        app.buttons["prefs.salary.done"].tap()
        XCTAssertFalse(app.keyboards.firstMatch.exists, "Done closes the number pad")
        let euYes = app.descendants(matching: .any)["prefs.auth.EU"].firstMatch.buttons["Yes"]
        scroll(to: euYes, in: app)
        euYes.tap()
        XCTAssertTrue(euYes.isSelected, "EU / EEA answered Yes")
        capture("4-preferences-edited")
        app.buttons["onboarding.continue"].tap()

        // Step 3: the first search, then Today.
        XCTAssertTrue(app.descendants(matching: .any)["onboarding.finish.summary"].waitForExistence(timeout: 10))
        capture("5-finish")
        app.buttons["onboarding.finish"].tap()
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 60), "Finish lands on the tabs")
        XCTAssertTrue(tabBar.buttons["Today"].isSelected, "on Today")
        capture("6-today")

        // Settings › Job preferences: the same values, and Seniority saves at once.
        app.open(try XCTUnwrap(URL(string: "bruteforcehr://settings/job-preferences")))
        let roles = app.buttons["jobPreferences.roles"]
        XCTAssertTrue(roles.waitForExistence(timeout: 15))
        XCTAssertTrue(roles.label.contains(role), roles.label)
        capture("7-settings")
        app.buttons["jobPreferences.seniority"].tap()
        let principal = app.descendants(matching: .any)["prefs.seniority.principal"].firstMatch
        XCTAssertTrue(principal.waitForExistence(timeout: 5))
        principal.tap()
        XCTAssertTrue(principal.isSelected)
        capture("8-seniority")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["jobPreferences.seniority"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["jobPreferences.seniority"].label.contains("Principal"))
        // Give the write a moment to reach the server before the script reads it.
        Thread.sleep(forTimeInterval: 4)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["settings.done"].waitForExistence(timeout: 5))
        app.buttons["settings.done"].tap()

        // Relaunch: a finished account goes straight to the tabs.
        app.terminate()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_DE"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        XCTAssertFalse(onboarding.exists, "onboarding doesn't come back")
    }
}
