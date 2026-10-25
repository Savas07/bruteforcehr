import XCTest

extension XCUIApplication {
    /// Waits until pushes, sheets and scrolling have come to rest before an accessibility audit.
    /// A fixed short sleep measured mid-animation on loaded CI runners (contrast and clipping
    /// reported for text still sliding in); this polls the frames that move during those
    /// transitions until two samples 0.25 s apart agree, for at most `timeout`.
    @MainActor
    func settleForAudit(timeout: TimeInterval = 4) {
        func sample() -> [CGRect] {
            var frames = navigationBars.allElementsBoundByIndex.map(\.frame)
            let bar = descendants(matching: .any)["sheet.bar"].firstMatch
            if bar.exists { frames.append(bar.frame) }
            let scroll = scrollViews.firstMatch
            if scroll.exists { frames.append(scroll.frame) }
            let list = collectionViews.firstMatch
            if list.exists { frames.append(list.frame) }
            return frames
        }
        let deadline = Date().addingTimeInterval(timeout)
        var previous = sample()
        while Date() < deadline {
            Thread.sleep(forTimeInterval: 0.25)
            let current = sample()
            if current == previous { return }
            previous = current
        }
    }
}
