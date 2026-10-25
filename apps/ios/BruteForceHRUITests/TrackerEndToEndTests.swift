import XCTest

/// Not part of normal runs: Today and the Tracker against the live Firebase project with a
/// throwaway test user, driven by `apps/ios/scripts/tracker-live-check.sh`:
///
/// 1. `SignInEndToEndTests.testSendsLink` (`BFHR_E2E_EMAIL`); the shell creates the sign-in link.
/// 2. `testTrackerOnLiveData` (`BFHR_E2E_LINK`): signs in, Today's first-run state, logs an
///    application, moves it with the leading swipe and undoes the move from the toast, adds an
///    interview round with a prep reminder (permission explainer → Not now), sets a reminder and
///    notes, opens the calendar, and checks Today lists the reminder.
/// 3. The shell reads `users/{uid}/applications`, `applicationEvents` and `interviews` through
///    the Firestore REST API, then deletes them and the user.
final class TrackerEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func shot(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("tracker-e2e-\(name).png"))
    }

    @MainActor
    private func type(_ app: XCUIApplication, field label: String, _ text: String) {
        let field = app.textFields[label].firstMatch.exists ? app.textFields[label].firstMatch : app.textViews[label].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10), label)
        field.tap()
        field.typeText(text)
    }

    @MainActor
    func testTrackerOnLiveData() throws {
        let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        if !app.tabBars.firstMatch.waitForExistence(timeout: 5) {
            app.open(link)
            // The link wasn't requested on this simulator, so the app asks which address it was
            // sent to (the "link from another device" step).
            let field = app.descendants(matching: .any)["signIn.emailField"]
            if field.waitForExistence(timeout: 15) {
                field.tap()
                field.typeText(try environment("BFHR_E2E_EMAIL"))
                app.descendants(matching: .any)["signIn.primary"].tap()
            }
        }
        app.skipOnboardingIfShown()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30), "signed in")

        // Today, first run on an empty account: calm, no connect card, Log an application.
        XCTAssertTrue(app.staticTexts["Nothing needs you yet"].waitForExistence(timeout: 30), "Today loaded from Firestore")
        XCTAssertTrue(app.descendants(matching: .any)["today.comingNote"].exists)
        shot("today-empty")

        // Log an application from Today's empty state: it opens the Tracker's sheet.
        app.buttons["Log an application"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Log an application"].waitForExistence(timeout: 10))
        type(app, field: "Company", "Acme Live")
        type(app, field: "Role", "Frontend Engineer")
        shot("add")
        app.buttons["add.save"].tap()
        XCTAssertTrue(app.navigationBars["Acme Live"].waitForExistence(timeout: 10), "detail opened")
        shot("detail-new")

        // Interview round with a prep reminder; the permission explainer appears once.
        app.buttons["detail.addInterview"].tap()
        XCTAssertTrue(app.navigationBars["New interview"].waitForExistence(timeout: 10))
        type(app, field: "Title", "Hiring manager call")
        let prep = app.buttons["interview.prep"].exists ? app.buttons["interview.prep"] : app.descendants(matching: .any)["interview.prep"]
        var swipes = 0
        while !(prep.exists && prep.isHittable), swipes < 6 { app.swipeUp(); swipes += 1 }
        prep.tap()
        app.buttons["1 hour before"].firstMatch.tap()
        app.buttons["interview.save"].tap()
        let explainer = app.descendants(matching: .any)["notifications.explainer"]
        XCTAssertTrue(explainer.waitForExistence(timeout: 10), "permission explainer on the first reminder")
        shot("explainer")
        app.buttons["notifications.notNow"].tap()

        // Reminder.
        app.swipeDown()
        let setReminder = app.buttons["detail.setReminder"]
        XCTAssertTrue(setReminder.waitForExistence(timeout: 10))
        setReminder.tap()
        XCTAssertTrue(app.navigationBars["Reminder"].waitForExistence(timeout: 10))
        type(app, field: "What to do", "Send portfolio")
        app.buttons["reminder.save"].tap()
        XCTAssertTrue(contains(app, "Send portfolio").waitForExistence(timeout: 10))
        shot("detail-filled")

        // Back to the Pipeline: leading swipe advances, the toast's Undo reverts.
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Acme Live")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.swipeRight()
        let advance = app.buttons["Move to Acknowledged"]
        XCTAssertTrue(advance.waitForExistence(timeout: 5))
        advance.tap()
        XCTAssertTrue(app.staticTexts["Acme Live · moved to Acknowledged"].waitForExistence(timeout: 5))
        shot("moved")
        app.buttons["Undo"].tap()
        XCTAssertTrue(app.staticTexts["Restored"].waitForExistence(timeout: 5))

        // Calendar lists the round and the reminder.
        app.buttons["tracker.switchView"].tap()
        XCTAssertTrue(contains(app, "Hiring manager call").waitForExistence(timeout: 10))
        XCTAssertTrue(contains(app, "Send portfolio").exists)
        shot("calendar")

        // Today now shows the round under Next up only within 48 h; the reminder is a deadline
        // only within 7 days (tomorrow 09:00 by default).
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(contains(app, "Send portfolio").waitForExistence(timeout: 10) || contains(app, "Hiring manager call").exists)
        shot("today")
        // Give Firestore time to acknowledge the writes before the app goes away.
        Thread.sleep(forTimeInterval: 3)
    }

    /// Rows combine their texts into one element, so match the label.
    @MainActor
    private func contains(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }
}
