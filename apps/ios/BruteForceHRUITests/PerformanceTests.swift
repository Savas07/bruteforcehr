import XCTest

/// Performance budgets (docs/BRIEF.md §9, docs/runbooks/performance.md), run by
/// `apps/ios/scripts/perf.sh`, which reads the measurements from the result bundle and enforces
/// the budgets (XCTest baselines are per machine, so they can't gate CI):
///
/// - launch to interactive < 2 s on a signed-in design launch (fixture data, Today), 5 launches:
///   the app's own time from process start until Today is on screen and the main thread is free
///   (`InAppLaunchMetric`, the budget), next to `XCTApplicationLaunchMetric(waitUntilResponsive:)`,
///   which adds the simulator's launch overhead (reported, with two baselines that show it);
/// - 60 fps scrolling with 5,000 jobs and 1,000 applications (`-BFHRDesign scaled`):
///   `XCTOSSignpostMetric.scrollingAndDecelerationMetric` while flicking the Jobs feed and the
///   Tracker board; the budget is the hitch time ratio, which only devices record.
///
/// The simulator stands in for a recent iPhone: it runs the app on the Mac's CPU and GPU, so the
/// numbers are a proxy (see the runbook). Design mode exists only in the Debug configuration, so
/// that is what runs.
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
        app.launchArguments += english + ["-BFHRDesign", "populated", "-BFHRScreen", "today", "-BFHRPerf", "YES"]
        let inApp = InAppLaunchMetric()
        measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true), inApp], options: options) {
            app.launch()
            let mark = app.descendants(matching: .any)["perf.launchToInteractive"]
            if mark.waitForExistence(timeout: 30), let milliseconds = Double(mark.label) {
                inApp.record(milliseconds: milliseconds)
            }
        }
        XCTAssertTrue(app.descendants(matching: .any)["design.today"].waitForExistence(timeout: 20))
    }

    /// Not a budget: the same measurement of the signed-out launch (the sign-in screen, no fixture
    /// data), to tell the app's own start-up from what the signed-in Today adds.
    @MainActor
    func testLaunchBaselineSignedOut() {
        let app = XCUIApplication()
        app.launchArguments += english
        measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options) {
            app.launch()
        }
    }

    /// Not a budget: the same measurement of a system app (Settings), the floor this simulator
    /// and runner put under any app's launch.
    @MainActor
    func testLaunchBaselineSystemApp() {
        let app = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options) {
            app.launch()
        }
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

/// Launch to interactive as the app measures it (`perf.launchToInteractive`, DesignMode.swift),
/// reported with the other metrics so perf.sh reads it from the result bundle.
private final class InAppLaunchMetric: NSObject, XCTMetric, @unchecked Sendable {
    /// One value per measured launch, in order. XCTest may ask for the measurements only after
    /// the last iteration, so each report takes the oldest.
    private var pending: [Double] = []

    /// Records the launch the measured block just read from the app's mark.
    func record(milliseconds: Double) { pending.append(milliseconds) }

    func copy(with zone: NSZone? = nil) -> Any { self }

    func willBeginMeasuring() {}

    func didStopMeasuring() {}

    func reportMeasurements(
        from startTime: XCTPerformanceMeasurementTimestamp,
        to endTime: XCTPerformanceMeasurementTimestamp
    ) throws -> [XCTPerformanceMeasurement] {
        guard !pending.isEmpty else {
            throw NSError(domain: "PerformanceTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "The app showed no launch mark"])
        }
        return [
            XCTPerformanceMeasurement(
                identifier: "com.savas07.bruteforcehr.launch-to-interactive",
                displayName: "Launch to interactive (in app)",
                doubleValue: pending.removeFirst() / 1000,
                unitSymbol: "s"
            ),
        ]
    }
}
