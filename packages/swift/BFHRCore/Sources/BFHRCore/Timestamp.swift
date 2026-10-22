import Foundation

/// ISO-8601 timestamps as JavaScript writes them (`Date.prototype.toJSON`): UTC with millisecond
/// precision, e.g. `2026-10-22T07:30:00.000Z`.
///
/// Parsing and formatting go through whole milliseconds, so a timestamp written by TypeScript
/// decodes to the same `Date` on every platform and encodes back to the identical string.
public enum ISO8601Timestamp {
    /// Parses `YYYY-MM-DDTHH:MM:SS[.fraction](Z|±HH:MM)`. Fractions beyond milliseconds are
    /// truncated, as in JavaScript.
    public static func date(from string: String) -> Date? {
        var scanner = Scanner(Array(string.utf8))
        guard
            let year = scanner.number(digits: 4), scanner.skip("-"),
            let month = scanner.number(digits: 2), scanner.skip("-"),
            let day = scanner.number(digits: 2), scanner.skip("T"),
            let hour = scanner.number(digits: 2), scanner.skip(":"),
            let minute = scanner.number(digits: 2), scanner.skip(":"),
            let second = scanner.number(digits: 2),
            (1...12).contains(month), (1...daysInMonth(month, year: year)).contains(day),
            hour < 24, minute < 60, second < 60
        else { return nil }

        var milliseconds = 0
        if scanner.skip(".") {
            guard let fraction = scanner.fraction() else { return nil }
            milliseconds = fraction
        }

        var offsetMinutes = 0
        if !scanner.skip("Z") {
            let sign: Int
            if scanner.skip("+") { sign = 1 } else if scanner.skip("-") { sign = -1 } else { return nil }
            guard
                let offsetHours = scanner.number(digits: 2), scanner.skip(":"),
                let offsetMinutesPart = scanner.number(digits: 2),
                offsetHours < 24, offsetMinutesPart < 60
            else { return nil }
            offsetMinutes = sign * (offsetHours * 60 + offsetMinutesPart)
        }
        guard scanner.isAtEnd else { return nil }

        let days = Int64(daysFromCivil(year: year, month: month, day: day))
        let seconds = days * 86_400 + Int64(hour * 3_600 + minute * 60 + second - offsetMinutes * 60)
        return Date(epochMilliseconds: seconds * 1_000 + Int64(milliseconds))
    }

    /// Formats `date` in UTC with milliseconds, the exact output of JavaScript's `toISOString()`
    /// for years 0–9999.
    public static func string(from date: Date) -> String {
        let milliseconds = date.epochMilliseconds
        let days = floorDivide(milliseconds, by: millisecondsPerDay)
        let msOfDay = Int(milliseconds - days * millisecondsPerDay)
        let (year, month, day) = civilFromDays(Int(days))
        return "\(pad(year, 4))-\(pad(month, 2))-\(pad(day, 2))T"
            + "\(pad(msOfDay / 3_600_000, 2)):\(pad(msOfDay / 60_000 % 60, 2)):\(pad(msOfDay / 1_000 % 60, 2))"
            + ".\(pad(msOfDay % 1_000, 3))Z"
    }

    private static func pad(_ value: Int, _ width: Int) -> String {
        let digits = String(value)
        return String(repeating: "0", count: max(0, width - digits.count)) + digits
    }

    private static func daysInMonth(_ month: Int, year: Int) -> Int {
        switch month {
        case 2: (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: 30
        default: 31
        }
    }

    /// Days since 1970-01-01 in the proleptic Gregorian calendar (Howard Hinnant's algorithm).
    private static func daysFromCivil(year: Int, month: Int, day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yearOfEra = y - era * 400
        let dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1
        let dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
        return era * 146_097 + dayOfEra - 719_468
    }

    /// Inverse of `daysFromCivil`.
    private static func civilFromDays(_ days: Int) -> (year: Int, month: Int, day: Int) {
        let z = days + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let dayOfEra = z - era * 146_097
        let yearOfEra = (dayOfEra - dayOfEra / 1_460 + dayOfEra / 36_524 - dayOfEra / 146_096) / 365
        let dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100)
        let mp = (5 * dayOfYear + 2) / 153
        let day = dayOfYear - (153 * mp + 2) / 5 + 1
        let month = mp < 10 ? mp + 3 : mp - 9
        return (yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day)
    }

    private struct Scanner {
        let bytes: [UInt8]
        var index = 0

        init(_ bytes: [UInt8]) { self.bytes = bytes }

        var isAtEnd: Bool { index == bytes.count }

        mutating func skip(_ character: Unicode.Scalar) -> Bool {
            guard index < bytes.count, bytes[index] == UInt8(ascii: character) else { return false }
            index += 1
            return true
        }

        mutating func number(digits count: Int) -> Int? {
            guard index + count <= bytes.count else { return nil }
            var value = 0
            for byte in bytes[index..<index + count] {
                guard let digit = Self.digit(byte) else { return nil }
                value = value * 10 + digit
            }
            index += count
            return value
        }

        /// Milliseconds from one or more fraction digits.
        mutating func fraction() -> Int? {
            var milliseconds = 0
            var count = 0
            while index < bytes.count, let digit = Self.digit(bytes[index]) {
                if count < 3 { milliseconds = milliseconds * 10 + digit }
                count += 1
                index += 1
            }
            guard count > 0 else { return nil }
            for _ in count..<max(count, 3) { milliseconds *= 10 }
            return milliseconds
        }

        private static func digit(_ byte: UInt8) -> Int? {
            (48...57).contains(byte) ? Int(byte - 48) : nil
        }
    }
}

let millisecondsPerDay: Int64 = 86_400_000

func floorDivide(_ value: Int64, by divisor: Int64) -> Int64 {
    let quotient = value / divisor
    return value % divisor < 0 ? quotient - 1 : quotient
}

extension Date {
    /// Whole milliseconds since 1970 (JavaScript `getTime()`).
    var epochMilliseconds: Int64 { Int64((timeIntervalSince1970 * 1_000).rounded()) }

    init(epochMilliseconds: Int64) {
        self.init(timeIntervalSince1970: Double(epochMilliseconds) / 1_000)
    }
}

/// JSON coders for Firestore-shaped documents: dates as ISO-8601 strings (see `ISO8601Timestamp`).
public enum BFHRJSON {
    public static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            guard let date = ISO8601Timestamp.date(from: string) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Expected an ISO-8601 timestamp, got \(string)"
                )
            }
            return date
        }
        return decoder
    }

    public static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601Timestamp.string(from: date))
        }
        return encoder
    }
}
