import BFHRCore
import Foundation
import SwiftUI

// Editable copies of a CV item, the header and the summary for the edit sheets
// (cv-editor.md "Decision — iOS": page sheet, Cancel / title / Save). A draft lives only in its
// sheet; Save writes it into the CV's working copy through `CVEditorModel`.

/// A field an item edit sheet shows. Which fields a section uses is `CVSectionKind.itemFields`.
public enum CVItemField: Hashable, Sendable, CaseIterable {
    /// Role, field of study, skill group, language, project, certificate, award…
    case title
    /// Company, institution, issuer, organization, publisher…
    case subtitle
    /// Degree, skill level, fluency.
    case detail
    case location
    /// Start / end month with "I currently work here".
    case dateRange
    /// One date (certificate, award, publication).
    case date
    case summary
    /// Highlights (courses for education), one field per bullet.
    case bullets
    case keywords
    case url
}

extension CVSectionKind {
    /// The fields the item edit sheet shows for this section (none for Header and Summary,
    /// which have their own sheets).
    public var itemFields: [CVItemField] {
        switch self {
        case .header, .summary: []
        case .work: [.title, .subtitle, .location, .dateRange, .bullets, .summary, .url]
        case .education: [.title, .detail, .subtitle, .dateRange, .bullets, .url]
        case .skills: [.title, .detail, .keywords]
        case .languages: [.title, .detail]
        case .projects: [.title, .subtitle, .dateRange, .bullets, .summary, .keywords, .url]
        case .certificates: [.title, .subtitle, .date, .url]
        case .volunteer: [.title, .subtitle, .dateRange, .bullets, .summary, .url]
        case .awards: [.title, .subtitle, .date, .summary]
        case .publications: [.title, .subtitle, .date, .summary, .url]
        case .interests: [.title, .keywords]
        case .references: [.title, .summary]
        case .custom: [.title, .subtitle, .dateRange, .bullets, .summary, .url]
        }
    }

    /// Sections whose items have a list of bullets (and so the ✦ Improve action).
    public var hasBullets: Bool { itemFields.contains(.bullets) }
}

/// One bullet in an item edit sheet. The id keeps rows stable while the user reorders them.
public struct CVBullet: Identifiable, Hashable, Sendable {
    public var id: UUID
    public var text: String

    public init(id: UUID = UUID(), text: String) {
        self.id = id
        self.text = text
    }
}

/// An item as the edit sheet sees it. Dates are stored as JSON Resume does: `yyyy` or `yyyy-MM`.
public struct CVItemDraft: Hashable, Sendable {
    public var title = ""
    public var subtitle = ""
    public var detail = ""
    public var location = ""
    public var url = ""
    public var startDate: String?
    public var endDate: String?
    /// "I currently work here": saves without an end date.
    public var isCurrent = false
    public var date: String?
    public var summary = ""
    public var bullets: [CVBullet] = []
    public var keywords: [String] = []

    public init() {}

    /// Nothing typed yet: Save stays off for a new item.
    public var isBlank: Bool {
        [title, subtitle, detail, location, url, summary].allSatisfy { $0.trimmed.isEmpty }
            && bullets.allSatisfy { $0.text.trimmed.isEmpty } && keywords.allSatisfy { $0.trimmed.isEmpty }
            && startDate == nil && date == nil
    }

    /// The end month is before the start month (states.md: "End date is before start date").
    public var endsBeforeStart: Bool {
        guard !isCurrent, let start = startDate.flatMap(CVMonth.init(iso:)), let end = endDate.flatMap(CVMonth.init(iso:)) else { return false }
        return end < start
    }

    /// AI placeholders like "[X%]" still in the text: Save stays off until the user fills them.
    public var placeholders: [String] {
        ([title, subtitle, summary] + bullets.map(\.text)).flatMap(CVPlaceholders.find)
    }

    public var canSave: Bool { !isBlank && !endsBeforeStart && placeholders.isEmpty }
}

/// The Header sheet: `basics` without the summary.
public struct CVHeaderDraft: Hashable, Sendable {
    public var name = ""
    public var headline = ""
    public var email = ""
    public var phone = ""
    public var website = ""
    public var city = ""

    public init() {}
}

/// `[X%]`, `[number]`, `[team size]`: blanks an AI suggestion leaves for facts only the user
/// knows. A suggestion with blanks can't be used, and an item with blanks can't be saved, until
/// each is replaced with the real value.
public enum CVPlaceholders {
    private static let pattern = /\[[^\[\]\n]{1,40}\]/

