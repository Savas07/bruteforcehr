import Foundation

// Port of packages/core/src/insights (§4.8 Insights, decisions.md D30/D31). TypeScript is the
// source of truth; core/conformance/insights.json proves this port. Pure: callers pass `now`.

// MARK: - Market

public enum InsightsMarket {
    public static let remote = "remote"

    /// Keywords per market (folded), checked in this order.
    public static let keywords: [(market: String, keywords: [String])] = [
        ("TR", ["turkey", "turkiye", "istanbul", "ankara", "izmir", "bursa", "antalya", "kocaeli", "kadikoy", "maslak"]),
        ("DE", [
            "germany", "deutschland", "berlin", "munchen", "munich", "hamburg", "frankfurt", "koln", "cologne",
            "stuttgart", "dusseldorf", "leipzig", "karlsruhe",
        ]),
        ("NL", ["netherlands", "nederland", "amsterdam", "rotterdam", "utrecht", "eindhoven", "the hague", "den haag", "delft"]),
        ("GB", [
            "united kingdom", "uk", "england", "scotland", "wales", "london", "manchester", "leeds", "edinburgh",
            "bristol", "cambridge", "oxford", "birmingham", "glasgow",
        ]),
        ("US", [
            "united states", "usa", "us", "new york", "nyc", "san francisco", "seattle", "boston", "austin", "chicago",
            "los angeles",
        ]),
        ("IE", ["ireland", "dublin", "cork"]),
        ("ES", ["spain", "espana", "barcelona", "madrid", "valencia"]),
        ("FR", ["france", "paris", "lyon"]),
        ("PT", ["portugal", "lisbon", "lisboa", "porto"]),
        ("PL", ["poland", "warsaw", "krakow"]),
        ("AT", ["austria", "vienna", "wien"]),
        ("CH", ["switzerland", "zurich", "geneva", "basel"]),
        ("SE", ["sweden", "stockholm"]),
        ("DK", ["denmark", "copenhagen"]),
        ("BE", ["belgium", "brussels", "antwerp"]),
    ]

    public static let remoteKeywords = ["remote", "uzaktan", "fernarbeit", "home office", "anywhere", "worldwide"]

    /// Lowercase a–z/0–9 words separated by single spaces, padded with one space on each side.
    public static func fold(_ text: String) -> String {
        var stripped = String.UnicodeScalarView()
        for scalar in text.decomposedStringWithCanonicalMapping.unicodeScalars {
            switch scalar.properties.generalCategory {
            case .nonspacingMark, .spacingMark, .enclosingMark: continue
            default: stripped.append(scalar)
            }
        }
        var words = String.UnicodeScalarView()
        var pendingSpace = false
        for scalar in String(stripped).lowercased().unicodeScalars {
            if ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar) {
                if pendingSpace, !words.isEmpty { words.append(" ") }
                pendingSpace = false
                words.append(scalar)
            } else {
                pendingSpace = true
            }
        }
        return " \(String(words)) "
    }

    /// The market of an application's `location`; nil when no known place or remote keyword appears.
    public static func of(_ location: String?) -> String? {
        guard let location else { return nil }
        let folded = fold(location)
        for (market, words) in keywords where words.contains(where: { folded.contains(" \($0) ") }) {
            return market
        }
        return remoteKeywords.contains(where: { folded.contains(" \($0) ") }) ? remote : nil
    }
}

// MARK: - Input

/// The application fields Insights reads (TypeScript `InsightsApplication`).
public struct InsightsApplication: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var status: ApplicationStatus
    public var appliedAt: Date?
    public var channel: Channel?
    public var source: String?
    public var cvId: String?
    public var location: String?

    public init(
        id: String, status: ApplicationStatus, appliedAt: Date?, channel: Channel?, source: String?,
        cvId: String?, location: String?
    ) {
        self.id = id
        self.status = status
        self.appliedAt = appliedAt
        self.channel = channel
        self.source = source
        self.cvId = cvId
        self.location = location
    }

    public init(_ application: Application) {
        self.init(
            id: application.id, status: application.status, appliedAt: application.appliedAt,
            channel: application.channel, source: application.source, cvId: application.cvId,
            location: application.location
        )
    }
}

