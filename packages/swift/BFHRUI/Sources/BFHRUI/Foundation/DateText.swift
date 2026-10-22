import Foundation

/// Neutral relative dates (components.md `RelativeTimeChip`): "Tomorrow, 17:00", "In 2 days",
/// "8 days ago". Day arithmetic is in calendar days of `calendar` (local midnight), and every
/// string comes from Foundation formatters in `locale` (24 h in TR / DE).
public enum DateText {
    /// Whole calendar days from `now` to `date`; negative in the past.
    public static func dayOffset(of date: Date, from now: Date, calendar: Calendar) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
    }

    /// "Today", "Tomorrow", "In 3 days", "8 days ago", capitalized for the start of a sentence.
    public static func relativeDay(_ date: Date, now: Date, locale: Locale, calendar: Calendar) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.dateTimeStyle = .named
        formatter.unitsStyle = .full
        formatter.formattingContext = .beginningOfSentence
        return formatter.localizedString(from: DateComponents(day: dayOffset(of: date, from: now, calendar: calendar)))
    }

    /// The time of day ("14:00" / "2:00 PM").
    public static func time(_ date: Date, locale: Locale, calendar: Calendar) -> String {
        date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, calendar: calendar, timeZone: calendar.timeZone))
    }

    /// "Today, 14:00" / "Tomorrow, 17:00" within a week either way, else "Thu 30 Oct, 14:00".
    public static func dayAndTime(_ date: Date, now: Date, locale: Locale, calendar: Calendar) -> String {
        let offset = dayOffset(of: date, from: now, calendar: calendar)
        let day = abs(offset) <= 6
            ? relativeDay(date, now: now, locale: locale, calendar: calendar)
            : date.formatted(
                Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
                    .weekday(.abbreviated).day().month(.abbreviated)
            )
        return String(localized: Strings.dayAndTime(day: day, time: time(date, locale: locale, calendar: calendar)))
    }

    /// The full date and time for accessibility labels and tooltips.
    public static func full(_ date: Date, locale: Locale, calendar: Calendar) -> String {
        date.formatted(Date.FormatStyle(date: .complete, time: .shortened, locale: locale, calendar: calendar, timeZone: calendar.timeZone))
    }
}
