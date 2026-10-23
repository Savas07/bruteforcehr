import BFHRCore
import Foundation

// Saving (docs/adr/0009-cv-studio.md): one revision per saved change, optimistic, through
// `CVWriter`; failed saves keep the content for Try again; version conflicts keep both versions
// and let the user choose.

/// Content this device holds apart from the CV's current revision.
struct CVDraft: Hashable {
    enum State: Hashable {
        /// The server rejected the save (not a conflict). `changes`: a metadata update to resend.
        case failed(changes: CVChanges?)
        /// Another device saved first. `mine` is this device's version, written as a revision of
        /// its own so nothing is lost whichever the user keeps.
        case conflict(mine: CvRevision)
    }

    var content: CvContent
    var state: State
}

/// The selected CV's version conflict, for the banner and Compare.
public struct CVConflictInfo: Hashable, Sendable {
    /// When the other device's version was saved.
    public var otherSavedAt: Date
    /// The other device's content (the CV's current revision); nil until it's loaded.
    public var otherContent: CvContent?
    /// This device's content.
    public var mineContent: CvContent
}

/// A notice the CV screens show once (toast): something didn't happen.
public enum CVNotice: Hashable, Sendable {
    /// A new CV couldn't be created (the server refused it).
    case createFailed
    /// The CV to copy couldn't be read.
    case readFailed
    /// AI translation for a language variant failed; nothing was created.
    case translateFailed
}

/// The change sentence of a revision ("Edited Experience · Acme"), written in the UI language
/// and shown as-is in the history on every device (diffSummary).
enum CVChangeSummary: Hashable {
    case created
    case edited(CVSectionKind, String?)
    case added(CVSectionKind, String?)
    case removed(CVSectionKind, String?)
    case reordered
    case restored(Date)
    case design(templateName: String)
    case imported(fileName: String)
    case variant(of: String)
    case duplicate(of: String)
    case kept

    var text: String {
        typealias L = CVEditorViewStrings
        func section(_ kind: CVSectionKind, _ label: String?) -> String {
            let title = String(localized: L.sectionTitle(kind))
            return label.map { "\(title) · \($0)" } ?? title
        }
        let resource: LocalizedStringResource = switch self {
        case .created: L.changeCreated
        case .edited(let kind, let label): L.changeEdited(section(kind, label))
        case .added(let kind, let label): L.historyAdded(section(kind, label))
        case .removed(let kind, let label): L.historyRemoved(section(kind, label))
        case .reordered: L.changeReordered
        case .restored(let date): L.changeRestored(date)
        case .design(let name): L.changeDesign(name)
        case .imported(let fileName): L.changeImported(fileName)
        case .variant(let title): L.changeVariant(title)
        case .duplicate(let title): L.changeDuplicate(title)
        case .kept: L.changeKept
        }
        return String(String(localized: resource).prefix(2_000))
    }
}

extension CVEditorModel {
    // MARK: Ids

    func newID(_ prefix: String) -> String {
        writer?.makeID() ?? "\(prefix)-\(UUID().uuidString.lowercased())"
    }

    // MARK: Writes

    /// Saves `content` as a new revision of the CV and makes it current.
    func commit(_ cvId: String, content: CvContent, summary: String, source: CvRevisionSource = .manual, basedOn: String? = nil) {
        guard let cv = data.cv(id: cvId) else { return }
        let revision = CvRevision(
            id: newID("rev"), cvId: cvId, content: content, source: source,
            basedOnRevisionId: basedOn ?? cv.currentRevisionId, jobId: nil, diffSummary: summary, createdAt: stamp
        )
        let changes = CVChanges(currentRevisionId: revision.id, templateId: content.meta.template, theme: content.meta.theme, updatedAt: stamp)
        update(cvId, changes, revision: revision)
    }

    /// Applies `changes` (and `revision`) locally and sends them.
    func update(_ cvId: String, _ changes: CVChanges, revision: CvRevision? = nil, isRetry: Bool = false) {
        guard let index = data.cvs.firstIndex(where: { $0.id == cvId }) else { return }
        let previousVersion = data.cvs[index].version
        data.cvs[index] = changes.applied(to: data.cvs[index])
        if let revision { data.cvRevisions.append(revision) }
        recordWrite(cvId)
        recompute()
        guard let writer else { return }
        Task {
            do {
                try await writer.update(cvId: cvId, previousVersion: previousVersion, changes: changes, revision: revision)
            } catch {
                saveFailed(cvId, (error as? CVWriteError) ?? .failed(String(describing: error)), changes: changes, revision: revision, isRetry: isRetry)
            }
        }
    }

