import XCTest

/// Not a check: saves one screenshot per tab for apps/ios/scripts/capture.sh, which sets the
/// simulator's appearance and text size and passes the output through `TEST_RUNNER_`-prefixed
/// environment variables (xcodebuild strips the prefix). Skipped in normal test runs.
///
/// Deep links go through `XCUIApplication.open`, because `simctl openurl` shows a system
/// "Open in …?" confirmation over the app.
final class ScreenCaptureTests: XCTestCase {
    @MainActor
    func testCaptureEveryTab() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let directory = environment["BFHR_CAPTURE_DIR"], let suffix = environment["BFHR_CAPTURE_SUFFIX"] else {
            throw XCTSkip("Runs only through apps/ios/scripts/capture.sh")
        }
        let app = XCUIApplication()
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))

        let tabs = [("today", "Today"), ("jobs", "Jobs"), ("tracker", "Tracker"), ("cvs", "CVs"), ("mail", "Mail")]
        for (tab, title) in tabs {
            app.open(try XCTUnwrap(URL(string: "bruteforcehr://\(tab)")))
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10), tab)
            XCTAssertTrue(app.tabBars.buttons[title].isSelected, tab)
            let file = URL(fileURLWithPath: directory).appendingPathComponent("\(tab)-\(suffix).png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
        }
    }
}
