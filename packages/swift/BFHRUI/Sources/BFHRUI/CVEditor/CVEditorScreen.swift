import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// The CVs tab (cv-editor.md "Decision — iOS"): base CVs with their variants beneath, and the
/// selected CV pushed over the list (`CVDocumentView`: Edit · Preview).
public struct CVEditorScreen: View {
    @Bindable private var model: CVEditorModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    public init(model: CVEditorModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: L.loading) {
            if model.isEmpty && model.filter == .all {
                EmptyState(
                    .firstUse,
                    glyph: "doc.text",
                    title: L.emptyTitle,
                    message: L.emptyBody,
                    primary: .init(L.startFromScratch) { model.startFromScratch() }
                )
            } else {
                list
            }
        } skeleton: {
            CVListSkeleton()
        } failure: { failure in
            PaneError(failure, title: L.errorTitle, retry: model.reload.map { reload in { reload() } })
        }
        .toolbar { toolbar }
        .navigationDestination(item: selection) { _ in
            CVDocumentView(model: model)
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
    }

    private var selection: Binding<String?> {
        Binding(get: { model.selectedCvId }, set: { model.select(cvId: $0) })
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if model.isLoaded {
            ToolbarItem(placement: .bfhrTrailing) {
                Menu {
                    Button { model.startFromScratch() } label: { Label { Text(L.startFromScratch) } icon: { Image(systemName: "doc.badge.plus") } }
                } label: {
                    Label { Text(L.newCV) } icon: { Image(systemName: "plus") }
                }
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
                // Archived filter with nothing archived left (after Restore).
                Section { Text(L.nothingArchived).foregroundStyle(BFHRColor.Fg.secondary) }
            }
            ForEach(model.groups) { group in
                Section {
                    ForEach([group.base] + group.variants) { row in
                        Button { model.select(cvId: row.id) } label: {
                            CVListRowView(row: row, isNestedVariant: row.isVariant && row.parentCvId == group.base.id)
                        }
                        .bfhrRowActions(actions(for: row))
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private func actions(for row: CVListRow) -> [RowAction] {
        if row.isArchived {
            [RowAction(L.restore, systemImage: "arrow.uturn.backward", edge: .leading) { model.unarchive(cvId: row.id) }]
        } else {
            [RowAction(L.archive, systemImage: "archivebox", edge: .trailing) {
                if let toast = model.archive(cvId: row.id) { toasts?.show(toast) }
            }]
        }
    }
}

/// A CV row: title, kind ("Default" / "Deutsch" / "Role variant") and last edit.
struct CVListRowView: View {
    let row: CVListRow
    let isNestedVariant: Bool
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
