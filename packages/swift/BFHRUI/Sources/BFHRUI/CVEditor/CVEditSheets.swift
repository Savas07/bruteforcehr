import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// The item edit sheet (Fi): Cancel / title / Save over labelled fields, month/year dates with
/// "I currently work here" and a duration hint, bullets with ✦ Improve, and Remove at the end.
/// Leaving with changes asks first.
struct CVItemEditorSheet: View {
    let model: CVEditorModel
    let kind: CVSectionKind
    let index: Int?
    @State private var draft: CVItemDraft
    @State private var assist: CVAssistSession?
    @State private var assistTarget: UUID?
    @State private var confirmDiscard = false
    @State private var appliedCount = 0
    @FocusState private var focusedBullet: UUID?
    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    init(model: CVEditorModel, kind: CVSectionKind, index: Int?, draft: CVItemDraft) {
        self.model = model
        self.kind = kind
        self.index = index
        _draft = State(initialValue: draft)
    }

    private var fields: [CVItemField] { kind.itemFields }
    /// Compared as the CV would save it, so untouched fields and blank bullets don't count.
    private var hasChanges: Bool { model.itemDraftChangesCV(draft, sectionKind: kind, at: index) }

    var body: some View {
        NavigationStack {
            Form {
                if !draft.placeholders.isEmpty {
                    Section {
                        InlineAlert(.warning, title: L.fillBlanksTitle(draft.placeholders.count), message: L.fillBlanksBody)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section {
                    CVLabeledField(L.titleLabel(kind), text: $draft.title)
                    if fields.contains(.detail) { CVLabeledField(L.detailLabel(kind), text: $draft.detail) }
                    if fields.contains(.subtitle) { CVLabeledField(L.subtitleLabel(kind), text: $draft.subtitle) }
                    if fields.contains(.location) { CVLabeledField(L.locationLabel, text: $draft.location) }
                }
                if fields.contains(.dateRange) { dateRangeSection }
                if fields.contains(.date) {
                    Section {
                        CVMonthYearPicker(L.dateLabel, iso: $draft.date)
                    }
                }
                if fields.contains(.bullets) { bulletsSection }
                if fields.contains(.summary) {
                    Section {
                        CVLabeledField(L.summaryLabel(kind), text: $draft.summary, multiline: true)
                    }
                }
                if fields.contains(.keywords) {
                    Section {
                        CVLabeledField(L.keywordsLabel, text: keywordsText, multiline: true)
                    } footer: {
                        Text(L.keywordsFooter).cvListFooter()
                    }
                }
                if fields.contains(.url) {
                    Section {
                        CVLabeledField(L.urlLabel, text: $draft.url, kind: .url)
                    }
                }
                if let index {
                    Section {
                        Button(role: .destructive) {
                            if let toast = model.removeItem(sectionKind: kind, at: index) { toasts?.show(toast) }
                            dismiss()
                        } label: {
                            Text(L.removeEntry)
                        }
                    }
                }
            }
            .navigationTitle(Text(index == nil ? L.newItemTitle(kind) : L.editItemTitle(kind)))
            .bfhrInlineTitle()
            .confirmationDialog(Text(L.discardTitle), isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button(role: .destructive) { dismiss() } label: { Text(L.discard) }
                Button(role: .cancel) {} label: { Text(L.keepEditing) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { hasChanges ? (confirmDiscard = true) : dismiss() } label: { Text(L.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        if model.saveItem(draft, sectionKind: kind, at: index) { dismiss() }
                    } label: {
                        Text(L.save)
                    }
                    .disabled(!draft.canSave || !hasChanges)
                    .accessibilityIdentifier("cv.sheet.save")
                }
            }
            .bfhrToastHost()
        }
        .interactiveDismissDisabled(hasChanges)
        .sheet(item: $assist) { session in
            CVAssistSheet(session: session, onUse: { text in apply(text, edit: false) }, onEdit: { text in apply(text, edit: true) })
        }
        .bfhrHaptic(.confirm, trigger: appliedCount)
        #if DEBUG
        .task {
            if CVDesignPane.takeLaunchAssist(), let first = draft.bullets.first { improve(first) }
        }
        #endif
    }

    // MARK: Dates

    private var dateRangeSection: some View {
        Section {
            CVMonthYearPicker(L.startLabel, iso: $draft.startDate)
            Toggle(isOn: $draft.isCurrent.animation()) { Text(L.currentLabel(kind)) }
            if !draft.isCurrent {
                CVMonthYearPicker(L.endLabel, iso: $draft.endDate)
            }
        } footer: {
            if draft.endsBeforeStart {
                Label { Text(L.endBeforeStart) } icon: { Image(systemName: "exclamationmark.circle") }
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRTone.warning.text)
            } else if let duration {
                Text(verbatim: duration).cvListFooter()
            }
        }
    }

    /// "2 yrs 3 mos" (Mindtrip duration hint).
    private var duration: String? {
        guard let start = draft.startDate.flatMap(CVMonth.init(iso:)) else { return nil }
        let end: CVMonth
        if draft.isCurrent {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = model.calendar.timeZone
            let now = calendar.dateComponents([.year, .month], from: model.now)
            end = CVMonth(year: now.year ?? start.year, month: now.month)
        } else if let value = draft.endDate.flatMap(CVMonth.init(iso:)) {
            end = value
        } else {
            return nil
        }
        guard let months = start.months(through: end) else { return nil }
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = months >= 12 ? [.year, .month] : [.month]
        formatter.unitsStyle = .short
        return formatter.string(from: DateComponents(year: months / 12, month: months % 12))
            ?? formatter.string(from: DateComponents(month: months))
    }

    // MARK: Bullets

    private var bulletsSection: some View {
        Section {
            ForEach($draft.bullets) { $bullet in
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    HStack(alignment: .top, spacing: BFHRSpace.s2) {
                        Text(verbatim: "•")
                            .font(.bfhr(.body))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .accessibilityHidden(true)
                        TextField(text: $bullet.text, axis: .vertical) { Text(L.bulletLabel) }
                            .font(.bfhr(.body))
                            .focused($focusedBullet, equals: bullet.id)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if model.offersSuggestions {
                            IconButton(L.improve, systemImage: "sparkles") { improve(bullet) }
                                .foregroundStyle(model.canRequestSuggestions ? BFHRColor.Accent.text : BFHRColor.Fg.disabled)
                                .disabled(!model.canRequestSuggestions || bullet.text.trimmed.isEmpty)
                                .accessibilityIdentifier("cv.improve")
                        }
                    }
                    let blanks = CVPlaceholders.find(in: bullet.text)
                    if !blanks.isEmpty {
                        Label { Text(L.replaceBlank(blanks.joined(separator: ", "))) } icon: { Image(systemName: "pencil.line") }
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRTone.warning.text)
                    }
                }
            }
            .onDelete { draft.bullets.remove(atOffsets: $0) }
            .onMove { draft.bullets.move(fromOffsets: $0, toOffset: $1) }
            Button {
                let bullet = CVBullet(text: "")
                draft.bullets.append(bullet)
                focusedBullet = bullet.id
            } label: {
                Label { Text(L.addBullet) } icon: { Image(systemName: "plus") }
            }
        } header: {
            Text(L.bulletsHeader(kind)).cvListHeader()
        } footer: {
            if model.offersSuggestions && !model.canRequestSuggestions {
                NeedsConnectionNote()
            }
        }
    }

