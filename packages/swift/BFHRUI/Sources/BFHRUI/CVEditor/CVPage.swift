import BFHRCore
import Foundation

// The Preview segment's page model: the CV's JSON Resume content as an ATS-safe single-column
// document (one text flow, real text, no tables or columns), split into blocks that never break
// across pages, then packed onto A4 / Letter pages. The view renders the blocks natively; PDF
// export (M2, cv-render) will follow the same order and wording.

/// One unbreakable block of the page.
public enum CVPageBlock: Hashable, Sendable {
    /// Name, headline and the contact line.
    case header(name: String, headline: String?, contact: [String])
    /// A section heading ("EXPERIENCE"); kept with the block after it.
    case heading(String)
    case paragraph(String)
    /// "Frontend Engineer — Pazarbox", dates and location, with the item's first bullet.
    case entry(title: String, subtitle: String?, dates: String?, location: String?, summary: String?, firstBullet: String?)
    case bullet(String)
    /// "Frontend: React, TypeScript, …".
    case labeledLine(label: String?, text: String)

    /// Headings stay with the next block (no heading alone at a page's foot).
    public var keepsWithNext: Bool {
        if case .heading = self { return true }
        return false
    }
}

/// Paper geometry in points (1/72 in).
public struct CVPaper: Hashable, Sendable {
    public var size: CvPaperSize
    public var density: CvDensity

    public init(size: CvPaperSize, density: CvDensity) {
        self.size = size
        self.density = density
    }

    public var width: Double { size == .a4 ? 595 : 612 }
    public var height: Double { size == .a4 ? 842 : 792 }
    public var margin: Double {
        switch density {
        case .compact: 40
        case .comfortable: 50
        case .spacious: 60
        }
    }

    public var contentWidth: Double { width - 2 * margin }
    public var contentHeight: Double { height - 2 * margin }
}

/// Page breaks for blocks of known height: greedy, a block that doesn't fit starts a new page,
/// a heading moves with the block after it, and a block taller than a page gets a page of its
/// own. Returns the block indices of each page (at least one page, possibly empty).
public enum CVPagination {
    public static func pages(heights: [Double], keepsWithNext: [Bool], pageHeight: Double, spacing: Double) -> [[Int]] {
        var pages: [[Int]] = [[]]
        var used = 0.0
        var index = 0
        while index < heights.count {
            // A heading travels with the block it introduces.
            var group = [index]
            while keepsWithNext.indices.contains(group.last!), keepsWithNext[group.last!], group.last! + 1 < heights.count {
                group.append(group.last! + 1)
            }
            let groupHeight = group.map { heights[$0] }.reduce(0, +) + spacing * Double(group.count - 1)
            let needed = (pages[pages.count - 1].isEmpty ? 0 : spacing) + groupHeight
            if used + needed > pageHeight, !pages[pages.count - 1].isEmpty {
                pages.append([])
                used = 0
            }
            used += (pages[pages.count - 1].isEmpty ? 0 : spacing) + groupHeight
            pages[pages.count - 1] += group
            index = group.last! + 1
        }
        return pages
    }
}

/// Words the page prints in the CV's language (not the UI's): a German CV edited in an English
/// UI still says "Berufserfahrung" and "heute" (cv-editor.md copy notes).
enum CVPageVocabulary {
    static func heading(_ kind: CVSectionKind, language: String) -> String {
        let lang = language.prefix(2)
        func pick(_ en: String, _ de: String, _ tr: String) -> String { lang == "de" ? de : lang == "tr" ? tr : en }
        return switch kind {
        case .header: ""
        case .summary: pick("Profile", "Profil", "Profil")
        case .work: pick("Experience", "Berufserfahrung", "Deneyim")
        case .education: pick("Education", "Ausbildung", "Eğitim")
        case .skills: pick("Skills", "Kenntnisse", "Yetkinlikler")
        case .languages: pick("Languages", "Sprachen", "Diller")
        case .projects: pick("Projects", "Projekte", "Projeler")
        case .certificates: pick("Certificates", "Zertifikate", "Sertifikalar")
        case .volunteer: pick("Volunteering", "Ehrenamt", "Gönüllü çalışmalar")
        case .awards: pick("Awards", "Auszeichnungen", "Ödüller")
        case .publications: pick("Publications", "Veröffentlichungen", "Yayınlar")
        case .interests: pick("Interests", "Interessen", "İlgi alanları")
        case .references: pick("References", "Referenzen", "Referanslar")
        case .custom(_, let title): title
        }
    }

    static func present(language: String) -> String {
        switch language.prefix(2) {
        case "de": "heute"
        case "tr": "Halen"
        default: "Present"
        }
    }

