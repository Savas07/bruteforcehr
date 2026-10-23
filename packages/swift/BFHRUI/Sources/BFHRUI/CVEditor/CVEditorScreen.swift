import BFHRCore
import BFHRDesignTokens
import SwiftUI
import UniformTypeIdentifiers

private typealias L = CVEditorViewStrings

/// The CVs tab (cv-editor.md "Decision — iOS"): base CVs with their variants beneath, and the
/// selected CV pushed over the list (`CVDocumentView`: Edit · Preview). "+" imports a file or
/// starts from scratch; each row's context menu holds the CV actions.
public struct CVEditorScreen: View {
    @Bindable private var model: CVEditorModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.bfhrReload) private var reload
    @State private var prompt: CVActionPrompt?
    @State private var picksFile = false
    @State private var importFlow: CVImportFlow?

    public init(model: CVEditorModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: L.loading) {
            if isFirstUse {
                EmptyState(
                    .firstUse,
                    glyph: "doc.text",
                    title: L.emptyTitle,
                    message: model.importer == nil ? L.emptyBody : L.emptyBodyImport,
                    primary: model.importer == nil ? .init(L.startFromScratch) { model.startFromScratch() } : .init(L.importCV) { picksFile = true },
                    secondary: model.importer == nil ? nil : .init(L.startFromScratch) { model.startFromScratch() }
                )
            } else {
                list
            }
        } skeleton: {
            CVListSkeleton()
        } failure: { failure in
            PaneError(failure, title: L.errorTitle, retry: reload)
        }
        .toolbar { toolbar }
        .navigationDestination(item: selection) { _ in
            // Destinations take the stack's environment, so hand over what this screen set.
            CVDocumentView(model: model)
                .environment(\.bfhrReload, reload)
                .environment(\.bfhrNow, model.now)
        }
        .cvActionPrompts($prompt, model: model)
        .fileImporter(isPresented: $picksFile, allowedContentTypes: CVImportPicker.contentTypes) { result in
            if case .success(let url) = result { startImport(url) }
        }
        .sheet(item: $importFlow) { flow in
            CVImportSheet(flow: flow, editor: model) {
                importFlow = nil
                picksFile = true
            }
        }
        .onChange(of: model.notice) { _, notice in
            guard let notice else { return }
            toasts?.show(ToastItem(glyph: "exclamationmark.circle", message: L.notice(notice)))
            model.notice = nil
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        #if DEBUG
        .task {
            if CVDesignPane.opensList, CVDesignPane.takeLaunchPane() == .import { openDesignImport() }
        }
        #endif
    }

    /// No CVs at all, archived ones included.
    private var isFirstUse: Bool { model.isEmpty && model.archivedCount == 0 }

    private var selection: Binding<String?> {
        Binding(get: { model.selectedCvId }, set: { model.select(cvId: $0) })
    }

    private func startImport(_ url: URL) {
        guard let importer = model.importer else { return }
        let flow = CVImportFlow(fileName: url.lastPathComponent, importer: importer, timezone: model.data.profile?.timezone,
                                uiLanguage: model.data.profile?.uiLanguage.rawValue ?? CVEditorModel.uiLanguage)
        importFlow = flow
        let engine = model.renderEngine
        let now = model.usesSystemClock ? Date.now : model.now
        Task {
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            guard let kind = CVImportFileKind(fileExtension: url.pathExtension) else {
                await flow.fail(.unsupported)
                return
            }
            guard let data = try? Data(contentsOf: url) else {
                await flow.fail(.unreadable)
                return
            }
            await flow.run(data: data, kind: kind, renderEngine: engine, now: now)
        }
    }

    #if DEBUG
    private func openDesignImport() {
        guard let importer = model.importer else { return }
        let flow = CVImportFlow(fileName: "CV_2025.pdf", importer: importer, timezone: model.data.profile?.timezone, uiLanguage: "en")
        importFlow = flow
        let engine = model.renderEngine, now = model.now
        Task { await flow.run(data: Data("design".utf8), kind: .pdf, renderEngine: engine, now: now) }
    }
    #endif

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        // First use: the empty state's buttons are the way in, so no "+" twin.
        if model.isLoaded && !isFirstUse {
            ToolbarItem(placement: .bfhrTrailing) {
                Menu {
                    if model.importer != nil {
                        Button { picksFile = true } label: { Label { Text(L.importFile) } icon: { Image(systemName: "square.and.arrow.down") } }
                    }
                    Button { model.startFromScratch() } label: { Label { Text(L.startFromScratch) } icon: { Image(systemName: "doc.badge.plus") } }
                } label: {
                    Label { Text(L.newCV) } icon: { Image(systemName: "plus") }
                }
                .accessibilityIdentifier("cv.new")
            }
            if model.archivedCount > 0 {
                ToolbarItem(placement: .bfhrTrailing) {
                    Menu {
                        Picker(selection: $model.filter) {
                            Text(L.filterAll).tag(CVListFilter.all)
                            Text(L.filterArchived(model.archivedCount)).tag(CVListFilter.archived)
                        } label: { Text(L.filter) }
                        .pickerStyle(.inline)
                    } label: {
                        Label { Text(L.filter) } icon: {
                            Image(systemName: model.filter == .all ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                        }
                    }
                }
            }
        }
    }

    private var list: some View {
        List {
            ConnectionBannerSection(model.connection)
            if model.groups.isEmpty {
                // Every CV archived (All), or nothing archived left after Restore (Archived).
                Section {
                    Text(model.filter == .archived ? L.nothingArchived : L.allArchived)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            ForEach(model.groups) { group in
                Section {
                    ForEach([group.base] + group.variants) { row in
                        Button { model.select(cvId: row.id) } label: {
                            CVListRowView(row: row, isNestedVariant: row.isVariant && row.parentCvId == group.base.id,
                                          isPending: model.pendingSyncIDs.contains(row.id))
                        }
                        .accessibilityIdentifier("cv.row.\(row.id)")
                        .bfhrRowActions(actions(for: row))
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private func actions(for row: CVListRow) -> [RowAction] {
        if row.isArchived {
            return [RowAction(L.restore, systemImage: "arrow.uturn.backward", edge: .leading) { model.unarchive(cvId: row.id) }]
        }
        let id = row.id
        return [
            RowAction(L.duplicate, systemImage: "plus.square.on.square", edge: .menuOnly) { Task { await model.duplicate(cvId: id) } },
            RowAction(L.newRoleVariant, systemImage: "person.crop.rectangle.stack", edge: .menuOnly) { prompt = .roleVariant(cvId: id) },
            RowAction(L.newLanguageVariant, systemImage: "globe", edge: .menuOnly) { prompt = .languageVariant(cvId: id) },
            RowAction(L.rename, systemImage: "pencil", edge: .menuOnly) { prompt = .rename(cvId: id) },
            RowAction(L.archive, systemImage: "archivebox", edge: .trailing) {
                if let toast = model.archive(cvId: id) { toasts?.show(toast) }
            },
        ]
    }
}

/// The file types Import accepts: PDF, Word, JSON Resume and the LinkedIn data export (ZIP).
enum CVImportPicker {
    static var contentTypes: [UTType] {
        [.pdf, .json, .zip, UTType("org.openxmlformats.wordprocessingml.document")].compactMap { $0 }
    }
}

/// A CV row: title, kind ("Default" / "Deutsch" / "Role variant") and last edit.
struct CVListRowView: View {
    let row: CVListRow
    let isNestedVariant: Bool
    /// Changes made offline that haven't synced yet.
    var isPending = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(spacing: BFHRSpace.s3) {
            if isNestedVariant && !dynamicTypeSize.isAccessibilitySize {
                Image(systemName: "arrow.turn.down.right")
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: row.title)
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(caption)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if isPending { SyncGlyph() }
            Image(systemName: "chevron.forward")
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.tertiary)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    private var caption: LocalizedStringResource {
        let kind: LocalizedStringResource? = switch row.variantKind {
        case .language: L.languageVariant(CVLanguageName.name(of: row.language))
        case .role: L.roleVariant
        case nil: row.isDefault ? L.defaultCV : nil
        }
        if row.isArchived { return L.archivedOn(row.archivedAt ?? row.updatedAt) }
        return kind.map { L.kindAndEdited($0, row.updatedAt) } ?? L.edited(row.updatedAt)
    }
}

/// Language names in their own language ("Deutsch", "Türkçe", "English"), cv-editor.md copy notes.
enum CVLanguageName {
    static func name(of code: String) -> String {
        let locale = Locale(identifier: code)
        return locale.localizedString(forLanguageCode: code)?.capitalized(with: locale) ?? code
    }
}

/// The list skeleton: two CV rows in the real layout.
private struct CVListSkeleton: View {
    var body: some View {
        List {
            Section {
                ForEach(0..<2, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(verbatim: "Base CV — English").font(.bfhr(.headline))
                        Text(verbatim: "Default · Edited 10 Oct").font(.bfhr(.footnote))
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
    }
}
