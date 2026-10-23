import Foundation

// Port of packages/core/src/insights/calendar.ts. Civil dates are `YYYY-MM-DD` strings in the
// user's time zone; arithmetic runs on day numbers (days since 1970-01-01). Only
// `InsightsCalendar.civilDate(_:)` touches time zones. Proven by core/conformance/insights.json.

/// `YYYY-MM-DD`. Compares correctly as a string.
public typealias CivilDate = String

/// Converts instants to civil dates in one time zone (create once per computation).
public struct InsightsCalendar: Sendable {
    public let timeZone: TimeZone
    private let calendar: Calendar

    /// `identifier` is an IANA zone; unknown identifiers fall back to UTC.
    public init(timeZoneIdentifier identifier: String) {
        self.init(timeZone: TimeZone(identifier: identifier) ?? TimeZone(secondsFromGMT: 0)!)
    }

    public init(timeZone: TimeZone) {
        self.timeZone = timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        self.calendar = calendar
    }

    /// The calendar date of `instant` in this time zone.
    public func civilDate(_ instant: Date) -> CivilDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        return CivilDates.format(year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1)
    }
}

/// Civil date arithmetic (TypeScript `calendar.ts` free functions).
public enum CivilDates {
    static func format(year: Int, month: Int, day: Int) -> CivilDate {
        "\(pad(year, 4))-\(pad(month, 2))-\(pad(day, 2))"
    }

    private static func pad(_ value: Int, _ width: Int) -> String {
        let digits = String(value)
        return String(repeating: "0", count: max(0, width - digits.count)) + digits
    }

    private static func parse(_ date: CivilDate) -> (year: Int, month: Int, day: Int)? {
        let bytes = Array(date.utf8)
        guard bytes.count == 10, bytes[4] == UInt8(ascii: "-"), bytes[7] == UInt8(ascii: "-") else { return nil }
        func number(_ range: Range<Int>) -> Int? {
            var value = 0
            for byte in bytes[range] {
                guard (48...57).contains(byte) else { return nil }
                value = value * 10 + Int(byte - 48)
            }
            return value
        }
        guard let year = number(0..<4), let month = number(5..<7), let day = number(8..<10) else { return nil }
        return (year, month, day)
    }

    static func daysInMonth(year: Int, month: Int) -> Int {
        switch month {
        case 2: (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: 30
        default: 31
        }
    }

    /// Whether `value` is a valid `YYYY-MM-DD` date.
    public static func isValid(_ value: String) -> Bool {
        guard let (year, month, day) = parse(value) else { return false }
        return (1...12).contains(month) && day >= 1 && day <= daysInMonth(year: year, month: month)
    }

    /// Days since 1970-01-01 (Howard Hinnant's algorithm). Invalid input counts as 1970-01-01.
    public static func dayNumber(_ date: CivilDate) -> Int {
        guard let (year, month, day) = parse(date) else { return 0 }
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yearOfEra = y - era * 400
        let dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1
        let dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
        return era * 146_097 + dayOfEra - 719_468
    }

    public static func fromDayNumber(_ days: Int) -> CivilDate {
        let z = days + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let dayOfEra = z - era * 146_097
        let yearOfEra = (dayOfEra - dayOfEra / 1_460 + dayOfEra / 36_524 - dayOfEra / 146_096) / 365
        let dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100)
        let mp = (5 * dayOfYear + 2) / 153
        let day = dayOfYear - (153 * mp + 2) / 5 + 1
        let month = mp < 10 ? mp + 3 : mp - 9
        return format(year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month: month, day: day)
    }

    public static func addDays(_ date: CivilDate, _ days: Int) -> CivilDate {
        fromDayNumber(dayNumber(date) + days)
    }

    /// Same day `months` later (negative: earlier), clamped to the month's last day.
    public static func addMonths(_ date: CivilDate, _ months: Int) -> CivilDate {
        guard let (year, month, day) = parse(date) else { return date }
        let index = year * 12 + (month - 1) + months
        let targetYear = Int((Double(index) / 12).rounded(.down))
        let targetMonth = index - targetYear * 12 + 1
        return format(
            year: targetYear,
            month: targetMonth,
            day: min(day, daysInMonth(year: targetYear, month: targetMonth))
        )
    }

    /// ISO weekday: 1 = Monday … 7 = Sunday.
    public static func isoWeekday(_ date: CivilDate) -> Int {
        (((dayNumber(date) + 3) % 7) + 7) % 7 + 1
    }

    /// The first day of the week containing `date`, for weeks starting on ISO weekday `weekStart`.
    public static func startOfWeek(_ date: CivilDate, weekStart: Int) -> CivilDate {
        addDays(date, -((isoWeekday(date) - weekStart + 7) % 7))
    }

    /// Inclusive number of days from `from` to `to`.
    public static func daysInclusive(from: CivilDate, to: CivilDate) -> Int {
        dayNumber(to) - dayNumber(from) + 1
    }
}
