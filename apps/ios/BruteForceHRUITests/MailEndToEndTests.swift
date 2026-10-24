import XCTest

/// Not part of normal runs: the Mail tab, Today's mail section, the application timeline and
/// Settings against the live Firebase project with a throwaway user, driven by
/// `apps/ios/scripts/mail-live-check.sh`, which seeds the user's mail with the Admin SDK
/// (`apps/functions/scripts/live-ios-mail.ts seed`): an Acme Live interview invite waiting for
/// review (with a suggested interview) and a Globex Live assessment applied automatically.
///
/// `testMailOnLiveData` (`BFHR_E2E_LINK`, `BFHR_E2E_EMAIL`):
/// 1. signs in; Today lists the invite under To review; the Mail tab badge reads 1;
/// 2. confirms the invite with the leading swipe and undoes it from the toast (the held write is
///    dropped: the email is still waiting 12 s later);
/// 3. confirms it from the review sheet; the server's trigger moves Acme Live to Interviewing and
///    adds the interview, which arrive through the snapshot;
/// 4. undoes Globex Live's automatic move from Updates;
/// 5. opens Acme Live's timeline: the linked email ("Email from Lena Vogel") opens the email sheet;
/// 6. Settings › Mail accounts lists the seeded inbox; Notifications › Offers is turned off.
/// The shell then reads the documents back (`report`) and deletes the user.
final class MailEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func shot(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("mail-e2e-\(name).png"))
    }

    @MainActor
    private func element(_ app: XCUIApplication, containing text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@", text)).firstMatch
    }

    @MainActor
    private func scrollTo(_ app: XCUIApplication, _ target: XCUIElement) {
        var swipes = 0
        while !(target.exists && target.isHittable), swipes < 8 { app.swipeUp(); swipes += 1 }
    }

    @MainActor
    func testMailOnLiveData() throws {
        let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        if !app.tabBars.firstMatch.waitForExistence(timeout: 5) {
            app.open(link)
            let field = app.descendants(matching: .any)["signIn.emailField"]
            if field.waitForExistence(timeout: 15) {
                field.tap()
                field.typeText(try environment("BFHR_E2E_EMAIL"))
                app.descendants(matching: .any)["signIn.primary"].tap()
            }
        }
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 30), "signed in")

        // 1. Today's mail section (the invite to review, Globex's automatic move), from Firestore.
        XCTAssertTrue(element(app, containing: "Looks like an interview invite").waitForExistence(timeout: 30), "Today lists the invite")
        XCTAssertTrue(element(app, containing: "Globex Live").exists, "Today lists the automatic move")
        shot("today")
        tabBar.buttons["Mail"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["screen.mail"].waitForExistence(timeout: 10))
        XCTAssertTrue(element(app, containing: "To review (1)").waitForExistence(timeout: 10), "one email to review")
        let row = element(app, containing: "Lena Vogel")
        XCTAssertTrue(row.waitForExistence(timeout: 20), "the invite waits for review")
        shot("queue")

        // 2. Leading swipe confirms; Undo from the toast drops the held write.
        row.swipeRight()
        let confirm = app.buttons["Confirm"].firstMatch
        if confirm.waitForExistence(timeout: 3), confirm.isHittable { confirm.tap() }
        let undo = app.buttons["Undo"].firstMatch
        XCTAssertTrue(undo.waitForExistence(timeout: 5), "toast with Undo")
        XCTAssertTrue(element(app, containing: "moved to Interviewing").exists, "toast names the move")
        shot("confirmed-toast")
        undo.tap()
        XCTAssertTrue(row.waitForExistence(timeout: 5), "back in To review")
        Thread.sleep(forTimeInterval: 12)
        XCTAssertTrue(row.exists, "still waiting after the Undo window: nothing reached the server")

        // 3. Confirm from the review sheet: the interview suggestion is shown, the server moves.
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["interview.suggestion"].waitForExistence(timeout: 10), "suggested interview")
        shot("sheet")
        app.buttons["Confirm"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Undo"].firstMatch.waitForExistence(timeout: 5), "confirmed")
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: row)
        XCTAssertEqual(XCTWaiter().wait(for: [gone], timeout: 10), .completed, "left To review")
        // Past the toast and the held write: the decision goes to the server.
        let toastGone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Undo"].firstMatch)
        XCTAssertEqual(XCTWaiter().wait(for: [toastGone], timeout: 15), .completed, "toast gone")
        Thread.sleep(forTimeInterval: 6)

        // 4. Updates: undo Globex Live's automatic move.
        element(app, containing: "Updates").tap()
        let globex = element(app, containing: "Globex Live")
        XCTAssertTrue(globex.waitForExistence(timeout: 10), "automatic change listed")
        shot("updates")
        let undoUpdate = app.buttons["Undo"].firstMatch
        XCTAssertTrue(undoUpdate.waitForExistence(timeout: 5))
        undoUpdate.tap()
        XCTAssertTrue(element(app, containing: "Globex Live · moved to Applied").waitForExistence(timeout: 5), "undo toast")
        shot("update-undone")

        // Past the hold, the trigger and the snapshot.
        Thread.sleep(forTimeInterval: 20)

        // 5. The timeline of Acme Live: moved to Interviewing by the trigger, the email linked.
        tabBar.buttons["Tracker"].tap()
        let acme = element(app, containing: "Acme Live")
        XCTAssertTrue(acme.waitForExistence(timeout: 20))
        acme.tap()
        XCTAssertTrue(app.navigationBars["Acme Live"].waitForExistence(timeout: 10), "application detail")
        let emailRow = element(app, containing: "Email from Lena Vogel")
        scrollTo(app, emailRow)
        XCTAssertTrue(emailRow.waitForExistence(timeout: 30), "linked email on the timeline")
        XCTAssertTrue(element(app, containing: "Interviewing").exists, "status from the server")
        shot("timeline")
        let open = app.buttons["timeline.openEmail"].firstMatch
        scrollTo(app, open)
        open.tap()
        XCTAssertTrue(app.descendants(matching: .any)["mail.email"].waitForExistence(timeout: 10), "email sheet")
        shot("email")
        app.buttons["Close"].firstMatch.tap()

        // 6. Settings from the avatar: the inbox, and one notification category off.
        app.navigationBars.buttons["BackButton"].firstMatch.tap()
        app.buttons["account.menu"].firstMatch.tap()
        app.buttons["account.settings"].firstMatch.tap()
        XCTAssertTrue(app.descendants(matching: .any)["settings"].waitForExistence(timeout: 10))
        app.buttons["settings.mailAccounts"].firstMatch.tap()
        XCTAssertTrue(element(app, containing: "@icloud.com").waitForExistence(timeout: 10), "seeded inbox")
        shot("settings-mail")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["settings.notifications"].firstMatch.tap()
        let offers = app.switches["settings.notifications.offers"].firstMatch
        XCTAssertTrue(offers.waitForExistence(timeout: 10))
        if (offers.value as? String) == "1" { offers.switches.firstMatch.exists ? offers.switches.firstMatch.tap() : offers.tap() }
        Thread.sleep(forTimeInterval: 3)
        shot("settings-notifications")
    }
}
