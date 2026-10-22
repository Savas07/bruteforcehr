import SwiftUI

extension AttributedString {
    /// A localized string with every link removed. Interpolated user data (an email address, a
    /// domain) would otherwise turn into a tappable, accent-colored link inside a sentence.
    public static func bfhrPlain(_ resource: LocalizedStringResource) -> AttributedString {
        var string = AttributedString(localized: resource)
        for run in string.runs where run.link != nil {
            string[run.range].link = nil
        }
        return string
    }
}

extension Text {
    /// `Text(resource)` without links: use it for any string that interpolates user data (emails,
    /// domains, company names). Shared components already do.
    public init(bfhrPlain resource: LocalizedStringResource) {
        self.init(AttributedString.bfhrPlain(resource))
    }
}
