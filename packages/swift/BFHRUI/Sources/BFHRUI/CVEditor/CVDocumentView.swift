import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// The Edit · Preview switch (Mimo Build / Preview).
enum CVSegment: Hashable, CaseIterable {
    case edit
    case preview
}

/// Sheets the CV screen presents.
enum CVEditorSheet: Identifiable, Hashable {
    case item(CVSectionKind, index: Int)
    case newItem(CVSectionKind)
    case header
    case summary
    case history
    case reorder
    case template
    case export
    case compare

    var id: String {
        switch self {
        case .item(let kind, let index): "item.\(kind.orderKey).\(index)"
        case .newItem(let kind): "new.\(kind.orderKey)"
        case .header: "header"
        case .summary: "summary"
        case .history: "history"
        case .reorder: "reorder"
        case .template: "template"
        case .export: "export"
        case .compare: "compare"
        }
    }
}

/// The selected CV, pushed over the CVs list: inline title = CV name, the sync status as the
/// subtitle, Edit · Preview pinned under the bar, Template in the toolbar and a "…" menu with the
/// CV's versions (base + variants), Version history, Reorder sections, Export, the CV actions and
/// Archive.
struct CVDocumentView: View {
    @Bindable var model: CVEditorModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.bfhrReload) private var reload
    @State private var segment: CVSegment = .edit
    @State private var sheet: CVEditorSheet?
    @State private var prompt: CVActionPrompt?
    @State private var sharing = false
    @State private var shareFile: CVExportFile?
    @State private var shareFailed = false
    @State private var tailors = false
    @Environment(\.bfhrTailoring) private var tailoring
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    #if os(iOS)
    @State private var editMode: EditMode = .inactive
    #endif

    var body: some View {
        PhaseContainer(model.phase, loadingLabel: L.loadingCV) {
            if let document = model.document {
                content(document)
            } else {
                PaneError(LoadFailure(.notFound), goBack: { model.select(cvId: nil) })
            }
        } skeleton: {
            // The real Edit · Preview bar sits over the skeleton, so nothing jumps when data lands.
            CVFormSkeleton()
                .modifier(CVTopBar { segmentBar.disabled(true) })
        } failure: { failure in
            PaneError(failure, title: L.errorTitleCV, retry: reload, goBack: { model.select(cvId: nil) })
        }
        .navigationTitle(Text(verbatim: model.document?.title ?? ""))
        .bfhrInlineTitle()
        .modifier(CVSyncSubtitle(status: model.isLoaded ? model.syncStatus : nil))
        .toolbar { toolbar }
        .sheet(item: $sheet) { sheet in
            CVSheetContent(model: model, sheet: sheet)
                .environment(\.bfhrNow, model.now)
        }
        .sheet(isPresented: $tailors) {
            if let tailoring, let document = model.document {
                CVTailorSheet(
                    tailoring: tailoring, cvId: document.id, revisionId: document.currentRevisionId,
                    cvTitle: document.title, language: document.language
                )
            }
        }
        .cvActionPrompts($prompt, model: model)
        .cvShareSheet($shareFile)
        .alert(Text(L.exportFailedTitle), isPresented: $shareFailed) {
            Button { } label: { Text(L.ok) }
        } message: {
            Text(L.exportFailedBody)
        }
        .bfhrToastHost()
        .onChange(of: segment) { _, _ in endEditing() }
        .onChange(of: model.selectedCvId) { _, _ in endEditing() }
        #if DEBUG
        .task { applyDesignPane() }
        #endif
    }

    // MARK: Content

    private func content(_ document: CVDocument) -> some View {
        Group {
            switch segment {
            case .edit:
                CVEditSegment(model: model, document: document, sheet: $sheet)
                #if os(iOS)
                    .environment(\.editMode, $editMode)
                #endif
            case .preview:
                CVPreviewSegment(model: model, document: document, onExport: { sheet = .export }, onShare: sharePDF)
            }
        }
        .modifier(CVTopBar { segmentBar })
    }

    private var segmentBar: some View {
        Picker(selection: $segment) {
            Text(L.segmentEdit).tag(CVSegment.edit)
            Text(L.segmentPreview).tag(CVSegment.preview)
        } label: {
            Text(L.segmentLabel)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s2)
        .accessibilityIdentifier("cv.segment")
    }

    /// Preview "Share PDF": the default name and paper, straight to the share sheet.
    private func sharePDF() {
        guard !sharing else { return }
        sharing = true
        Task {
            defer { sharing = false }
            do {
                shareFile = try await CVExporter.file(model, format: .pdf, paper: model.document?.content.meta.theme.paperSize ?? .a4,
                                                      fileName: model.exportFileName(format: .pdf))
            } catch {
                shareFailed = true
            }
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if model.isLoaded, let document = model.document {
            ToolbarItemGroup(placement: .bfhrTrailing) {
                if segment == .edit {
                    #if os(iOS)
                    Button {
                        withAnimation(BFHRMotion.animation(.base, reduceMotion: reduceMotion)) { editMode = editMode.isEditing ? .inactive : .active }
                    } label: {
                        if editMode.isEditing {
                            Text(L.done).fontWeight(.semibold)
                        } else {
                            Label { Text(L.reorder) } icon: { Image(systemName: "arrow.up.arrow.down") }
                        }
                    }
                    .accessibilityIdentifier("cv.reorderItems")
                    #endif
                }
                Button { sheet = .template } label: {
                    Label { Text(L.templateTitle) } icon: { Image(systemName: "paintpalette") }
                }
                .accessibilityIdentifier("cv.template")
                moreMenu(document)
            }
        }
    }

    private func moreMenu(_ document: CVDocument) -> some View {
        Menu {
            if let group = model.selectedGroup, !group.variants.isEmpty {
                Section {
                    ForEach([group.base] + group.variants) { row in
                        Button { model.select(cvId: row.id) } label: {
                            Label {
                                Text(verbatim: row.title)
                                Text(row.variantKind == nil ? L.baseCV : row.variantKind == .language ? L.languageVariant(CVLanguageName.name(of: row.language)) : L.roleVariant)
                            } icon: {
                                Image(systemName: row.id == document.id ? "checkmark" : row.variantKind == nil ? "doc.text" : "doc.on.doc")
                            }
                        }
                        .accessibilityAddTraits(row.id == document.id ? .isSelected : [])
                    }
                } header: {
                    Text(L.versionsOfThisCV)
                }
            }
            if tailoring != nil, !document.isArchived {
                Section {
                    Button { tailors = true } label: {
                        Label { Text(ApplyStrings.tailorForJob) } icon: { Image(systemName: "sparkles") }
                    }
                    .accessibilityIdentifier("cv.tailor")
                }
            }
            Section {
                Button { sheet = .history } label: { Label { Text(L.versionHistory) } icon: { Image(systemName: "clock.arrow.circlepath") } }
                Button { sheet = .reorder } label: { Label { Text(L.reorderSections) } icon: { Image(systemName: "list.bullet.indent") } }
                Button { sheet = .export } label: { Label { Text(L.exportOptions) } icon: { Image(systemName: "square.and.arrow.up") } }
            }
            CVActionItems(model: model, cvId: document.id, prompt: $prompt)
            if let original = document.importedFrom {
                Section {
                    Label {
                        Text(L.originalFile)
                        Text(verbatim: original.fileName)
                    } icon: { Image(systemName: "paperclip") }
                } header: {
                    Text(L.importedFrom)
                }
            }
            if !document.isArchived {
                Section {
                    Button {
                        let toast = model.archive(cvId: document.id)
                        model.select(cvId: nil)
                        if let toast { toasts?.show(toast) }
                    } label: {
                        Label { Text(L.archiveCV) } icon: { Image(systemName: "archivebox") }
                    }
                }
            }
        } label: {
            Label { Text(L.more) } icon: { Image(systemName: "ellipsis") }
        }
        .accessibilityIdentifier("cv.more")
    }

    private func endEditing() {
        #if os(iOS)
        editMode = .inactive
        #endif
    }

    #if DEBUG
    /// Design mode: `-BFHRCVPane preview|item|assist|summary|history|reorder|template|export|conflict|tailor`
    /// opens one pane for critique captures and UI tests (once per launch).
    private func applyDesignPane() {
        guard let pane = CVDesignPane.takeLaunchPane() else { return }
        switch pane {
        case .preview: segment = .preview
        case .item, .assist: sheet = .item(.work, index: 0)
        case .summary: sheet = .summary
        case .history: sheet = .history
        case .reorder: sheet = .reorder
        case .template: sheet = .template
        case .export: sheet = .export
        case .conflict: model.simulateConflict()
        case .revision: sheet = .history
        case .languageVariant: if let id = model.document?.id { prompt = .languageVariant(cvId: id) }
        case .import: break
        case .tailor: tailors = tailoring != nil
        case .compare:
            model.simulateConflict()
            sheet = .compare
        }
    }
    #endif
}

