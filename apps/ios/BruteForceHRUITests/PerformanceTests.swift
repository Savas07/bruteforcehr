import XCTest

/// Performance budgets (docs/BRIEF.md §9, docs/runbooks/performance.md), run by
/// `apps/ios/scripts/perf.sh`, which reads the measurements from the result bundle and enforces
/// the budgets (XCTest baselines are per machine, so they can't gate CI):
///
/// - launch to interactive < 2 s: `XCTApplicationLaunchMetric(waitUntilResponsive:)` on a
///   signed-in design launch (fixture data, Today), 5 measured launches;
/// - 60 fps scrolling with 5,000 jobs and 1,000 applications (`-BFHRDesign scaled`):
///   `XCTOSSignpostMetric.scrollingAndDecelerationMetric` while flicking the Jobs feed and the
///   Tracker board; the budget is the hitch time ratio.
///
/// The simulator stands in for a recent iPhone: it runs the app on the Mac's CPU and GPU, so the
/// numbers are a proxy (see the runbook), and design mode exists only in Debug builds (unoptimized
/// Swift), which makes them conservative.
final class PerformanceTests: XCTestCase {
    private let english = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]

    private var options: XCTMeasureOptions {
        let options = XCTMeasureOptions()
        options.iterationCount = 5
        return options
    }

    @MainActor
    func testLaunchToInteractive() {
        let app = XCUIApplication()
        app.launchArguments += english + ["-BFHRDesign", "populated", "-BFHRScreen", "today"]
        measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options) {
            app.launch()
        }
        XCTAssertTrue(app.descendants(matching: .any)["design.today"].waitForExistence(timeout: 20))
    }

    @MainActor
    func testScrollJobsFeed() {
        let app = launch("jobs", ready: "jobs.feed")
        let feed = app.collectionViews.firstMatch
        XCTAssertTrue(feed.waitForExistence(timeout: 20))
        flick(feed)
    }

    @MainActor
    func testScrollTrackerBoard() {
        let app = launch("tracker-board", ready: "design.tracker-board")
        let board = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
        XCTAssertTrue(board.waitForExistence(timeout: 20))
        flick(board)
    }

    @MainActor
    private func launch(_ screen: String, ready: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += english + ["-BFHRScreen", screen, "-BFHRDesign", "scaled"]
        app.launch()
        XCTAssertTrue(app.descendants(matching: .any)[ready].firstMatch.waitForExistence(timeout: 60), "\(screen) shows \(ready)")
        return app
    }

    /// Fast flicks down and back up, measured as one scroll-and-decelerate interaction each run.
    @MainActor
    private func flick(_ element: XCUIElement) {
        measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric], options: options) {
            element.swipeUp(velocity: .fast)
            element.swipeUp(velocity: .fast)
            element.swipeDown(velocity: .fast)
        }
    }
}
