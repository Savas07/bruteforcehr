import SwiftUI

/// The count a screen asks its tab to show as a badge (IA.md: the Mail tab's To review count is
/// the app's only badge). The app reads it per tab and applies `.badge(_:)`; 0 shows no badge.
/// Nested views reporting the same count don't add up: the largest value wins.
public struct BFHRTabBadgeKey: PreferenceKey {
    public static let defaultValue = 0

    public static func reduce(value: inout Int, nextValue: () -> Int) {
        value = max(value, nextValue())
    }
}

extension View {
    /// Shows `count` as the badge of the tab this view is in (0 hides it). Only the Mail tab uses
    /// a badge (calm principle: no other counters).
    public func bfhrTabBadge(_ count: Int) -> some View {
        preference(key: BFHRTabBadgeKey.self, value: max(0, count))
    }
}