public struct InsightsInterview: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var applicationId: String
    public var startsAt: Date

    public init(id: String, applicationId: String, startsAt: Date) {
        self.id = id
        self.applicationId = applicationId
        self.startsAt = startsAt
    }

    public init(_ interview: Interview) {
        self.init(id: interview.id, applicationId: interview.applicationId, startsAt: interview.startsAt)
    }
}

public struct InsightsInput: Sendable {
    public var applications: [InsightsApplication]
    /// Events of other (e.g. deleted) applications are ignored.
    public var events: [ApplicationEvent]
    public var interviews: [InsightsInterview]
    /// `mailMessages/{id}.category` by message id; a `mail_received` event is a response when its
    /// `evidence.mailMessageId` maps to a response category.
    public var mailCategories: [String: MailCategory]

    public init(
        applications: [InsightsApplication], events: [ApplicationEvent], interviews: [InsightsInterview] = [],
        mailCategories: [String: MailCategory] = [:]
    ) {
        self.applications = applications
        self.events = events
        self.interviews = interviews
        self.mailCategories = mailCategories
    }
}

// MARK: - Journey

public enum Insights {
    /// Rates and medians need at least this many applications (D31).
    public static let lowSampleThreshold = 5
    /// Weeks in the weekly activity chart, ending with the current week.
    public static let activityWeeks = 12
    /// A `mail_sent` within this long after applying is the application itself.
    public static let applicationMailWindowMilliseconds: Int64 = 3_600_000
    /// Groups for applications without a source / channel / CV / known market.
    public static let noneKey = "none"
    public static let responseStatuses: [ApplicationStatus] = [.screening, .interviewing, .offer, .rejected]
    public static let responseMailCategories: [MailCategory] = [
        .interviewInvite, .assessment, .offer, .rejection, .infoRequest,
    ]
}

public enum InsightsDimension: String, Codable, Hashable, Sendable, CaseIterable {
    case source, channel, cv, market
}

/// One selected value per dimension.
public typealias InsightsFilters = [InsightsDimension: String]

/// One application's path through the funnel (TypeScript `Journey`).
public struct InsightsJourney: Hashable, Sendable {
    public let id: String
    public let status: ApplicationStatus
    public let source: String
    public let channel: String
    public let cv: String
    public let market: String
    public let appliedAt: Date?
    public let appliedDate: CivilDate?
    public let responded: Bool
    public let respondedAt: Date?
    public let interviewed: Bool
    public let interviewedAt: Date?
    public let offered: Bool
    public let offeredAt: Date?
    public let followUps: [Date]

    public func key(_ dimension: InsightsDimension) -> String {
        switch dimension {
        case .source: source
        case .channel: channel
        case .cv: cv
        case .market: market
        }
    }
}

private let appliedRank = statusRank(.applied) ?? 0
private let interviewRank = statusRank(.interviewing) ?? 0
private let offerRank = statusRank(.offer) ?? 0

private func atLeast(_ status: ApplicationStatus, _ rank: Int) -> Bool { (statusRank(status) ?? -1) >= rank }

