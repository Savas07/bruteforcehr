import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Settings › Application answers (research/apply.md "AnswersLibrary": grouped list, per-language
/// values, country and currency tags): one section per kind, each row its label, the first text
/// and where it applies; tap to edit in a sheet, swipe to delete (Undo), Reorder within a kind.
struct AnswersLibraryPage: View {
    @Bindable var model: SettingsModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @State private var editing: AnswerDraft?
    @State private var openedDesignEditor = false
    #if os(iOS)
    @State private var editMode: EditMode = .inactive
    #endif

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                Text(AnswersStrings.intro)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                #if os(iOS)
                // In the list, not the navigation bar: "Reorder" next to "+" truncated the title
                // ("Application answ…") on iPhone 17e.
                if model.answers.count > 1, !editMode.isEditing {
                    Button { editMode = .active } label: {
                        Label { Text(AnswersStrings.reorder) } icon: { Image(systemName: "arrow.up.arrow.down") }
                    }
                    .accessibilityIdentifier("answers.reorder")
                }
                #endif
            }
            if model.answers.isEmpty {
                EmptyState(
                    .firstUse, glyph: "text.badge.checkmark", title: AnswersStrings.emptyTitle, message: AnswersStrings.emptyBody,
                    primary: .init(AnswersStrings.add) { editing = AnswerDraft(kind: .workAuthorization).withDefaultLabel() }
                )
                .listRowBackground(Color.clear)
            }
            ForEach(AnswerKind.allCases, id: \.self) { kind in
                let rows = model.answers(of: kind)
                if !rows.isEmpty {
                    Section {
                        ForEach(rows) { answer in
                            Button { editing = AnswerDraft(answer) } label: { AnswerRow(answer: answer) }
                                .foregroundStyle(BFHRColor.Fg.primary)
                                .accessibilityIdentifier("answers.row.\(answer.id)")
                                .swipeActions {
                                    Button(role: .destructive) { delete(answer.id) } label: {
                                        Label { Text(AnswersStrings.delete) } icon: { Image(systemName: "trash") }
                                    }
                                }
                        }
                        .onMove { source, destination in model.moveAnswers(of: kind, from: source, to: destination) }
                    } header: {
                        Text(AnswersStrings.kindSection(kind)).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(AnswersStrings.title))
        .bfhrInlineTitle()
        .toolbar {
            ToolbarItemGroup(placement: .bfhrTrailing) {
                #if os(iOS)
                if editMode.isEditing {
                    Button { editMode = .inactive } label: { Text(AnswersStrings.done) }
                        .accessibilityIdentifier("answers.reorderDone")
                } else {
                    addButton
                }
                #else
                addButton
                #endif
            }
        }
        #if os(iOS)
        .environment(\.editMode, $editMode)
        #endif
        .sheet(item: $editing) { draft in
            AnswerEditorSheet(model: model, draft: draft) { toast in
                if let toast { toasts?.show(toast) }
            }
        }
        .accessibilityIdentifier("settings.answers.page")
        #if DEBUG
        .task {
            // Design mode: `-BFHRSettingsPage answer-editor` opens the editor once.
            guard DesignSettingsPage.launch == .answerEditor, !openedDesignEditor, let first = model.answers.first else { return }
            openedDesignEditor = true
            editing = AnswerDraft(first)
        }
        #endif
    }

    private var addButton: some View {
        Button { editing = AnswerDraft(kind: .workAuthorization).withDefaultLabel() } label: {
            Label { Text(AnswersStrings.add) } icon: { Image(systemName: "plus") }
        }
        .accessibilityIdentifier("answers.add")
    }

    private func delete(_ id: String) {
        if let toast = model.deleteAnswer(id) { toasts?.show(toast) }
    }
}

extension AnswerDraft: Identifiable {
    /// The label a new answer of its kind starts with ("Notice period", "LinkedIn").
    func withDefaultLabel() -> AnswerDraft {
        var draft = self
        draft.label = String(localized: AnswersStrings.defaultLabel(kind))
        return draft
    }
}

/// Label, the first text (two lines) and where it applies.
struct AnswerRow: View {
    let answer: Answer

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: answer.label).font(.bfhr(.body))
            if let text = answer.values.first?.text {
                Text(verbatim: text)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .lineLimit(2)
            }
            Text(verbatim: Self.scope(answer))
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "TR · EN, TR", "EU · EUR · EN, DE", "Every country · EN".
    static func scope(_ answer: Answer) -> String {
        var parts = [answer.countries.isEmpty ? String(localized: AnswersStrings.everywhere) : answer.countries.joined(separator: ", ")]
        if let currency = answer.currency { parts.append(currency) }
        parts.append(answer.values.map { $0.language.uppercased() }.joined(separator: ", "))
        return parts.joined(separator: " · ")
    }
}

