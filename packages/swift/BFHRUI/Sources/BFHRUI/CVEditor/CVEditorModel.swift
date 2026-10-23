import BFHRCore
import Foundation
import Observation

/// The CV editor screen (cv-editor.md "Decision — iOS"): the CV list (base CVs with their
/// variants, All / Archived filter) and the selected CV's Edit segment (section list, items,
/// sync status, revision history, conflicts).
///
/// Every saved change is one immutable revision plus a `version` bump of the CV, written through
/// `writer` (`CVDataLayer.swift`). Changes show at once (optimistic); the data layer's snapshot
/// listener then confirms them through `load(_:)`. Without a writer (design mode, previews) the
/// changes stay in memory.
@Observable
public final class CVEditorModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    /// CVs with writes the server hasn't confirmed yet (Firestore `hasPendingWrites`).
    public var pendingSyncIDs: Set<String> = []

    /// The clock for relative times and (without `usesSystemClock`) for mutation dates.
    public var now: Date
    /// Live data: stamp writes with the real time instead of `now`.
    public var usesSystemClock = false
    public let calendar: Calendar

    /// The CV list's filter menu.
    public var filter: CVListFilter = .all

    public internal(set) var data: UserData = .empty
    public private(set) var selectedCvId: String?

    /// The selected CV with its content; nil when nothing is selected or it's gone.
    public private(set) var document: CVDocument?
    /// Header, Summary, then the list sections in `meta.sectionOrder` order.
    public private(set) var sections: [CVSection] = []
    /// Sections the CV doesn't show (not in `meta.sectionOrder`): "+ Add section" candidates.
    public private(set) var hiddenSections: [CVSection] = []
    /// The selected CV's revisions by day, newest day first.
    public private(set) var revisionDays: [CVRevisionDay] = []

    /// Where ✦ Improve gets its suggestions. Nil: AI assists aren't offered.
    public var suggestionProvider: (any CVSuggestionProvider)?
    /// Writes CVs and revisions; nil keeps changes in memory (design mode, previews).
    public var writer: (any CVWriter)?
    /// Something that didn't happen (shown once as a toast); the view clears it.
    public var notice: CVNotice?
    /// cv-render in JavaScriptCore: the Preview, the template picker thumbnails, PDF and DOCX.
    /// Nil (unit tests without the bundle): the Preview explains it can't render.
    @ObservationIgnored public var renderEngine: CVRenderEngine?
    /// Uploads files and asks the server to read them (`cvImport`); nil hides Import.
    @ObservationIgnored public var importer: (any CVImporter)?
    @ObservationIgnored var catalogCache: [String: CVTemplateCatalog] = [:]

    /// Content this device holds that isn't the CV's current revision: a save the server
    /// rejected (Try again) or a version conflict (Keep this version / Use the other version).
    var drafts: [String: CVDraft] = [:]

    public init(selectedCvId: String? = nil, now: Date = .now, calendar: Calendar = .current) {
        self.selectedCvId = selectedCvId
        self.now = now
        self.calendar = calendar
    }

    public func load(_ data: UserData) {
        self.data = data
        drafts = drafts.filter { cvId, _ in data.cv(id: cvId) != nil }
        recompute()
        phase = .loaded
    }

    /// The time stamped on writes.
    var stamp: Date { usesSystemClock ? .now : now }

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

    /// No non-archived CVs: the empty state (Import a CV / Start from scratch).
    public var isEmpty: Bool { !data.cvs.contains { $0.archivedAt == nil } }

    /// How many CVs are archived (the Archived filter is offered only when > 0).
    public var archivedCount: Int { data.cvs.count(where: { $0.archivedAt != nil }) }

    // MARK: - Sync status

    /// The selected CV's `SyncStatus`: failed write, then offline with pending writes, then
    /// pending writes still syncing, else saved at the CV's last write.
    public var syncStatus: CVSyncStatus? {
        guard let document else { return nil }
        if case .failed = drafts[document.id]?.state { return .failed }
        if pendingSyncIDs.contains(document.id) {
            return connection.isOffline ? .savedOnDevice : .saving
        }
        let revisionAt = data.revision(id: document.currentRevisionId)?.createdAt ?? document.updatedAt
        return .saved(at: max(revisionAt, document.updatedAt))
    }

    /// CV ids whose last save the server rejected ("Couldn't save · Try again").
    public var failedWriteIDs: Set<String> {
        Set(drafts.compactMap { id, draft in if case .failed = draft.state { id } else { nil } })
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
        editContent(.reordered) { content in content.moveListSection(from: from - pinned, to: to - pinned) }
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
        let label = item.subtitle ?? item.title
        var removed: CVRemovedItem?
        editContent(.removed(section.kind, label)) { content in
            removed = content.removeItem(section.kind, at: index)
            return removed != nil
        }
        guard let removed else { return nil }
        return ToastItem(
            glyph: ToastGlyph.removed,
            message: CVEditorStrings.removed(title: item.title, subtitle: item.subtitle),
            action: .undo { [weak self] in
                self?.editContent(of: cvId, .edited(section.kind, label)) { content in
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
        update(cvId, CVChanges(archivedAt: .some(stamp), updatedAt: stamp))
        return ToastItem(
            glyph: ToastGlyph.archived,
            message: CVEditorStrings.archived(cv.title),
            action: .undo { [weak self] in self?.unarchive(cvId: cvId) }
        )
    }

    /// Brings an archived CV back (Archived filter, or Undo after archiving).
    public func unarchive(cvId: String) {
        guard data.cv(id: cvId)?.archivedAt != nil else { return }
        update(cvId, CVChanges(archivedAt: .some(nil), updatedAt: stamp))
    }

    /// Renames a CV. Blank titles are ignored.
    public func rename(cvId: String, to title: String) {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, let cv = data.cv(id: cvId), cv.title != title else { return }
        update(cvId, CVChanges(title: String(title.prefix(120)), updatedAt: stamp))
    }

    /// Makes a CV the default one (the others lose the flag).
    public func makeDefault(cvId: String) {
        guard let cv = data.cv(id: cvId), !cv.isDefault else { return }
        for other in data.cvs where other.isDefault && other.id != cvId {
            update(other.id, CVChanges(isDefault: false, updatedAt: stamp))
        }
        update(cvId, CVChanges(isDefault: true, updatedAt: stamp))
    }

    /// Saves an item edit sheet (`index` nil: a new item at the end of the section). Returns
    /// false when the draft can't be saved (blank, end before start, unfilled placeholders).
    @discardableResult
    public func saveItem(_ draft: CVItemDraft, sectionKind: CVSectionKind, at index: Int?) -> Bool {
        guard draft.canSave else { return false }
        var saved = false
        let label = draft.subtitle.nilIfBlank ?? draft.title.nilIfBlank
        editContent(index == nil ? .added(sectionKind, label) : .edited(sectionKind, label)) { content in
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
        editContent(.edited(sectionKind, nil)) { content in content.moveItems(sectionKind, from: source, to: destination) }
    }

    /// Saves the Header sheet.
    public func saveHeader(_ draft: CVHeaderDraft) {
        editContent(.edited(.header, nil)) { content in content.setHeader(draft) }
    }

    /// Saves the Summary sheet. Placeholders left by a suggestion block it.
    @discardableResult
    public func saveSummary(_ text: String) -> Bool {
        guard CVPlaceholders.find(in: text).isEmpty else { return false }
        editContent(.edited(.summary, nil)) { content in content.setSummary(text) }
        return true
    }

    /// "+ Add section": shows a hidden section at the end of the order.
    public func showSection(_ kind: CVSectionKind) {
        editContent(.added(kind, nil)) { content in content.showSection(kind) }
    }

    /// Start from scratch: a blank CV in the user's UI language, header prefilled from the
    /// profile, opened right away. Returns its id.
    @discardableResult
    public func startFromScratch() -> String {
        let profile = data.profile
        let language = profile?.uiLanguage.rawValue ?? Self.preferredCVLanguage
        let content = CvContent(
            basics: ResumeBasics(name: profile?.fullName, label: profile?.headline, email: profile?.email, phone: profile?.phone),
            meta: CvMeta(template: CVTemplateCatalog.defaultTemplateId, theme: CVTemplateCatalog.defaultTheme(language: language, timezone: profile?.timezone),
                         sectionOrder: ["basics", "work", "education", "skills", "languages"], customSections: [])
        )
        return createCv(title: CVEditorStrings.untitledTitle, language: language, content: content, source: .manual,
                        summary: CVChangeSummary.created.text)
    }

    /// The app's language when there's no profile yet ("en", "de" or "tr").
    static var preferredCVLanguage: String {
        let code = Locale.preferredLanguages.first.map { Locale(identifier: $0).language.languageCode?.identifier ?? "en" } ?? "en"
        return ["en", "de", "tr"].contains(code) ? code : "en"
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

    /// The CV's content: this device's draft when it holds one, else its current revision's.
    func content(of cv: Cv) -> CvContent? {
        drafts[cv.id]?.content ?? data.revision(id: cv.currentRevisionId)?.content
    }

    func recompute() {
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
            templateId: content.meta.template, theme: content.meta.theme, currentRevisionId: cv.currentRevisionId,
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
        while let id = next, visited.insert(id).inserted {
            if let revision = data.revision(id: id) {
                if revision.cvId == parentId { return revision }
                next = revision.basedOnRevisionId
            } else {
                return nil
            }
        }
        return nil
    }

    private func revisionDays(for cv: Cv) -> [CVRevisionDay] {
        let rows = data.cvRevisions
            .filter { $0.cvId == cv.id }
            .sorted {
                // Newest first; at the same instant the current revision leads.
                if $0.createdAt != $1.createdAt { return $0.createdAt > $1.createdAt }
                let current = ($0.id == cv.currentRevisionId, $1.id == cv.currentRevisionId)
                if current.0 != current.1 { return current.0 }
                return $0.id > $1.id
            }
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

    // MARK: - Content edits

    /// Applies `edit` to the selected CV's content.
    private func editContent(_ change: CVChangeSummary, _ edit: (inout CvContent) -> Bool) {
        guard let cvId = document?.id else { return }
        editContent(of: cvId, change, edit)
    }

    /// Applies `edit` (returns whether it changed anything) to a CV's content and saves it as a
    /// new revision. While the CV holds a draft (failed save or conflict), edits change the draft
    /// and wait for Try again / the conflict decision.
    func editContent(of cvId: String, _ change: CVChangeSummary, _ edit: (inout CvContent) -> Bool) {
        guard let cv = data.cv(id: cvId), var content = content(of: cv) else { return }
        guard edit(&content) else { return }
        if var draft = drafts[cvId] {
            draft.content = content
            drafts[cvId] = draft
            recompute()
            return
        }
        commit(cvId, content: content, summary: change.text)
    }
}

extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
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