/// The journey of `application` from `events` (any order; other applications' events are skipped).
public func buildJourney(
    _ application: InsightsApplication,
    events: [ApplicationEvent],
    mailCategories: [String: MailCategory],
    calendar: InsightsCalendar
) -> InsightsJourney {
    let own = events.filter { $0.applicationId == application.id }
    let undone = Set(own.compactMap(\.revertsEventId))
    let kept = own.enumerated()
        .filter { $0.element.revertsEventId == nil && !undone.contains($0.element.id) }
        .sorted {
            let (a, b) = ($0.element.occurredAt.epochMilliseconds, $1.element.occurredAt.epochMilliseconds)
            return a != b ? a < b : $0.offset < $1.offset
        }
        .map(\.element)

    var applied = false
    var appliedAt: Date?
    var responded = false
    var respondedAt: Date?
    var interviewed = false
    var interviewedAt: Date?
    var offered = false
    var offeredAt: Date?
    var mails: [Date] = []
    var sent: [Date] = []

    for event in kept {
        switch (event.type, event.toStatus) {
        case (.created, let to?):
            let closedWithDate = ApplicationStatus.sideExits.contains(to) && application.appliedAt != nil
            guard atLeast(to, appliedRank) || closedWithDate else { continue }
            applied = true
            appliedAt = application.appliedAt ?? event.occurredAt
            if Insights.responseStatuses.contains(to) || atLeast(to, offerRank) { responded = true }
            if atLeast(to, interviewRank) { interviewed = true }
            if atLeast(to, offerRank) { offered = true }
        case (.statusChanged, let to?):
            if !applied {
                guard atLeast(to, appliedRank) else { continue }
                applied = true
                appliedAt = application.appliedAt ?? event.occurredAt
                if Insights.responseStatuses.contains(to) { responded = true }
                if atLeast(to, interviewRank) { interviewed = true }
                if atLeast(to, offerRank) { offered = true }
                continue
            }
            if !responded, Insights.responseStatuses.contains(to) {
                responded = true
                respondedAt = event.occurredAt
            }
            if !interviewed, atLeast(to, interviewRank) {
                interviewed = true
                interviewedAt = event.occurredAt
            }
            if !offered, atLeast(to, offerRank) {
                offered = true
                offeredAt = event.occurredAt
            }
        case (.mailReceived, _):
            if let id = event.evidence?.mailMessageId, let category = mailCategories[id],
               Insights.responseMailCategories.contains(category)
            {
                mails.append(event.occurredAt)
            }
        case (.mailSent, _):
            sent.append(event.occurredAt)
        default:
            break
        }
    }

    if applied, let appliedAt {
        let appliedTime = appliedAt.epochMilliseconds
        if let mail = mails.first(where: { $0.epochMilliseconds >= appliedTime }),
           !responded || (respondedAt.map { mail.epochMilliseconds < $0.epochMilliseconds } ?? false)
        {
            responded = true
            respondedAt = mail
        }
    }

    let appliedTime = appliedAt?.epochMilliseconds ?? 0
    return InsightsJourney(
        id: application.id,
        status: application.status,
        source: application.source ?? Insights.noneKey,
        channel: application.channel?.rawValue ?? Insights.noneKey,
        cv: application.cvId ?? Insights.noneKey,
        market: InsightsMarket.of(application.location) ?? Insights.noneKey,
        appliedAt: applied ? appliedAt : nil,
        appliedDate: applied ? appliedAt.map(calendar.civilDate) : nil,
        responded: applied && responded,
        respondedAt: applied ? respondedAt : nil,
        interviewed: applied && interviewed,
        interviewedAt: applied ? interviewedAt : nil,
        offered: applied && offered,
        offeredAt: applied ? offeredAt : nil,
        followUps: applied
            ? sent.filter { $0.epochMilliseconds > appliedTime + Insights.applicationMailWindowMilliseconds }
            : []
    )
}

// MARK: - Ranges

public enum InsightsRangePreset: String, Codable, Hashable, Sendable, CaseIterable {
    case fourWeeks = "4w"
    case twelveWeeks = "12w"
    case thirtyDays = "30d"
    case ninetyDays = "90d"
    case sixMonths = "6m"
    case twelveMonths = "12m"
    case all

    /// iOS offers `4W · 12W · All` (D31).
    public static let ios: [InsightsRangePreset] = [.fourWeeks, .twelveWeeks, .all]
}

