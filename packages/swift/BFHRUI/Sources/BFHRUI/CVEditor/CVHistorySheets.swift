import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// Version history (Canva / Mimo): versions by day, newest first, each a change sentence with
/// its source and time, "Current" on the version the CV shows. Opening and restoring a version
/// arrive with CV Studio (M2); every version is kept, so nothing is lost meanwhile.
struct CVHistorySheet: View {
    let model: CVEditorModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if model.document?.hasLocalEdits == true {
                    Section {
                        Label { Text(L.localEditsNote) } icon: { Image(systemName: "pencil") }
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                ForEach(model.revisionDays) { day in
                    Section {
                        ForEach(day.revisions) { revision in
                            CVRevisionRowView(revision: revision)
                        }
                    } header: {
                        Text(day.day, format: .dateTime.day().month(.wide).year()).cvListHeader()
                    }
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(L.versionHistory))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(L.done) }
                }
            }
        }
        .presentationDetents([.medium, .large])
        // Opaque, so text keeps its contrast over the CV behind the sheet.
        .presentationBackground(BFHRColor.groupedBackground)
    }
}

private struct CVRevisionRowView: View {
    let revision: CVRevisionRow

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Image(systemName: glyph)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .frame(minWidth: BFHRIconSize.lg)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                (revision.diffSummary.map { Text(verbatim: $0) } ?? Text(L.source(revision.source)))
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                HStack(spacing: BFHRSpace.s2) {
                    Text(L.sourceAndTime(L.source(revision.source), revision.createdAt))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                    if revision.isCurrent {
                        Text(L.current)
                            .font(.bfhr(.caption1, emphasized: true))
                            .foregroundStyle(BFHRColor.Accent.text)
                            .padding(.horizontal, BFHRSpace.s2)
                            .padding(.vertical, 2)
                            .background(BFHRColor.Accent.subtle, in: Capsule())
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var glyph: String {
        switch revision.source {
        case .manual: "pencil"
        case .import: "square.and.arrow.down"
        case .aiTailor: "sparkles"
        }
    }
}

/// Reorder sections: drag handles always on; Header and Summary stay first.
struct CVReorderSectionsSheet: View {
    let model: CVEditorModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let pinned = model.sections.filter(\.isPinned)
        let movable = model.sections.filter { !$0.isPinned }
        NavigationStack {
            List {
                Section {
                    ForEach(pinned) { section in
                        Label { Text(L.sectionTitle(section.kind)) } icon: { Image(systemName: "pin") }
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .moveDisabled(true)
                    }
                } footer: {
                    Text(L.pinnedFooter).cvListFooter()
                }
                Section {
                    ForEach(movable) { section in
                        Text(L.sectionTitle(section.kind))
                            .accessibilityActions {
                                let position = movable.firstIndex(of: section) ?? 0
                                if position > 0 {
                                    Button { model.moveSection(from: pinned.count + position, to: pinned.count + position - 1) } label: { Text(L.moveUp) }
                                }
                                if position < movable.count - 1 {
                                    Button { model.moveSection(from: pinned.count + position, to: pinned.count + position + 1) } label: { Text(L.moveDown) }
                                }
                            }
                    }
                    .onMove { source, destination in
                        guard let from = source.first else { return }
                        let to = destination > from ? destination - 1 : destination
                        model.moveSection(from: pinned.count + from, to: pinned.count + to)
                    }
                } footer: {
                    Text(L.reorderFooter).cvListFooter()
                }
            }
            .bfhrInsetGroupedList()
            #if os(iOS)
            .environment(\.editMode, .constant(.active))
            #endif
            .navigationTitle(Text(L.reorderSections))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(L.done) }
                }
            }
        }
        .presentationDetents([.medium, .large])
        // Opaque, so text keeps its contrast over the CV behind the sheet.
        .presentationBackground(BFHRColor.groupedBackground)
    }
}
