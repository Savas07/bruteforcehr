import XCTest

/// Smoke tests: signed out the app shows sign-in instead of the tabs; in design mode (no session
/// needed) it shows five tabs, and `bruteforcehr://` links switch tabs.
final class BruteForceHRUITests: XCTestCase {
    private let titles = ["Today", "Jobs", "Tracker", "CVs", "Mail"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func launchApp(_ arguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        // Pin English so the assertions can use the visible titles.
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"] + arguments
        app.launch()
        return app
    }

    /// The test simulators have no session: the tabs stay behind sign-in.
    @MainActor
    func testSignedOutLaunchShowsSignIn() throws {
        let app = launchApp()
        XCTAssertTrue(app.descendants(matching: .any)["signIn.email"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Sign in to BruteForceHR"].exists)
        XCTAssertFalse(app.tabBars.firstMatch.exists)
    }

    @MainActor
    func testDesignModeShowsFiveTabsStartingOnToday() throws {
        let app = launchApp(["-BFHRDesign", "populated"])
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 15))
        XCTAssertEqual(tabBar.buttons.count, titles.count)
        for title in titles {
            XCTAssertTrue(tabBar.buttons[title].exists, "tab \(title)")
        }
        XCTAssertTrue(tabBar.buttons["Today"].isSelected)
    }

    @MainActor
    func testDeepLinksSwitchTabs() throws {
        let app = launchApp(["-BFHRDesign", "populated"])
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 15))

        let links: [(url: String, tab: String)] = [
            ("bruteforcehr://mail", "Mail"),
            ("bruteforcehr://cvs", "CVs"),
            ("bruteforcehr://applications/app-1", "Tracker"),
            ("bruteforcehr://jobs/saved", "Jobs"),
            ("bruteforcehr://not-a-destination", "Today"),
        ]
        for link in links {
            app.open(try XCTUnwrap(URL(string: link.url)))
            let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: tabBar.buttons[link.tab])
            XCTAssertEqual(XCTWaiter().wait(for: [selected], timeout: 10), .completed, link.url)
        }
    }
}
