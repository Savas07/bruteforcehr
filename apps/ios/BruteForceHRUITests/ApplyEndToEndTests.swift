import XCTest

/// Not part of normal runs: "Tailor for this job", the AI cover letter and the application kit
/// against the live Firebase project with a throwaway user, driven by
/// `apps/ios/scripts/apply-live-check.sh` (which seeds the user, a CV, a job and the answers
/// library, then checks and deletes the documents):
///
/// 1. Job detail → Apply → Tailor for this job → Light → Suggest edits (`cvTailor`, Claude) →
///    Accept two suggestions, Keep original for the rest → Save as new version → the checklist
///    selects "Tailored for this job";
/// 2. Cover letter → Write one → Draft with AI (`coverLetterDraft`) → fill any field the draft
///    left → Use this letter (a draft that still has a `[gap]` goes out as None instead);
/// 3. Open company site → Safari → Done → the kit: the CV PDF, Copy on an answer and the letter →
///    "Yes, I applied".
final class ApplyEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func shot(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("apply-e2e-\(name).png"))
    }

    @MainActor
    func testTailorLetterAndKit() throws {
        let jobId = try environment("BFHR_E2E_APPLY_JOB")
        let app = try signedIn()
        let proceed = app.buttons["apply.continue"]

        openDetail(app, jobId)
        app.buttons["jobDetail.apply"].tap()
        XCTAssertTrue(proceed.waitForExistence(timeout: 15), "Apply sheet")
        shot("checklist")

        // 1. Tailor: Light, Claude's suggestions, accept two, keep the rest, save.
        let tailorRow = app.buttons["apply.tailorRow"]
        XCTAssertTrue(tailorRow.waitForExistence(timeout: 5), "Tailor for this job row")
        tailorRow.tap()
        XCTAssertTrue(app.buttons["apply.tailor.light"].waitForExistence(timeout: 5), "Light / Thorough")
        app.buttons["apply.tailor.light"].tap()
        shot("tailor-choice")
        app.buttons["apply.tailor.suggest"].tap()
        let accepts = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.tailor.accept.'"))
        XCTAssertTrue(accepts.firstMatch.waitForExistence(timeout: 150), "cvTailor answered with suggestions (error shown: \(app.descendants(matching: .any)["apply.tailor.error"].exists))")
        shot("tailor-review")
        var accepted = 0
        var looked = 0
        while accepted < 2, looked < 12 {
            looked += 1
            let enabled = accepts.allElementsBoundByIndex.first { $0.isEnabled && $0.isHittable }
            if let button = enabled {
                button.tap()
                accepted += 1
                Thread.sleep(forTimeInterval: 0.5)
            } else {
                scrollDown(app)
            }
        }
        XCTAssertEqual(accepted, 2, "two suggestions without a gap to accept")
        let keepRest = app.buttons["apply.tailor.keepRest"]
        if keepRest.exists { keepRest.tap() }
        let tally = app.staticTexts["apply.tailor.tally"]
        if tally.exists { XCTAssertTrue(tally.label.hasPrefix("2 accepted"), tally.label) }
        app.buttons["apply.tailor.view"].buttons["Preview"].tap()
        Thread.sleep(forTimeInterval: 2)
        shot("tailor-preview")
        app.buttons["apply.tailor.view"].buttons["Changes"].tap()
        let save = app.buttons["apply.tailor.save"]
        XCTAssertTrue(save.isEnabled, "Save as new version")
        save.tap()
        XCTAssertTrue(proceed.waitForExistence(timeout: 10), "back on the checklist")
        let tailored = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.cv.version:'")).firstMatch
        XCTAssertTrue(tailored.waitForExistence(timeout: 5), "the tailored version is offered")
        XCTAssertTrue(tailored.isSelected, "and chosen")
        shot("tailor-saved")

        // 2. Cover letter drafted with AI.
        app.buttons["apply.letter"].firstMatch.tap()
        let write = app.buttons["Write one"].firstMatch
        XCTAssertTrue(write.waitForExistence(timeout: 5), "letter menu")
        write.tap()
        let draft = app.buttons["apply.letter.draft"]
        XCTAssertTrue(draft.waitForExistence(timeout: 10), "cover letter editor")
        draft.tap()
        XCTAssertTrue(app.descendants(matching: .any)["apply.letter.banner"].firstMatch.waitForExistence(timeout: 150),
                      "coverLetterDraft answered (error shown: \(app.descendants(matching: .any)["apply.letter.error"].exists))")
        shot("letter-draft")
        let fields = app.textFields.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.letter.field.'"))
        for field in fields.allElementsBoundByIndex {
            scrollTo(field, in: app)
            field.tap()
            field.typeText(field.identifier.hasSuffix("hiring_manager") ? "Hiring Team" : "Test")
        }
        if fields.count > 0 { app.swipeDown() }
        let stillBlocked = app.staticTexts["apply.letter.blocker"].exists
        shot("letter-ready")
        app.buttons["apply.letter.done"].tap()
        XCTAssertTrue(proceed.waitForExistence(timeout: 5), "checklist")
        if stillBlocked {
            // A gap only the user can fill (BRIEF §2.4): this run sends no letter.
            app.buttons["apply.letter"].firstMatch.tap()
            app.buttons["None"].firstMatch.tap()
        }
        XCTAssertTrue(proceed.isEnabled, "Open company site is available")

        // 3. The company site, then the kit.
        proceed.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'workable'")).firstMatch.waitForExistence(timeout: 20)
            || app.buttons["Done"].firstMatch.waitForExistence(timeout: 5), "SFSafariViewController opened")
        Thread.sleep(forTimeInterval: 2)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 45, dy: 90)).tap()
        let applied = app.buttons.matching(NSPredicate(format: "identifier == 'apply.submitPrompt' AND label == 'Yes, I applied'")).firstMatch
        XCTAssertTrue(applied.waitForExistence(timeout: 10), "Did you apply? after Safari")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label ENDSWITH '.pdf'")).firstMatch.waitForExistence(timeout: 60)
            || app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.kit.saveToFiles.'")).firstMatch.waitForExistence(timeout: 5), "the CV PDF in the kit")
        shot("kit")
        if !stillBlocked {
            let copyLetter = app.buttons["apply.kit.copyLetter"]
            scrollTo(copyLetter, in: app)
            copyLetter.tap()
            XCTAssertTrue(contains(app, "Cover letter copied").waitForExistence(timeout: 5), "letter copied toast")
        }
        let copy = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'apply.kit.copy.'")).firstMatch
        scrollTo(copy, in: app)
        XCTAssertTrue(copy.exists, "an answer to copy")
        copy.tap()
        XCTAssertTrue(contains(app, "copied").waitForExistence(timeout: 5), "answer copied toast")
        shot("kit-copied")
        applied.tap()
        XCTAssertTrue(contains(app, "marked as Applied").waitForExistence(timeout: 10) || app.buttons["View in Tracker"].waitForExistence(timeout: 10), "applied")
        shot("applied")
        // The PDF upload and its pin.
        Thread.sleep(forTimeInterval: 5)
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
            let field = app.descendants(matching: .any)["signIn.emailField"]
            if field.waitForExistence(timeout: 15) {
                field.tap()
                field.typeText(try environment("BFHR_E2E_EMAIL"))
                app.descendants(matching: .any)["signIn.primary"].tap()
            }
        }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30), "signed in")
        app.tabBars.buttons["Jobs"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["jobs.feed"].firstMatch.waitForExistence(timeout: 30), "feed")
        return app
    }

    // MARK: Helpers

    @MainActor
    private func openDetail(_ app: XCUIApplication, _ id: String) {
        let target = app.descendants(matching: .any)["jobs.row.\(id)"].firstMatch
        XCTAssertTrue(target.waitForExistence(timeout: 30), id)
        target.tap()
        XCTAssertTrue(app.buttons["jobDetail.apply"].waitForExistence(timeout: 15), "Job detail of \(id)")
    }

    @MainActor
    private func scrollDown(_ app: XCUIApplication) {
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    @MainActor
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < 8 {
            scrollDown(app)
            swipes += 1
        }
    }

    @MainActor
    private func contains(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }
}
