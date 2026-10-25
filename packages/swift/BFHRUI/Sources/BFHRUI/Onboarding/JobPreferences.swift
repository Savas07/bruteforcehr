import BFHRCore
import Foundation

// What matching filters on (`Profile.targetRoles`, `seniority`, `locations`, `remotePreferences`,
// `salaryFloor`, `workAuthorization`, `languages`), as the Preferences editor edits it. Onboarding
// step 2 and Settings › Job preferences share it, and the desktop writes the same values
// (onboarding-signin.md "Decision — iOS", agreed mapping):
//
// - Seniority is one value (the schema's), chips are single-select, a second tap clears it.
// - "Remote worldwide" is no location: it adds `remote` to `remotePreferences`.
// - Work authorization: one answer per picked country, one "EU / EEA" answer for EU picks. Yes keeps
//   a stored non-sponsorship status (else `work_permit`), No = `needs_sponsorship`, Not sure = no
//   entry.
// - Salary floor: amount + currency + per month / per year; TRY defaults to per month.
// - Languages: CEFR levels (`native`, C2…A1).

/// A work-authorization answer ("Can you work in Germany without sponsorship?").
public enum AuthorizationAnswer: String, Hashable, Sendable, CaseIterable {
    case yes
    case no
    case notSure
}

/// A target market offered as a quick-add chip.
public struct PreferenceMarket: Hashable, Sendable, Identifiable {
    /// ISO country code; nil for Remote worldwide.
    public let countryCode: String?
    public var id: String { countryCode ?? "remote" }

    /// Türkiye, Germany, Netherlands, United Kingdom, United States, then Remote worldwide.
    public static let all: [PreferenceMarket] = ["TR", "DE", "NL", "GB", "US"].map { PreferenceMarket(countryCode: $0) }
        + [PreferenceMarket(countryCode: nil)]
}

public struct JobPreferencesDraft: Hashable, Sendable {
    /// Research: up to five roles.
    public static let maxRoles = 5
    public static let currencies = ["EUR", "TRY", "GBP", "USD"]
    /// EU/EEA + Switzerland (`EU_AUTHORIZATION_COUNTRIES` of @bfhr/core): one "EU / EEA" answer.
    public static let euCountries: Set<String> = [
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT",
        "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
    ]
    public static let euRegion = "EU"
    /// Quick-add languages.
    public static let quickLanguages = ["en", "tr", "de"]

    public var fullName: String
    public var roles: [String]
    public var seniority: Seniority?
    /// Accepted workplaces, most preferred first.
    public var workplaces: [RemoteType]
    public var locations: [TargetLocation]
    /// Remote worldwide: no location, `remote` accepted.
    public var remoteWorldwide: Bool
    public var openToRelocation: Bool
    public var salaryAmount: Double?
    public var salaryCurrency: String
    public var salaryPeriod: SalaryPeriod
    /// By region (a country code or `EU`); a missing region is "Not sure".
    public var authorization: [String: AuthorizationAnswer]
    public var languages: [SpokenLanguage]
    /// Stored statuses, so Yes keeps "citizen" / "permanent resident".
    var storedAuthorization: [String: WorkAuthorizationStatus]

    public init(
        fullName: String = "", roles: [String] = [], seniority: Seniority? = nil, workplaces: [RemoteType] = [],
        locations: [TargetLocation] = [], remoteWorldwide: Bool = false, openToRelocation: Bool = false,
        salaryAmount: Double? = nil, salaryCurrency: String = JobPreferencesDraft.defaultCurrency(),
        salaryPeriod: SalaryPeriod? = nil, authorization: [String: AuthorizationAnswer] = [:], languages: [SpokenLanguage] = []
    ) {
        self.fullName = fullName
        self.roles = roles
        self.seniority = seniority
        self.workplaces = workplaces
        self.locations = locations
        self.remoteWorldwide = remoteWorldwide
        self.openToRelocation = openToRelocation
        self.salaryAmount = salaryAmount
        self.salaryCurrency = salaryCurrency
        self.salaryPeriod = salaryPeriod ?? Self.defaultPeriod(for: salaryCurrency)
        self.authorization = authorization
        self.languages = languages
        storedAuthorization = [:]
    }

