import XCTest

/// Not a check: saves screenshots for apps/ios/scripts/capture.sh, which sets the simulator's
/// appearance and text size and passes its options through `TEST_RUNNER_`-prefixed environment
/// variables (xcodebuild strips the prefix). Skipped in normal test runs.
///
/// - `testCaptureEveryTab`: the title-only shell, one screenshot per tab. It needs a session on
///   the simulator (signed out, the app shows sign-in and the capture is skipped).
/// - `testCaptureDesignScreens`: design mode (Debug builds), one screenshot per core screen and
///   state, launched with `-BFHRScreen`, `-BFHRDesign` and `-BFHRState`; or, for the screen
///   `update-gate`, the update banner / blocking screen over Today (`-BFHRUpdate`); or, for
///   `sign-in`, the signed-out screens (`-BFHRSignIn`).
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
        let signIn = app.descendants(matching: .any)["signIn"]
        let shown = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in app.tabBars.firstMatch.exists || signIn.exists },
            object: nil
        )
        XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 15), .completed)
        if signIn.exists {
            throw XCTSkip("Signed out: the title-only shell needs a session on this simulator")
        }

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

        if screens == ["update-gate"] {
            try captureUpdateGate(states: list("BFHR_CAPTURE_STATES") ?? ["available", "required"], directory: directory, suffix: suffix)
            return
        }
        if screens == ["sign-in"] {
            try captureSignIn(states: states, directory: directory, suffix: suffix)
            return
        }
        if screens == ["share-sheet"] {
            for state in states {
                let app = XCUIApplication()
                app.launchArguments += english + ["-BFHRShareSheet", state]
                app.launch()
                XCTAssertTrue(app.descendants(matching: .any)["share.sheet"].waitForExistence(timeout: 20), "share-sheet \(state)")
                Thread.sleep(forTimeInterval: 1.2)
                let file = directory.appendingPathComponent("share-sheet-\(state)-\(suffix).png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
                app.terminate()
            }
            return
        }

        for screen in screens {
            for state in states {
                let app = XCUIApplication()
                app.launchArguments += english + ["-BFHRScreen", screen] + designArguments(for: state)
                app.launch()
                // The screen's tab is selected, then the screen is showing: its design root
                // (`design.<screen>`), or a view the screen pushed over that root (the root leaves
                // the tree then, e.g. the CV editor opens the selected CV over the CVs list), which
                // shows a back button.
                let tabBar = app.tabBars.firstMatch
                XCTAssertTrue(tabBar.waitForExistence(timeout: 20), "\(screen) \(state)")
                XCTAssertTrue(tabBar.buttons[tabTitle(for: screen)].isSelected, "\(screen) \(state): tab")
                let root = app.descendants(matching: .any)["design.\(screen)"]
                let back = app.navigationBars.buttons["BackButton"]
                let shown = XCTNSPredicateExpectation(
                    predicate: NSPredicate { _, _ in root.exists || back.exists },
                    object: nil
                )
                XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 20), .completed, "\(screen) \(state)")
                // Past the 300 ms skeleton delay, toasts and the banner's appearance.
                Thread.sleep(forTimeInterval: state == "loading" ? 1.0 : 1.5)
                let file = directory.appendingPathComponent("\(screen)-\(state)-\(suffix).png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
                app.terminate()
            }
        }
    }

    /// The update gate over Today (`-BFHRUpdate`): the banner (`available`) or the blocking
    /// screen (`required`), saved as `update-gate-<state>-<theme>[-ax].png`.
    @MainActor
    private func captureUpdateGate(states: [String], directory: URL, suffix: String) throws {
        for state in states {
            let app = XCUIApplication()
            app.launchArguments += english + ["-BFHRScreen", "today", "-BFHRDesign", "populated", "-BFHRUpdate", state]
            app.launch()
            let surface = app.descendants(matching: .any)[state == "required" ? "update.required" : "update.banner"]
            XCTAssertTrue(surface.waitForExistence(timeout: 20), "update-gate \(state)")
            // Past the banner's fade-in and the cover's slide-up.
            Thread.sleep(forTimeInterval: 1.5)
            let file = directory.appendingPathComponent("update-gate-\(state)-\(suffix).png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            app.terminate()
        }
    }

    /// The signed-out screens (`-BFHRSignIn <state>`), saved as `sign-in-<state>-<theme>[-ax].png`.
    @MainActor
    private func captureSignIn(states: [String], directory: URL, suffix: String) throws {
        for state in states {
            let app = XCUIApplication()
            app.launchArguments += english + ["-BFHRSignIn", state]
            app.launch()
            XCTAssertTrue(app.descendants(matching: .any)["signIn"].waitForExistence(timeout: 20), "sign-in \(state)")
            Thread.sleep(forTimeInterval: 1.0)
            let file = directory.appendingPathComponent("sign-in-\(state)-\(suffix).png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            app.terminate()
        }
    }

    /// A comma-separated environment list; nil when unset or empty.
    private func list(_ name: String) -> [String]? {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else { return nil }
        return value.split(separator: ",").map(String.init)
    }

    /// The English title of the tab that hosts a design screen (DesignMode.swift).
    private func tabTitle(for screen: String) -> String {
        switch screen {
        case "job-detail": "Jobs"
        case "cv-editor": "CVs"
        case "tracker-board", "insights": "Tracker"
        case "mail-review": "Mail"
        default: "Today"
        }
    }

    private func designArguments(for state: String) -> [String] {
        switch state {
        case "populated", "empty": ["-BFHRDesign", state]
        default: ["-BFHRDesign", "populated", "-BFHRState", state]
        }
    }
}
