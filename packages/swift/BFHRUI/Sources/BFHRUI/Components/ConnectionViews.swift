import BFHRDesignTokens
import SwiftUI

/// The neutral connection banner under the navigation bar (states.md "Decision — iOS"): bold
/// status + one consequence line, `wifi.slash`, never red, not dismissible while offline. "Back
/// online" replaces it for `BFHRTiming.backOnline`. Announced politely when it appears.
public struct ConnectionBanner: View {
    private let state: ConnectionState

    public init(_ state: ConnectionState) {
        self.state = state
    }

    public var body: some View {
        switch state {
        case .online:
            EmptyView()
        case .offline:
            banner(glyph: "wifi.slash", title: Strings.offlineTitle, body: Strings.offlineBody)
        case .backOnline(let synced):
            banner(glyph: "wifi", title: Strings.backOnline, body: synced > 0 ? Strings.allSynced : nil)
        }
    }

    private func banner(glyph: String, title: LocalizedStringResource, body: LocalizedStringResource?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
            Image(systemName: glyph)
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if let body {
                    Text(body)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s2)
        .background(BFHRColor.Surface.sunken)
        .overlay(alignment: .bottom) {
            Rectangle().fill(BFHRColor.Line.subtle).frame(height: BFHRBorderWidth.hairline)
        }
        .accessibilityElement(children: .combine)
        .onAppear {
            AccessibilityNotification.Announcement(String(localized: title)).post()
        }
    }
}

/// `ConnectionBanner` as the first section of a `List`, edge to edge. Put it first in the list's
/// content; it renders nothing while online. (A top `safeAreaInset`, `safeAreaBar` or overlay on
/// the list hides the large title on iOS 26, so the banner lives in the content for M0; pinning
/// it while scrolling is open for the screens' design.)
public struct ConnectionBannerSection: View {
    private let state: ConnectionState

    public init(_ state: ConnectionState) {
        self.state = state
    }

    public var body: some View {
        if state != .online {
            Section {
                ConnectionBanner(state)
                    .listRowInsets(EdgeInsets())
            }
        }
    }
}

/// "Waiting to sync" glyph for rows changed offline (`clock.arrow.circlepath`).
public struct SyncGlyph: View {
    public init() {}

    public var body: some View {
        Image(systemName: "clock.arrow.circlepath")
            .font(.bfhr(.caption1))
            .foregroundStyle(BFHRColor.Fg.tertiary)
            .accessibilityLabel(Text(Strings.waitingToSync))
    }
}

/// "Updated 09:12" / "Last checked 09:40" footnote for cached data.
public struct StaleStamp: View {
    public enum Kind: Sendable {
        case updated
        case lastChecked
    }

    private let date: Date
    private let kind: Kind
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @Environment(\.timeZone) private var timeZone

    public init(_ date: Date, kind: Kind = .updated) {
        self.date = date
        self.kind = kind
    }

    public var body: some View {
        var calendar = calendar
        calendar.timeZone = timeZone
        let time = DateText.time(date, locale: locale, calendar: calendar)
        return Text(kind == .updated ? Strings.updated(time) : Strings.lastChecked(time))
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.tertiary)
    }
}

/// The reason under a server-only action that's disabled offline (`NeedsConnection`). The action
/// stays visible, disabled; this line says why.
public struct NeedsConnectionNote: View {
    public init() {}

    public var body: some View {
        Label { Text(Strings.needsConnection) } icon: { Image(systemName: "wifi.slash") }
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
    }
}
