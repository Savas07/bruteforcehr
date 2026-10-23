import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// Changes | Page (revision viewer and Compare).
enum CVVersionPane: Hashable {
    case changes
    case page
}

// MARK: - Field changes

/// `FieldDiffTable` on iPhone: one row per changed field, grouped by section, "before → after"
/// with labels instead of colour alone.
struct CVFieldChangeList: View {
    let changes: [CVFieldChange]
    /// "Current version" / "Other device".
    let beforeLabel: LocalizedStringResource
    /// "This version" / "This device".
    let afterLabel: LocalizedStringResource
    let emptyMessage: LocalizedStringResource

    var body: some View {
        List {
            if changes.isEmpty {
                Section { Text(emptyMessage).foregroundStyle(BFHRColor.Fg.secondary) }
            }
            ForEach(groups, id: \.title) { group in
                Section {
                    ForEach(group.changes) { change in row(change) }
                } header: {
                    Text(verbatim: group.title).cvListHeader()
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private var groups: [(title: String, changes: [CVFieldChange])] {
        var result: [(title: String, changes: [CVFieldChange])] = []
        for change in changes {
            let title = String(localized: L.diffSection(change.section))
            if result.last?.title == title {
                result[result.count - 1].changes.append(change)
            } else {
                result.append((title, [change]))
            }
        }
        return result
    }

    private func row(_ change: CVFieldChange) -> some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
            Text(fieldTitle(change))
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            value(beforeLabel, change.before, struck: true)
            value(afterLabel, change.after, struck: false)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private func fieldTitle(_ change: CVFieldChange) -> String {
        var parts: [String] = []
        if let item = change.item { parts.append(item) }
        var field = String(localized: L.diffField(change.field))
        if let position = change.position { field += " \(position)" }
        parts.append(field)
        return parts.joined(separator: " › ")
    }

    private func value(_ label: LocalizedStringResource, _ text: String?, struck: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
            Text(label)
                .font(.bfhr(.caption1, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.secondary)
            Group {
                if let text {
                    Text(verbatim: text).strikethrough(struck, color: BFHRColor.Fg.secondary)
                } else {
                    Text(L.diffEmpty).italic()
                }
            }
            .font(.bfhr(.body))
            .foregroundStyle(struck ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Revision viewer

/// A version from history, read-only (Notion): timestamp title, Changes | Page, Restore.
struct CVRevisionViewer: View {
    let model: CVEditorModel
    let revisionId: String
    @Environment(\.dismiss) private var dismiss
    @State private var pane: CVVersionPane = .changes
    @State private var confirmsRestore = false

    var body: some View {
        Group {
            if let revision = model.revision(revisionId), let document = model.document {
                content(revision, document)
            } else {
                PaneError(LoadFailure(.notFound))
            }
        }
        .navigationTitle(Text(model.revision(revisionId)?.createdAt ?? .now, format: .dateTime.day().month(.abbreviated).hour().minute()))
        .bfhrInlineTitle()
    }

    private func content(_ revision: CvRevision, _ document: CVDocument) -> some View {
        let isCurrent = revision.id == document.currentRevisionId
        return VStack(spacing: 0) {
            Picker(selection: $pane) {
                Text(L.paneChanges).tag(CVVersionPane.changes)
                Text(L.panePage).tag(CVVersionPane.page)
            } label: { Text(L.segmentLabel) }
                .pickerStyle(.segmented)
                .padding(.horizontal, BFHRSpace.s4)
                .padding(.vertical, BFHRSpace.s2)
            switch pane {
            case .changes:
                CVFieldChangeList(
                    changes: CVFieldDiff.changes(from: document.content, to: revision.content),
                    beforeLabel: L.currentVersion, afterLabel: L.thisVersion,
                    emptyMessage: isCurrent ? L.isCurrentVersion : L.sameAsCurrent
                )
            case .page:
                switch model.render(revision.content, language: document.language) {
                case .success(let rendered):
                    CVRenderedPage(rendered: rendered, templateName: model.catalog()?.templateName(revision.content.meta.template) ?? revision.content.meta.template)
                case .failure(let error):
                    PaneError(LoadFailure(.unknown, details: String(describing: error)), title: L.previewFailedTitle, message: L.previewFailedBody)
                }
            }
        }
        .background(BFHRColor.groupedBackground)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !isCurrent {
                Button { confirmsRestore = true } label: { Text(L.restoreVersion) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .disabled(model.conflict != nil)
                    .padding(.horizontal, BFHRSpace.s4)
                    .padding(.vertical, BFHRSpace.s3)
                    .background(.bar)
                    .accessibilityIdentifier("cv.history.restore")
            }
        }
        .confirmationDialog(Text(L.restoreTitle(revision.createdAt)), isPresented: $confirmsRestore, titleVisibility: .visible) {
            Button { if model.restore(revisionId: revision.id) { dismiss() } } label: { Text(L.restore) }
            Button(role: .cancel) {} label: { Text(L.cancel) }
        } message: {
            Text(L.restoreBody)
        }
    }
}

// MARK: - Conflict

/// The `cv.conflict` banner (states.md): this device's version vs the one saved elsewhere.
/// Neither choice loses anything: this device's version is already a revision of its own.
struct CVConflictBanner: View {
    let model: CVEditorModel
    let conflict: CVConflictInfo
    let onCompare: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                Image(systemName: "arrow.triangle.branch").foregroundStyle(BFHRColor.Fg.secondary).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    Text(L.conflictTitle).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                    Text(L.conflictBody(conflict.otherSavedAt)).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            ButtonPair {
                Button { model.keepThisVersion() } label: { Text(L.keepThisVersion) }
                    .accessibilityIdentifier("cv.conflict.keep")
            } secondary: {
                Button { model.useOtherVersion() } label: { Text(L.useOtherVersion) }
                    .accessibilityIdentifier("cv.conflict.useOther")
            }
            Button(action: onCompare) { Text(L.compare) }
                .buttonStyle(.bfhr(.plain))
                .accessibilityIdentifier("cv.conflict.compare")
        }
        .padding(BFHRSpace.s4)
        .background(BFHRColor.Surface.elevated, in: BFHRRadius.shape(BFHRRadius.md))
        .overlay(BFHRRadius.shape(BFHRRadius.md).strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.hairline))
        .accessibilityElement(children: .contain)
    }
}

/// Compare versions: Changes (whose value is whose) | Page (the two renders as a pager).
struct CVCompareView: View {
    let model: CVEditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var pane: CVVersionPane = .changes
    @State private var page = 0

    var body: some View {
        NavigationStack {
            Group {
                if let conflict = model.conflict, let document = model.document {
                    content(conflict, document)
                } else {
                    // Resolved (here or on the banner): nothing left to compare.
                    Color.clear.onAppear { dismiss() }
                }
            }
            .navigationTitle(Text(L.compareTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(L.close) }
                }
            }
        }
    }

    private func content(_ conflict: CVConflictInfo, _ document: CVDocument) -> some View {
        VStack(spacing: 0) {
            Picker(selection: $pane) {
                Text(L.paneChanges).tag(CVVersionPane.changes)
                Text(L.panePage).tag(CVVersionPane.page)
            } label: { Text(L.segmentLabel) }
                .pickerStyle(.segmented)
                .padding(.horizontal, BFHRSpace.s4)
                .padding(.vertical, BFHRSpace.s2)
            switch pane {
            case .changes:
                if let other = conflict.otherContent {
                    CVFieldChangeList(changes: CVFieldDiff.changes(from: other, to: conflict.mineContent),
                                      beforeLabel: L.otherDevice(conflict.otherSavedAt), afterLabel: L.thisDevice, emptyMessage: L.sameVersions)
                } else {
                    ProgressNote(L.loadingOtherVersion).frame(maxHeight: .infinity)
                }
            case .page:
                pager(conflict, document)
            }
        }
        .background(BFHRColor.groupedBackground)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ButtonPair {
                Button { model.keepThisVersion() } label: { Text(L.keepThisVersion) }
            } secondary: {
                Button { model.useOtherVersion() } label: { Text(L.useOtherVersion) }
            }
            .padding(.horizontal, BFHRSpace.s4)
            .padding(.vertical, BFHRSpace.s3)
            .background(.bar)
        }
    }

    @ViewBuilder
    private func pager(_ conflict: CVConflictInfo, _ document: CVDocument) -> some View {
        let versions: [(LocalizedStringResource, CvContent?)] = [(L.thisDevice, conflict.mineContent), (L.otherDevice(conflict.otherSavedAt), conflict.otherContent)]
        TabView(selection: $page) {
            ForEach(Array(versions.enumerated()), id: \.offset) { index, version in
                Group {
                    if let content = version.1, case .success(let rendered) = model.render(content, language: document.language) {
                        CVRenderedPage(rendered: rendered, templateName: model.catalog()?.templateName(content.meta.template) ?? content.meta.template)
                    } else {
                        ProgressNote(L.loadingOtherVersion)
                    }
                }
                .overlay(alignment: .bottom) {
                    Text(L.versionPill(version.0, index + 1, versions.count))
                        .font(.bfhr(.footnote, emphasized: true))
                        .padding(.horizontal, BFHRSpace.s3)
                        .padding(.vertical, BFHRSpace.s1)
                        .background(.regularMaterial, in: Capsule())
                        .padding(.bottom, BFHRSpace.s3)
                }
                .tag(index)
            }
        }
        #if os(iOS)
        .tabViewStyle(.page(indexDisplayMode: .never))
        #endif
    }
}
