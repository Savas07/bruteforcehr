import XCTest

/// Smoke tests: the app launches into five tabs, and `bruteforcehr://` links switch tabs.
final class BruteForceHRUITests: XCTestCase {
    private let titles = ["Today", "Jobs", "Tracker", "CVs", "Mail"]

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        // Pin English so the assertions can use the visible titles.
        app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        return app
    }

    @MainActor
    func testLaunchShowsFiveTabsStartingOnToday() throws {
        let app = launchApp()
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 15))
        XCTAssertEqual(tabBar.buttons.count, titles.count)
        for title in titles {
            XCTAssertTrue(tabBar.buttons[title].exists, "tab \(title)")
        }
        XCTAssertTrue(tabBar.buttons["Today"].isSelected)
        XCTAssertTrue(app.navigationBars["Today"].exists)
    }

    @MainActor
    func testDeepLinksSwitchTabs() throws {
        let app = launchApp()
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
            XCTAssertTrue(app.navigationBars[link.tab].waitForExistence(timeout: 10), link.url)
            XCTAssertTrue(tabBar.buttons[link.tab].isSelected, link.url)
        }
    }
}