/// Inclusive applied-date bounds; `from` nil means since the first application.
public struct InsightsRange: Codable, Hashable, Sendable {
    public var from: CivilDate?
    public var to: CivilDate

    public init(from: CivilDate?, to: CivilDate) {
        self.from = from
        self.to = to
    }

    public func contains(_ date: CivilDate?) -> Bool {
        guard let date else { return false }
        return (from.map { date >= $0 } ?? true) && date <= to
    }
}

public func rangeForPreset(_ preset: InsightsRangePreset, today: CivilDate) -> InsightsRange {
    switch preset {
    case .fourWeeks: InsightsRange(from: CivilDates.addDays(today, -27), to: today)
    case .twelveWeeks: InsightsRange(from: CivilDates.addDays(today, -83), to: today)
    case .thirtyDays: InsightsRange(from: CivilDates.addDays(today, -29), to: today)
    case .ninetyDays: InsightsRange(from: CivilDates.addDays(today, -89), to: today)
    case .sixMonths: InsightsRange(from: CivilDates.addDays(CivilDates.addMonths(today, -6), 1), to: today)
    case .twelveMonths: InsightsRange(from: CivilDates.addDays(CivilDates.addMonths(today, -12), 1), to: today)
    case .all: InsightsRange(from: nil, to: today)
    }
}

/// The equally long range just before `range`; nil for "all".
public func previousRange(_ range: InsightsRange) -> InsightsRange? {
    guard let from = range.from else { return nil }
    let length = CivilDates.daysInclusive(from: from, to: range.to)
    return InsightsRange(from: CivilDates.addDays(from, -length), to: CivilDates.addDays(from, -1))
}

// MARK: - Report

public struct InsightsOptions: Sendable {
    public var now: Date
    /// IANA zone for applied dates and weeks.
    public var timeZone: String
    /// ISO weekday the locale's week starts on (1 = Monday, 7 = Sunday).
    public var weekStart: Int
    public var range: InsightsRange
    public var filters: InsightsFilters

    public init(now: Date, timeZone: String, weekStart: Int, range: InsightsRange, filters: InsightsFilters = [:]) {
        self.now = now
        self.timeZone = timeZone
        self.weekStart = weekStart
        self.range = range
        self.filters = filters
    }
}

/// `count` of `of`; `value` nil while `of` < the low-sample threshold.
public struct InsightsRate: Codable, Hashable, Sendable {
    public let count: Int
    public let of: Int
    public let value: Double?

    public init(count: Int, of: Int) {
        self.count = count
        self.of = of
        value = of < Insights.lowSampleThreshold ? nil : Double(count) / Double(of)
    }
}

/// Median days over `n` measured applications; `days` nil while `n` < the threshold.
public struct MedianDays: Codable, Hashable, Sendable {
    public let n: Int
    public let days: Double?

    public init(_ samples: [Double]) {
        n = samples.count
        guard n >= Insights.lowSampleThreshold else {
            days = nil
            return
        }
        let sorted = samples.sorted()
        let mid = n / 2
        days = n % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }
}

public enum FunnelStage: String, Codable, Hashable, Sendable, CaseIterable {
    case applied, responded, interview, offer
}

public struct FunnelStep: Codable, Hashable, Sendable {
    public let stage: FunnelStage
    public let reached: Int
    public let fromPrevious: InsightsRate?
    public let ofApplied: InsightsRate
    public let daysFromPrevious: MedianDays?
}

public struct BreakdownRow: Codable, Hashable, Sendable, Identifiable {
    public let key: String
    public let applications: Int
    public let responses: Int
    public let rate: InsightsRate
    public let medianDaysToResponse: MedianDays

    public var id: String { key }
}

public struct ActivityWeek: Codable, Hashable, Sendable, Identifiable {
    public let weekStart: CivilDate
    public let applied: Int
    public let followUps: Int
    public let interviews: Int

    public var id: CivilDate { weekStart }
}

