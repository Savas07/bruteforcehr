import CoreGraphics
import Testing
@testable import BFHRUI

@Suite("Button pair")
struct ButtonPairTests {
    @Test("Side by side only when each label fits in half the width")
    func sideBySideRule() {
        #expect(ButtonPairLayout.isSideBySide(idealWidths: [120, 100], available: 343, spacing: 8))
        #expect(!ButtonPairLayout.isSideBySide(idealWidths: [180, 100], available: 343, spacing: 8))
        #expect(ButtonPairLayout.isSideBySide(idealWidths: [180, 100], available: .infinity, spacing: 8))
    }
}

@Suite("Button pair slack")
struct ButtonPairSlackTests {
    @Test("A label that only just fits half the width stacks instead of risking truncation")
    func needsSlack() {
        #expect(!ButtonPairLayout.isSideBySide(idealWidths: [167.4, 100], available: 342, spacing: 8))
        #expect(ButtonPairLayout.isSideBySide(idealWidths: [165.5, 100], available: 342, spacing: 8))
    }
}