    /// The profile's current preferences.
    public init(profile: Profile, region: String? = Locale.current.region?.identifier) {
        let currency = profile.salaryFloor?.currency ?? Self.defaultCurrency(region: region)
        self.init(
            fullName: profile.fullName,
            roles: profile.targetRoles,
            seniority: profile.seniority,
            workplaces: profile.remotePreferences,
            locations: profile.locations,
            remoteWorldwide: profile.locations.isEmpty && profile.remotePreferences.contains(.remote),
            openToRelocation: profile.locations.contains { $0.relocation },
            salaryAmount: profile.salaryFloor?.amount,
            salaryCurrency: currency,
            salaryPeriod: profile.salaryFloor?.period ?? Self.defaultPeriod(for: currency),
            authorization: Dictionary(profile.workAuthorization.map {
                ($0.region, $0.status == .needsSponsorship ? AuthorizationAnswer.no : .yes)
            }, uniquingKeysWith: { first, _ in first }),
            languages: profile.languages
        )
        storedAuthorization = Dictionary(profile.workAuthorization.map { ($0.region, $0.status) }, uniquingKeysWith: { first, _ in first })
    }

    // MARK: Defaults

    /// TRY, GBP or USD in Türkiye, the UK and the US; EUR elsewhere.
    public static func defaultCurrency(region: String? = Locale.current.region?.identifier) -> String {
        switch region {
        case "TR": "TRY"
        case "GB": "GBP"
        case "US": "USD"
        default: "EUR"
        }
    }

    /// Turkish offers are quoted monthly; others yearly.
    public static func defaultPeriod(for currency: String) -> SalaryPeriod {
        currency == "TRY" ? .month : .year
    }

    // MARK: Roles

    public var canAddRole: Bool { roles.count < Self.maxRoles }

    /// Adds a trimmed role unless it's empty, already there (any case) or over the limit.
    @discardableResult
    public mutating func addRole(_ text: String) -> Bool {
        let role = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
        guard !role.isEmpty, canAddRole, !roles.contains(where: { $0.caseInsensitiveCompare(role) == .orderedSame }) else { return false }
        roles.append(role)
        return true
    }

    public mutating func removeRole(_ role: String) {
        roles.removeAll { $0 == role }
    }

    /// One tap selects, a second tap on the same level clears it.
    public mutating func toggleSeniority(_ level: Seniority) {
        seniority = seniority == level ? nil : level
    }

    public mutating func toggleWorkplace(_ type: RemoteType) {
        if let index = workplaces.firstIndex(of: type) {
            workplaces.remove(at: index)
            if type == .remote { remoteWorldwide = false }
        } else {
            workplaces.append(type)
        }
    }

    // MARK: Locations

    public func isPicked(_ market: PreferenceMarket) -> Bool {
        guard let code = market.countryCode else { return remoteWorldwide }
        return locations.contains { $0.countryCode == code && $0.city == nil }
    }

    /// `label` is the market's name in the app's language (stored as the display label).
    public mutating func toggle(_ market: PreferenceMarket, label: String) {
        guard let code = market.countryCode else {
            remoteWorldwide.toggle()
            if remoteWorldwide, !workplaces.contains(.remote) { workplaces.append(.remote) }
            return
        }
        if isPicked(market) {
            locations.removeAll { $0.countryCode == code && $0.city == nil }
        } else {
            locations.append(TargetLocation(label: label, city: nil, countryCode: code, relocation: openToRelocation))
        }
    }

