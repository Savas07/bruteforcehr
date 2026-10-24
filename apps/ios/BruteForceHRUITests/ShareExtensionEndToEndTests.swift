import XCTest

/// The real Share Extension on live Firebase (apps/ios/scripts/share-live-check.sh): sign in to the
/// app with an email link (`BFHR_E2E_LINK`), open a public job posting in Safari, Share →
/// BruteForceHR, check the fields read by `jobImportUrl`, Save and log as applied. The script
/// reads the written documents back and deletes the user. Screenshots go to `BFHR_CAPTURE_DIR`.
final class ShareExtensionEndToEndTests: XCTestCase {
    private func environment(_ name: String) throws -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            throw XCTSkip("Runs only with \(name) (live Firebase)")
        }
        return value
    }

    @MainActor
    private func shot(_ name: String) {
        guard let directory = ProcessInfo.processInfo.environment["BFHR_CAPTURE_DIR"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("share-e2e-\(name).png"))
    }

    @MainActor
    func testShareFromSafari() throws {
        let link = try XCTUnwrap(URL(string: try environment("BFHR_E2E_LINK")))
        let posting = try XCTUnwrap(URL(string: try environment("BFHR_E2E_JOB_URL")))

        // 1. Signed in in the app: the session lands in the shared keychain group.
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
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30), "signed in")
        app.terminate()

        // 2. Safari with the posting, then the share sheet.
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.launch()
        safari.open(posting)
        Thread.sleep(forTimeInterval: 6)
        shot("1-safari")
        // iOS 26 Safari keeps Share in the ⋯ menu (a first-run tip points at it).
        let tipClose = safari.buttons["Close"].firstMatch
        if tipClose.exists { tipClose.tap() }
        let share: XCUIElement
        if safari.buttons["ShareButton"].firstMatch.exists {
            share = safari.buttons["ShareButton"].firstMatch
        } else {
            let more = safari.buttons.matching(NSPredicate(format: "label IN %@ OR identifier IN %@", ["More", "Page Menu", "More options"], ["MoreButton", "PageMenuButton"])).firstMatch
            XCTAssertTrue(more.waitForExistence(timeout: 15), "Safari ⋯ button\n\(safari.debugDescription.prefix(3000))")
            more.tap()
            share = safari.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Share")).firstMatch
        }
        XCTAssertTrue(share.waitForExistence(timeout: 15), "Safari share button\n\(safari.debugDescription.prefix(3000))")
        share.tap()
        let target = safari.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "BruteForceHR")).firstMatch
        if !target.waitForExistence(timeout: 10) {
            // Behind "More" the first time an extension is used.
            safari.cells["More"].firstMatch.tap()
        }
        XCTAssertTrue(target.waitForExistence(timeout: 10), "BruteForceHR in the share sheet")
        shot("2-share-sheet")
        target.tap()

        // 3. The extension reads the page through jobImportUrl.
        let save = safari.buttons["share.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 60), "fields read")
        Thread.sleep(forTimeInterval: 1)
        shot("3-confirm")
        XCTAssertTrue(safari.descendants(matching: .any)["share.source"].exists)
        safari.buttons["share.saveAndLog"].tap()
        XCTAssertTrue(safari.descendants(matching: .any)["share.saved"].waitForExistence(timeout: 30), "saved")
        shot("4-saved")
        safari.buttons["share.done"].tap()
    }
}
