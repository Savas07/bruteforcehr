import BFHRCore
import Foundation
import Testing
@testable import BFHRUI

@Suite("Plain text")
struct PlainTextTests {
    @Test("An interpolated address stays plain text with the full sentence")
    func linksAreRemoved() {
        let plain = AttributedString.bfhrPlain(Strings.autoChange(to: .interviewing, sender: "interviews@acme.com"))
        #expect(String(plain.characters) == "Moved to Interviewing — from an email by interviews@acme.com")
        #expect(plain.runs.allSatisfy { $0.link == nil })
    }
}