    /// "+ Add location": a country typed by name becomes that country, anything else a city.
    @discardableResult
    public mutating func addLocation(_ text: String, locale: Locale = .current) -> Bool {
        let label = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(120))
        guard !label.isEmpty, locations.count < 30,
              !locations.contains(where: { $0.label.caseInsensitiveCompare(label) == .orderedSame }) else { return false }
        if let code = Self.countryCode(named: label, locale: locale) {
            guard !locations.contains(where: { $0.countryCode == code && $0.city == nil }) else { return false }
            locations.append(TargetLocation(label: label, city: nil, countryCode: code, relocation: openToRelocation))
        } else {
            locations.append(TargetLocation(label: label, city: label, countryCode: nil, relocation: openToRelocation))
        }
        return true
    }

    /// A place's name in `locale`: a country without a city is named from its code (the stored label
    /// is in the language it was picked in); cities and free text keep their label.
    public static func displayName(of location: TargetLocation, locale: Locale) -> String {
        guard location.city == nil, let code = location.countryCode, let name = locale.localizedString(forRegionCode: code) else {
            return location.label
        }
        return name
    }

    public mutating func removeLocation(_ location: TargetLocation) {
        locations.removeAll { $0 == location }
    }

    /// A country's ISO code from its name in `locale` or in English ("Deutschland", "Germany", "DE").
    static func countryCode(named name: String, locale: Locale) -> String? {
        let folded = name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: locale)
        let english = Locale(identifier: "en")
        for region in Locale.Region.isoRegions where region.identifier.count == 2 && region.identifier.allSatisfy(\.isLetter) {
            let code = region.identifier
            if code.caseInsensitiveCompare(name) == .orderedSame { return code }
            for candidate in [locale.localizedString(forRegionCode: code), english.localizedString(forRegionCode: code)].compactMap({ $0 }) {
                if candidate.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: locale) == folded { return code }
            }
        }
        return nil
    }

    // MARK: Work authorization

    /// The regions to ask about: each picked country outside the EU, plus `EU` once for EU picks.
    /// Empty when only Remote worldwide (or nothing) is picked.
    public var authorizationRegions: [String] {
        var regions: [String] = []
        for code in locations.compactMap(\.countryCode) {
            let region = Self.euCountries.contains(code) ? Self.euRegion : code
            if !regions.contains(region) { regions.append(region) }
        }
        return regions
    }

    public func answer(for region: String) -> AuthorizationAnswer {
        authorization[region] ?? .notSure
    }

    public mutating func setAnswer(_ answer: AuthorizationAnswer, for region: String) {
        authorization[region] = answer == .notSure ? nil : answer
    }

    // MARK: Languages

    public mutating func setLanguage(_ code: String, level: LanguageLevel) {
        if let index = languages.firstIndex(where: { $0.language == code }) {
            languages[index].level = level
        } else if languages.count < 20 {
            languages.append(SpokenLanguage(language: code, level: level))
        }
    }

    public mutating func removeLanguage(_ code: String) {
        languages.removeAll { $0.language == code }
    }

    // MARK: Salary

    public var salaryFloor: SalaryFloor? {
        guard let salaryAmount, salaryAmount > 0 else { return nil }
        return SalaryFloor(amount: salaryAmount, currency: salaryCurrency, period: salaryPeriod)
    }

    /// Picking a currency moves the period to that currency's default.
    public mutating func setCurrency(_ currency: String) {
        guard currency != salaryCurrency else { return }
        salaryCurrency = currency
        salaryPeriod = Self.defaultPeriod(for: currency)
    }

    // MARK: Writing

    /// Writes the preferences into `profile` (the other fields stay).
    public func apply(to profile: inout Profile) {
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { profile.fullName = String(name.prefix(200)) }
        profile.targetRoles = roles
        profile.seniority = seniority
        profile.locations = locations.map {
            TargetLocation(label: $0.label, city: $0.city, countryCode: $0.countryCode, relocation: openToRelocation)
        }
        var remote = workplaces
        if remoteWorldwide, !remote.contains(.remote) { remote.append(.remote) }
        profile.remotePreferences = Array(remote.prefix(3))
        profile.salaryFloor = salaryFloor
        // Answers for regions no longer picked are kept: they still describe the user. Stored
        // regions keep their order (an unchanged answer writes nothing), new ones follow.
        let storedOrder = profile.workAuthorization.map(\.region)
        let regions = storedOrder.filter { authorization[$0] != nil } + authorization.keys.filter { !storedOrder.contains($0) }.sorted()
        profile.workAuthorization = regions.compactMap { region in
            switch authorization[region] {
            case .yes:
                let stored = storedAuthorization[region]
                return WorkAuthorization(region: region, status: stored.flatMap { $0 == .needsSponsorship ? nil : $0 } ?? .workPermit)
            case .no: return WorkAuthorization(region: region, status: .needsSponsorship)
            case .notSure, nil: return nil
            }
        }
        profile.languages = languages
    }

    /// Whether nothing is set (the Settings rows say "Not set", Finish names no role).
    public var isEmpty: Bool {
        roles.isEmpty && seniority == nil && workplaces.isEmpty && locations.isEmpty && !remoteWorldwide
            && salaryFloor == nil && authorization.isEmpty && languages.isEmpty
    }
}

