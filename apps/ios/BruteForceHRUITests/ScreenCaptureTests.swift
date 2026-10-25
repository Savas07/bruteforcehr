import XCTest

/// Not a check: saves screenshots for apps/ios/scripts/capture.sh, which sets the simulator's
/// appearance and text size and passes its options through `TEST_RUNNER_`-prefixed environment
/// variables (xcodebuild strips the prefix). Skipped in normal test runs.
///
/// - `testCaptureEveryTab`: the title-only shell, one screenshot per tab. It needs a session on
///   the simulator (signed out, the app shows sign-in and the capture is skipped).
/// - `testCaptureDesignScreens`: design mode (Debug builds), one screenshot per core screen and
///   state, launched with `-BFHRScreen`, `-BFHRDesign` and `-BFHRState`; or, for the screen
///   `update-gate`, the update banner / blocking screen over Today (`-BFHRUpdate`); for
///   `sign-in`, the signed-out screens (`-BFHRSignIn`); for `data-privacy`, Settings › Data &
///   privacy and Delete account (`-BFHRDataPrivacy`). `BFHR_CAPTURE_ARGS` (comma-separated)
///   adds launch arguments for a sub-state, e.g. `-BFHRApplyStep,kit`, and `BFHR_CAPTURE_TAG`
///   names it in the file: `<screen>-<tag>-<state>-<theme>[-ax].png`.
///
/// `BFHR_CAPTURE_LANGUAGE` (en, tr, de; default en) sets the app's language.
///
/// Deep links go through `XCUIApplication.open`, because `simctl openurl` shows a system
/// "Open in …?" confirmation over the app.
final class ScreenCaptureTests: XCTestCase {
    private var languageArguments: [String] {
        let code = ProcessInfo.processInfo.environment["BFHR_CAPTURE_LANGUAGE"].flatMap { $0.isEmpty ? nil : $0 } ?? "en"
        let locale = ["en": "en_US", "tr": "tr_TR", "de": "de_DE"][code] ?? "en_US"
        return ["-AppleLanguages", "(\(code))", "-AppleLocale", locale]
    }

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
        app.launchArguments += languageArguments
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
        if screens == ["data-privacy"] {
            try captureDataPrivacy(states: states, directory: directory, suffix: suffix)
            return
        }
        if screens == ["onboarding"] {
            try captureOnboarding(states: states, directory: directory, suffix: suffix)
            return
        }
        if screens == ["share-sheet"] {
            for state in states {
                let app = XCUIApplication()
                app.launchArguments += languageArguments + ["-BFHRShareSheet", state]
                app.launch()
                XCTAssertTrue(app.descendants(matching: .any)["share.sheet"].waitForExistence(timeout: 20), "share-sheet \(state)")
                Thread.sleep(forTimeInterval: 1.2)
                let file = directory.appendingPathComponent("share-sheet-\(state)-\(suffix).png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
                app.terminate()
            }
            return
        }

        let extraArguments = list("BFHR_CAPTURE_ARGS") ?? []
        let tag = ProcessInfo.processInfo.environment["BFHR_CAPTURE_TAG"].flatMap { $0.isEmpty ? nil : "-\($0)" } ?? ""
        for screen in screens {
            for state in states {
                let app = XCUIApplication()
                app.launchArguments += languageArguments + ["-BFHRScreen", screen] + designArguments(for: state) + extraArguments
                app.launch()
                // The screen is showing: its design root (`design.<screen>`), a view the screen
                // pushed over that root (the root leaves the tree then, e.g. the CV editor opens
                // the selected CV over the CVs list), which shows a back button, or a sheet it
                // presents at launch (Apply, paste a link), which hides the tab bar from the tree.
                let root = app.descendants(matching: .any)["design.\(screen)"]
                let back = app.navigationBars.buttons["BackButton"]
                let sheet = app.descendants(matching: .any).matching(
                    NSPredicate(format: "identifier IN %@", [
                        "apply.sheet", "import.sheet", "settings",
                        "connect.providers", "connect.oauth", "connect.appPassword", "connect.scan",
                    ])
                ).firstMatch
                // Settings and Connect email open as sheets over their tab: wait for the sheet.
                let opensSheet = ["settings", "mail-connect"].contains(screen)
                let shown = XCTNSPredicateExpectation(
                    predicate: NSPredicate { _, _ in opensSheet ? sheet.exists : root.exists || back.exists || sheet.exists },
                    object: nil
                )
                XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 20), .completed, "\(screen) \(state)")
                if !sheet.exists {
                    let tabBar = app.tabBars.firstMatch
                    XCTAssertTrue(tabBar.waitForExistence(timeout: 20), "\(screen) \(state)")
                    XCTAssertTrue(tabBar.buttons[tabTitle(for: screen)].isSelected, "\(screen) \(state): tab")
                }
                // Past the 300 ms skeleton delay, toasts, the banner's appearance and a sheet's slide-up.
                Thread.sleep(forTimeInterval: state == "loading" ? 1.0 : 1.5)
                let file = directory.appendingPathComponent("\(screen)\(tag)-\(state)-\(suffix).png")
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
            app.launchArguments += languageArguments + ["-BFHRScreen", "today", "-BFHRDesign", "populated", "-BFHRUpdate", state]
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
            app.launchArguments += languageArguments + ["-BFHRSignIn", state]
            app.launch()
            XCTAssertTrue(app.descendants(matching: .any)["signIn"].waitForExistence(timeout: 20), "sign-in \(state)")
            Thread.sleep(forTimeInterval: 1.0)
            let file = directory.appendingPathComponent("sign-in-\(state)-\(suffix).png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            app.terminate()
        }
    }

