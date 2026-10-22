import BFHRCore
import Foundation

// Section derivation and item edits on a CV's JSON Resume content, for `CVEditorModel`.

/// An item taken out of a section, kept so Undo can put it back.
enum CVRemovedItem: Hashable, Sendable {
    case work(ResumeWork)
    case education(ResumeEducation)
    case skill(ResumeSkill)
    case language(ResumeLanguage)
    case project(ResumeProject)
    case certificate(ResumeCertificate)
    case volunteer(ResumeVolunteer)
    case award(ResumeAward)
    case publication(ResumePublication)
    case interest(ResumeInterest)
    case reference(ResumeReference)
    case custom(sectionId: String, CvCustomSectionItem)
}

extension CvContent {
    // MARK: Sections

    /// The Edit segment's sections: Header and Summary (pinned), then the list sections in
    /// `meta.sectionOrder` order. Sections not in the order are hidden by cv-render and left out.
    var editorSections: [CVSection] {
        var sections = [section(.header), section(.summary)]
        var seen: Set<String> = []
        for key in meta.sectionOrder where seen.insert(key).inserted {
            if let kind = CVSectionKind(orderKey: key, customSections: meta.customSections) {
                sections.append(section(kind))
            }
        }
        return sections
    }

    /// Standard and custom sections that aren't in `meta.sectionOrder` (candidates for
    /// "+ Add section"; some may hold content, e.g. an imported Certificates list).
    var hiddenSections: [CVSection] {
        let listed = Set(meta.sectionOrder)
        let standard = CVSectionKind.standardListSections.filter { !listed.contains($0.orderKey) }
        let custom = meta.customSections
            .map { CVSectionKind.custom(id: $0.id, title: $0.title) }
            .filter { !listed.contains($0.orderKey) }
        return (standard + custom).map(section)
    }

    func section(_ kind: CVSectionKind) -> CVSection {
        let items = items(for: kind)
        let summary: CVSectionSummary?
        switch kind {
        case .header:
            let name = basics?.name.nonBlank
            let headline = basics?.label.nonBlank
            let hasContact = [basics?.email, basics?.phone, basics?.url].contains { $0.nonBlank != nil }
                || !(basics?.profiles ?? []).isEmpty || basics?.location != nil
            summary = name != nil || headline != nil || hasContact ? .header(name: name, headline: headline) : nil
        case .summary:
            summary = basics?.summary.nonBlank.map(CVSectionSummary.text)
        case .skills, .languages, .interests:
            let names = items.compactMap { $0.title }
            summary = items.isEmpty ? nil : .names(names)
        default:
            summary = items.first.map { .item(title: $0.title, subtitle: $0.subtitle, moreCount: items.count - 1) }
        }
        return CVSection(kind: kind, summary: summary, items: items)
    }

    func items(for kind: CVSectionKind) -> [CVSectionItem] {
        let key = kind.orderKey
        func item(
            _ index: Int, title: String?, subtitle: String? = nil, detail: String? = nil,
            start: String? = nil, end: String? = nil, date: String? = nil,
            highlights: [String]? = nil, fallback: String? = nil, keywords: [String]? = nil
        ) -> CVSectionItem {
            let bullets: [String] = (highlights ?? []).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return CVSectionItem(
                id: "\(key).\(index)", index: index,
                title: title.nonBlank, subtitle: subtitle.nonBlank, detail: detail.nonBlank,
                startDate: start.nonBlank, endDate: end.nonBlank, date: date.nonBlank,
                firstBullet: bullets.first ?? fallback.nonBlank, bulletCount: bullets.count,
                keywords: keywords ?? []
            )
        }
        switch kind {
        case .header, .summary:
            return []
        case .work:
            return (work ?? []).enumerated().map { i, w in
                item(i, title: w.position, subtitle: w.name, start: w.startDate, end: w.endDate, highlights: w.highlights, fallback: w.summary)
            }
        case .education:
            return (education ?? []).enumerated().map { i, e in
                item(i, title: e.area ?? e.studyType, subtitle: e.institution, detail: e.area == nil ? nil : e.studyType,
                     start: e.startDate, end: e.endDate, highlights: e.courses)
            }
        case .skills:
            return (skills ?? []).enumerated().map { i, s in
                item(i, title: s.name ?? s.keywords?.first, detail: s.level, keywords: s.keywords)
            }
        case .languages:
            return (languages ?? []).enumerated().map { i, l in item(i, title: l.language, detail: l.fluency) }
        case .projects:
            return (projects ?? []).enumerated().map { i, p in
                item(i, title: p.name, subtitle: p.entity, start: p.startDate, end: p.endDate,
                     highlights: p.highlights, fallback: p.description, keywords: p.keywords)
            }
        case .certificates:
            return (certificates ?? []).enumerated().map { i, c in item(i, title: c.name, subtitle: c.issuer, date: c.date) }
        case .volunteer:
            return (volunteer ?? []).enumerated().map { i, v in
                item(i, title: v.position, subtitle: v.organization, start: v.startDate, end: v.endDate, highlights: v.highlights, fallback: v.summary)
            }
        case .awards:
            return (awards ?? []).enumerated().map { i, a in item(i, title: a.title, subtitle: a.awarder, date: a.date, fallback: a.summary) }
        case .publications:
            return (publications ?? []).enumerated().map { i, p in
                item(i, title: p.name, subtitle: p.publisher, date: p.releaseDate, fallback: p.summary)
            }
        case .interests:
            return (interests ?? []).enumerated().map { i, n in item(i, title: n.name ?? n.keywords?.first, keywords: n.keywords) }
        case .references:
            return (references ?? []).enumerated().map { i, r in item(i, title: r.name, fallback: r.reference) }
        case .custom(let id, _):
            let section = meta.customSections.first { $0.id == id }
            return (section?.items ?? []).enumerated().map { i, c in
                item(i, title: c.title, subtitle: c.subtitle, start: c.startDate, end: c.endDate, highlights: c.highlights, fallback: c.summary)
            }
        }
    }