    /// The placeholders in `text`, brackets included, in order.
    public static func find(in text: String) -> [String] {
        text.matches(of: pattern).map { String(text[$0.range]) }
    }

    /// Replaces the placeholders in order with `values` (trimmed); blank values leave the
    /// placeholder in place.
    public static func fill(_ text: String, with values: [String]) -> String {
        var result = ""
        var rest = text[...]
        var index = 0
        while let match = rest.firstMatch(of: pattern) {
            result += rest[rest.startIndex..<match.range.lowerBound]
            let value = index < values.count ? values[index].trimmed : ""
            result += value.isEmpty ? String(rest[match.range]) : value
            rest = rest[match.range.upperBound...]
            index += 1
        }
        return result + rest
    }
}

/// A CV month, from JSON Resume's `yyyy`, `yyyy-MM` or `yyyy-MM-dd`.
public struct CVMonth: Hashable, Comparable, Sendable {
    public var year: Int
    /// 1...12; nil for a year-only date.
    public var month: Int?

    public init(year: Int, month: Int?) {
        self.year = year
        self.month = month
    }

    public init?(iso: String) {
        let parts = iso.split(separator: "-")
        guard let first = parts.first, let year = Int(first), (1900...2200).contains(year) else { return nil }
        self.year = year
        if parts.count > 1 {
            guard let month = Int(parts[1]), (1...12).contains(month) else { return nil }
            self.month = month
        } else {
            month = nil
        }
    }

    public var iso: String {
        month.map { String(format: "%04d-%02d", year, $0) } ?? String(format: "%04d", year)
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        (lhs.year, lhs.month ?? 1) < (rhs.year, rhs.month ?? 1)
    }

    /// Whole months from `self` to `end`, counting both months (Mar–Mar = 1). Nil without months.
    public func months(through end: CVMonth) -> Int? {
        guard let start = month, let last = end.month else { return nil }
        let count = (end.year - year) * 12 + (last - start) + 1
        return count > 0 ? count : nil
    }

    public func date(calendar: Calendar) -> Date? {
        calendar.date(from: DateComponents(year: year, month: month ?? 1, day: 1))
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }

    /// nil when blank, else trimmed.
    var nonBlankValue: String? {
        let value = trimmed
        return value.isEmpty ? nil : value
    }
}

// MARK: - Reading and writing items

extension CvContent {
    /// The edit-sheet copy of item `index` of a list section; nil when there's no such item.
    func itemDraft(_ kind: CVSectionKind, at index: Int) -> CVItemDraft? {
        var draft = CVItemDraft()
        func bullets(_ values: [String]?) -> [CVBullet] { (values ?? []).map { CVBullet(text: $0) } }
        func dates(_ start: String?, _ end: String?) {
            draft.startDate = start?.nonBlankValue
            draft.endDate = end?.nonBlankValue
            draft.isCurrent = draft.startDate != nil && draft.endDate == nil
        }
        func value<T>(_ list: [T]?) -> T? {
            guard let list, list.indices.contains(index) else { return nil }
            return list[index]
        }
        switch kind {
        case .header, .summary:
            return nil
        case .work:
            guard let w = value(work) else { return nil }
            draft.title = w.position ?? ""
            draft.subtitle = w.name ?? ""
            draft.location = w.location ?? ""
            draft.url = w.url ?? ""
            draft.summary = w.summary ?? ""
            draft.bullets = bullets(w.highlights)
            dates(w.startDate, w.endDate)
        case .education:
            guard let e = value(education) else { return nil }
            draft.title = e.area ?? ""
            draft.detail = e.studyType ?? ""
            draft.subtitle = e.institution ?? ""
            draft.url = e.url ?? ""
            draft.bullets = bullets(e.courses)
            dates(e.startDate, e.endDate)
        case .skills:
            guard let s = value(skills) else { return nil }
            draft.title = s.name ?? ""
            draft.detail = s.level ?? ""
            draft.keywords = s.keywords ?? []
        case .languages:
            guard let l = value(languages) else { return nil }
            draft.title = l.language ?? ""
            draft.detail = l.fluency ?? ""
        case .projects:
            guard let p = value(projects) else { return nil }
            draft.title = p.name ?? ""
            draft.subtitle = p.entity ?? ""
            draft.summary = p.description ?? ""
            draft.url = p.url ?? ""
            draft.bullets = bullets(p.highlights)
            draft.keywords = p.keywords ?? []
            dates(p.startDate, p.endDate)
        case .certificates:
            guard let c = value(certificates) else { return nil }
            draft.title = c.name ?? ""
            draft.subtitle = c.issuer ?? ""
            draft.date = c.date?.nonBlankValue
            draft.url = c.url ?? ""
        case .volunteer:
            guard let v = value(volunteer) else { return nil }
            draft.title = v.position ?? ""
            draft.subtitle = v.organization ?? ""
            draft.url = v.url ?? ""
            draft.summary = v.summary ?? ""
            draft.bullets = bullets(v.highlights)
            dates(v.startDate, v.endDate)
        case .awards:
            guard let a = value(awards) else { return nil }
            draft.title = a.title ?? ""
            draft.subtitle = a.awarder ?? ""
            draft.date = a.date?.nonBlankValue
            draft.summary = a.summary ?? ""
        case .publications:
            guard let p = value(publications) else { return nil }
            draft.title = p.name ?? ""
            draft.subtitle = p.publisher ?? ""
            draft.date = p.releaseDate?.nonBlankValue
            draft.summary = p.summary ?? ""
            draft.url = p.url ?? ""
        case .interests:
            guard let n = value(interests) else { return nil }
            draft.title = n.name ?? ""
            draft.keywords = n.keywords ?? []
        case .references:
            guard let r = value(references) else { return nil }
            draft.title = r.name ?? ""
            draft.summary = r.reference ?? ""
        case .custom(let id, _):
            guard let c = value(meta.customSections.first { $0.id == id }?.items) else { return nil }
            draft.title = c.title
            draft.subtitle = c.subtitle ?? ""
            draft.url = c.url ?? ""
            draft.summary = c.summary ?? ""
            draft.bullets = bullets(c.highlights)
            dates(c.startDate, c.endDate)
        }
        return draft
    }