// MARK: - CV pre-fill

/// What a parsed CV suggests for the Preferences step ("From CV").
public struct CVPreferenceHints: Hashable, Sendable {
    public var name: String?
    /// Most recent first: the headline, then positions.
    public var roles: [String]
    public var countryCode: String?
    public var languages: [SpokenLanguage]
    /// Normalized (lower-case) skill names for `Profile.skills`.
    public var skills: [String]

    public init(name: String? = nil, roles: [String] = [], countryCode: String? = nil, languages: [SpokenLanguage] = [], skills: [String] = []) {
        self.name = name
        self.roles = roles
        self.countryCode = countryCode
        self.languages = languages
        self.skills = skills
    }

    public init(content: CvContent) {
        var roles: [String] = []
        for title in [content.basics?.label] + (content.work ?? []).map(\.position) {
            guard let title = title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty, title.count <= 120,
                  !roles.contains(where: { $0.caseInsensitiveCompare(title) == .orderedSame }) else { continue }
            roles.append(title)
        }
        var skills: [String] = []
        for skill in content.skills ?? [] {
            // A group's name ("Languages", "Frontend") isn't a skill when it lists keywords.
            let keywords = skill.keywords ?? []
            for value in keywords.isEmpty ? [skill.name].compactMap({ $0 }) : keywords {
                let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                guard !normalized.isEmpty, normalized.count <= 60, !skills.contains(normalized) else { continue }
                skills.append(normalized)
            }
        }
        var languages: [SpokenLanguage] = []
        for entry in content.languages ?? [] {
            guard let code = entry.language.flatMap(Self.languageCode), !languages.contains(where: { $0.language == code }) else { continue }
            languages.append(SpokenLanguage(language: code, level: Self.level(entry.fluency)))
        }
        let country = content.basics?.location?.countryCode?.uppercased()
        self.init(
            name: content.basics?.name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfBlank,
            roles: roles,
            countryCode: country.flatMap { $0.count == 2 ? $0 : nil },
            languages: Array(languages.prefix(20)),
            skills: Array(skills.prefix(200))
        )
    }

    /// "English", "Deutsch", "Türkçe", "en", "en-GB" → a language code.
    static func languageCode(_ name: String) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let folded = trimmed.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        if trimmed.range(of: #"^[a-zA-Z]{2,3}(-[a-zA-Z]{2})?$"#, options: .regularExpression) != nil {
            let base = String(trimmed.prefix { $0 != "-" }).lowercased()
            if Locale(identifier: "en").localizedString(forLanguageCode: base) != nil, base.count == 2 { return base }
        }
        for code in Locale.LanguageCode.isoLanguageCodes.map(\.identifier) where code.count == 2 {
            for display in ["en", "de", "tr", code] {
                if let label = Locale(identifier: display).localizedString(forLanguageCode: code),
                   label.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil) == folded {
                    return code
                }
            }
        }
        return nil
    }

    /// A CV's fluency text ("Native", "C1", "Fluent", "Muttersprache", "Ana dil") → a CEFR level.
    static func level(_ fluency: String?) -> LanguageLevel {
        let text = (fluency ?? "").folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        if let cefr = text.range(of: #"\b[abc][12]\b"#, options: .regularExpression) {
            return LanguageLevel(rawValue: text[cefr].uppercased()) ?? .b2
        }
        let table: [(LanguageLevel, [String])] = [
            (.native, ["native", "mother", "muttersprach", "ana dil", "anadil", "bilingual"]),
            (.c2, ["fluent", "proficien", "fliessend", "fließend", "verhandlungssicher", "akici"]),
            (.c1, ["advanced", "professional", "full working", "fortgeschritten", "ileri"]),
            (.b2, ["upper", "good", "gut", "intermediate", "orta"]),
            (.a2, ["elementary", "basic", "grund", "temel", "beginner", "anfanger", "baslangic"]),
        ]
        for (level, words) in table where words.contains(where: { text.contains($0) }) { return level }
        return .b2
    }
}