    private func saveFailed(_ cvId: String, _ error: CVWriteError, changes: CVChanges, revision: CvRevision?, isRetry: Bool) {
        guard let cv = data.cv(id: cvId) else { return }
        switch (error, revision) {
        case (.conflict, let revision?):
            // Keep this device's version as a revision of its own, then let the user choose.
            drafts[cvId] = CVDraft(content: drafts[cvId]?.content ?? revision.content, state: .conflict(mine: revision))
            if let writer {
                Task { try? await writer.createRevision(revision) }
            }
        case (.conflict, nil) where !isRetry:
            // Metadata only (rename, archive): apply it again on top of the other device's write.
            update(cvId, changes, isRetry: true)
        default:
            let content = revision?.content ?? drafts[cvId]?.content ?? content(of: cv)
            guard let content else { return }
            drafts[cvId] = CVDraft(content: content, state: .failed(changes: revision == nil ? changes : nil))
        }
        pendingSyncIDs.remove(cvId)
        recompute()
    }

    /// Creates a CV with its first revision and opens it. Returns its id.
    @discardableResult
    func createCv(
        title: String, language: String, content: CvContent, source: CvRevisionSource, summary: String,
        parentCvId: String? = nil, basedOnRevisionId: String? = nil, importedFrom: CvImportedFile? = nil
    ) -> String {
        let id = newID("cv")
        let revision = CvRevision(
            id: newID("rev"), cvId: id, content: content, source: source,
            basedOnRevisionId: basedOnRevisionId, jobId: nil, diffSummary: summary, createdAt: stamp
        )
        let cv = Cv(
            id: id, title: String(title.prefix(120)), language: language, parentCvId: parentCvId, currentRevisionId: revision.id,
            templateId: content.meta.template, theme: content.meta.theme,
            isDefault: parentCvId == nil && !data.cvs.contains { $0.archivedAt == nil },
            archivedAt: nil, version: 1, importedFrom: importedFrom, createdAt: stamp, updatedAt: stamp
        )
        data.cvs.append(cv)
        data.cvRevisions.append(revision)
        recordWrite(id)
        select(cvId: id)
        if let writer {
            Task {
                do {
                    try await writer.create(cv, revision: revision)
                } catch {
                    notice = .createFailed
                }
            }
        }
        return id
    }

    // MARK: Failed saves

    /// "Couldn't save · Try again": sends the kept content (and metadata) again.
    public func retrySave() {
        guard let cvId = document?.id, let draft = drafts[cvId], case .failed(let changes) = draft.state else { return }
        drafts[cvId] = nil
        if var changes {
            changes.updatedAt = stamp
            update(cvId, changes)
        }
        if let cv = data.cv(id: cvId), data.revision(id: cv.currentRevisionId)?.content != draft.content {
            commit(cvId, content: draft.content, summary: CVChangeSummary.kept.text)
        } else {
            recompute()
        }
    }

    // MARK: Conflicts

    /// The selected CV's version conflict, if any.
    public var conflict: CVConflictInfo? {
        guard let document, let draft = drafts[document.id], case .conflict = draft.state,
              let cv = data.cv(id: document.id) else { return nil }
        return CVConflictInfo(
            otherSavedAt: cv.updatedAt,
            otherContent: data.revision(id: cv.currentRevisionId)?.content,
            mineContent: draft.content
        )
    }

    /// Keep this version: this device's content becomes current again (a new version on top of
    /// the other device's, which stays in history).
    public func keepThisVersion() {
        guard let cvId = document?.id, let draft = drafts[cvId], case .conflict(let mine) = draft.state,
              let cv = data.cv(id: cvId) else { return }
        drafts[cvId] = nil
        if mine.content == draft.content {
            update(cvId, CVChanges(currentRevisionId: mine.id, templateId: mine.content.meta.template,
                                   theme: mine.content.meta.theme, updatedAt: stamp))
        } else {
            commit(cvId, content: draft.content, summary: CVChangeSummary.kept.text, basedOn: cv.currentRevisionId)
        }
    }

    /// Use the other version: drop this device's draft (it stays in history as its own version).
    public func useOtherVersion() {
        guard let cvId = document?.id, case .conflict = drafts[cvId]?.state else { return }
        drafts[cvId] = nil
        recompute()
    }

    // MARK: History

    /// The content of one of the selected CV's revisions (revision viewer).
    public func revisionContent(_ revisionId: String) -> CvContent? {
        data.revision(id: revisionId)?.content
    }

