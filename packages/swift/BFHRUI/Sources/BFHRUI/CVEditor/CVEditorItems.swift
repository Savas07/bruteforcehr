import BFHRCore
import Foundation

// Value types the CV editor screen renders (cv-editor.md "Decision — iOS"): the CV list, the
// selected CV's section list and items, its sync status and its revision history.

// MARK: - CV list

/// The CV list's filter menu: "All" hides archived CVs, "Archived" shows only them.
public enum CVListFilter: String, Hashable, Sendable, CaseIterable, Identifiable {
    case all
    case archived

    public var id: Self { self }
}

/// How a variant differs from its base CV (kind pill: "Role: Frontend" / "Deutsch").
public enum CVVariantKind: Hashable, Sendable {
    /// Same language as the base; the CV title is the role label.
    case role
    /// A different language than the base.
    case language
}

/// A CV row in the list (`CvList`).
public struct CVListRow: Identifiable, Hashable, Sendable {
    public var id: String
    public var title: String
    /// BCP 47 language code ("en", "de"); the view shows the name in its own language.
    public var language: String
    public var isDefault: Bool
    public var updatedAt: Date
    public var archivedAt: Date?
    /// Set for variants (`parentCvId`).
    public var parentCvId: String?
    public var variantKind: CVVariantKind?

    public var isArchived: Bool { archivedAt != nil }
    public var isVariant: Bool { parentCvId != nil }
}

/// A base CV with its variants beneath it. A variant whose base isn't in the filtered list (the
/// base is archived, or it is) heads its own group.
public struct CVListGroup: Identifiable, Hashable, Sendable {
    public var base: CVListRow
    public var variants: [CVListRow]

    public var id: String { base.id }
}

// MARK: - Selected CV

/// What `VariantBanner` shows: "Variant of Base CV · Deutsch" (+ "The base changed in N places").
public struct CVVariantInfo: Hashable, Sendable {
    public var kind: CVVariantKind
    public var parentCvId: String
    public var parentTitle: String
    public var parentLanguage: String
    /// Sections of the base CV that changed since this variant was made from it (compares the
    /// base revision the variant started from with the base's current content). Empty: in sync,
    /// or the starting revision isn't known.
    public var baseChangedSections: [CVSectionKind]
}

/// The selected CV: title, language, variant info, template/theme and the current content (the
/// local working copy when edited, else the current revision's content).
public struct CVDocument: Identifiable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var language: String
    public var isDefault: Bool
    public var archivedAt: Date?
    public var variant: CVVariantInfo?
    public var templateId: String
    public var theme: CvTheme
    public var currentRevisionId: String
    public var content: CvContent
    /// The original import file ("…" › Original file).
    public var importedFrom: CvImportedFile?
    public var updatedAt: Date
    /// The content differs from the current revision (local working copy, not yet a revision).
    public var hasLocalEdits: Bool

    public var isArchived: Bool { archivedAt != nil }
}

// MARK: - Sections

/// A section of the Edit segment. Header and Summary both come from JSON Resume `basics`
/// (`meta.sectionOrder` key "basics"); the others map to their own key, custom sections to
/// `custom:<id>`.
public enum CVSectionKind: Hashable, Sendable {
    case header
    case summary
    case work
    case education
    case skills
    case languages
    case projects
    case certificates
    case volunteer
    case awards
    case publications
    case interests
    case references
    case custom(id: String, title: String)

    /// Standard sections in cv-render's default order (`CV_STANDARD_SECTIONS`), without the two
    /// `basics` sections.
    public static let standardListSections: [CVSectionKind] = [
        .work, .projects, .education, .skills, .languages, .certificates,
        .awards, .publications, .volunteer, .interests, .references,
    ]

    /// The `meta.sectionOrder` key.
    public var orderKey: String {
        switch self {
        case .header, .summary: "basics"
        case .work: "work"
        case .education: "education"
        case .skills: "skills"
        case .languages: "languages"
        case .projects: "projects"
        case .certificates: "certificates"
        case .volunteer: "volunteer"
        case .awards: "awards"
        case .publications: "publications"
        case .interests: "interests"
        case .references: "references"
        case .custom(let id, _): "custom:\(id)"
        }
    }