    private var keywordsText: Binding<String> {
        Binding(
            get: { draft.keywords.joined(separator: ", ") },
            set: { draft.keywords = $0.split(separator: ",", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) } }
        )
    }

    private func improve(_ bullet: CVBullet) {
        guard let provider = model.suggestionProvider, let language = model.document?.language else { return }
        assistTarget = bullet.id
        assist = CVAssistSession(original: bullet.text, language: language, provider: provider)
    }

    /// Use suggestion / Edit: the bullet takes the text; Undo in the toast puts the old one back.
    private func apply(_ text: String, edit: Bool) {
        guard let target = assistTarget, let position = draft.bullets.firstIndex(where: { $0.id == target }) else { return }
        let previous = draft.bullets[position].text
        draft.bullets[position].text = text
        assist = nil
        appliedCount += 1
        if edit { focusedBullet = target }
        let binding = $draft
        toasts?.show(ToastItem(glyph: "sparkles", message: L.suggestionApplied, action: .undo {
            guard let i = binding.wrappedValue.bullets.firstIndex(where: { $0.id == target }) else { return }
            binding.wrappedValue.bullets[i].text = previous
        }))
    }
}

/// The Header sheet.
struct CVHeaderSheet: View {
    let model: CVEditorModel
    private let original: CVHeaderDraft
    @State private var draft: CVHeaderDraft
    @State private var confirmDiscard = false
    @Environment(\.dismiss) private var dismiss

