import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// Template picker (Givingli / Craft): a 2-column grid of the user's own CV in each template,
/// "ATS-safe" under each name, a checkmark on the chosen one; below it the theme rows (accent,
/// font pair, density, paper). Done saves one revision for the design change; Cancel keeps the
/// CV as it was.
struct CVTemplatePicker: View {
    let model: CVEditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var templateId: String
    @State private var theme: CvTheme

    init(model: CVEditorModel) {
        self.model = model
        let content = model.document?.content
        _templateId = State(initialValue: content?.meta.template ?? CVTemplateCatalog.defaultTemplateId)
        _theme = State(initialValue: content?.meta.theme ?? CVTemplateCatalog.defaultTheme(language: "en", timezone: nil))
    }

    var body: some View {
        NavigationStack {
            Group {
                if let catalog = model.catalog(), let document = model.document {
                    form(catalog, document)
                } else {
                    PaneError(LoadFailure(.unknown, details: "cv-render bundle missing"), title: L.previewFailedTitle, message: L.previewFailedBody)
                }
            }
            .navigationTitle(Text(L.templateTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(L.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        model.applyDesign(templateId: templateId, theme: theme, templateName: model.catalog()?.templateName(templateId) ?? templateId)
                        dismiss()
                    } label: {
                        Text(L.done).fontWeight(.semibold)
                    }
                    .accessibilityIdentifier("cv.template.done")
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private func form(_ catalog: CVTemplateCatalog, _ document: CVDocument) -> some View {
        Form {
            Section {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: BFHRSpace.s3, alignment: .top), GridItem(.flexible(), spacing: BFHRSpace.s3, alignment: .top)],
                          spacing: BFHRSpace.s4) {
                    ForEach(catalog.templates) { template in
                        thumbnail(template, document)
                    }
                }
                .padding(.vertical, BFHRSpace.s2)
            } footer: {
                Text(L.templateFooter)
            }
            Section {
                accentRow(catalog)
                Picker(selection: $theme.fontPair) {
                    ForEach(catalog.fontPairs) { pair in Text(verbatim: pair.name).tag(pair.id) }
                } label: { Text(L.fontPair) }
                Picker(selection: $theme.density) {
                    Text(L.density(.compact)).tag(CvDensity.compact)
                    Text(L.density(.comfortable)).tag(CvDensity.comfortable)
                    Text(L.density(.spacious)).tag(CvDensity.spacious)
                } label: { Text(L.densityLabel) }
                Picker(selection: $theme.paperSize) {
                    Text(verbatim: "A4").tag(CvPaperSize.a4)
                    Text(verbatim: "Letter").tag(CvPaperSize.letter)
                } label: { Text(L.paper) }
            } header: {
                Text(L.themeHeader)
            } footer: {
                Text(L.paperFooter)
            }
        }
    }

    private func thumbnail(_ template: CVTemplateCatalog.Template, _ document: CVDocument) -> some View {
        let selected = template.id == templateId
        var content = document.content
        content.meta.template = template.id
        content.meta.theme = theme
        let paperRatio: CGFloat = theme.paperSize == .letter ? 11 / 8.5 : 297 / 210
        return Button { templateId = template.id } label: {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                Group {
                    #if os(iOS)
                    if case .success(let rendered) = model.render(content, language: document.language) {
                        CVWebPage(rendered: rendered, accessibilityIdentifier: "cv.template.thumb.\(template.id)")
                            .allowsHitTesting(false)
                    } else {
                        Color.white
                    }
                    #else
                    Color.white
                    #endif
                }
                .aspectRatio(1 / paperRatio, contentMode: .fit)
                .background(Color.white)
                .clipShape(BFHRRadius.shape(BFHRRadius.sm))
                .overlay {
                    BFHRRadius.shape(BFHRRadius.sm)
                        .strokeBorder(selected ? BFHRColor.tint : BFHRColor.Line.subtle, lineWidth: selected ? 3 : BFHRBorderWidth.hairline)
                }
                .overlay(alignment: .topTrailing) {
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.bfhr(.title3))
                            .foregroundStyle(.white, BFHRColor.tint)
                            .padding(BFHRSpace.s2)
                    }
                }
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: template.name).font(.bfhr(.subheadline, emphasized: true)).foregroundStyle(BFHRColor.Fg.primary)
                    if !template.description.isEmpty {
                        Text(verbatim: template.description).font(.bfhr(.caption1)).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    Label { Text(L.atsSafe) } icon: { Image(systemName: "checkmark.seal") }
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("cv.template.\(template.id)")
    }

    private func accentRow(_ catalog: CVTemplateCatalog) -> some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            Text(L.accent).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: BFHRSpace.s2)], alignment: .leading, spacing: BFHRSpace.s2) {
                ForEach(catalog.accents) { accent in
                    let selected = accent.id.caseInsensitiveCompare(theme.accentColor) == .orderedSame
                    Button { theme.accentColor = accent.id.uppercased() } label: {
                        Circle()
                            .fill(CVThemeColor.color(hex: accent.id))
                            .frame(width: 32, height: 32)
                            .overlay { if selected { Image(systemName: "checkmark").font(.bfhr(.footnote, emphasized: true)).foregroundStyle(.white) } }
                            .padding(4)
                            .overlay { Circle().strokeBorder(selected ? BFHRColor.Fg.primary : .clear, lineWidth: 2) }
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(verbatim: accent.name))
                    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }
}
