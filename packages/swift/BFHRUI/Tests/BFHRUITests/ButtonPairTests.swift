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