    init(model: CVEditorModel, draft: CVHeaderDraft) {
        self.model = model
        original = draft
        _draft = State(initialValue: draft)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CVLabeledField(L.nameLabel, text: $draft.name, kind: .name)
                    CVLabeledField(L.headlineLabel, text: $draft.headline)
                } footer: {
                    Text(L.headlineFooter).cvListFooter()
                }
                Section {
                    CVLabeledField(L.emailLabel, text: $draft.email, kind: .email)
                    CVLabeledField(L.phoneLabel, text: $draft.phone, kind: .phone)
                    CVLabeledField(L.websiteLabel, text: $draft.website, kind: .url)
                    CVLabeledField(L.cityLabel, text: $draft.city)
                } header: {
                    Text(L.contactHeader).cvListHeader()
                }
            }
            .navigationTitle(Text(L.sectionTitle(.header)))
            .bfhrInlineTitle()
            .confirmationDialog(Text(L.discardTitle), isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button(role: .destructive) { dismiss() } label: { Text(L.discard) }
                Button(role: .cancel) {} label: { Text(L.keepEditing) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { draft != original ? (confirmDiscard = true) : dismiss() } label: { Text(L.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        model.saveHeader(draft)
                        dismiss()
                    } label: { Text(L.save) }
                        .disabled(draft == original)
                }
            }
        }
        .interactiveDismissDisabled(draft != original)
    }
}

/// The Summary sheet (Luma): one long text with guidance and ✦ Improve.
struct CVSummarySheet: View {
    let model: CVEditorModel
    private let original: String
    @State private var text: String
    @State private var assist: CVAssistSession?
    @State private var confirmDiscard = false
    @State private var appliedCount = 0
    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    init(model: CVEditorModel, text: String) {
        self.model = model
        original = text
        _text = State(initialValue: text)
    }

    private var blanks: [String] { CVPlaceholders.find(in: text) }