public struct InsightsBreakdowns: Codable, Hashable, Sendable {
    public let source: [BreakdownRow]
    public let channel: [BreakdownRow]
    public let cv: [BreakdownRow]
    public let market: [BreakdownRow]

    public subscript(dimension: InsightsDimension) -> [BreakdownRow] {
        switch dimension {
        case .source: source
        case .channel: channel
        case .cv: cv
        case .market: market
        }
    }
}

public struct InsightsReport: Codable, Hashable, Sendable {
    public let range: InsightsRange
    public let applications: Int
    public let funnel: [FunnelStep]
    public let responseRate: InsightsRate
    public let interviewRate: InsightsRate
    public let offerRate: InsightsRate
    public let medianDaysToFirstResponse: MedianDays
    public let stillWaiting: Int
    public let noResponse: Int
    public let withdrawn: Int
    public let breakdowns: InsightsBreakdowns
    public let weekly: [ActivityWeek]
}

private func daysBetween(_ from: Date, _ to: Date) -> Double {
    max(0, Double(to.epochMilliseconds - from.epochMilliseconds) / Double(millisecondsPerDay))
}

/// Every application's journey, filtered but not limited to a range.
public func insightsJourneys(_ input: InsightsInput, calendar: InsightsCalendar, filters: InsightsFilters) -> [InsightsJourney] {
    let byApplication = Dictionary(grouping: input.events, by: \.applicationId)
    return input.applications
        .map {
            buildJourney($0, events: byApplication[$0.id] ?? [], mailCategories: input.mailCategories, calendar: calendar)
        }
        .filter { journey in filters.allSatisfy { journey.key($0.key) == $0.value } }
}

extension InsightsJourney {
    public func reached(_ stage: FunnelStage) -> Bool {
        switch stage {
        case .applied: appliedAt != nil
        case .responded: responded
        case .interview: interviewed
        case .offer: offered
        }
    }

    func reachedAt(_ stage: FunnelStage) -> Date? {
        switch stage {
        case .applied: appliedAt
        case .responded: respondedAt
        case .interview: interviewedAt
        case .offer: offeredAt
        }
    }
}

private func responseDays(_ journeys: [InsightsJourney]) -> [Double] {
    journeys.compactMap { journey in
        guard let applied = journey.appliedAt, let responded = journey.respondedAt else { return nil }
        return daysBetween(applied, responded)
    }
}

private func breakdown(_ cohort: [InsightsJourney], _ dimension: InsightsDimension) -> [BreakdownRow] {
    var order: [String] = []
    var groups: [String: [InsightsJourney]] = [:]
    for journey in cohort {
        let key = journey.key(dimension)
        if groups[key] == nil { order.append(key) }
        groups[key, default: []].append(journey)
    }
    let rows = order.map { key -> BreakdownRow in
        let journeys = groups[key] ?? []
        let responses = journeys.filter(\.responded).count
        return BreakdownRow(
            key: key,
            applications: journeys.count,
            responses: responses,
            rate: InsightsRate(count: responses, of: journeys.count),
            medianDaysToResponse: MedianDays(responseDays(journeys.filter(\.responded)))
        )
    }
    return rows.sorted { a, b in
        if (a.rate.value == nil) != (b.rate.value == nil) { return a.rate.value != nil }
        let (rateA, rateB) = (a.rate.value ?? 0, b.rate.value ?? 0)
        if rateA != rateB { return rateA > rateB }
        if a.applications != b.applications { return a.applications > b.applications }
        return a.key < b.key
    }
}

/// The weeks of the activity chart, oldest first.
public func activityWeeks(today: CivilDate, weekStart: Int) -> [CivilDate] {
    let current = CivilDates.startOfWeek(today, weekStart: weekStart)
    return (0..<Insights.activityWeeks).map { CivilDates.addDays(current, ($0 - Insights.activityWeeks + 1) * 7) }
}