    /// Writes `draft` over item `index` of a list section (fields the sheet doesn't show are
    /// kept), or appends it when `index` is nil. Returns whether the content changed.
    mutating func setItem(_ kind: CVSectionKind, at index: Int?, to draft: CVItemDraft) -> Bool {
        let before = self
        let highlights = draft.bullets.compactMap { $0.text.nonBlankValue }
        let bulletList: [String]? = highlights.isEmpty ? nil : highlights
        let keywords = draft.keywords.compactMap(\.nonBlankValue)
        let keywordList: [String]? = keywords.isEmpty ? nil : keywords
        let start = draft.startDate
        let end = draft.isCurrent ? nil : draft.endDate
        func put<T>(_ list: inout [T]?, _ empty: T, _ update: (inout T) -> Void) {
            var values = list ?? []
            if let index {
                guard values.indices.contains(index) else { return }
                update(&values[index])
            } else {
                var value = empty
                update(&value)
                values.append(value)
            }
            list = values
        }
        switch kind {
        case .header, .summary:
            return false
        case .work:
            put(&work, ResumeWork()) {
                $0.position = draft.title.nonBlankValue
                $0.name = draft.subtitle.nonBlankValue
                $0.location = draft.location.nonBlankValue
                $0.url = draft.url.nonBlankValue
                $0.summary = draft.summary.nonBlankValue
                $0.highlights = bulletList
                $0.startDate = start
                $0.endDate = end
            }
        case .education:
            put(&education, ResumeEducation()) {
                $0.area = draft.title.nonBlankValue
                $0.studyType = draft.detail.nonBlankValue
                $0.institution = draft.subtitle.nonBlankValue
                $0.url = draft.url.nonBlankValue
                $0.courses = bulletList
                $0.startDate = start
                $0.endDate = end
            }
        case .skills:
            put(&skills, ResumeSkill()) {
                $0.name = draft.title.nonBlankValue
                $0.level = draft.detail.nonBlankValue
                $0.keywords = keywordList
            }
        case .languages:
            put(&languages, ResumeLanguage()) {
                $0.language = draft.title.nonBlankValue
                $0.fluency = draft.detail.nonBlankValue
            }
        case .projects:
            put(&projects, ResumeProject()) {
                $0.name = draft.title.nonBlankValue
                $0.entity = draft.subtitle.nonBlankValue
                $0.description = draft.summary.nonBlankValue
                $0.url = draft.url.nonBlankValue
                $0.highlights = bulletList
                $0.keywords = keywordList
                $0.startDate = start
                $0.endDate = end
            }
        case .certificates:
            put(&certificates, ResumeCertificate()) {
                $0.name = draft.title.nonBlankValue
                $0.issuer = draft.subtitle.nonBlankValue
                $0.date = draft.date
                $0.url = draft.url.nonBlankValue
            }
        case .volunteer:
            put(&volunteer, ResumeVolunteer()) {
                $0.position = draft.title.nonBlankValue
                $0.organization = draft.subtitle.nonBlankValue
                $0.url = draft.url.nonBlankValue
                $0.summary = draft.summary.nonBlankValue
                $0.highlights = bulletList
                $0.startDate = start
                $0.endDate = end
            }
        case .awards:
            put(&awards, ResumeAward()) {
                $0.title = draft.title.nonBlankValue
                $0.awarder = draft.subtitle.nonBlankValue
                $0.date = draft.date
                $0.summary = draft.summary.nonBlankValue
            }
        case .publications:
            put(&publications, ResumePublication()) {
                $0.name = draft.title.nonBlankValue
                $0.publisher = draft.subtitle.nonBlankValue
                $0.releaseDate = draft.date
                $0.summary = draft.summary.nonBlankValue
                $0.url = draft.url.nonBlankValue
            }
        case .interests:
            put(&interests, ResumeInterest()) {
                $0.name = draft.title.nonBlankValue
                $0.keywords = keywordList
            }
        case .references:
            put(&references, ResumeReference()) {
                $0.name = draft.title.nonBlankValue
                $0.reference = draft.summary.nonBlankValue
            }
        case .custom(let id, _):
            guard let s = meta.customSections.firstIndex(where: { $0.id == id }) else { return false }
            var items: [CvCustomSectionItem]? = meta.customSections[s].items
            put(&items, CvCustomSectionItem(title: "")) {
                $0.title = draft.title.trimmed
                $0.subtitle = draft.subtitle.nonBlankValue
                $0.url = draft.url.nonBlankValue
                $0.summary = draft.summary.nonBlankValue
                $0.highlights = bulletList
                $0.startDate = start
                $0.endDate = end
            }
            meta.customSections[s].items = items ?? []
        }
        return self != before
    }

