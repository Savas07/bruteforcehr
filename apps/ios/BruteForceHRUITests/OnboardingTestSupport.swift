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
