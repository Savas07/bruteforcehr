import Testing
@testable import BFHRUI

@Suite("Tab badge")
struct TabBadgeTests {
    @Test("Nested reports of one count don't add up; no report means no badge")
    func reduceKeepsTheLargest() {
        #expect(BFHRTabBadgeKey.defaultValue == 0)
        var value = BFHRTabBadgeKey.defaultValue
        for next in [3, 3, 1] {
            BFHRTabBadgeKey.reduce(value: &value) { next }
        }
        #expect(value == 3)
    }
}