    /// "Mar 2022" / "März 2022" / "Mar 2022" in the CV's language; the year alone for `yyyy`.
    static func month(_ iso: String, language: String) -> String {
        guard let month = CVMonth(iso: iso) else { return iso }
        guard month.month != nil else { return String(month.year) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard let date = month.date(calendar: calendar) else { return iso }
        var style = Date.FormatStyle(date: .omitted, time: .omitted, locale: Locale(identifier: language), calendar: calendar, timeZone: calendar.timeZone)
        style = style.month(.abbreviated).year()
        return date.formatted(style)
    }

    static func range(start: String?, end: String?, language: String) -> String? {
        switch (start, end) {
        case let (start?, end?): "\(month(start, language: language)) – \(month(end, language: language))"
        case let (start?, nil): "\(month(start, language: language)) – \(present(language: language))"
        case let (nil, end?): month(end, language: language)
        case (nil, nil): nil
        }
    }
}

extension CvContent {
    /// The page blocks, in `meta.sectionOrder` order (Header and Summary first). Sections not in
    /// the order and empty sections don't print.
    func pageBlocks(language: String) -> [CVPageBlock] {
        var blocks: [CVPageBlock] = []
        let b = basics
        let location = [b?.location?.city, b?.location?.region, b?.location?.countryCode].compactMap { $0?.nonBlankValue }.joined(separator: ", ")
        let contact = ([location, b?.email, b?.phone, b?.url].compactMap { $0?.nonBlankValue }
            + (b?.profiles ?? []).compactMap { $0.url?.nonBlankValue.map(Self.displayURL) })
        if let name = b?.name?.nonBlankValue {
            blocks.append(.header(name: name, headline: b?.label?.nonBlankValue, contact: contact))
        } else if !contact.isEmpty || b?.label?.nonBlankValue != nil {
            blocks.append(.header(name: "", headline: b?.label?.nonBlankValue, contact: contact))
        }
        if let summary = b?.summary?.nonBlankValue {
            blocks += [.heading(CVPageVocabulary.heading(.summary, language: language)), .paragraph(summary)]
        }
        for section in editorSections where !section.isPinned && !section.isEmpty {
            blocks.append(.heading(CVPageVocabulary.heading(section.kind, language: language)))
            blocks += sectionBlocks(section.kind, language: language)
        }
        return blocks
    }

    private func sectionBlocks(_ kind: CVSectionKind, language: String) -> [CVPageBlock] {
        func dates(_ start: String?, _ end: String?) -> String? {
            CVPageVocabulary.range(start: start?.nonBlankValue, end: end?.nonBlankValue, language: language)
        }
        func entry(_ title: String?, _ subtitle: String?, _ dates: String?, _ location: String?, _ summary: String?, _ bullets: [String]?) -> [CVPageBlock] {
            let bullets = (bullets ?? []).compactMap(\.nonBlankValue)
            return [.entry(title: title?.nonBlankValue ?? "", subtitle: subtitle?.nonBlankValue, dates: dates, location: location?.nonBlankValue,
                           summary: summary?.nonBlankValue, firstBullet: bullets.first)]
                + bullets.dropFirst().map(CVPageBlock.bullet)
        }
        switch kind {
        case .header, .summary:
            return []
        case .work:
            return (work ?? []).flatMap { entry($0.position, $0.name, dates($0.startDate, $0.endDate), $0.location, $0.summary, $0.highlights) }
        case .education:
            return (education ?? []).flatMap { e in
                let title = [e.studyType, e.area].compactMap { $0?.nonBlankValue }.joined(separator: ", ")
                return entry(title, e.institution, dates(e.startDate, e.endDate), nil, e.score, e.courses)
            }
        case .skills:
            return (skills ?? []).map { .labeledLine(label: $0.name?.nonBlankValue, text: ($0.keywords ?? []).joined(separator: ", ")) }
        case .languages:
            let text = (languages ?? []).compactMap { l -> String? in
                guard let name = l.language?.nonBlankValue else { return nil }
                return l.fluency?.nonBlankValue.map { "\(name) (\($0))" } ?? name
            }.joined(separator: " · ")
            return [.paragraph(text)]
        case .projects:
            return (projects ?? []).flatMap { entry($0.name, $0.entity, dates($0.startDate, $0.endDate), nil, $0.description, $0.highlights) }
        case .certificates:
            return (certificates ?? []).flatMap { entry($0.name, $0.issuer, $0.date.map { CVPageVocabulary.month($0, language: language) }, nil, nil, nil) }
        case .volunteer:
            return (volunteer ?? []).flatMap { entry($0.position, $0.organization, dates($0.startDate, $0.endDate), nil, $0.summary, $0.highlights) }
        case .awards:
            return (awards ?? []).flatMap { entry($0.title, $0.awarder, $0.date.map { CVPageVocabulary.month($0, language: language) }, nil, $0.summary, nil) }
        case .publications:
            return (publications ?? []).flatMap { entry($0.name, $0.publisher, $0.releaseDate.map { CVPageVocabulary.month($0, language: language) }, nil, $0.summary, nil) }
        case .interests:
            return (interests ?? []).map { .labeledLine(label: $0.name?.nonBlankValue, text: ($0.keywords ?? []).joined(separator: ", ")) }
        case .references:
            return (references ?? []).flatMap { entry($0.name, nil, nil, nil, $0.reference, nil) }
        case .custom(let id, _):
            // Custom items (talks, events) with only a start date are one-off: no "– Present".
            return (meta.customSections.first { $0.id == id }?.items ?? []).flatMap { item in
                let when = item.endDate?.nonBlankValue == nil
                    ? item.startDate?.nonBlankValue.map { CVPageVocabulary.month($0, language: language) }
                    : dates(item.startDate, item.endDate)
                return entry(item.title, item.subtitle, when, nil, item.summary, item.highlights)
            }
        }
    }

    /// "github.com/deniz" from "https://github.com/deniz".
    static func displayURL(_ url: String) -> String {
        var value = url
        for prefix in ["https://", "http://", "www."] where value.hasPrefix(prefix) {
            value.removeFirst(prefix.count)
        }
        return value.hasSuffix("/") ? String(value.dropLast()) : value
    }
}
