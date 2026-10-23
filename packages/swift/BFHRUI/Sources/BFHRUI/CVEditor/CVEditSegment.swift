import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// The Edit segment: Header and Summary pinned, then each section of `meta.sectionOrder` with its
/// items. Tap an item to edit it in a sheet, swipe to remove it (Undo in the toast), Reorder for
/// drag handles; empty sections show a ghost row.
struct CVEditSegment: View {
    @Bindable var model: CVEditorModel
    let document: CVDocument
    @Binding var sheet: CVEditorSheet?
    /// Import review: the reader's low-confidence flags and the "only fields to check" filter.
    var importFlow: CVImportFlow?
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            if let conflict = model.conflict {
                Section { CVConflictBanner(model: model, conflict: conflict) { sheet = .compare } }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            } else if model.failedWriteIDs.contains(document.id) {
                Section {
                    InlineAlert(.error, title: L.saveFailedTitle, message: L.saveFailedBody, actionTitle: L.tryAgain) { model.retrySave() }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
            if let importFlow {
                CVImportSummarySection(flow: importFlow)
            }
            if let variant = document.variant {
                Section { variantBanner(variant) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            if let header = model.sections.first(where: { $0.kind == .header }), shows(sectionKey: "basics", index: nil) {
                Section {
                    if header.isEmpty {
                        GhostRow(L.addHeader) { sheet = .header }
                    } else {
                        Button {
                            importFlow?.resolve(sectionKey: "basics", index: nil)
                            sheet = .header
                        } label: {
                            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                                CVHeaderRow(content: document.content)
                                CVFlagNote(flags: flags(sectionKey: "basics", index: nil))
                            }
                        }
                        .accessibilityIdentifier("cv.header")
                    }
                } header: {
                    Text(L.sectionTitle(.header)).cvListHeader()
                }
            }
            if let summary = model.sections.first(where: { $0.kind == .summary }), importFlow?.showsOnlyFlagged != true {
                Section {
                    if case .text(let text) = summary.summary {
                        Button { sheet = .summary } label: {
                            CVRowChrome {
                                Text(verbatim: text)
                                    .font(.bfhr(.subheadline))
                                    .foregroundStyle(BFHRColor.Fg.primary)
                            }
                        }
                        .accessibilityHint(Text(L.editHint))
                    } else {
                        GhostRow(L.addSummary) { sheet = .summary }
                    }
                } header: {
                    Text(L.sectionTitle(.summary)).cvListHeader()
                }
            }
            ForEach(model.sections.filter { !$0.isPinned && shows(section: $0) }) { section in
                Section {
                    if section.isEmpty {
                        GhostRow(L.ghost(section.kind)) { sheet = .newItem(section.kind) }
                    } else {
                        ForEach(section.items.filter { shows(sectionKey: section.kind.orderKey, index: $0.index) }) { item in
                            Button {
                                importFlow?.resolve(sectionKey: section.kind.orderKey, index: item.index)
                                sheet = .item(section.kind, index: item.index)
                            } label: {
                                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                                    CVItemRow(item: item, kind: section.kind)
                                    CVFlagNote(flags: flags(sectionKey: section.kind.orderKey, index: item.index))
                                }
                            }
                            .accessibilityIdentifier("cv.item.\(item.id)")
                            .bfhrRowActions([removeAction(section, item)])
                            .accessibilityActions { moveActions(section, item) }
                        }
                        .onMove { source, destination in
                            model.moveItems(sectionKind: section.kind, from: source, to: destination)
                        }
                    }
                } header: {
                    CVSectionHeader(title: L.sectionTitle(section.kind), addLabel: L.addTo(L.sectionTitle(section.kind))) {
                        sheet = .newItem(section.kind)
                    }
                }
            }
            if !model.hiddenSections.isEmpty {
                Section {
                    Menu {
                        ForEach(model.hiddenSections) { hidden in
                            Button { model.showSection(hidden.kind) } label: {
                                if hidden.isEmpty {
                                    Text(L.sectionTitle(hidden.kind))
                                } else {
                                    Text(L.sectionTitle(hidden.kind))
                                    Text(L.hiddenWithItems(hidden.itemCount))
                                }
                            }
                        }
                    } label: {
                        Label { Text(L.addSection) } icon: { Image(systemName: "plus") }
                            .font(.bfhr(.body))
                            .foregroundStyle(BFHRColor.Accent.text)
                            .frame(minHeight: BFHRHitTarget.minimum)
                    }
                } footer: {
                    Text(L.addSectionFooter).cvListFooter()
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    // MARK: Import review

    private func flags(sectionKey: String, index: Int?) -> [CVImportFlag] {
        importFlow?.flags(sectionKey: sectionKey, index: index) ?? []
    }

    /// With "Show only fields to check" on, only rows that still have flags.
    private func shows(sectionKey: String, index: Int?) -> Bool {
        guard let importFlow, importFlow.showsOnlyFlagged else { return true }
        return !importFlow.flags(sectionKey: sectionKey, index: index).isEmpty
    }

    private func shows(section: CVSection) -> Bool {
        guard let importFlow, importFlow.showsOnlyFlagged else { return true }
        return importFlow.openFlags.contains { $0.sectionKey == section.kind.orderKey }
    }

    private func variantBanner(_ variant: CVVariantInfo) -> some View {
        let kind: LocalizedStringResource = variant.kind == .language ? L.languageVariant(CVLanguageName.name(of: document.language)) : L.roleVariant
        let changed = variant.baseChangedSections.map { String(localized: L.sectionTitle($0)) }
        return InlineAlert(
            .info,
            title: L.variantOf(kind, variant.parentTitle),
            message: changed.isEmpty ? L.variantInSync : L.baseChanged(changed.formatted(.list(type: .and))),
            actionTitle: L.openBase,
            action: { model.select(cvId: variant.parentCvId) }
        )
    }

    private func removeAction(_ section: CVSection, _ item: CVSectionItem) -> RowAction {
        RowAction(L.remove, systemImage: "trash", edge: .trailing, role: .destructive) {
            if let toast = model.removeItem(sectionKind: section.kind, at: item.index) { toasts?.show(toast) }
        }
    }

    /// VoiceOver counterparts of the drag handles.
    @ViewBuilder
    private func moveActions(_ section: CVSection, _ item: CVSectionItem) -> some View {
        if item.index > 0 {
            Button { model.moveItems(sectionKind: section.kind, from: [item.index], to: item.index - 1) } label: { Text(L.moveUp) }
        }
        if item.index < section.items.count - 1 {
            Button { model.moveItems(sectionKind: section.kind, from: [item.index], to: item.index + 2) } label: { Text(L.moveDown) }
        }
    }
}

/// A section header with a compact trailing "+ Add" (Glassdoor).
private struct CVSectionHeader: View {
    let title: LocalizedStringResource
    let addLabel: LocalizedStringResource
    let add: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
            Text(title)
                .cvListHeader()
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            Button(action: add) {
                Label { Text(L.add) } icon: { Image(systemName: "plus") }
                    .labelStyle(AdaptiveAddLabelStyle(iconOnly: dynamicTypeSize.isAccessibilitySize))
                    .font(.bfhr(.subheadline, emphasized: true))
                    .textCase(nil)
                    .foregroundStyle(BFHRColor.Accent.text)
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(addLabel))
        }
    }
}

private struct AdaptiveAddLabelStyle: LabelStyle {
    let iconOnly: Bool

    func makeBody(configuration: Configuration) -> some View {
        if iconOnly {
            configuration.icon
        } else {
            HStack(spacing: BFHRSpace.s1) {
                configuration.icon
                configuration.title
            }
        }
    }
}

/// Row content with a trailing chevron, so a tappable row reads as one.
struct CVRowChrome<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(spacing: BFHRSpace.s3) {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.forward")
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.tertiary)
                .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
    }
}