    var body: some View {
        NavigationStack {
            Form {
                if !blanks.isEmpty {
                    Section {
                        InlineAlert(.warning, title: L.fillBlanksTitle(blanks.count), message: L.fillBlanksBody)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
                Section {
                    TextField(text: $text, prompt: Text(L.summaryPrompt), axis: .vertical) { Text(L.sectionTitle(.summary)) }
                        .font(.bfhr(.body))
                        .lineLimit(6...)
                } footer: {
                    Text(L.summaryFooter).cvListFooter()
                }
                if model.offersSuggestions {
                    Section {
                        Button {
                            guard let provider = model.suggestionProvider, let language = model.document?.language else { return }
                            assist = CVAssistSession(original: text, language: language, provider: provider)
                        } label: {
                            Label { Text(L.improveWithAI) } icon: { Image(systemName: "sparkles") }
                        }
                        .disabled(!model.canRequestSuggestions || text.trimmed.isEmpty)
                    } footer: {
                        if !model.canRequestSuggestions { NeedsConnectionNote() }
                    }
                }
            }
            .navigationTitle(Text(L.sectionTitle(.summary)))
            .bfhrInlineTitle()
            .confirmationDialog(Text(L.discardTitle), isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button(role: .destructive) { dismiss() } label: { Text(L.discard) }
                Button(role: .cancel) {} label: { Text(L.keepEditing) }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { text != original ? (confirmDiscard = true) : dismiss() } label: { Text(L.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        if model.saveSummary(text) { dismiss() }
                    } label: { Text(L.save) }
                        .disabled(text == original || !blanks.isEmpty)
                }
            }
            .bfhrToastHost()
        }
        .interactiveDismissDisabled(text != original)
        .sheet(item: $assist) { session in
            CVAssistSheet(session: session, onUse: apply, onEdit: apply)
        }
        .bfhrHaptic(.confirm, trigger: appliedCount)
    }

    private func apply(_ suggestion: String) {
        let previous = text
        text = suggestion
        assist = nil
        appliedCount += 1
        let binding = $text
        toasts?.show(ToastItem(glyph: "sparkles", message: L.suggestionApplied, action: .undo { binding.wrappedValue = previous }))
    }
}

// MARK: - Fields

/// A text field whose label stays visible above the value (floating label, long DE labels).
struct CVLabeledField: View {
    enum Kind {
        case text
        case name
        case email
        case phone
        case url
    }

    private let label: LocalizedStringResource
    @Binding private var text: String
    private let multiline: Bool
    private let kind: Kind

    init(_ label: LocalizedStringResource, text: Binding<String>, multiline: Bool = false, kind: Kind = .text) {
        self.label = label
        _text = text
        self.multiline = multiline
        self.kind = kind
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            field
                .font(.bfhr(.body))
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var field: some View {
        // Vertical fields grow with their text instead of clipping it (long titles, AX sizes);
        // single-value fields drop line breaks, so Return can't split a role or a name.
        let base = TextField(text: multiline ? $text : singleLine, axis: .vertical) { Text(label) }
            .accessibilityLabel(Text(label))
        #if os(iOS)
        switch kind {
        case .text: base
        case .name: base.textContentType(.name)
        case .email: base.textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        case .phone: base.textContentType(.telephoneNumber).keyboardType(.phonePad)
        case .url: base.textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        #else
        base
        #endif
    }

    private var singleLine: Binding<String> {
        Binding(get: { text }, set: { text = $0.replacingOccurrences(of: "\n", with: " ") })
    }
}

/// Month + year ("I currently work here" lives next to it). Stored as `yyyy-MM`; "Not set" clears.
struct CVMonthYearPicker: View {
    private let label: LocalizedStringResource
    @Binding private var iso: String?
    @Environment(\.locale) private var locale

    init(_ label: LocalizedStringResource, iso: Binding<String?>) {
        self.label = label
        _iso = iso
    }

    private var value: CVMonth? { iso.flatMap(CVMonth.init(iso:)) }

    var body: some View {
        LabeledContent {
            HStack(spacing: BFHRSpace.s1) {
                Picker(selection: monthBinding) {
                    Text(L.noMonth).tag(Int?.none)
                    ForEach(1...12, id: \.self) { month in
                        Text(verbatim: monthName(month)).tag(Int?.some(month))
                    }
                } label: { Text(L.monthLabel) }
                Picker(selection: yearBinding) {
                    Text(L.notSet).tag(Int?.none)
                    ForEach((1970...2035).reversed(), id: \.self) { year in
                        Text(verbatim: String(year)).tag(Int?.some(year))
                    }
                } label: { Text(L.yearLabel) }
            }
            .labelsHidden()
            .pickerStyle(.menu)
        } label: {
            Text(label)
        }
    }

    private var monthBinding: Binding<Int?> {
        Binding(
            get: { value?.month },
            set: { month in
                let year = value?.year ?? Calendar(identifier: .gregorian).component(.year, from: .now)
                iso = CVMonth(year: year, month: month).iso
            }
        )
    }

    private var yearBinding: Binding<Int?> {
        Binding(
            get: { value?.year },
            set: { year in iso = year.map { CVMonth(year: $0, month: value?.month).iso } }
        )
    }

    private func monthName(_ month: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        return calendar.standaloneMonthSymbols[month - 1]
    }
}