/// The CV screen's sheets (shared with the import review).
struct CVSheetContent: View {
    let model: CVEditorModel
    let sheet: CVEditorSheet

    var body: some View {
        switch sheet {
        case .item(let kind, let index):
            if let draft = model.itemDraft(sectionKind: kind, at: index) {
                CVItemEditorSheet(model: model, kind: kind, index: index, draft: draft)
            }
        case .newItem(let kind):
            CVItemEditorSheet(model: model, kind: kind, index: nil, draft: CVItemDraft())
        case .header:
            CVHeaderSheet(model: model, draft: model.headerDraft)
        case .summary:
            CVSummarySheet(model: model, text: model.summaryText)
        case .history:
            CVHistorySheet(model: model)
        case .reorder:
            CVReorderSectionsSheet(model: model)
        case .template:
            CVTemplatePicker(model: model)
        case .export:
            CVExportSheet(model: model)
        case .compare:
            CVCompareView(model: model)
        }
    }
}


/// Edit · Preview pinned under the navigation bar: a scroll-edge bar on iOS 26, an inset with
/// the bar material before.
private struct CVTopBar<Bar: View>: ViewModifier {
    @ViewBuilder let bar: () -> Bar

    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *) {
            content.safeAreaBar(edge: .top) { bar() }
        } else {
            content.safeAreaInset(edge: .top, spacing: 0) { bar().background(.bar) }
        }
    }
}

