import XCTest

/// Not part of normal runs: the Jobs tab and Apply against the live Firebase project with a
/// throwaway user, driven by `apps/ios/scripts/jobs-live-check.sh`, which creates the user and
/// seeds `jobs`, `jobMatches` and a CV before the app signs in:
///
/// `testJobsOnLiveData`:
/// 1. the feed lists the seeded jobs; Work mode → Remote keeps the remote ones;
/// 2. Save from the leading swipe (Saved application + created event + match saved);
/// 3. Job detail → Apply → company site → SFSafariViewController → Done → "Yes, I applied";
/// 4. Job detail → Apply → a typed recruiter address → Review email → Open in Mail (no Mail
///    account on the simulator: the mailto link) → "Did you send it?";
/// 5. Add → Add a job from a link (`BFHR_E2E_IMPORT_URL`, a live Greenhouse posting) → Read the
///    posting → Add.
///
/// `testSendFromAccountAndUndo` (after the shell seeds a connected account, `mailSend`
/// deployed): send from the account and Undo within the 10 seconds.
///
/// The shell then reads and checks the documents through the Firestore REST API and deletes
/// them, the Storage objects and the user.
final class JobsEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func shot(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("jobs-e2e-\(name).png"))
    }

    @MainActor
    func testJobsOnLiveData() throws {
        let ids = try environment("BFHR_E2E_JOBS").split(separator: ",").map(String.init)
        let remoteIds = try environment("BFHR_E2E_REMOTE_JOBS").split(separator: ",").map(String.init)
        let saveId = try environment("BFHR_E2E_SAVE_JOB")
        let siteId = try environment("BFHR_E2E_SITE_JOB")
        let emailId = try environment("BFHR_E2E_EMAIL_JOB")
        let recruiter = try environment("BFHR_E2E_RECRUITER")
        let importURL = try environment("BFHR_E2E_IMPORT_URL")
        let app = try signedIn()
        let proceed = app.buttons["apply.continue"]
        let send = app.buttons["apply.send"]

        // 1. The seeded jobs, then Work mode → Remote.
        // The list is lazy: rows below the fold exist once scrolled to.
        XCTAssertTrue(row(app, ids[0]).waitForExistence(timeout: 30), "feed loaded")
        for id in ids {
            var swipes = 0
            while !row(app, id).exists, swipes < 4 { app.swipeUp(); swipes += 1 }
            XCTAssertTrue(row(app, id).exists, "seeded job \(id) in the feed")
        }
        for _ in 0..<4 { app.swipeDown() }
        shot("feed")
        filterRemote(app, on: true)
        for id in ids {
            let shown = row(app, id).waitForExistence(timeout: remoteIds.contains(id) ? 5 : 1)
            XCTAssertEqual(shown, remoteIds.contains(id), "Remote filter on \(id)")
        }
        shot("remote")
        filterRemote(app, on: false)
        XCTAssertTrue(row(app, saveId).waitForExistence(timeout: 5), "filter reset")

        // 2. Save from the leading swipe.
        let saveRow = row(app, saveId)
        saveRow.swipeRight()
        let save = app.buttons["Save"].firstMatch
        if save.waitForExistence(timeout: 2), save.isHittable { save.tap() }
        XCTAssertTrue(contains(app, "· saved").waitForExistence(timeout: 5), "saved toast")
        shot("saved")

        // 3. Company site: Safari, Done, Yes, I applied.
        openDetail(app, siteId)
        app.buttons["jobDetail.apply"].tap()
        XCTAssertTrue(proceed.waitForExistence(timeout: 15), "Apply sheet")
        XCTAssertTrue(app.buttons["apply.channel.site"].firstMatch.isSelected, "company site is the default route")
        shot("apply-checklist")
        proceed.tap()
        // Safari's address bar must be up before Done is the top-leading control.
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'workable'")).firstMatch.waitForExistence(timeout: 20)
            || app.buttons["Done"].firstMatch.waitForExistence(timeout: 5), "SFSafariViewController opened")
        Thread.sleep(forTimeInterval: 2)
        shot("safari")
        // iOS 26 draws Done as a checkmark in the top-leading corner; other Safari buttons share
        // labels, so tap by position.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 45, dy: 90)).tap()
        // The prompt inside the Apply sheet (the Job detail behind it shows its own copy).
        let applied = app.buttons.matching(NSPredicate(format: "identifier == 'apply.submitPrompt' AND label == 'Yes, I applied'")).firstMatch
        XCTAssertTrue(applied.waitForExistence(timeout: 10), "Did you apply? after Safari")
        // Give the kit a moment to make the CV PDF, so it's stored and pinned too.
        _ = app.staticTexts.matching(NSPredicate(format: "label ENDSWITH '.pdf'")).firstMatch.waitForExistence(timeout: 30)
        shot("apply-prompt")
        applied.tap()
        XCTAssertTrue(contains(app, "marked as Applied").waitForExistence(timeout: 10) || app.buttons["View in Tracker"].waitForExistence(timeout: 10), "applied")
        shot("applied")
        Thread.sleep(forTimeInterval: 3) // the PDF upload and the pin
        back(app)

        // 4. Email through a typed recruiter address; no Mail account → mailto → Did you send it?
        openDetail(app, emailId)
        app.buttons["jobDetail.apply"].tap()
        XCTAssertTrue(proceed.waitForExistence(timeout: 15), "Apply sheet")
        let address = app.textFields["apply.recruiter"]
        scrollTo(address, in: app)
        address.tap()
        address.typeText(recruiter)
        app.buttons["Use"].firstMatch.tap()
        XCTAssertTrue(app.buttons["apply.channel.email"].firstMatch.waitForExistence(timeout: 5), "email route added")
        XCTAssertTrue(app.buttons["apply.channel.email"].firstMatch.isSelected, "typed address is the route")
        proceed.tap()
        XCTAssertTrue(send.waitForExistence(timeout: 15), "email review")
        XCTAssertEqual(send.label, "Open in Mail")
        XCTAssertTrue(waitUntilEnabled(send, timeout: 60), "CV PDF made on the device")
        shot("email-review")
        send.tap()
        XCTAssertTrue(app.descendants(matching: .any)["apply.submitPrompt"].firstMatch.waitForExistence(timeout: 10)
            || app.buttons["Yes, I applied"].firstMatch.waitForExistence(timeout: 5), "Did you send it? after the mailto link")
        shot("email-prompt")
        app.buttons["Not yet"].firstMatch.tap()
        app.buttons["Close"].firstMatch.tap()
        back(app)

        // 5. Paste a link.
        app.buttons["jobs.add"].tap()
        app.buttons["Add a job from a link"].firstMatch.tap()
        let field = app.textFields["import.link"]
        XCTAssertTrue(field.waitForExistence(timeout: 10), "import sheet")
        field.tap()
        field.typeText(importURL)
        app.buttons["import.lookUp"].tap()
        let title = app.textFields["import.title"]
        XCTAssertTrue(title.waitForExistence(timeout: 90), "posting read")
        shot("import-review")
        app.buttons["import.save"].tap()
        XCTAssertTrue(contains(app, "· added").waitForExistence(timeout: 10), "imported toast")
        shot("imported")
        // Let Firestore acknowledge the writes before the app goes away.
        Thread.sleep(forTimeInterval: 4)
    }

    /// Run after the shell seeds a connected account (`BFHR_E2E_MAIL_SEND` = the job): Review
    /// email offers "Send to …" from the account; the toast's Undo cancels inside the 10 seconds.
    @MainActor
    func testSendFromAccountAndUndo() throws {
        let jobId = try environment("BFHR_E2E_MAIL_SEND")
        let recipient = try environment("BFHR_E2E_EMAIL")
        let app = try signedIn()
        openDetail(app, jobId)
        app.buttons["jobDetail.apply"].tap()
        let proceed = app.buttons["apply.continue"]
        XCTAssertTrue(proceed.waitForExistence(timeout: 15), "Apply sheet")
        // Our own throwaway address instead of the posting's, in case the Undo came too late.
        let typed = app.textFields["apply.recruiter"]
        scrollTo(typed, in: app)
        typed.tap()
        typed.typeText(recipient)
        app.buttons["Use"].firstMatch.tap()
        XCTAssertTrue(app.buttons["apply.channel.email"].firstMatch.waitForExistence(timeout: 5))
        proceed.tap()
        let send = app.buttons["apply.send"]
        XCTAssertTrue(send.waitForExistence(timeout: 15), "email review")
        XCTAssertEqual(send.label, "Send to \(recipient)", "sends from the connected account")
        XCTAssertTrue(waitUntilEnabled(send, timeout: 60), "CV PDF made on the device")
        shot("mail-review")
        send.tap()
        let undo = app.buttons["Undo"].firstMatch
        XCTAssertTrue(undo.waitForExistence(timeout: 15), "Sending … · Undo")
        shot("mail-sending")
        undo.tap()
        // mailSendCancel runs in the background; let it land before the app goes away.
        Thread.sleep(forTimeInterval: 5)
        shot("mail-cancelled")
    }

    /// Launches the app and signs in with the email link unless a session is kept, then opens Jobs.
    @MainActor
    private func signedIn() throws -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        if !app.tabBars.firstMatch.waitForExistence(timeout: 5) {
            let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
            app.open(link)
            // The link wasn't requested on this simulator: the app asks which address it went to.
            let field = app.descendants(matching: .any)["signIn.emailField"]
            if field.waitForExistence(timeout: 15) {
                field.tap()
                field.typeText(try environment("BFHR_E2E_EMAIL"))
                app.descendants(matching: .any)["signIn.primary"].tap()
            }
        }
        app.skipOnboardingIfShown()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30), "signed in")
        app.tabBars.buttons["Jobs"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["jobs.feed"].firstMatch.waitForExistence(timeout: 30), "feed")
        return app
    }

    // MARK: Helpers

    @MainActor
    private func row(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)["jobs.row.\(id)"].firstMatch
    }

    @MainActor
    private func openDetail(_ app: XCUIApplication, _ id: String) {
        let target = row(app, id)
        // Rows below the fold exist only once scrolled to (lazy list).
        var swipes = 0
        while !target.waitForExistence(timeout: 3), swipes < 4 { app.swipeUp(); swipes += 1 }
        XCTAssertTrue(target.exists, id)
        scrollTo(target, in: app)
        target.tap()
        XCTAssertTrue(app.buttons["jobDetail.apply"].waitForExistence(timeout: 15), "Job detail of \(id)")
    }

    @MainActor
    private func back(_ app: XCUIApplication) {
        let button = app.navigationBars.buttons["BackButton"].firstMatch
        if button.waitForExistence(timeout: 5) { button.tap() }
        XCTAssertTrue(app.descendants(matching: .any)["jobs.feed"].firstMatch.waitForExistence(timeout: 10), "back on the feed")
    }

    @MainActor
    private func filterRemote(_ app: XCUIApplication, on: Bool) {
        app.buttons["jobs.filter.remote"].tap()
        XCTAssertTrue(app.navigationBars["Work mode"].waitForExistence(timeout: 5))
        if on {
            let remote = app.switches["Remote"].exists ? app.switches["Remote"] : app.buttons["Remote"].firstMatch
            remote.tap()
        } else {
            app.buttons["filters.reset"].tap()
        }
        app.buttons["filters.show"].tap()
        XCTAssertTrue(app.navigationBars["Work mode"].waitForNonExistence(timeout: 5))
    }

    @MainActor
    private func waitUntilEnabled(_ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists, element.isEnabled { return true }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return false
    }

    /// Scrolls until `element` is hittable (a few swipes at most).
    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < 6 {
            let window = app.windows.firstMatch
            window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
                .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .slow, thenHoldForDuration: 0.1)
            swipes += 1
        }
    }

    /// Toasts and rows combine their texts into one element, so match the label.
    @MainActor
    private func contains(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }
}