    /// Moves items of a list section (`List.onMove` indices). Returns whether anything moved.
    mutating func moveItems(_ kind: CVSectionKind, from source: IndexSet, to destination: Int) -> Bool {
        func move<T>(_ list: inout [T]?) {
            guard var values = list else { return }
            values.move(fromOffsets: source, toOffset: destination)
            list = values
        }
        let before = self
        switch kind {
        case .header, .summary: return false
        case .work: move(&work)
        case .education: move(&education)
        case .skills: move(&skills)
        case .languages: move(&languages)
        case .projects: move(&projects)
        case .certificates: move(&certificates)
        case .volunteer: move(&volunteer)
        case .awards: move(&awards)
        case .publications: move(&publications)
        case .interests: move(&interests)
        case .references: move(&references)
        case .custom(let id, _):
            guard let s = meta.customSections.firstIndex(where: { $0.id == id }) else { return false }
            meta.customSections[s].items.move(fromOffsets: source, toOffset: destination)
        }
        return self != before
    }

    var headerDraft: CVHeaderDraft {
        var draft = CVHeaderDraft()
        draft.name = basics?.name ?? ""
        draft.headline = basics?.label ?? ""
        draft.email = basics?.email ?? ""
        draft.phone = basics?.phone ?? ""
        draft.website = basics?.url ?? ""
        draft.city = basics?.location?.city ?? ""
        return draft
    }

    mutating func setHeader(_ draft: CVHeaderDraft) -> Bool {
        let before = self
        var value = basics ?? ResumeBasics()
        value.name = draft.name.nonBlankValue
        value.label = draft.headline.nonBlankValue
        value.email = draft.email.nonBlankValue
        value.phone = draft.phone.nonBlankValue
        value.url = draft.website.nonBlankValue
        if let city = draft.city.nonBlankValue {
            var location = value.location ?? ResumeLocation()
            location.city = city
            value.location = location
        } else if value.location != nil {
            value.location?.city = nil
            if value.location == ResumeLocation() { value.location = nil }
        }
        basics = value
        return self != before
    }

    mutating func setSummary(_ text: String) -> Bool {
        let before = self
        var value = basics ?? ResumeBasics()
        value.summary = text.nonBlankValue
        basics = value
        return self != before
    }

    /// Shows a hidden section: adds its key to the end of `meta.sectionOrder`.
    mutating func showSection(_ kind: CVSectionKind) -> Bool {
        guard !kind.isPinned, !meta.sectionOrder.contains(kind.orderKey) else { return false }
        meta.sectionOrder.append(kind.orderKey)
        return true
    }
}
