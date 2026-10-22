import BFHRCore
import Foundation
import Observation

/// The CV editor screen (cv-editor.md "Decision — iOS"): the CV list (base CVs with their
/// variants, All / Archived filter) and the selected CV's Edit segment (section list, items,
/// sync status, revision history).
///
/// Edits change a local working copy of the selected CV's content. M0 writes no revision
/// documents: the working copy stands in for the next revision until the data layer coalesces
/// edits into one (cv-editor.md open question 2).
@Observable
public final class CVEditorModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []
    /// CV ids whose last write the server rejected; the data layer sets it ("Couldn't save · Try
    /// again"), and clears it when a retry succeeds.
    public var failedWriteIDs: Set<String> = []

    /// The clock for mutation dates; the data layer (or a design scenario) can move it.
    public var now: Date
    public let calendar: Calendar

    /// The CV list's filter menu.
    public var filter: CVListFilter = .all

    public private(set) var data: UserData = .empty
    public private(set) var selectedCvId: String?

    /// The selected CV with its working content; nil when nothing is selected or it's gone.
    public private(set) var document: CVDocument?
    /// Header, Summary, then the list sections in `meta.sectionOrder` order.
    public private(set) var sections: [CVSection] = []
    /// Sections the CV doesn't show (not in `meta.sectionOrder`): "+ Add section" candidates.
    public private(set) var hiddenSections: [CVSection] = []
    /// The selected CV's revisions by day, newest day first.
    public private(set) var revisionDays: [CVRevisionDay] = []
    /// Where ✦ Improve gets its suggestions. Nil (the default, and every Release build in M0):
    /// AI assists aren't offered. Claude through the server fills it from M2; Debug design mode
    /// sets a canned provider.
    public var suggestionProvider: (any CVSuggestionProvider)?

    /// Local working copies by CV id (M0: edits don't write revisions).
    private var drafts: [String: Draft] = [:]

    private struct Draft {
        /// The revision the working copy started from; dropped when the CV moves on.
        var basedOnRevisionId: String
        var content: CvContent
        var editedAt: Date
    }

    public init(selectedCvId: String? = nil, now: Date = .now, calendar: Calendar = .current) {
        self.selectedCvId = selectedCvId
        self.now = now
        self.calendar = calendar
    }

    public func load(_ data: UserData) {
        self.data = data
        drafts = drafts.filter { cvId, draft in data.cv(id: cvId)?.currentRevisionId == draft.basedOnRevisionId }
        recompute()
        phase = .loaded
    }

    // MARK: - List

    /// The list for `filter`: each base CV with its variants beneath. Default CV first, then most
    /// recently edited; variants most recently edited first.
    public var groups: [CVListGroup] {
        let visible = data.cvs.filter { filter == .archived ? $0.archivedAt != nil : $0.archivedAt == nil }
        let visibleIds = Set(visible.map(\.id))
        let rows = visible.map(row(for:))
        let byRecency: (CVListRow, CVListRow) -> Bool = { ($0.updatedAt, $1.id) > ($1.updatedAt, $0.id) }
        let roots = rows.filter { $0.parentCvId.map { !visibleIds.contains($0) } ?? true }
        return roots
            .sorted { $0.isDefault != $1.isDefault ? $0.isDefault : byRecency($0, $1) }
            .map { base in
                CVListGroup(base: base, variants: rows.filter { $0.parentCvId == base.id }.sorted(by: byRecency))
            }
    }

    /// No non-archived CVs: the `ChoiceCards` empty state (Import a CV / Start from scratch).
    public var isEmpty: Bool { !data.cvs.contains { $0.archivedAt == nil } }

    /// How many CVs are archived (the Archived filter is offered only when > 0).
    public var archivedCount: Int { data.cvs.count(where: { $0.archivedAt != nil }) }

    // MARK: - Sync status

    /// The selected CV's `SyncStatus`: failed write, then offline with pending writes, then
    /// pending writes still syncing, else saved at the latest local edit / CV write / revision.
    public var syncStatus: CVSyncStatus? {
        guard let document else { return nil }
        if failedWriteIDs.contains(document.id) { return .failed }
        if pendingSyncIDs.contains(document.id) {
            return connection.isOffline ? .savedOnDevice : .saving
        }
        let revisionAt = data.revision(id: document.currentRevisionId)?.createdAt ?? document.updatedAt
        let editedAt = drafts[document.id]?.editedAt ?? .distantPast
        return .saved(at: max(revisionAt, document.updatedAt, editedAt))
    }

    // MARK: - Selected CV extras

    /// ✦ Improve is offered (a provider exists) …
    public var offersSuggestions: Bool { suggestionProvider != nil }

    /// … and works now (AI needs a connection).
    public var canRequestSuggestions: Bool { offersSuggestions && !connection.isOffline }

    /// The selected CV's group (its base and the base's variants), for the version switcher.
    public var selectedGroup: CVListGroup? {
        guard let document else { return nil }
        let baseId = document.variant?.parentCvId ?? document.id
        let rows = data.cvs.filter { $0.archivedAt == nil || $0.id == document.id }
        guard let base = rows.first(where: { $0.id == baseId }) else { return nil }
        let variants = rows.filter { $0.parentCvId == baseId }.sorted { ($0.updatedAt, $1.id) > ($1.updatedAt, $0.id) }
        return CVListGroup(base: row(for: base), variants: variants.map(row(for:)))
    }

    /// The Preview segment's blocks, in the CV's language.
    public var pageBlocks: [CVPageBlock] {
        guard let document else { return [] }
        return document.content.pageBlocks(language: document.language)
    }

    /// The Preview segment's paper (the CV's theme).
    public var paper: CVPaper? {
        document.map { CVPaper(size: $0.content.meta.theme.paperSize, density: $0.content.meta.theme.density) }
    }

    /// The edit-sheet copy of an item; nil when there's no such item.
    public func itemDraft(sectionKind: CVSectionKind, at index: Int) -> CVItemDraft? {
        document?.content.itemDraft(sectionKind, at: index)
    }

    public var headerDraft: CVHeaderDraft { document?.content.headerDraft ?? CVHeaderDraft() }

    public var summaryText: String { document?.content.basics?.summary ?? "" }

    // MARK: - Actions

    /// Opens a CV (nil: back to the list). Selection isn't a write.
    public func select(cvId: String?) {
        selectedCvId = cvId
        recompute()
    }

    /// Reorders the selected CV's sections ("Edit sections" mode). Indices are into `sections`,
    /// `to` is the final position. Header and Summary stay pinned at the top: moves from or into
    /// their positions are ignored.
    public func moveSection(from: Int, to: Int) {
        let pinned = sections.prefix { $0.isPinned }.count
        guard from >= pinned, to >= pinned else { return }
        editContent { content in content.moveListSection(from: from - pinned, to: to - pinned) }
    }

    /// Removes item `index` from a list section of the selected CV ("Removed “Acme — Senior
    /// Engineer” · Undo"). Nil when there's no such item (Header and Summary have no items).
    @discardableResult
    public func removeItem(sectionKind: CVSectionKind, at index: Int) -> ToastItem? {
        guard let cvId = document?.id else { return nil }
        let section = sections.first { $0.kind.orderKey == sectionKind.orderKey && !$0.isPinned }
            ?? hiddenSections.first { $0.kind.orderKey == sectionKind.orderKey }
        guard let section, section.items.indices.contains(index) else { return nil }
        let item = section.items[index]
        var removed: CVRemovedItem?
        editContent { content in
            removed = content.removeItem(section.kind, at: index)
            return removed != nil
        }
        guard let removed else { return nil }
        return ToastItem(
            glyph: ToastGlyph.removed,
            message: CVEditorStrings.removed(title: item.title, subtitle: item.subtitle),
            action: .undo { [weak self] in
                self?.editContent(of: cvId) { content in
                    content.insert(removed, at: index)
                    return true
                }
            }
        )
    }

    /// Archives a CV (archive-only in v1, decisions.md D14). Undo unarchives it. Nil when the CV
    /// doesn't exist or is already archived.
    @discardableResult
    public func archive(cvId: String) -> ToastItem? {
        guard let cv = data.cv(id: cvId), cv.archivedAt == nil else { return nil }
        data.setCvArchived(cvId, at: now, now: now)
        recordWrite(cvId)
        recompute()
        return ToastItem(
            glyph: ToastGlyph.archived,
            message: CVEditorStrings.archived(cv.title),
            action: .undo { [weak self] in self?.unarchive(cvId: cvId) }
        )
    }

    /// Brings an archived CV back (Archived filter, or Undo after archiving).
    public func unarchive(cvId: String) {
        guard data.cv(id: cvId)?.archivedAt != nil else { return }
        data.setCvArchived(cvId, at: nil, now: now)
        recordWrite(cvId)
        recompute()
    }

    /// Saves an item edit sheet (`index` nil: a new item at the end of the section). Returns
    /// false when the draft can't be saved (blank, end before start, unfilled placeholders).
    @discardableResult
    public func saveItem(_ draft: CVItemDraft, sectionKind: CVSectionKind, at index: Int?) -> Bool {
        guard draft.canSave else { return false }
        var saved = false
        editContent { content in
            saved = content.setItem(sectionKind, at: index, to: draft)
            return saved
        }
        return saved || index != nil
    }

    /// Whether saving `draft` would change the CV (the sheet's "unsaved changes" test). A new
    /// item counts once anything is typed.
    public func itemDraftChangesCV(_ draft: CVItemDraft, sectionKind: CVSectionKind, at index: Int?) -> Bool {
        guard let index else { return !draft.isBlank }
        guard var content = document?.content else { return false }
        return content.setItem(sectionKind, at: index, to: draft)
    }

    /// Reorders a section's items (Edit mode drag handles).
    public func moveItems(sectionKind: CVSectionKind, from source: IndexSet, to destination: Int) {
        editContent { content in content.moveItems(sectionKind, from: source, to: destination) }
    }

    /// Saves the Header sheet.
    public func saveHeader(_ draft: CVHeaderDraft) {
        editContent { content in content.setHeader(draft) }
    }

    /// Saves the Summary sheet. Placeholders left by a suggestion block it.
    @discardableResult
    public func saveSummary(_ text: String) -> Bool {
        guard CVPlaceholders.find(in: text).isEmpty else { return false }
        editContent { content in content.setSummary(text) }
        return true
    }

    /// "+ Add section": shows a hidden section at the end of the order.
    public func showSection(_ kind: CVSectionKind) {
        editContent { content in content.showSection(kind) }
    }

    /// Start from scratch: a blank CV in the user's UI language, header prefilled from the
    /// profile, opened right away. Returns its id.
    @discardableResult
    public func startFromScratch() -> String {
        let profile = data.profile
        let language = profile?.uiLanguage.rawValue ?? "en"
        let id = "cv-\(UUID().uuidString.lowercased())"
        let theme = CvTheme(accentColor: "#2F5D8A", fontPair: "inter-source-serif", density: .comfortable,
                            paperSize: language == "en" && profile?.timezone.hasPrefix("America/") == true ? .letter : .a4)
        let content = CvContent(
            basics: ResumeBasics(name: profile?.fullName, label: profile?.headline, email: profile?.email, phone: profile?.phone),
            meta: CvMeta(template: "classic", theme: theme, sectionOrder: ["basics", "work", "education", "skills", "languages"], customSections: [])
        )
        let revision = CvRevision(id: "rev-\(UUID().uuidString.lowercased())", cvId: id, content: content, source: .manual,
                                  basedOnRevisionId: nil, jobId: nil, diffSummary: nil, createdAt: now)
        let cv = Cv(id: id, title: CVEditorStrings.untitledTitle, language: language, parentCvId: nil, currentRevisionId: revision.id,
                    templateId: "classic", theme: theme, isDefault: !data.cvs.contains { $0.archivedAt == nil },
                    archivedAt: nil, version: 1, importedFrom: nil, createdAt: now, updatedAt: now)
        data.cvs.append(cv)
        data.cvRevisions.append(revision)
        recordWrite(id)
        select(cvId: id)
        return id
    }

    // MARK: - Derivation

    private func row(for cv: Cv) -> CVListRow {
        CVListRow(
            id: cv.id, title: cv.title, language: cv.language, isDefault: cv.isDefault,
            updatedAt: cv.updatedAt, archivedAt: cv.archivedAt, parentCvId: cv.parentCvId,
            variantKind: variantKind(of: cv)
        )
    }

    private func variantKind(of cv: Cv) -> CVVariantKind? {
        guard let parentId = cv.parentCvId else { return nil }
        guard let parent = data.cv(id: parentId) else { return .role }
        return parent.language == cv.language ? .role : .language
    }

    /// The CV's working content: the local copy when edited, else its current revision's.
    private func content(of cv: Cv) -> CvContent? {
        drafts[cv.id]?.content ?? data.revision(id: cv.currentRevisionId)?.content
    }

    private func recompute() {
        guard let cvId = selectedCvId, let cv = data.cv(id: cvId), let content = content(of: cv) else {
            document = nil
            sections = []
            hiddenSections = []
            revisionDays = []
            return
        }
        document = CVDocument(
            id: cv.id, title: cv.title, language: cv.language, isDefault: cv.isDefault,
            archivedAt: cv.archivedAt, variant: variantInfo(for: cv),
            templateId: cv.templateId, theme: cv.theme, currentRevisionId: cv.currentRevisionId,
            content: content, importedFrom: cv.importedFrom, updatedAt: cv.updatedAt,
            hasLocalEdits: drafts[cv.id] != nil
        )
        sections = content.editorSections
        hiddenSections = content.hiddenSections
        revisionDays = revisionDays(for: cv)
    }

    private func variantInfo(for cv: Cv) -> CVVariantInfo? {
        guard let parentId = cv.parentCvId, let parent = data.cv(id: parentId), let kind = variantKind(of: cv) else { return nil }
        var changed: [CVSectionKind] = []
        if let origin = originRevision(of: cv, in: parentId), let parentContent = content(of: parent) {
            changed = origin.content.changedSections(comparedTo: parentContent)
        }
        return CVVariantInfo(
            kind: kind, parentCvId: parent.id, parentTitle: parent.title,
            parentLanguage: parent.language, baseChangedSections: changed
        )
    }

    /// The parent's revision the variant was made from: the first revision of the parent found
    /// following `basedOnRevisionId` back from the variant's current revision.
    private func originRevision(of cv: Cv, in parentId: String) -> CvRevision? {
        var next: String? = cv.currentRevisionId
        var visited: Set<String> = []
        while let id = next, visited.insert(id).inserted, let revision = data.revision(id: id) {
            if revision.cvId == parentId { return revision }
            next = revision.basedOnRevisionId
        }
        return nil
    }

    private func revisionDays(for cv: Cv) -> [CVRevisionDay] {
        let rows = data.cvRevisions
            .filter { $0.cvId == cv.id }
            .sorted { ($0.createdAt, $0.id) > ($1.createdAt, $1.id) }
            .map { revision in
                CVRevisionRow(
                    id: revision.id, source: revision.source, diffSummary: revision.diffSummary,
                    createdAt: revision.createdAt, jobId: revision.jobId,
                    isCurrent: revision.id == cv.currentRevisionId
                )
            }
        var days: [CVRevisionDay] = []
        for row in rows {
            let day = calendar.startOfDay(for: row.createdAt)
            if days.last?.day == day {
                days[days.count - 1].revisions.append(row)
            } else {
                days.append(CVRevisionDay(day: day, revisions: [row]))
            }
        }
        return days
    }

    // MARK: - Working copy

    /// Applies `edit` to the selected CV's working copy.
    private func editContent(_ edit: (inout CvContent) -> Bool) {
        guard let cvId = document?.id else { return }
        editContent(of: cvId, edit)
    }

    /// Applies `edit` (returns whether it changed anything) to a CV's working copy, records the
    /// write and recomputes. A working copy equal to the current revision is dropped.
    private func editContent(of cvId: String, _ edit: (inout CvContent) -> Bool) {
        guard let cv = data.cv(id: cvId), let revision = data.revision(id: cv.currentRevisionId) else { return }
        var content = drafts[cvId]?.content ?? revision.content
        guard edit(&content) else { return }
        drafts[cvId] = content == revision.content
            ? nil
            : Draft(basedOnRevisionId: revision.id, content: content, editedAt: now)
        recordWrite(cvId)
        recompute()
    }
}

