import XCTest

/// Not part of normal runs: email-link sign-in against the live Firebase project, in two
/// launches driven by a shell (`TEST_RUNNER_`-prefixed variables reach the runner without it):
///
/// 1. `testSendsLink` (`BFHR_E2E_EMAIL`): the app sends a real sign-in link and shows
///    "Check your email". The address is remembered on the simulator.
/// 2. The shell creates a sign-in link for the same address with the Identity Toolkit API
///    (`accounts:sendOobCode`, `returnOobLink`), in the shape Firebase emails it.
/// 3. `testOpensLinkThenSignsOut` (`BFHR_E2E_EMAIL`, `BFHR_E2E_LINK`): the app, opened with the
///    link, signs in with the remembered address, shows the tabs, and signs out from the avatar
///    menu back to the email field.
final class SignInEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        return app
    }

    @MainActor
    func testSendsLink() throws {
        let email = try environment("BFHR_E2E_EMAIL")
        let app = launch()
        let field = app.descendants(matching: .any)["signIn.emailField"]
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText(email)
        app.descendants(matching: .any)["signIn.primary"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["signIn.check"].waitForExistence(timeout: 30), "Firebase accepted the send")
        XCTAssertTrue(app.staticTexts["We sent a sign-in link to \(email)."].exists)
    }

    @MainActor
    func testOpensLinkThenSignsOut() throws {
        let email = try environment("BFHR_E2E_EMAIL")
        let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
        let app = launch()
        XCTAssertTrue(app.descendants(matching: .any)["signIn.check"].waitForExistence(timeout: 20), "the pending address survived the relaunch")
        app.open(link)
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 30), "signed in")
        let menu = app.buttons["account.menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 10))
        menu.tap()
        XCTAssertTrue(app.staticTexts["Signed in as \(email)"].waitForExistence(timeout: 5))
        if let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] {
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("sign-in-e2e-account-menu.png"))
        }
        app.buttons["account.signOut"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["signIn.email"].waitForExistence(timeout: 10), "signed out")
        XCTAssertEqual(app.descendants(matching: .any)["signIn.emailField"].value as? String, email, "pre-filled after sign-out")
        XCTAssertFalse(tabBar.exists)
    }
}
