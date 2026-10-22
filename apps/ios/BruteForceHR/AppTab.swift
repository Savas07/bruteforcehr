import SwiftUI

/// The tab bar destinations, in order (docs/design/IA.md, "Destinations").
enum AppTab: String, CaseIterable, Identifiable {
    case today
    case jobs
    case tracker
    case cvs
    case mail

    var id: Self { self }

    var title: LocalizedStringKey {
        switch self {
        case .today: "tab.today"
        case .jobs: "tab.jobs"
        case .tracker: "tab.tracker"
        case .cvs: "tab.cvs"
        case .mail: "tab.mail"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .jobs: "briefcase"
        case .tracker: "rectangle.split.3x1"
        case .cvs: "doc.text"
        case .mail: "envelope"
        }
    }

    /// The tab a `bruteforcehr://` link opens (IA.md, "Deep links"): the host names the tab, and
    /// application, interview and insights links live under Tracker. Links only navigate; unknown
    /// or invalid links open Today. Returns nil for other schemes.
    init?(deepLink url: URL) {
        guard url.scheme?.lowercased() == "bruteforcehr" else { return nil }
        switch url.host()?.lowercased() {
        case "jobs": self = .jobs
        case "tracker", "applications", "interviews", "insights": self = .tracker
        case "cvs": self = .cvs
        case "mail": self = .mail
        default: self = .today
        }
    }
}