    // MARK: Section order

    /// Moves list section `from` to final position `to` (indices among the list sections, i.e.
    /// `editorSections` without the pinned Header and Summary). `basics` stays first.
    mutating func moveListSection(from: Int, to: Int) -> Bool {
        let listKeys = editorSections.filter { !$0.isPinned }.map(\.kind.orderKey)
        guard listKeys.indices.contains(from), listKeys.indices.contains(to), from != to else { return false }
        var keys = listKeys
        keys.insert(keys.remove(at: from), at: to)
        let hasBasics = meta.sectionOrder.contains("basics")
        meta.sectionOrder = (hasBasics ? ["basics"] : []) + keys
        return true
    }

    // MARK: Items

    /// Removes item `index` of a list section; nil when there is no such item.
    mutating func removeItem(_ kind: CVSectionKind, at index: Int) -> CVRemovedItem? {
        func take<T>(_ list: inout [T]?, _ wrap: (T) -> CVRemovedItem) -> CVRemovedItem? {
            guard var values = list, values.indices.contains(index) else { return nil }
            let removed = values.remove(at: index)
            list = values
            return wrap(removed)
        }
        switch kind {
        case .header, .summary: return nil
        case .work: return take(&work, CVRemovedItem.work)
        case .education: return take(&education, CVRemovedItem.education)
        case .skills: return take(&skills, CVRemovedItem.skill)
        case .languages: return take(&languages, CVRemovedItem.language)
        case .projects: return take(&projects, CVRemovedItem.project)
        case .certificates: return take(&certificates, CVRemovedItem.certificate)
        case .volunteer: return take(&volunteer, CVRemovedItem.volunteer)
        case .awards: return take(&awards, CVRemovedItem.award)
        case .publications: return take(&publications, CVRemovedItem.publication)
        case .interests: return take(&interests, CVRemovedItem.interest)
        case .references: return take(&references, CVRemovedItem.reference)
        case .custom(let id, _):
            guard let s = meta.customSections.firstIndex(where: { $0.id == id }),
                  meta.customSections[s].items.indices.contains(index) else { return nil }
            return .custom(sectionId: id, meta.customSections[s].items.remove(at: index))
        }
    }

    /// Puts a removed item back at `index` (clamped to the section's current length).
    mutating func insert(_ removed: CVRemovedItem, at index: Int) {
        func put<T>(_ list: inout [T]?, _ value: T) {
            var values = list ?? []
            values.insert(value, at: min(max(index, 0), values.count))
            list = values
        }
        switch removed {
        case .work(let value): put(&work, value)
        case .education(let value): put(&education, value)
        case .skill(let value): put(&skills, value)
        case .language(let value): put(&languages, value)
        case .project(let value): put(&projects, value)
        case .certificate(let value): put(&certificates, value)
        case .volunteer(let value): put(&volunteer, value)
        case .award(let value): put(&awards, value)
        case .publication(let value): put(&publications, value)
        case .interest(let value): put(&interests, value)
        case .reference(let value): put(&references, value)
        case .custom(let id, let value):
            guard let s = meta.customSections.firstIndex(where: { $0.id == id }) else { return }
            meta.customSections[s].items.insert(value, at: min(max(index, 0), meta.customSections[s].items.count))
        }
    }

    // MARK: Comparison

    /// Sections whose content differs between `self` (an earlier version) and `other`, in the
    /// editor's order: Header, Summary, standard list sections, then custom sections.
    func changedSections(comparedTo other: CvContent) -> [CVSectionKind] {
        var changed: [CVSectionKind] = []
        var header = basics ?? ResumeBasics(), otherHeader = other.basics ?? ResumeBasics()
        header.summary = nil
        otherHeader.summary = nil
        if header != otherHeader { changed.append(.header) }
        if basics?.summary.nonBlank != other.basics?.summary.nonBlank { changed.append(.summary) }
        for kind in CVSectionKind.standardListSections where !hasSameItems(kind, as: other) {
            changed.append(kind)
        }
        var customIds: [String] = []
        for section in meta.customSections + other.meta.customSections where !customIds.contains(section.id) {
            customIds.append(section.id)
        }
        for id in customIds {
            let mine = meta.customSections.first { $0.id == id }
            let theirs = other.meta.customSections.first { $0.id == id }
            if mine != theirs, let section = theirs ?? mine {
                changed.append(.custom(id: id, title: section.title))
            }
        }
        return changed
    }

    private func hasSameItems(_ kind: CVSectionKind, as other: CvContent) -> Bool {
        switch kind {
        case .work: work ?? [] == other.work ?? []
        case .education: education ?? [] == other.education ?? []
        case .skills: skills ?? [] == other.skills ?? []
        case .languages: languages ?? [] == other.languages ?? []
        case .projects: projects ?? [] == other.projects ?? []
        case .certificates: certificates ?? [] == other.certificates ?? []
        case .volunteer: volunteer ?? [] == other.volunteer ?? []
        case .awards: awards ?? [] == other.awards ?? []
        case .publications: publications ?? [] == other.publications ?? []
        case .interests: interests ?? [] == other.interests ?? []
        case .references: references ?? [] == other.references ?? []
        case .header, .summary, .custom: true
        }
    }
}

extension Optional where Wrapped == String {
    /// The trimmed string, or nil when it's missing or blank.
    fileprivate var nonBlank: String? {
        guard let value = self?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