    /// Header and Summary stay at the top; they can't be reordered.
    public var isPinned: Bool { self == .header || self == .summary }

    /// The section kind for a list-section order key; nil for "basics" and unknown keys.
    init?(orderKey: String, customSections: [CvCustomSection]) {
        if orderKey.hasPrefix("custom:") {
            let id = String(orderKey.dropFirst("custom:".count))
            guard let section = customSections.first(where: { $0.id == id }) else { return nil }
            self = .custom(id: id, title: section.title)
            return
        }
        guard let kind = Self.standardListSections.first(where: { $0.orderKey == orderKey }) else { return nil }
        self = kind
    }
}

/// The one-line content summary on a section row (Mozi: "UX Designer at Mobbin"). Typed, so the
/// view composes it in the UI language.
public enum CVSectionSummary: Hashable, Sendable {
    /// Header: name and headline (`basics.label`).
    case header(name: String?, headline: String?)
    /// Summary: the text (the row truncates to one line).
    case text(String)
    /// List sections: the first item ("Frontend Engineer" · "Pazarbox") and how many more.
    case item(title: String?, subtitle: String?, moreCount: Int)
    /// Skills, languages, interests: the item names in order ("Turkish, English, German").
    case names([String])
}

/// An item card (`ItemCard`): title, org · dates, first bullet.
public struct CVSectionItem: Identifiable, Hashable, Sendable {
    /// `"<orderKey>.<index>"`.
    public var id: String
    public var index: Int
    /// Role, degree area, project, skill group, language, certificate…
    public var title: String?
    /// Company, institution, issuer, organization, entity…
    public var subtitle: String?
    /// A short qualifier: study type, skill level, language fluency.
    public var detail: String?
    /// As stored: ISO `yyyy`, `yyyy-MM` or `yyyy-MM-dd`.
    public var startDate: String?
    public var endDate: String?
    /// Single-date items (certificate, award, publication), as stored.
    public var date: String?
    /// The first highlight, or the item's summary/description when it has no highlights.
    public var firstBullet: String?
    public var bulletCount: Int
    /// Skill / interest keywords.
    public var keywords: [String]

    /// Started and not ended ("I currently work here").
    public var isCurrent: Bool { startDate != nil && endDate == nil }
}

/// One row of the section list (`SectionRow`).
public struct CVSection: Identifiable, Hashable, Sendable {
    public var kind: CVSectionKind
    /// nil when the section is empty.
    public var summary: CVSectionSummary?
    public var items: [CVSectionItem]

    /// "header", "summary", or the `meta.sectionOrder` key ("work", "custom:talks").
    public var id: String {
        switch kind {
        case .header: "header"
        case .summary: "summary"
        default: kind.orderKey
        }
    }

    public var itemCount: Int { items.count }
    /// Shows the ghost row ("+ Add your first role").
    public var isEmpty: Bool { summary == nil }
    public var isPinned: Bool { kind.isPinned }
}

// MARK: - Sync status

/// The editor's `SyncStatus` subtitle (states.md `save.*`): "Saved · {relative}" / "Saving…" /
/// "Saved on this device" / "Couldn't save · Try again".
public enum CVSyncStatus: Hashable, Sendable {
    case saved(at: Date)
    case saving
    case savedOnDevice
    case failed
}

// MARK: - Revision history

/// One row of `RevisionList`.
public struct CVRevisionRow: Identifiable, Hashable, Sendable {
    public var id: String
    public var source: CvRevisionSource
    /// The change sentence ("Added Projects, Certificates and a Talks section").
    public var diffSummary: String?
    public var createdAt: Date
    /// The job an AI-tailored revision was made for.
    public var jobId: String?
    /// The CV's `currentRevisionId` ("Current" tag).
    public var isCurrent: Bool
}

/// Revisions made on one calendar day, newest first.
public struct CVRevisionDay: Identifiable, Hashable, Sendable {
    /// Start of the day in the model's calendar.
    public var day: Date
    public var revisions: [CVRevisionRow]

    public var id: Date { day }
}