/// The sync status as the navigation subtitle ("Saved · 10 Oct, 09:30").
private struct CVSyncSubtitle: ViewModifier {
    let status: CVSyncStatus?

    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *), let status {
            content.navigationSubtitle(Text(CVEditorViewStrings.sync(status)))
        } else {
            content
        }
    }
}

/// The CV theme's accent colour (user data, e.g. "#2F5D8A"); it colours the page only, never UI.
enum CVThemeColor {
    static func color(hex: String) -> Color {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return .gray }
        return Color(
            .sRGB,
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

/// The Edit skeleton: section cards in the real layout under the real nav bar.
private struct CVFormSkeleton: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    Text(verbatim: "Deniz Aksoy").font(.bfhr(.title3))
                    Text(verbatim: "Frontend & Product Engineer").font(.bfhr(.subheadline))
                }
            }
            Section {
                Text(verbatim: "Frontend engineer with five years of experience building fast product UIs.")
                    .font(.bfhr(.body))
            }
            ForEach(0..<2, id: \.self) { _ in
                Section {
                    ForEach(0..<2, id: \.self) { _ in
                        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                            Text(verbatim: "Frontend Engineer").font(.bfhr(.headline))
                            Text(verbatim: "Company · Mar 2022 – Present").font(.bfhr(.subheadline))
                        }
                    }
                } header: {
                    Text(verbatim: "Experience")
                }
            }
        }
        .bfhrInsetGroupedList()
    }
}
