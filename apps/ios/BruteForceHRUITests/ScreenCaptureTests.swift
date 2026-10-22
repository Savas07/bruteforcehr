import XCTest

/// Not a check: saves screenshots for apps/ios/scripts/capture.sh, which sets the simulator's
/// appearance and text size and passes its options through `TEST_RUNNER_`-prefixed environment
/// variables (xcodebuild strips the prefix). Skipped in normal test runs.
///
/// - `testCaptureEveryTab`: the title-only shell, one screenshot per tab.
/// - `testCaptureDesignScreens`: design mode (Debug builds), one screenshot per core screen and
///   state, launched with `-BFHRScreen`, `-BFHRDesign` and `-BFHRState`.
///
/// Deep links go through `XCUIApplication.open`, because `simctl openurl` shows a system
/// "Open in …?" confirmation over the app.
final class ScreenCaptureTests: XCTestCase {
    private let english = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]

    private func output() throws -> (directory: URL, suffix: String) {
        let environment = ProcessInfo.processInfo.environment
        guard let directory = environment["BFHR_CAPTURE_DIR"], let suffix = environment["BFHR_CAPTURE_SUFFIX"] else {
            throw XCTSkip("Runs only through apps/ios/scripts/capture.sh")
        }
        return (URL(fileURLWithPath: directory), suffix)
    }

    @MainActor
    func testCaptureEveryTab() throws {
        let (directory, suffix) = try output()
        guard list("BFHR_CAPTURE_SCREENS") == nil else {
            throw XCTSkip("Design capture run")
        }
        let app = XCUIApplication()
        app.launchArguments += english
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))

        let tabs = [("today", "Today"), ("jobs", "Jobs"), ("tracker", "Tracker"), ("cvs", "CVs"), ("mail", "Mail")]
        for (tab, title) in tabs {
            app.open(try XCTUnwrap(URL(string: "bruteforcehr://\(tab)")))
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10), tab)
            XCTAssertTrue(app.tabBars.buttons[title].isSelected, tab)
            let file = directory.appendingPathComponent("\(tab)-\(suffix).png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
        }
    }

    /// `BFHR_CAPTURE_SCREENS` and `BFHR_CAPTURE_STATES` are comma-separated lists, e.g.
    /// `today,mail-review` and `populated,empty,loading,error,offline`.
    @MainActor
    func testCaptureDesignScreens() throws {
        let (directory, suffix) = try output()
        guard let screens = list("BFHR_CAPTURE_SCREENS") else {
            throw XCTSkip("Tab capture run")
        }
        let states = list("BFHR_CAPTURE_STATES") ?? ["populated", "empty", "loading", "error", "offline"]

        for screen in screens {
            for state in states {
                let app = XCUIApplication()
                app.launchArguments += english + ["-BFHRScreen", screen] + designArguments(for: state)
                app.launch()
                let root = app.descendants(matching: .any)["design.\(screen)"]
                XCTAssertTrue(root.waitForExistence(timeout: 20), "\(screen) \(state)")
                // Past the 300 ms skeleton delay, toasts and the banner's appearance.
                Thread.sleep(forTimeInterval: state == "loading" ? 1.0 : 1.5)
                let file = directory.appendingPathComponent("\(screen)-\(state)-\(suffix).png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
                app.terminate()
            }
        }
    }

    /// A comma-separated environment list; nil when unset or empty.
    private func list(_ name: String) -> [String]? {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else { return nil }
        return value.split(separator: ",").map(String.init)
    }

    private func designArguments(for state: String) -> [String] {
        switch state {
        case "populated", "empty": ["-BFHRDesign", state]
        default: ["-BFHRDesign", "populated", "-BFHRState", state]
        }
    }
}