/// CV editor strings (table "CVEditor").
enum CVEditorStrings {
    /// "Removed “Pazarbox — Frontend Engineer”" (states.md CV editor Undo column).
    static func removed(title: String?, subtitle: String?) -> LocalizedStringResource {
        switch (subtitle, title) {
        case let (subtitle?, title?):
            .bfhr("cvEditor.toast.removedEntry", default: "Removed “\(subtitle) — \(title)”", table: "CVEditor",
                  comment: "Toast after removing a CV entry. %1$@ = organization (company, school), %2$@ = title (role, degree).")
        case let (name?, nil), let (nil, name?):
            .bfhr("cvEditor.toast.removedNamed", default: "Removed “\(name)”", table: "CVEditor",
                  comment: "Toast after removing a CV entry that has one name (skill group, language, certificate). %@ = name.")
        case (nil, nil):
            .bfhr("cvEditor.toast.removedUnnamed", default: "Removed an entry", table: "CVEditor",
                  comment: "Toast after removing a CV entry that has no title yet.")
        }
    }

    /// "Base CV — English · archived" (decisions.md D14: CVs are archive-only).
    static func archived(_ title: String) -> LocalizedStringResource {
        .bfhr("cvEditor.toast.archived", default: "\(title) · archived", table: "CVEditor",
              comment: "Toast after archiving a CV. %@ = CV title. Undo brings it back.")
    }

    /// The title of a CV started from scratch (the user renames it later).
    static var untitledTitle: String {
        String(localized: .bfhr("cvEditor.untitled", default: "New CV", table: "CVEditor", comment: "Title of a CV started from scratch."))
    }
}
