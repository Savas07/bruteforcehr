import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// `ConfidenceField` on a row: amber tint, info glyph and a short reason. Never red; the reader
/// was unsure, the user didn't do anything wrong.
struct CVFlagNote: View {
    let flags: [CVImportFlag]

    var body: some View {
        if let reason {
            Label { Text(reason) } icon: { Image(systemName: "info.circle") }
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRTone.warning.text)
                .padding(.horizontal, BFHRSpace.s2)
                .padding(.vertical, BFHRSpace.s1)
                .background(BFHRTone.warning.subtle, in: BFHRRadius.shape(BFHRRadius.sm))
                .accessibilityIdentifier("cv.import.flag")
        }
    }

    private var reason: LocalizedStringResource? {
        guard !flags.isEmpty else { return nil }
        if flags.contains(where: { $0.field == .date }) { return L.flagDate }
        if flags.contains(where: { $0.field == .name }) { return L.flagName }
        return L.flagText
    }
}

/// The review's summary row: "We read 42 fields. 3 need a quick look." + the flagged filter.
struct CVImportSummarySection: View {
    @Bindable var flow: CVImportFlow

    var body: some View {
        Section {
            // The question sits here as the screen's heading; the inline nav title stays short.
            Text(L.importReviewTitle)
                .font(.bfhr(.title3, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
                .accessibilityAddTraits(.isHeader)
            Text(flow.openFlags.isEmpty ? L.importSummaryClear(flow.fieldCount) : L.importSummary(flow.fieldCount, flow.openFlags.count))
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
            if !flow.flags.isEmpty {
                Toggle(isOn: $flow.showsOnlyFlagged) { Text(L.showOnlyFlagged) }
                    .accessibilityIdentifier("cv.import.onlyFlagged")
            }
        } footer: {
            Text(L.importSummaryFooter).cvListFooter()
        }
    }
}

/// Import a file: reading progress, then the review ("Did we read your CV correctly?") with the
/// normal edit sheets, then Create CV. Failures say what happened and what to do next.
struct CVImportSheet: View {
    let flow: CVImportFlow
    let editor: CVEditorModel
    let onTryAnother: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var sheet: CVEditorSheet?

    var body: some View {
        NavigationStack {
            Group {
                switch flow.step {
                case .reading(let fileName):
                    VStack(spacing: BFHRSpace.s4) {
                        ProgressNote(L.importReading)
                        Text(verbatim: fileName).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                        Text(L.importReadingHint).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(BFHRSpace.s6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityIdentifier("cv.import.reading")
                case .failed(let error):
                    failure(error)
                case .review:
                    if let review = flow.review, let document = review.document {
                        CVEditSegment(model: review, document: document, sheet: $sheet, importFlow: flow)
                            .sheet(item: $sheet) { sheet in
                                CVSheetContent(model: review, sheet: sheet).environment(\.bfhrNow, review.now)
                            }
                            .safeAreaInset(edge: .bottom, spacing: 0) {
                                ButtonPair {
                                    Button {
                                        flow.create(in: editor)
                                        dismiss()
                                    } label: { Text(L.createCV) }
                                        .accessibilityIdentifier("cv.import.create")
                                } secondary: {
                                    Button(action: onTryAnother) { Text(L.tryAnotherFile) }
                                }
                                .padding(.horizontal, BFHRSpace.s4)
                                .padding(.vertical, BFHRSpace.s3)
                                .background(.bar)
                            }
                    }
                }
            }
            .background(BFHRColor.groupedBackground)
            .navigationTitle(Text(L.importTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(L.cancel) }
                }
            }
        }
        .interactiveDismissDisabled(flow.step == .review)
    }

    private func failure(_ error: CVImportError) -> some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s4) {
            Text(L.importFailedTitle(error)).font(.bfhr(.title3, emphasized: true)).foregroundStyle(BFHRColor.Fg.primary)
            Text(L.importFailedBody(error)).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.secondary)
            ButtonPair {
                Button(action: onTryAnother) { Text(L.chooseAnotherFile) }
            } secondary: {
                Button {
                    editor.startFromScratch()
                    dismiss()
                } label: { Text(L.startFromScratch) }
            }
        }
        .padding(BFHRSpace.s5)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityIdentifier("cv.import.failed")
    }
}
