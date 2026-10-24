#if os(iOS)
import Foundation
import Testing
import WebKit
@testable import BFHRUI

/// The CV preview and the PDF print view load only their HTML string; nothing in a CV navigates them.
@Suite("CV web view navigation")
struct CVWebNavigationTests {
    @Test("Allows only the HTML string load")
    func onlyTheHTMLString() {
        #expect(CVWebNavigation.allows(.other, url: nil))
        #expect(CVWebNavigation.allows(.other, url: URL(string: "about:blank")))
    }

    @Test("Cancels links, redirects, forms and loads of any URL")
    func everythingElse() {
        let evil = URL(string: "https://attacker.example/x")
        #expect(!CVWebNavigation.allows(.other, url: evil))
        #expect(!CVWebNavigation.allows(.other, url: URL(string: "file:///etc/hosts")))
        #expect(!CVWebNavigation.allows(.linkActivated, url: evil))
        #expect(!CVWebNavigation.allows(.linkActivated, url: URL(string: "about:blank")))
        #expect(!CVWebNavigation.allows(.formSubmitted, url: evil))
        #expect(!CVWebNavigation.allows(.reload, url: nil))
        #expect(!CVWebNavigation.allows(.backForward, url: nil))
    }
}
#endif
