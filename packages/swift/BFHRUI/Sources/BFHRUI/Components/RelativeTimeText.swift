import BFHRDesignTokens
import SwiftUI

extension EnvironmentValues {
    /// The clock relative times are measured against. Production leaves the default (the current
    /// time); design builds and previews set the fixture's `now` so captures are stable.
    @Entry public var bfhrNow: Date = .now
}

/// A neutral relative date (components.md `RelativeTimeChip`), with the full date and time as the
/// accessibility label. Never colored, never "overdue".
public struct RelativeTimeText: View {
    public enum Style: Sendable {
        /// "Tomorrow", "In 3 days", "8 days ago".
        case day
        /// "Tomorrow, 17:00"; beyond a week "Thu 30 Oct, 14:00".
        case dayAndTime
        /// "14:00".
        case time
    }

    private let date: Date
    private let style: Style
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @Environment(\.timeZone) private var timeZone

    public init(_ date: Date, style: Style = .day) {
        self.date = date
        self.style = style
    }

    public var body: some View {
        var calendar = calendar
        calendar.timeZone = timeZone
        let text = switch style {
        case .day: DateText.relativeDay(date, now: now, locale: locale, calendar: calendar)
        case .dayAndTime: DateText.dayAndTime(date, now: now, locale: locale, calendar: calendar)
        case .time: DateText.time(date, locale: locale, calendar: calendar)
        }
        return Text(verbatim: text)
            .monospacedDigit()
            .accessibilityLabel(Text(verbatim: DateText.full(date, locale: locale, calendar: calendar)))
    }
}