/// Header row: name, headline and the contact line.
private struct CVHeaderRow: View {
    let content: CvContent

    var body: some View {
        let basics = content.basics
        let contact = [basics?.email, basics?.phone, basics?.location?.city].compactMap { $0?.nonBlankValue }
        CVRowChrome {
            if let name = basics?.name?.nonBlankValue {
                Text(verbatim: name).font(.bfhr(.title3, emphasized: true)).foregroundStyle(BFHRColor.Fg.primary)
            }
            if let headline = basics?.label?.nonBlankValue {
                Text(verbatim: headline).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.primary)
            }
            if !contact.isEmpty {
                Text(verbatim: contact.joined(separator: " · "))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text(L.editHint))
    }
}

/// An item card (`ItemCard`): title, organization · dates, then the first bullet (or keywords /
/// fluency for skills and languages).
private struct CVItemRow: View {
    let item: CVSectionItem
    let kind: CVSectionKind
    @Environment(\.locale) private var locale

    var body: some View {
        CVRowChrome {
            Text(verbatim: item.title ?? item.subtitle ?? item.firstBullet ?? "—")
                .font(.bfhr(.headline))
                .foregroundStyle(BFHRColor.Fg.primary)
            if let line = secondLine {
                Text(verbatim: line)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            if let third = thirdLine {
                Text(verbatim: third)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text(L.editHint))
    }

    private var dates: String? {
        if let date = item.date { return CVDateText.month(date, locale: locale) }
        guard let start = item.startDate else { return item.endDate.map { CVDateText.month($0, locale: locale) } }
        let end = item.endDate.map { CVDateText.month($0, locale: locale) } ?? String(localized: L.present)
        return "\(CVDateText.month(start, locale: locale)) – \(end)"
    }

    private var secondLine: String? {
        let parts = [item.title == nil ? nil : item.subtitle, item.detail, dates].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var thirdLine: String? {
        switch kind {
        case .skills, .interests: item.keywords.isEmpty ? nil : item.keywords.joined(separator: ", ")
        case .languages: nil
        default: item.firstBullet
        }
    }
}

/// Item dates in the UI's language ("Mar 2022").
enum CVDateText {
    static func month(_ iso: String, locale: Locale) -> String {
        guard let month = CVMonth(iso: iso) else { return iso }
        guard month.month != nil else { return String(month.year) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        guard let date = month.date(calendar: calendar) else { return iso }
        let style = Date.FormatStyle(date: .omitted, time: .omitted, locale: locale, calendar: calendar, timeZone: calendar.timeZone)
            .month(.abbreviated).year()
        return date.formatted(style)
    }
}

extension View {
    /// List section header text: Dynamic Type subheadline in the secondary token colour (the
    /// system header grey misses 4.5:1 on the grouped background).
    func cvListHeader() -> some View {
        font(.bfhr(.subheadline, emphasized: true))
            .foregroundStyle(BFHRColor.Fg.secondary)
    }

    /// List section footer text: Dynamic Type footnote in the secondary token colour.
    func cvListFooter() -> some View {
        font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}
