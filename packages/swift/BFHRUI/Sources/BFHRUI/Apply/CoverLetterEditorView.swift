import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The cover letter editor page of the Apply sheet (research/apply.md "Cover letter editor":
/// Notion tone presets, Jira/Revolut grouped templates, Spark Mail's AI banner with Undo): Template,
/// Tone and Language, "Draft with AI", the editable letter with Insert field and a word count,
/// "Fields to fill" for merge fields the job and profile don't know, and Save as template. The
/// bottom button returns to the checklist; a field without a value or a `[gap]` is named there
/// and blocks sending.
struct CoverLetterEditorPage: View {
    @Bindable var model: CoverLetterEditorModel
    let onDone: () -> Void
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @State private var namesTemplate = false
    @State private var templateName = ""
    @FocusState private var focusedField: MergeField?

    var body: some View {
        Form {
            settings
            if case .failed(let error) = model.draftPhase { failure(error) }
            if let banner = model.banner { draftBanner(banner) }
            letter
            if !model.fieldsToFill.isEmpty { fields }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ApplyBottomBar {
                if let blocker = model.blocker {
                    Text(ApplyStrings.letterBlocker(blocker))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("apply.letter.blocker")
                }
                Button(action: onDone) { Text(ApplyStrings.useLetter) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .disabled(model.draftPhase == .drafting)
                    .accessibilityIdentifier("apply.letter.done")
            }
        }
        .alert(Text(ApplyStrings.saveAsTemplate), isPresented: $namesTemplate) {
            TextField(text: $templateName) { Text(ApplyStrings.templateName) }
                .accessibilityIdentifier("apply.letter.templateName")
            Button(role: .cancel) {} label: { Text(ApplyStrings.cancel) }
            Button {
                if model.saveAsTemplate(title: templateName) != nil {
                    toasts?.show(ToastItem(glyph: ToastGlyph.confirmed, message: ApplyStrings.templateSaved))
                }
            } label: { Text(ApplyStrings.save) }
        } message: {
            Text(ApplyStrings.templateNameBody)
        }
        .accessibilityIdentifier("apply.letter.editor")
    }

    // MARK: Template, tone, language, Draft with AI

    private var settings: some View {
        Section {
            Picker(selection: Binding(get: { model.templateId ?? "" }, set: { model.useTemplate($0) })) {
                if model.templateId == nil { Text(ApplyStrings.noTemplate).tag("") }
                if !model.ownTemplates.isEmpty {
                    Section {
                        ForEach(model.ownTemplates) { template in
                            Text(verbatim: template.title).tag(template.id)
                        }
                    } header: { Text(ApplyStrings.yourTemplates) }
                }
                Section {
                    ForEach(model.starterTemplates) { template in
                        Text(verbatim: "\(template.title) · \(template.language.uppercased())").tag(template.id)
                    }
                } header: { Text(ApplyStrings.starterTemplates) }
            } label: { Text(ApplyStrings.template) }
            .pickerStyle(.menu)
            .accessibilityIdentifier("apply.letter.template")
            Picker(selection: $model.tone) {
                ForEach(CoverLetterTone.allCases, id: \.self) { tone in
                    VStack(alignment: .leading) {
                        Text(ApplyStrings.toneName(tone))
                        Text(ApplyStrings.toneBody(tone))
                    }
                    .tag(tone)
                }
            } label: { Text(ApplyStrings.tone) }
            .pickerStyle(.menu)
            .accessibilityIdentifier("apply.letter.tone")
            Picker(selection: $model.language) {
                ForEach(CvAssistLanguage.allCases, id: \.self) { language in
                    Text(ApplyStrings.languageName(language)).tag(language)
                }
            } label: { Text(ApplyStrings.language) }
            .pickerStyle(.menu)
            .accessibilityIdentifier("apply.letter.language")
            if model.draftPhase == .drafting {
                HStack(spacing: BFHRSpace.s3) {
                    ProgressView()
                    Text(ApplyStrings.drafting)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { model.cancelDraft() } label: { Text(ApplyStrings.cancel) }
                        .buttonStyle(.borderless)
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("apply.letter.drafting")
            } else {
                Button { Task { await model.draft() } } label: {
                    HStack(spacing: BFHRSpace.s2) {
                        Label {
                            Text(model.author == .ai ? ApplyStrings.draftAgain : ApplyStrings.draftWithAI)
                        } icon: { Image(systemName: "sparkles") }
                        Spacer(minLength: 0)
                        AiBadge()
                    }
                }
                .accessibilityIdentifier("apply.letter.draft")
            }
        } footer: {
            Text(ApplyStrings.draftFooter).foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    private func failure(_ error: ApplyAIError) -> some View {
        Section {
            InlineAlert(
                error == .aiDisabled || error == .dailyLimit ? .info : .warning,
                title: ApplyStrings.draftErrorTitle(error),
                message: ApplyStrings.draftErrorBody(error),
                actionTitle: error == .aiDisabled ? ApplyStrings.openAISettings : nil,
                action: error == .aiDisabled ? { openURL(URL(string: "bruteforcehr://settings/ai")!) } : nil,
                onDismiss: { model.dismissFailure() }
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("apply.letter.error")
        }
    }

    private func draftBanner(_ banner: LetterDraftBanner) -> some View {
        Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                Label { Text(ApplyStrings.draftBanner) } icon: { Image(systemName: "sparkles") }
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if banner.droppedSentences > 0 {
                    Text(ApplyStrings.droppedSentences(banner.droppedSentences))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                ButtonPair {
                    Button { model.undo() } label: { Text(ApplyStrings.undo) }
                        .accessibilityIdentifier("apply.letter.undo")
                } secondary: {
                    Button { model.dismissBanner() } label: { Text(ApplyStrings.dismiss) }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("apply.letter.banner")
        }
    }

    // MARK: Letter

    private var letter: some View {
        Section {
            TextEditor(text: $model.text)
                .frame(minHeight: 240)
                .font(.bfhr(.body))
                .accessibilityLabel(Text(ApplyStrings.letterEditorLabel))
                .accessibilityIdentifier("apply.letterText")
            HStack(spacing: BFHRSpace.s3) {
                Menu {
                    ForEach(MergeField.allCases, id: \.self) { field in
                        Button { model.text += (model.text.last?.isWhitespace ?? true ? "" : " ") + "{\(field.rawValue)}" } label: {
                            Text(ApplyStrings.fieldName(field))
                        }
                    }
                } label: {
                    Label { Text(ApplyStrings.insertField) } icon: { Image(systemName: "curlybraces") }
                        .frame(minHeight: BFHRHitTarget.minimum)
                }
                .accessibilityIdentifier("apply.letter.insertField")
                Spacer(minLength: 0)
                Button { templateName = ""; namesTemplate = true } label: {
                    Label { Text(ApplyStrings.saveAsTemplate) } icon: { Image(systemName: "square.and.arrow.down") }
                        .frame(minHeight: BFHRHitTarget.minimum)
                }
                .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityIdentifier("apply.letter.saveTemplate")
            }
            .buttonStyle(.borderless)
            .labelStyle(.titleAndIcon)
            if model.canUndo, model.banner == nil {
                Button { model.undo() } label: { Text(ApplyStrings.undo) }
                    .accessibilityIdentifier("apply.letter.undoTemplate")
            }
        } header: {
            Text(ApplyStrings.letterText).foregroundStyle(BFHRColor.Fg.secondary)
        } footer: {
            VStack(alignment: .leading, spacing: 2) {
                Text(ApplyStrings.words(model.wordCount))
                if model.wordCount > 400 { Text(ApplyStrings.longLetter) }
            }
            .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    // MARK: Fields to fill

    private var fields: some View {
        Section {
            ForEach(model.fieldsToFill, id: \.self) { field in
                VStack(alignment: .leading, spacing: 2) {
                    Text(ApplyStrings.fieldName(field))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .accessibilityHidden(true)
                    TextField(text: Binding(
                        get: { model.typedValues[field] ?? "" },
                        set: { model.typedValues[field] = $0 }
                    )) { Text(ApplyStrings.fieldName(field)) }
                    .focused($focusedField, equals: field)
                    .accessibilityIdentifier("apply.letter.field.\(field.rawValue)")
                }
            }
        } header: {
            Text(ApplyStrings.fieldsToFill).foregroundStyle(BFHRColor.Fg.secondary)
        } footer: {
            Text(ApplyStrings.fieldsFooter).foregroundStyle(BFHRColor.Fg.secondary)
        }
    }
}
