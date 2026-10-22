import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Foundation rendering of `CVEditorModel`: the CVs list (or its empty state) and, with a CV
/// selected, its Edit sections as a plain list with the shared components. The screen's real
/// design replaces this file.
public struct CVEditorScreen: View {
    @Bindable private var model: CVEditorModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    public init(model: CVEditorModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: CVEditorViewStrings.loading) {
            if let document = model.document {
                editor(document)
            } else if model.isEmpty {
                EmptyState(
                    .firstUse,
                    glyph: "doc.text",
                    title: CVEditorViewStrings.emptyTitle,
                    message: CVEditorViewStrings.emptyBody,
                    primary: .init(CVEditorViewStrings.importCV) {},
                    secondary: .init(CVEditorViewStrings.startFromScratch) {}
                )
            } else {
                list
            }
        } skeleton: {
            List {
                ForEach(0..<5, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(verbatim: "Experience").font(.bfhr(.headline))
                        Text(verbatim: "Frontend Engineer · Company").font(.bfhr(.subheadline))
                    }
                }
            }
            .bfhrInsetGroupedList()
        } failure: { failure in
            PaneError(failure, title: CVEditorViewStrings.errorTitle, retry: {})
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
    }

    private var list: some View {
        List {
            ConnectionBannerSection(model.connection)
            ForEach(model.groups) { group in
                Section {
                    ForEach([group.base] + group.variants) { row in
                        Button { model.select(cvId: row.id) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: row.title).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                                RelativeTimeText(row.updatedAt, style: .day)
                                    .font(.bfhr(.footnote))
                                    .foregroundStyle(BFHRColor.Fg.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private func editor(_ document: CVDocument) -> some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                if let status = model.syncStatus { syncLine(status) }
                if let variant = document.variant {
                    InlineAlert(.info, title: CVEditorViewStrings.variantOf(variant.parentTitle))
                }
            }
            ForEach(model.sections) { section in
                Section {
                    if section.isEmpty {
                        GhostRow(CVEditorViewStrings.addFirst) {}
                    } else {
                        ForEach(section.items) { item in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: item.title ?? item.firstBullet ?? "—").font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary)
                                if let subtitle = item.subtitle {
                                    Text(verbatim: subtitle).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                                }
                            }
                            .bfhrRowActions([
                                RowAction(CVEditorViewStrings.remove, systemImage: "minus.circle", edge: .trailing) {
                                    if let toast = model.removeItem(sectionKind: section.kind, at: item.index) { toasts?.show(toast) }
                                },
                            ])
                        }
                    }
                } header: {
                    Text(CVEditorViewStrings.sectionTitle(section.kind))
                }
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(verbatim: document.title))
        .bfhrInlineTitle()
    }

    private func syncLine(_ status: CVSyncStatus) -> some View {
        Group {
            switch status {
            case .saved(let at): Text(CVEditorViewStrings.saved(at))
            case .saving: Text(CVEditorViewStrings.saving)
            case .savedOnDevice: Text(CVEditorViewStrings.savedOnDevice)
            case .failed: Text(CVEditorViewStrings.saveFailed)
            }
        }
        .font(.bfhr(.footnote))
        .foregroundStyle(BFHRColor.Fg.secondary)
    }
}

enum CVEditorViewStrings {
    static let loading = LocalizedStringResource.bfhr("cvEditor.loading", default: "Loading your CVs", table: "CVEditor")
    static let errorTitle = LocalizedStringResource.bfhr("cvEditor.error.title", default: "We couldn't load your CVs", table: "CVEditor")
    static let emptyTitle = LocalizedStringResource.bfhr("cvEditor.empty.title", default: "Add your first CV", table: "CVEditor")
    static let emptyBody = LocalizedStringResource.bfhr("cvEditor.empty.body", default: "Import the CV you already have, or start from a blank one. You can make versions for each role or language later.", table: "CVEditor")
    static let importCV = LocalizedStringResource.bfhr("cvEditor.empty.import", default: "Import a CV", table: "CVEditor")
    static let startFromScratch = LocalizedStringResource.bfhr("cvEditor.empty.scratch", default: "Start from scratch", table: "CVEditor")
    static let addFirst = LocalizedStringResource.bfhr("cvEditor.ghost.addFirst", default: "Add your first entry", table: "CVEditor")
    static let remove = LocalizedStringResource.bfhr("cvEditor.action.remove", default: "Remove", table: "CVEditor")
    static let saving = LocalizedStringResource.bfhr("cvEditor.sync.saving", default: "Saving…", table: "CVEditor")
    static let savedOnDevice = LocalizedStringResource.bfhr("cvEditor.sync.savedOnDevice", default: "Saved on this device", table: "CVEditor")
    static let saveFailed = LocalizedStringResource.bfhr("cvEditor.sync.failed", default: "Couldn't save · Try again", table: "CVEditor")

    static func saved(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.sync.saved", default: "Saved · \(date, format: .dateTime.day().month(.abbreviated).hour().minute())", table: "CVEditor")
    }

    static func sectionTitle(_ kind: CVSectionKind) -> LocalizedStringResource {
        switch kind {
        case .header: .bfhr("cvEditor.section.header", default: "Header", table: "CVEditor")
        case .summary: .bfhr("cvEditor.section.summary", default: "Summary", table: "CVEditor")
        case .work: .bfhr("cvEditor.section.work", default: "Experience", table: "CVEditor")
        case .education: .bfhr("cvEditor.section.education", default: "Education", table: "CVEditor")
        case .skills: .bfhr("cvEditor.section.skills", default: "Skills", table: "CVEditor")
        case .languages: .bfhr("cvEditor.section.languages", default: "Languages", table: "CVEditor")
        case .projects: .bfhr("cvEditor.section.projects", default: "Projects", table: "CVEditor")
        case .certificates: .bfhr("cvEditor.section.certificates", default: "Certificates", table: "CVEditor")
        case .volunteer: .bfhr("cvEditor.section.volunteer", default: "Volunteering", table: "CVEditor")
        case .awards: .bfhr("cvEditor.section.awards", default: "Awards", table: "CVEditor")
        case .publications: .bfhr("cvEditor.section.publications", default: "Publications", table: "CVEditor")
        case .interests: .bfhr("cvEditor.section.interests", default: "Interests", table: "CVEditor")
        case .references: .bfhr("cvEditor.section.references", default: "References", table: "CVEditor")
        case .custom(_, let title): .bfhr("cvEditor.section.custom", default: "\(title)", table: "CVEditor")
        }
    }

    static func variantOf(_ parent: String) -> LocalizedStringResource {
        .bfhr("cvEditor.variantOf", default: "Variant of \(parent)", table: "CVEditor")
    }
}
