import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// Prompts behind the CV actions (Dropbox-style action menu: Duplicate, New role variant, New
/// language variant, Rename, Archive).
enum CVActionPrompt: Identifiable, Hashable {
    case rename(cvId: String)
    case roleVariant(cvId: String)
    case languageVariant(cvId: String)

    var id: String {
        switch self {
        case .rename(let id): "rename.\(id)"
        case .roleVariant(let id): "role.\(id)"
        case .languageVariant(let id): "language.\(id)"
        }
    }
}

/// The CV actions shared by the list's context menu and the CV screen's "…" menu.
struct CVActionItems: View {
    let model: CVEditorModel
    let cvId: String
    @Binding var prompt: CVActionPrompt?

    var body: some View {
        Section {
            Button { Task { await model.duplicate(cvId: cvId) } } label: {
                Label { Text(L.duplicate) } icon: { Image(systemName: "plus.square.on.square") }
            }
            Button { prompt = .roleVariant(cvId: cvId) } label: {
                Label { Text(L.newRoleVariant) } icon: { Image(systemName: "person.crop.rectangle.stack") }
            }
            Button { prompt = .languageVariant(cvId: cvId) } label: {
                Label { Text(L.newLanguageVariant) } icon: { Image(systemName: "globe") }
            }
            Button { prompt = .rename(cvId: cvId) } label: {
                Label { Text(L.rename) } icon: { Image(systemName: "pencil") }
            }
            if model.data.cv(id: cvId)?.isDefault == false, model.data.cv(id: cvId)?.archivedAt == nil {
                Button { model.makeDefault(cvId: cvId) } label: {
                    Label { Text(L.makeDefault) } icon: { Image(systemName: "star") }
                }
            }
        }
    }
}

extension View {
    /// Rename and role-variant name prompts (alerts with a text field) and the language-variant
    /// sheet.
    func cvActionPrompts(_ prompt: Binding<CVActionPrompt?>, model: CVEditorModel) -> some View {
        modifier(CVActionPromptsModifier(prompt: prompt, model: model))
    }
}

private struct CVActionPromptsModifier: ViewModifier {
    @Binding var prompt: CVActionPrompt?
    let model: CVEditorModel
    @State private var text = ""

    func body(content: Content) -> some View {
        content
            .alert(Text(alertTitle), isPresented: alertShown) {
                TextField(text: $text) { Text(alertField) }
                    .accessibilityIdentifier("cv.prompt.field")
                Button(role: .cancel) { prompt = nil } label: { Text(L.cancel) }
                Button { submit() } label: { Text(alertAction) }
                    .disabled(text.nilIfBlank == nil)
                    .accessibilityIdentifier("cv.prompt.submit")
            } message: {
                Text(alertMessage)
            }
            .sheet(item: languagePrompt) { item in
                CVLanguageVariantSheet(model: model, cvId: item.id)
            }
            .onChange(of: prompt) { _, prompt in
                if case .rename(let cvId) = prompt { text = model.data.cv(id: cvId)?.title ?? "" } else { text = "" }
            }
    }

    private var alertShown: Binding<Bool> {
        Binding(
            get: {
                switch prompt {
                case .rename, .roleVariant: true
                default: false
                }
            },
            set: { if !$0 { prompt = nil } }
        )
    }

    private var languagePrompt: Binding<CVSheetID?> {
        Binding(
            get: { if case .languageVariant(let id) = prompt { CVSheetID(id: id) } else { nil } },
            set: { if $0 == nil { prompt = nil } }
        )
    }

    private var alertTitle: LocalizedStringResource {
        if case .roleVariant = prompt { L.newRoleVariant } else { L.renameTitle }
    }

    private var alertMessage: LocalizedStringResource {
        if case .roleVariant = prompt { L.roleVariantMessage } else { L.renameMessage }
    }

    private var alertField: LocalizedStringResource {
        if case .roleVariant = prompt { L.roleVariantField } else { L.cvName }
    }

    private var alertAction: LocalizedStringResource {
        if case .roleVariant = prompt { L.create } else { L.save }
    }

    private func submit() {
        switch prompt {
        case .rename(let cvId):
            model.rename(cvId: cvId, to: text)
        case .roleVariant(let cvId):
            let label = text
            Task { await model.newRoleVariant(of: cvId, label: label) }
        default:
            break
        }
        prompt = nil
    }
}

/// A CV id as a sheet item.
struct CVSheetID: Identifiable, Hashable {
    let id: String
}

/// New language variant: the language (EN / TR / DE, names in their own language) and whether
/// Claude translates the text first or the variant starts with the original wording.
struct CVLanguageVariantSheet: View {
    let model: CVEditorModel
    let cvId: String
    @Environment(\.dismiss) private var dismiss
    @State private var language: String
    @State private var translate: Bool
    @State private var working = false

    init(model: CVEditorModel, cvId: String) {
        self.model = model
        self.cvId = cvId
        let current = model.data.cv(id: cvId)?.language ?? "en"
        _language = State(initialValue: ["de", "en", "tr"].first { $0 != current } ?? "en")
        _translate = State(initialValue: model.canRequestSuggestions)
    }

    private var languages: [String] {
        let current = model.data.cv(id: cvId)?.language
        return ["en", "de", "tr"].filter { $0 != current }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(selection: $language) {
                        ForEach(languages, id: \.self) { code in Text(verbatim: CVLanguageName.name(of: code)).tag(code) }
                    } label: { Text(L.variantLanguage) }
                        .pickerStyle(.inline)
                        .labelsHidden()
                } header: {
                    Text(L.variantLanguage).cvListHeader()
                }
                Section {
                    Picker(selection: $translate) {
                        Text(L.translateWithAI).tag(true)
                        Text(L.keepOriginalText).tag(false)
                    } label: { Text(L.variantText) }
                        .pickerStyle(.inline)
                        .labelsHidden()
                        .disabled(!model.canRequestSuggestions)
                } header: {
                    Text(L.variantText).cvListHeader()
                } footer: {
                    Text(model.canRequestSuggestions ? L.translateFooter : L.translateUnavailable).cvListFooter()
                }
            }
            .navigationTitle(Text(L.newLanguageVariant))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(L.cancel) }.disabled(working)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        working = true
                        Task {
                            await model.newLanguageVariant(of: cvId, language: language, translate: translate && model.canRequestSuggestions)
                            working = false
                            dismiss()
                        }
                    } label: {
                        if working { ProgressView() } else { Text(L.create).fontWeight(.semibold) }
                    }
                    .disabled(working)
                    .accessibilityIdentifier("cv.languageVariant.create")
                }
            }
            .overlay {
                if working && translate {
                    ProgressNote(L.translating)
                        .padding(BFHRSpace.s4)
                        .background(.regularMaterial, in: BFHRRadius.shape(BFHRRadius.md))
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(BFHRColor.groupedBackground)
        .interactiveDismissDisabled(working)
    }
}