/// Add / edit one answer: kind, label, a text per language, countries and (salary) currency;
/// Save stays off with the reason until the answer is valid. Editing offers Delete (Undo).
struct AnswerEditorSheet: View {
    let model: SettingsModel
    @State var draft: AnswerDraft
    let onDone: (ToastItem?) -> Void
    @Environment(\.dismiss) private var dismiss

    static let currencies = ["EUR", "GBP", "USD", "TRY", "CHF"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(selection: $draft.kind) {
                        ForEach(AnswerKind.allCases, id: \.self) { kind in
                            Text(AnswersStrings.kindName(kind)).tag(kind)
                        }
                    } label: { Text(AnswersStrings.kind) }
                    .accessibilityIdentifier("answers.editor.kind")
                    .onChange(of: draft.kind) { old, new in
                        if draft.id == nil, draft.label == String(localized: AnswersStrings.defaultLabel(old)) {
                            draft.label = String(localized: AnswersStrings.defaultLabel(new))
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(AnswersStrings.label)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .accessibilityHidden(true)
                        TextField(text: $draft.label, axis: .vertical) { Text(AnswersStrings.label) }
                            .accessibilityLabel(Text(AnswersStrings.label))
                            .accessibilityIdentifier("answers.editor.label")
                            .onChange(of: draft.label) { _, text in
                                if text.contains(where: \.isNewline) { draft.label = text.filter { !$0.isNewline } }
                            }
                    }
                } footer: {
                    Text(AnswersStrings.labelFooter).foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    ForEach(languages, id: \.self) { language in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(AnswersStrings.language(language))
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                                .accessibilityHidden(true)
                            TextField(text: Binding(
                                get: { draft.texts[language] ?? "" },
                                set: { draft.texts[language] = $0 }
                            ), axis: .vertical) { Text(AnswersStrings.language(language)) }
                            .lineLimit(1...8)
                            .accessibilityIdentifier("answers.editor.text.\(language)")
                        }
                    }
                } header: {
                    Text(AnswersStrings.texts).foregroundStyle(BFHRColor.Fg.secondary)
                } footer: {
                    Text(AnswersStrings.textsFooter).foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(AnswersStrings.countries)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .accessibilityHidden(true)
                        TextField(text: $draft.countries, axis: .vertical) { Text(AnswersStrings.countriesPrompt) }
                            .accessibilityLabel(Text(AnswersStrings.countries))
                            .accessibilityIdentifier("answers.editor.countries")
                            .onChange(of: draft.countries) { _, text in
                                if text.contains(where: \.isNewline) { draft.countries = text.filter { !$0.isNewline } }
                            }
                            #if os(iOS)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            #endif
                    }
                    if draft.kind == .salaryExpectation {
                        Picker(selection: $draft.currency) {
                            Text(AnswersStrings.anyCurrency).tag(String?.none)
                            ForEach(currencyOptions, id: \.self) { code in
                                Text(verbatim: code).tag(Optional(code))
                            }
                        } label: { Text(AnswersStrings.currency) }
                        .accessibilityIdentifier("answers.editor.currency")
                    }
                } header: {
                    Text(AnswersStrings.whereSection).foregroundStyle(BFHRColor.Fg.secondary)
                } footer: {
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(AnswersStrings.countriesFooter)
                        if draft.kind == .salaryExpectation { Text(AnswersStrings.currencyFooter) }
                    }
                    .foregroundStyle(BFHRColor.Fg.secondary)
                }
                if let problem = draft.problem {
                    Section {
                        Text(AnswersStrings.problem(problem))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .accessibilityIdentifier("answers.editor.problem")
                    }
                }
                if let id = draft.id {
                    Section {
                        Button(role: .destructive) {
                            onDone(model.deleteAnswer(id))
                            dismiss()
                        } label: { Text(AnswersStrings.delete) }
                        .accessibilityIdentifier("answers.editor.delete")
                    }
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(draft.id == nil ? AnswersStrings.newAnswer : AnswersStrings.edit))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(AnswersStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        if model.saveAnswer(draft) != nil {
                            onDone(nil)
                            dismiss()
                        }
                    } label: { Text(AnswersStrings.save) }
                    .disabled(draft.problem != nil)
                    .accessibilityIdentifier("answers.editor.save")
                }
            }
        }
        .accessibilityIdentifier("answers.editor")
    }

    /// en, tr, de, then any other language the answer already has.
    private var languages: [String] {
        answerLanguages + draft.texts.keys.filter { !answerLanguages.contains($0) }.sorted()
    }

    private var currencyOptions: [String] {
        Self.currencies + [draft.currency].compactMap { $0 }.filter { !Self.currencies.contains($0) }
    }
}
