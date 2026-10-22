import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// ✦ Improve (Grab "Rewrite this for me"): the user's text quoted, mode chips, up to three
/// alternatives as word-level diffs (removed words struck through, added words underlined and
/// tinted; VoiceOver reads the changes), blanks to fill in, the Claude disclaimer, then
/// Keep mine · Use suggestion and Edit before using. One text at a time; no "accept all".
struct CVAssistSheet: View {
    @Bindable var session: CVAssistSession
    let onUse: (String) -> Void
    let onEdit: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(verbatim: session.original)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                } header: {
                    Text(L.yourText).cvListHeader()
                }
                Section {
                    ChipFlow {
                        ForEach(CVAssistMode.allCases) { mode in
                            Toggle(isOn: Binding(get: { session.mode == mode }, set: { if $0 { session.setMode(mode) } })) {
                                Text(L.mode(mode))
                            }
                            .toggleStyle(.bfhrChip)
                        }
                    }
                    .listRowInsets(EdgeInsets(top: BFHRSpace.s2, leading: BFHRSpace.s4, bottom: BFHRSpace.s2, trailing: BFHRSpace.s4))
                    if session.mode == .translate {
                        Picker(selection: Binding(get: { session.targetLanguage ?? "" }, set: { session.setMode(.translate, targetLanguage: $0) })) {
                            ForEach(session.translationTargets, id: \.self) { code in
                                Text(verbatim: CVLanguageName.name(of: code)).tag(code)
                            }
                        } label: {
                            Text(L.translateTo)
                        }
                    }
                } header: {
                    Text(L.howToImprove).cvListHeader()
                }
                suggestionsSection
                if let selected = session.selected, !selected.placeholders.isEmpty {
                    Section {
                        ForEach(Array(selected.placeholders.enumerated()), id: \.offset) { index, placeholder in
                            CVLabeledField(L.blankLabel(placeholder), text: placeholderBinding(index))
                                .accessibilityIdentifier("cv.assist.blank.\(index)")
                        }
                    } header: {
                        Text(L.fillInHeader).cvListHeader()
                    } footer: {
                        Text(L.fillInFooter).cvListFooter()
                    }
                }
                Section {
                    AiDisclosureLine()
                }
                if dynamicTypeSize.isAccessibilitySize {
                    // At accessibility sizes a pinned bar would cover most of the sheet, so the
                    // actions scroll with the content.
                    Section { actions }
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(L.improveTitle))
            .bfhrInlineTitle()
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !dynamicTypeSize.isAccessibilitySize {
                    actions
                        .padding(.horizontal, BFHRSpace.s4)
                        .padding(.top, BFHRSpace.s3)
                        .padding(.bottom, BFHRSpace.s2)
                        .background(.bar)
                }
            }
        }
        .presentationDetents([.large])
        .task { if session.phase == .loading { await session.load() } }
    }

    @ViewBuilder
    private var suggestionsSection: some View {
        Section {
            switch session.phase {
            case .loading:
                ProgressNote(L.writingSuggestions)
            case .failed:
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(L.suggestionsFailed).font(.bfhr(.subheadline))
                    Button { Task { await session.load() } } label: { Text(Strings.tryAgain) }
                        .buttonStyle(.bfhrPlain)
                }
            case .loaded(let suggestions) where suggestions.isEmpty:
                Text(L.noSuggestions)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            case .loaded(let suggestions):
                ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, suggestion in
                    suggestionRow(suggestion, number: index + 1, of: suggestions.count)
                }
            }
        } header: {
            Text(L.suggestionsHeader).cvListHeader()
        }
    }

    private func suggestionRow(_ suggestion: CVSuggestion, number: Int, of count: Int) -> some View {
        let isSelected = session.selectedID == suggestion.id
        let segments = CVWordDiff.diff(session.original, suggestion.text)
        return Button { session.select(suggestion) } label: {
            HStack(alignment: .top, spacing: BFHRSpace.s3) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.bfhr(.title3))
                    .foregroundStyle(isSelected ? BFHRColor.Accent.text : BFHRColor.Fg.tertiary)
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(diffText(segments))
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !suggestion.reasons.isEmpty {
                        Text(verbatim: suggestion.reasons.map { String(localized: L.reason($0)) }.joined(separator: " · "))
                            .font(.bfhr(.footnote, emphasized: true))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(L.suggestionNumber(number, count)) + Text(verbatim: ". ") + Text(verbatim: suggestion.text))
        .accessibilityValue(Text(verbatim: changesDescription(segments, reasons: suggestion.reasons)))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("cv.assist.suggestion.\(number)")
    }

    /// Removed words struck through and dimmed, added words underlined and tinted: never colour
    /// alone.
    private func diffText(_ segments: [CVDiffSegment]) -> AttributedString {
        var result = AttributedString()
        for (index, segment) in segments.enumerated() {
            if index > 0 { result += AttributedString(" ") }
            var run = AttributedString(segment.text)
            switch segment.kind {
            case .same:
                break
            case .removed:
                run.strikethroughStyle = .single
                run.foregroundColor = BFHRColor.Fg.secondary
            case .added:
                run.underlineStyle = .single
                run.foregroundColor = BFHRColor.Accent.text
                run.backgroundColor = BFHRColor.Accent.subtle
            }
            result += run
        }
        return result
    }

    /// "Replaced “Led” with “Drove”; added “by [X%]”. Shorter."
    private func changesDescription(_ segments: [CVDiffSegment], reasons: [CVSuggestionReason]) -> String {
        let changes = CVWordDiff.changes(segments).map { change -> String in
            switch (change.removed, change.added) {
            case let (removed?, added?): String(localized: L.changeReplaced(removed, added))
            case let (removed?, nil): String(localized: L.changeRemoved(removed))
            case let (nil, added?): String(localized: L.changeAdded(added))
            case (nil, nil): ""
            }
        }
        let reasonText = reasons.map { String(localized: L.reason($0)) }.joined(separator: ", ")
        return (changes.joined(separator: "; ") + (reasonText.isEmpty ? "" : ". \(reasonText)"))
    }

    private func placeholderBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { index < session.placeholderValues.count ? session.placeholderValues[index] : "" },
            set: { value in
                guard index < session.placeholderValues.count else { return }
                session.placeholderValues[index] = value
            }
        )
    }

    private var actions: some View {
        VStack(spacing: BFHRSpace.s2) {
            if session.selected != nil, !session.missingPlaceholders.isEmpty {
                Label { Text(L.fillBlanksFirst(session.missingPlaceholders.count)) } icon: { Image(systemName: "pencil.line") }
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRTone.warning.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            ButtonPair {
                Button {
                    if let text = session.resolvedText, session.canUse { onUse(text) }
                } label: { Text(L.useSuggestion) }
                    .disabled(!session.canUse)
                    .accessibilityIdentifier("cv.assist.use")
            } secondary: {
                Button { dismiss() } label: { Text(L.keepMine) }
                    .accessibilityIdentifier("cv.assist.keepMine")
            }
            Button {
                if let text = session.resolvedText { onEdit(text) }
            } label: { Text(L.editBeforeUsing) }
                .buttonStyle(.bfhrPlain)
                .disabled(session.selected == nil)
        }
    }
}