    /// Settings › Data & privacy (`-BFHRDataPrivacy <state>`), saved as
    /// `data-privacy-<state>-<theme>[-ax][-lang].png`. Delete states show the pushed screen;
    /// typed states scroll to the confirmation field and buttons.
    @MainActor
    private func captureDataPrivacy(states: [String], directory: URL, suffix: String) throws {
        for state in states {
            let app = XCUIApplication()
            app.launchArguments += languageArguments + ["-BFHRDataPrivacy", state]
            app.launch()
            let isDelete = state.hasPrefix("delete") || ["reauthNeeded", "linkSent", "linkExpired", "reauthDone", "deleting"].contains(state)
            let root = app.descendants(matching: .any)[isDelete ? "delete.title" : "dataPrivacy.create"]
            let ready = app.descendants(matching: .any)[isDelete ? "delete.title" : "dataPrivacy.ready"]
            let shown = XCTNSPredicateExpectation(
                predicate: NSPredicate { _, _ in root.exists || ready.exists || app.navigationBars.firstMatch.exists },
                object: nil
            )
            XCTAssertEqual(XCTWaiter().wait(for: [shown], timeout: 20), .completed, "data-privacy \(state)")
            Thread.sleep(forTimeInterval: 1.2)
            let file = directory.appendingPathComponent("data-privacy-\(state)-\(suffix).png")
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
            if isDelete {
                // The lower half: re-authentication, the field and the buttons.
                app.swipeUp()
                app.swipeUp()
                Thread.sleep(forTimeInterval: 0.8)
                let lower = directory.appendingPathComponent("data-privacy-\(state)-\(suffix)-lower.png")
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: lower)
            }
            app.terminate()
        }
    }

    /// First-run onboarding (`-BFHROnboarding <state>`), saved as
    /// `onboarding-<state>-<theme>[-ax][-lang].png`, plus `-lower1`… pages below the fold of the
    /// long Preferences step (and of every step at AX sizes).
    @MainActor
    private func captureOnboarding(states: [String], directory: URL, suffix: String) throws {
        let ax = suffix.contains("-ax")
        for state in states {
            let app = XCUIApplication()
            app.launchArguments += languageArguments + ["-BFHROnboarding", state]
            app.launch()
            XCTAssertTrue(app.descendants(matching: .any)["onboarding"].waitForExistence(timeout: 20), "onboarding \(state)")
            Thread.sleep(forTimeInterval: 1.2)
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: directory.appendingPathComponent("onboarding-\(state)-\(suffix).png"))
            let pages = state.hasPrefix("preferences") ? (ax ? 8 : 3) : (ax ? 2 : 0)
            for page in stride(from: 1, through: pages, by: 1) {
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75))
                let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25))
                start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .default, thenHoldForDuration: 0.6)
                try XCUIScreen.main.screenshot().pngRepresentation.write(to: directory.appendingPathComponent("onboarding-\(state)-\(suffix)-lower\(page).png"))
            }
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
        case "jobs", "job-detail", "saved-searches", "apply": "Jobs"
        case "cv-editor": "CVs"
        case "tracker-board", "insights": "Tracker"
        case "mail-review", "mail-connect": "Mail"
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
