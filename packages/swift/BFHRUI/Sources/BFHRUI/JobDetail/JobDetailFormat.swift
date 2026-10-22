import BFHRCore
import Foundation

/// Formatting for the job detail screen: salaries, source names and relative times. Labels for
/// domain enums live in `JobDetailViewStrings`.
enum JobDetailFormat {
    /// "€70K–€85K", "From €70K", "Up to €85K" in `locale`, whole units, compact.
    static func salaryAmount(_ range: SalaryRange, locale: Locale) -> String? {
        func amount(_ value: Double) -> String {
            value.formatted(
                .currency(code: range.currency)
                    .locale(locale)
                    .notation(.compactName)
                    .precision(.significantDigits(1...3))
            )
        }
        switch (range.min, range.max) {
        case let (min?, max?) where min == max:
            return amount(min)
        case let (min?, max?):
            return String(localized: JobDetailViewStrings.salaryRange(amount(min), amount(max)))
        case let (min?, nil):
            return String(localized: JobDetailViewStrings.salaryFrom(amount(min)))
        case let (nil, max?):
            return String(localized: JobDetailViewStrings.salaryUpTo(amount(max)))
        case (nil, nil):
            return nil
        }
    }

    /// "€70K–€85K a year".
    static func salary(_ range: SalaryRange, locale: Locale) -> String? {
        salaryAmount(range, locale: locale).map { String(localized: JobDetailViewStrings.salaryPer(range.period, amount: $0)) }
    }

    /// "7 hours ago" / "vor 7 Stunden" / "7 saat önce", for the middle of a sentence.
    static func relativeTime(_ date: Date, now: Date, locale: Locale, calendar: Calendar) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.unitsStyle = .full
        formatter.dateTimeStyle = .numeric
        formatter.formattingContext = .middleOfSentence
        // Under a minute reads "now" rather than "0 seconds ago".
        let interval = abs(date.timeIntervalSince(now)) < 60 ? 0 : date.timeIntervalSince(now)
        return formatter.localizedString(fromTimeInterval: interval)
    }

    /// "yesterday" / "3 days ago", in calendar days, for the middle of a sentence.
    static func relativeDay(_ date: Date, now: Date, locale: Locale, calendar: Calendar) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.dateTimeStyle = .named
        formatter.unitsStyle = .full
        formatter.formattingContext = .middleOfSentence
        return formatter.localizedString(from: DateComponents(day: DateText.dayOffset(of: date, from: now, calendar: calendar)))
    }

    /// "12 Oct" (the applied bar).
    static func shortDate(_ date: Date, locale: Locale, calendar: Calendar) -> String {
        date.formatted(Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone).day().month(.abbreviated))
    }

    /// The display name of a job source key ("greenhouse" → "Greenhouse"). Brand names stay
    /// untranslated.
    static func sourceName(_ key: String) -> String {
        let known = [
            "greenhouse": "Greenhouse", "lever": "Lever", "ashby": "Ashby", "smartrecruiters": "SmartRecruiters",
            "workable": "Workable", "recruitee": "Recruitee", "remotive": "Remotive", "arbeitnow": "Arbeitnow",
            "adzuna": "Adzuna", "jooble": "Jooble", "usajobs": "USAJOBS", "reed": "Reed", "linkedin": "LinkedIn",
            "indeed": "Indeed", "kariyer": "Kariyer.net", "stepstone": "StepStone",
        ]
        if let name = known[key.lowercased()] { return name }
        return key.split(separator: "_").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }
}
