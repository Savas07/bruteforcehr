import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// "Tailor for this job" (research/apply.md "Tailor review"; Deel/Speak cards, Manus Changes /
/// Preview, GoFundMe intensity): the Light / Thorough choice, "Reading the job description…",
/// the AI-off and limit states, then one card per suggested edit and the bottom bar with
/// Accept all (D44), Keep original for the rest and Save as new version. Used by the Apply sheet
/// and by CV Studio's "Tailor for a job…".
public struct TailorReviewPage: View {
    @Bindable private var model: TailorReviewModel
    private let onSaved: (CvRevision) -> Void
    @Environment(\.openURL) private var openURL

    public init(model: TailorReviewModel, onSaved: @escaping (CvRevision) -> Void) {
        self.model = model
        self.onSaved = onSaved
    }

    public var body: some View {
        Group {
            switch model.phase {
            case .choosing: choice
            case .loading: loading
            case .failed(let error): failure(error)
            case .review, .saved: review
            }
        }
    }

    // MARK: Choice

    private var choice: some View {
        Form {
            Section {
                Text(ApplyStrings.tailorIntro)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Label {
                    Text(ApplyStrings.tailorFrom(model.cvTitle, language: model.language.uppercased()))
                } icon: { Image(systemName: "doc.text").accessibilityHidden(true) }
                .font(.bfhr(.body))
            }
            Section {
                ForEach([TailorIntensity.light, .thorough], id: \.self) { intensity in
                    RadioRow(isSelected: model.intensity == intensity) {
                        model.intensity = intensity
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(intensity == .light ? ApplyStrings.light : ApplyStrings.thorough)
                                .font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                            Text(intensity == .light ? ApplyStrings.lightBody : ApplyStrings.thoroughBody)
                                .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    } trailing: { EmptyView() }
                    .accessibilityIdentifier("apply.tailor.\(intensity.rawValue)")
                }
            } header: {
                Text(ApplyStrings.intensityLabel).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                disclosure
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ApplyBottomBar {
                Button { Task { await model.start() } } label: {
                    Label { Text(ApplyStrings.suggestEdits) } icon: { Image(systemName: "sparkles") }
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .accessibilityIdentifier("apply.tailor.suggest")
            }
        }
    }

    private var disclosure: some View {
        Label { Text(ApplyStrings.aiDisclosure) } icon: { Image(systemName: "sparkles") }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
    }

    // MARK: Loading / failure

    private var loading: some View {
        VStack(spacing: BFHRSpace.s4) {
            ProgressView()
            Text(ApplyStrings.tailorLoading)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .multilineTextAlignment(.center)
            Button { model.cancel() } label: { Text(ApplyStrings.cancel) }
                .buttonStyle(.bfhr(.secondary))
                .accessibilityIdentifier("apply.tailor.cancel")
        }
        .padding(BFHRSpace.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("apply.tailor.loading")
    }

    private func failure(_ error: ApplyAIError) -> some View {
        List {
            Section {
                InlineAlert(
                    error == .aiDisabled || error == .dailyLimit ? .info : .warning,
                    title: ApplyStrings.aiErrorTitle(error),
                    message: ApplyStrings.tailorErrorBody(error),
                    actionTitle: Self.actionTitle(error),
                    action: Self.actionTitle(error) == nil ? nil : { act(on: error) }
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .accessibilityIdentifier("apply.tailor.error")
            }
        }
        .bfhrInsetGroupedList()
    }

    static func actionTitle(_ error: ApplyAIError) -> LocalizedStringResource? {
        switch error {
        case .aiDisabled: ApplyStrings.openAISettings
        case .offline, .failed: Strings.tryAgain
        case .dailyLimit, .emailUnverified, .notFound: nil
        }
    }

    private func act(on error: ApplyAIError) {
        if error == .aiDisabled {
            openURL(URL(string: "bruteforcehr://settings/ai")!)
        } else {
            Task { await model.start() }
        }
    }

    // MARK: Review

    private var review: some View {
        let cards = model.cards
        return VStack(spacing: 0) {
            if !cards.isEmpty {
                Picker(selection: $model.showsPreview) {
                    Text(ApplyStrings.changes).tag(false)
                    Text(ApplyStrings.preview).tag(true)
                } label: { Text(ApplyStrings.viewLabel) }
                .pickerStyle(.segmented)
                .padding(.horizontal, BFHRSpace.s4)
                .padding(.vertical, BFHRSpace.s2)
                .accessibilityIdentifier("apply.tailor.view")
            }
            if cards.isEmpty {
                List {
                    EmptyState(.subArea, glyph: "checkmark.seal", title: ApplyStrings.noEditsTitle, message: ApplyStrings.noEditsBody)
                        .listRowBackground(Color.clear)
                }
                .bfhrInsetGroupedList()
            } else if model.showsPreview {
                TailorPreview(model: model)
            } else {
                changes
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !cards.isEmpty { reviewBar }
        }
    }

    private var changes: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    Text(ApplyStrings.suggestedEdits(model.response?.edits.count ?? 0))
                        .font(.bfhr(.title3, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .accessibilityAddTraits(.isHeader)
                    Text(ApplyStrings.tally(accepted: model.acceptedCount, kept: model.keptCount, pending: model.pendingCount))
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .accessibilityIdentifier("apply.tailor.tally")
                    disclosure
                    if let dropped = model.response?.dropped, dropped > 0 {
                        Text(ApplyStrings.droppedNote(dropped))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: BFHRSpace.s2, leading: BFHRSpace.s4, bottom: BFHRSpace.s2, trailing: BFHRSpace.s4))
                if model.sections.count > 1 {
                    ChipFlow {
                        Toggle(isOn: Binding(get: { model.sectionFilter == nil }, set: { if $0 { model.sectionFilter = nil } })) {
                            Text(ApplyStrings.allSections)
                        }
                        ForEach(model.sections, id: \.self) { section in
                            Toggle(isOn: Binding(
                                get: { model.sectionFilter == section },
                                set: { model.sectionFilter = $0 ? section : nil }
                            )) { Text(ApplyStrings.section(section)) }
                        }
                    }
                    .toggleStyle(.bfhrChip)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: BFHRSpace.s4, bottom: BFHRSpace.s2, trailing: BFHRSpace.s4))
                }
            }
            ForEach(model.visibleCards) { card in
                Section {
                    TailorCardView(
                        card: card,
                        decide: { model.decide(card.id, $0) },
                        undecide: { model.undecide(card.id) }
                    )
                    .accessibilityIdentifier("apply.tailor.card.\(card.id)")
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private var reviewBar: some View {
        ApplyBottomBar {
            if let blocker = model.saveBlocker {
                Text(ApplyStrings.saveBlocker(blocker))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("apply.tailor.blocker")
            }
            if model.pendingCount > 0 || model.acceptableCount > 0 {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: BFHRSpace.s2) { bulkButtons }
                    VStack(spacing: BFHRSpace.s2) { bulkButtons }
                }
            }
            Button(action: save) { Text(ApplyStrings.saveVersion) }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .disabled(model.saveBlocker != nil || model.phase == .saved)
                .accessibilityIdentifier("apply.tailor.save")
        }
    }

    @ViewBuilder
    private var bulkButtons: some View {
        if model.acceptableCount > 0 {
            Button { model.acceptAll() } label: { Text(ApplyStrings.acceptAll(model.acceptableCount)) }
                .buttonStyle(.bfhr(.secondary, fullWidth: true))
                .accessibilityIdentifier("apply.tailor.acceptAll")
        }
        if model.pendingCount > 0 {
            Button { model.keepRest() } label: { Text(ApplyStrings.keepRest(model.pendingCount)) }
                .buttonStyle(.bfhr(.secondary, fullWidth: true))
                .accessibilityIdentifier("apply.tailor.keepRest")
        }
    }

    private func save() {
        guard let revision = model.save() else { return }
        onSaved(revision)
    }
}

/// One suggested edit: where, what kind, Original (struck through) → Suggestion, Why, Based on,
/// and Accept / Keep original; decided cards say so with "Decide again". The diff is in words
/// ("Original", "Suggestion"), not only strike-through and color.
struct TailorCardView: View {
    let card: TailorCard
    let decide: (TailorDecision) -> Void
    let undecide: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                Text(verbatim: ApplyStrings.location(card.location))
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(ApplyStrings.operation(card.op))
                    .font(.bfhr(.caption1, emphasized: true))
                    .foregroundStyle(BFHRTone.info.text)
                    .padding(.horizontal, BFHRSpace.s2)
                    .padding(.vertical, 2)
                    .background(BFHRTone.info.subtle, in: Capsule())
            }
            if let before = card.before {
                labeled(ApplyStrings.original) {
                    Text(verbatim: before)
                        .strikethrough(card.op != .reorder, color: BFHRColor.Fg.secondary)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            labeled(ApplyStrings.suggestion) {
                if let after = card.after {
                    Text(Self.highlightingGaps(after))
                        .foregroundStyle(BFHRColor.Fg.primary)
                } else {
                    Text(ApplyStrings.removedBullet).foregroundStyle(BFHRColor.Fg.primary)
                }
            }
            labeled(ApplyStrings.why) {
                Text(verbatim: card.reason).foregroundStyle(BFHRColor.Fg.primary)
            }
            if !card.groundedIn.isEmpty {
                labeled(ApplyStrings.basedOn) {
                    Text(verbatim: card.groundedIn.map(ApplyStrings.location).joined(separator: "; "))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            if let gap = card.gap {
                Label { Text(ApplyStrings.gapNote(gap)) } icon: { Image(systemName: "number.square") }
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRTone.warning.text)
            }
            if let skipped = card.skipped {
                Label { Text(ApplyStrings.skipped(skipped)) } icon: { Image(systemName: "info.circle") }
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            decision
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    @ViewBuilder
    private var decision: some View {
        switch card.decision {
        case nil:
            ButtonPair {
                Button { decide(.accepted) } label: { Text(ApplyStrings.accept) }
                    .disabled(card.gap != nil)
                    .accessibilityIdentifier("apply.tailor.accept.\(card.id)")
            } secondary: {
                Button { decide(.kept) } label: { Text(ApplyStrings.keepOriginal) }
                    .accessibilityIdentifier("apply.tailor.keep.\(card.id)")
            }
        case let decision?:
            HStack(spacing: BFHRSpace.s2) {
                Label {
                    Text(decision == .accepted ? ApplyStrings.accepted : ApplyStrings.keptOriginal)
                } icon: {
                    Image(systemName: decision == .accepted ? "checkmark.circle.fill" : "arrow.uturn.backward.circle")
                }
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(decision == .accepted ? BFHRColor.Accent.text : BFHRColor.Fg.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                Button { undecide() } label: { Text(ApplyStrings.decideAgain) }
                    .buttonStyle(.bfhr(.plain))
                    .accessibilityIdentifier("apply.tailor.undo.\(card.id)")
            }
        }
    }

    private func labeled(_ title: LocalizedStringResource, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.bfhr(.caption1, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.secondary)
            content().font(.bfhr(.body))
        }
        .accessibilityElement(children: .combine)
    }

    /// `[X%]` gaps stand out (bold, underlined) so the user sees what's missing.
    static func highlightingGaps(_ text: String) -> AttributedString {
        var attributed = AttributedString(text)
        for gap in Set(CVPlaceholders.find(in: text)) {
            var searchRange = attributed.startIndex..<attributed.endIndex
            while let range = attributed[searchRange].range(of: gap) {
                attributed[range].inlinePresentationIntent = .stronglyEmphasized
                attributed[range].underlineStyle = .single
                searchRange = range.upperBound..<attributed.endIndex
            }
        }
        return attributed
    }
}

/// The tailored CV with the accepted suggestions, as cv-render draws it.
struct TailorPreview: View {
    let model: TailorReviewModel

    var body: some View {
        VStack(spacing: BFHRSpace.s2) {
            Text(ApplyStrings.previewNote)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, BFHRSpace.s4)
            #if os(iOS)
            if let rendered = model.previewHTML() {
                CVWebPage(rendered: rendered, accessibilityIdentifier: "apply.tailor.previewPage")
                    .padding(.horizontal, BFHRSpace.s2)
            } else {
                unavailable
            }
            #else
            unavailable
            #endif
        }
        .padding(.top, BFHRSpace.s2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(BFHRColor.Surface.canvas)
    }

    private var unavailable: some View {
        Text(ApplyStrings.previewUnavailable)
            .font(.bfhr(.body))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .padding(BFHRSpace.s4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The sheet's sticky bottom bar: bar material, a hairline on top, capped at AX1 like Job
/// detail's Apply bar (the Large Content Viewer covers larger sizes).
struct ApplyBottomBar<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: BFHRSpace.s2) {
            content()
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s2)
        .frame(maxWidth: .infinity)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }
}