    public func revision(_ revisionId: String) -> CvRevision? { data.revision(id: revisionId) }

    /// Restore this version: a new revision with the old content (the current one stays in
    /// history). Not offered for the current revision or while a conflict is open.
    @discardableResult
    public func restore(revisionId: String) -> Bool {
        guard let cvId = document?.id, let cv = data.cv(id: cvId), cv.currentRevisionId != revisionId,
              let revision = data.revision(id: revisionId), revision.cvId == cvId, conflict == nil else { return false }
        drafts[cvId] = nil
        commit(cvId, content: revision.content, summary: CVChangeSummary.restored(revision.createdAt).text, basedOn: revision.id)
        return true
    }

    // MARK: Template and theme

    /// Template picker "Done": one revision for the design change.
    public func applyDesign(templateId: String, theme: CvTheme, templateName: String) {
        editContent(of: document?.id ?? "", .design(templateName: templateName)) { content in
            guard content.meta.template != templateId || content.meta.theme != theme else { return false }
            content.meta.template = templateId
            content.meta.theme = theme
            return true
        }
    }

    // MARK: Copies and variants

    /// A CV's current content, read from the server when it isn't loaded.
    func currentContent(of cvId: String) async -> CvContent? {
        guard let cv = data.cv(id: cvId) else { return nil }
        if let content = content(of: cv) { return content }
        guard let writer else { return nil }
        return try? await writer.revision(cvId: cvId, revisionId: cv.currentRevisionId).content
    }

    /// Duplicate: an independent copy next to the original (same base, if it's a variant).
    @discardableResult
    public func duplicate(cvId: String) async -> String? {
        guard let cv = data.cv(id: cvId) else { return nil }
        guard let content = await currentContent(of: cvId) else {
            notice = .readFailed
            return nil
        }
        return createCv(
            title: String(localized: CVEditorViewStrings.copyTitle(cv.title)), language: cv.language, content: content,
            source: .manual, summary: CVChangeSummary.duplicate(of: cv.title).text,
            parentCvId: cv.parentCvId, basedOnRevisionId: cv.currentRevisionId
        )
    }

    /// The base a new variant hangs under: variants of variants attach to the root base.
    private func variantBase(of cvId: String) -> Cv? {
        guard let cv = data.cv(id: cvId) else { return nil }
        return cv.parentCvId.flatMap { data.cv(id: $0) } ?? cv
    }

    /// New role variant: a copy titled with the role label, same language.
    @discardableResult
    public func newRoleVariant(of cvId: String, label: String) async -> String? {
        guard let source = data.cv(id: cvId), let base = variantBase(of: cvId), let label = label.nilIfBlank else { return nil }
        guard let content = await currentContent(of: cvId) else {
            notice = .readFailed
            return nil
        }
        return createCv(
            title: label, language: source.language, content: content, source: .manual,
            summary: CVChangeSummary.variant(of: source.title).text,
            parentCvId: base.id, basedOnRevisionId: source.currentRevisionId
        )
    }

    /// New language variant, optionally translated by Claude field by field (each field goes
    /// through the same grounded `cvAssist` translate as ✦ Improve). Nothing is created when the
    /// translation fails.
    @discardableResult
    public func newLanguageVariant(of cvId: String, language: String, translate: Bool) async -> String? {
        guard let source = data.cv(id: cvId), let base = variantBase(of: cvId), language != source.language else { return nil }
        guard var content = await currentContent(of: cvId) else {
            notice = .readFailed
            return nil
        }
        if translate {
            guard let provider = suggestionProvider else { return nil }
            let from = source.language
            do {
                try await content.translateTexts { text in
                    let request = CVAssistRequest(text: text, mode: .translate, language: from, targetLanguage: language)
                    return try await provider.suggestions(for: request).first?.text ?? text
                }
            } catch {
                notice = .translateFailed
                return nil
            }
        }
        let name = CVLanguageName.name(of: language)
        return createCv(
            title: "\(base.title) — \(name)", language: language, content: content, source: .manual,
            summary: CVChangeSummary.variant(of: source.title).text,
            parentCvId: base.id, basedOnRevisionId: source.currentRevisionId
        )
    }

    // MARK: Import

    /// Import review "Create CV": the reviewed content as a new CV with the original attached.
    @discardableResult
    public func createImported(_ content: CvContent, language: String, title: String, original: CvImportedFile) -> String {
        createCv(title: title, language: language, content: content, source: .import,
                 summary: CVChangeSummary.imported(fileName: original.fileName).text, importedFrom: original)
    }
}
