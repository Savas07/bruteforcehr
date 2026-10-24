import XCTest

extension XCUIApplication {
    /// A fresh test account sees first-run onboarding after sign-in: Skip for now on all three
    /// steps (Finish without a saved search) so a live test lands on the tabs. Returns at once
    /// when the tabs show first.
    @MainActor
    func skipOnboardingIfShown(timeout: TimeInterval = 30) {
        let onboarding = descendants(matching: .any)["onboarding"]
        let tabs = tabBars.firstMatch
        let shown = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in tabs.exists || onboarding.exists }, object: nil)
        _ = XCTWaiter().wait(for: [shown], timeout: timeout)
        guard onboarding.exists, !tabs.exists else { return }
        for _ in 0..<3 {
            let skip = buttons["onboarding.skip"]
            guard skip.waitForExistence(timeout: 10) else { return }
            // Skip is disabled while Finish writes; wait for it.
            let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: skip)
            _ = XCTWaiter().wait(for: [enabled], timeout: 20)
            skip.tap()
            if tabs.waitForExistence(timeout: 2) { return }
        }
    }
}

extension XCUIElement {
    /// A chip (a SwiftUI toggle, exposed as a switch) is on.
    var isOn: Bool { (value as? String) == "1" || isSelected }
}

extension XCUIApplication {
    /// Drags the onboarding / Settings list in short steps until `element` is fully visible above
    /// the sticky bottom bar (XCUITest calls elements under the bar hittable).
    @MainActor
    func scrollUntilVisible(_ element: XCUIElement, maxDrags: Int = 14) {
        let bar = descendants(matching: .any).matching(
            NSPredicate(format: "identifier IN %@", ["onboarding.continue", "onboarding.finish"])
        ).firstMatch
        for _ in 0..<maxDrags {
            let limit = bar.exists ? bar.frame.minY - 8 : frame.maxY - 40
            if element.exists, element.isHittable, element.frame.maxY < limit, element.frame.minY > 120 { return }
            let start = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
            let end = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
    }
}