public func computeInsights(_ input: InsightsInput, options: InsightsOptions) -> InsightsReport {
    let calendar = InsightsCalendar(timeZoneIdentifier: options.timeZone)
    let journeys = insightsJourneys(input, calendar: calendar, filters: options.filters)
    let cohort = journeys.filter { options.range.contains($0.appliedDate) }
    let n = cohort.count

    let stages = FunnelStage.allCases
    let funnel = stages.enumerated().map { index, stage -> FunnelStep in
        let reached = cohort.filter { $0.reached(stage) }
        guard index > 0 else {
            return FunnelStep(
                stage: stage, reached: reached.count, fromPrevious: nil,
                ofApplied: InsightsRate(count: reached.count, of: n), daysFromPrevious: nil
            )
        }
        let previous = stages[index - 1]
        let samples = reached.compactMap { journey -> Double? in
            guard let start = journey.reachedAt(previous), let end = journey.reachedAt(stage) else { return nil }
            return daysBetween(start, end)
        }
        return FunnelStep(
            stage: stage,
            reached: reached.count,
            fromPrevious: InsightsRate(count: reached.count, of: cohort.filter { $0.reached(previous) }.count),
            ofApplied: InsightsRate(count: reached.count, of: n),
            daysFromPrevious: MedianDays(samples)
        )
    }

    let responded = cohort.filter(\.responded)
    let unanswered = cohort.filter { !$0.responded }

    let today = calendar.civilDate(options.now)
    let weeks = activityWeeks(today: today, weekStart: options.weekStart)
    let firstWeek = CivilDates.dayNumber(weeks.first ?? today)
    var applied = Array(repeating: 0, count: weeks.count)
    var followUps = applied
    var interviews = applied
    func bump(_ counts: inout [Int], _ date: CivilDate) {
        let offset = CivilDates.dayNumber(date) - firstWeek
        guard offset >= 0, date <= today else { return }
        let index = offset / 7
        if index < counts.count { counts[index] += 1 }
    }
    var included = Set<String>()
    for journey in journeys {
        included.insert(journey.id)
        if let date = journey.appliedDate { bump(&applied, date) }
        for at in journey.followUps { bump(&followUps, calendar.civilDate(at)) }
    }
    for interview in input.interviews
    where included.contains(interview.applicationId) && interview.startsAt.epochMilliseconds <= options.now.epochMilliseconds {
        bump(&interviews, calendar.civilDate(interview.startsAt))
    }

    return InsightsReport(
        range: options.range,
        applications: n,
        funnel: funnel,
        responseRate: InsightsRate(count: responded.count, of: n),
        interviewRate: InsightsRate(count: cohort.filter(\.interviewed).count, of: n),
        offerRate: InsightsRate(count: cohort.filter(\.offered).count, of: n),
        medianDaysToFirstResponse: MedianDays(responseDays(responded)),
        stillWaiting: unanswered.filter { $0.status.isActive }.count,
        noResponse: unanswered.filter { $0.status == .ghosted }.count,
        withdrawn: unanswered.filter { $0.status == .withdrawn }.count,
        breakdowns: InsightsBreakdowns(
            source: breakdown(cohort, .source),
            channel: breakdown(cohort, .channel),
            cv: breakdown(cohort, .cv),
            market: breakdown(cohort, .market)
        ),
        weekly: weeks.enumerated().map { index, weekStart in
            ActivityWeek(
                weekStart: weekStart, applied: applied[index], followUps: followUps[index],
                interviews: interviews[index]
            )
        }
    )
}

// MARK: - Drill-downs

public enum DrillDownStage: String, Codable, Hashable, Sendable, CaseIterable {
    case applied, responded, interview, offer, waiting
    case noResponse = "no_response"
    case withdrawn
}

public enum DrillDownActivity: String, Codable, Hashable, Sendable, CaseIterable {
    case applied
    case followUp = "follow_up"
    case interview
}

/// The applications behind one Insights number (`bruteforcehr://tracker?view=table&…`).
public struct InsightsDrillDown: Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case stage(DrillDownStage)
        case activity(DrillDownActivity)
    }

    public var kind: Kind
    public var from: CivilDate?
    public var to: CivilDate?
    public var filters: InsightsFilters

    public init(_ kind: Kind, from: CivilDate? = nil, to: CivilDate? = nil, filters: InsightsFilters = [:]) {
        self.kind = kind
        self.from = from
        self.to = to
        self.filters = filters
    }

    /// Reads a drill-down from Tracker query items; nil when they hold none.
    public init?(parameters: [String: String]) {
        var filters: InsightsFilters = [:]
        for dimension in InsightsDimension.allCases {
            if let value = parameters[dimension.rawValue], !value.isEmpty { filters[dimension] = value }
        }
        let kind: Kind
        if let stage = parameters["stage"].flatMap(DrillDownStage.init(rawValue:)) {
            kind = .stage(stage)
        } else if let activity = parameters["activity"].flatMap(DrillDownActivity.init(rawValue:)) {
            kind = .activity(activity)
        } else {
            return nil
        }
        self.init(
            kind,
            from: parameters["from"].flatMap { CivilDates.isValid($0) ? $0 : nil },
            to: parameters["to"].flatMap { CivilDates.isValid($0) ? $0 : nil },
            filters: filters
        )
    }

    /// Query items in a stable order (pair with `view=table`).
    public var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        switch kind {
        case .stage(let stage): items.append(URLQueryItem(name: "stage", value: stage.rawValue))
        case .activity(let activity): items.append(URLQueryItem(name: "activity", value: activity.rawValue))
        }
        if let from { items.append(URLQueryItem(name: "from", value: from)) }
        if let to { items.append(URLQueryItem(name: "to", value: to)) }
        for dimension in InsightsDimension.allCases {
            if let value = filters[dimension] { items.append(URLQueryItem(name: dimension.rawValue, value: value)) }
        }
        return items
    }

    /// `bruteforcehr://tracker?view=table&…` (iOS shows the filtered Pipeline).
    public var url: URL {
        var components = URLComponents()
        components.scheme = "bruteforcehr"
        components.host = "tracker"
        components.queryItems = [URLQueryItem(name: "view", value: "table")] + queryItems
        return components.url!
    }
}

/// Ids of the applications behind `drill`, in input order.
public func selectDrillDownIds(_ input: InsightsInput, drill: InsightsDrillDown, now: Date, timeZone: String) -> [String] {
    let calendar = InsightsCalendar(timeZoneIdentifier: timeZone)
    let journeys = insightsJourneys(input, calendar: calendar, filters: drill.filters)
    let range = InsightsRange(from: drill.from, to: drill.to ?? calendar.civilDate(now))
    switch drill.kind {
    case .stage(let stage):
        return journeys.filter { range.contains($0.appliedDate) }.filter { journey in
            switch stage {
            case .applied: journey.reached(.applied)
            case .responded: journey.reached(.responded)
            case .interview: journey.reached(.interview)
            case .offer: journey.reached(.offer)
            case .waiting: !journey.responded && journey.status.isActive
            case .noResponse: !journey.responded && journey.status == .ghosted
            case .withdrawn: !journey.responded && journey.status == .withdrawn
            }
        }.map(\.id)
    case .activity(let activity):
        let interviewed = Set(input.interviews.compactMap { interview -> String? in
            interview.startsAt.epochMilliseconds <= now.epochMilliseconds
                && range.contains(calendar.civilDate(interview.startsAt)) ? interview.applicationId : nil
        })
        return journeys.filter { journey in
            switch activity {
            case .applied: range.contains(journey.appliedDate)
            case .followUp: journey.followUps.contains { range.contains(calendar.civilDate($0)) }
            case .interview: interviewed.contains(journey.id)
            }
        }.map(\.id)
    }
}
