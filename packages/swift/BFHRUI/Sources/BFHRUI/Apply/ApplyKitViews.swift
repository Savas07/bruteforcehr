import BFHRCore
import BFHRDesignTokens
import SwiftUI
import UniformTypeIdentifiers

// The external-apply kit's pieces (research/apply.md "External channel: application kit": N26
// copy sheet, Wise "Copy" pills, Public's toast naming the item) and the email's attachment
// picker (Fabric "your files", Shopify multi-select tray, Telegram size note).

/// The answers for this job, grouped by kind, each with a Copy pill.
struct KitAnswersSections: View {
    let answers: [KitAnswer]
    let onCopy: (KitAnswer) -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        if answers.isEmpty {
            Section {
                Text(ApplyStrings.noAnswers)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Button { openURL(URL(string: "bruteforcehr://settings/answers")!) } label: {
                    Label { Text(ApplyStrings.addAnswers) } icon: { Image(systemName: "plus") }
                }
                .accessibilityIdentifier("apply.kit.addAnswers")
            } header: {
                Text(ApplyStrings.answersSection).foregroundStyle(BFHRColor.Fg.secondary)
            }
        } else {
            let kinds = AnswerKind.allCases.filter { kind in answers.contains { $0.kind == kind } }
            ForEach(Array(kinds.enumerated()), id: \.element) { index, kind in
                Section {
                    ForEach(answers.filter { $0.kind == kind }) { answer in
                        AnswerCopyRow(answer: answer) { onCopy(answer) }
                    }
                } header: {
                    VStack(alignment: .leading, spacing: 2) {
                        if index == 0 {
                            Text(ApplyStrings.answersSection)
                                .font(.bfhr(.headline))
                                .foregroundStyle(BFHRColor.Fg.primary)
                                .textCase(nil)
                                .accessibilityAddTraits(.isHeader)
                        }
                        Text(ApplyStrings.answerKind(kind)).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                } footer: {
                    if index == kinds.count - 1 {
                        Text(ApplyStrings.answersFooter).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
            }
        }
    }
}

/// Label above value (two lines, tap to expand), and a "Copy" pill (a labelled text button: a
/// larger target than a bare icon).
struct AnswerCopyRow: View {
    let answer: KitAnswer
    let copy: () -> Void
    @State private var expanded = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s2))
            : AnyLayout(HStackLayout(alignment: .center, spacing: BFHRSpace.s3))
        layout {
            Button { expanded.toggle() } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: answer.label)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                    Text(verbatim: answer.text)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .lineLimit(expanded ? nil : 2)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            Button(action: copy) {
                Text(ApplyStrings.copy)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .padding(.horizontal, BFHRSpace.s3)
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                    .background(BFHRColor.Accent.subtle, in: Capsule())
                    .foregroundStyle(BFHRColor.Accent.text)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(ApplyStrings.copyItem(answer.label)))
            .accessibilityIdentifier("apply.kit.copy.\(answer.id)")
        }
    }
}

/// A PDF for "Save to Files" (`fileExporter`).
struct ApplyFileDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.pdf]
    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

/// A file made for this application in the kit: name and size, then Save to Files and Share.
struct KitFileRow: View {
    let file: ApplyFile
    let onSaved: () -> Void
    @State private var exports = false

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            HStack(spacing: BFHRSpace.s3) {
                Image(systemName: "doc.richtext")
                    .foregroundStyle(BFHRColor.Accent.text)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: file.fileName).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                    Text(verbatim: ByteCountFormatter.string(fromByteCount: Int64(file.sizeBytes), countStyle: .file))
                        .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(ApplyStrings.fileKind(file.kind)))
                .accessibilityValue(Text(verbatim: ByteCountFormatter.string(fromByteCount: Int64(file.sizeBytes), countStyle: .file)))
            }
            // Stacked full width: side by side, "Save to Files" wrapped onto two lines on iPhone 17e
            // next to a one-line "Share" (half the row is narrower than its one-line label).
            VStack(spacing: BFHRSpace.s2) { actions }
        }
        .fileExporter(
            isPresented: $exports,
            document: ApplyFileDocument(data: file.data),
            contentType: .pdf,
            defaultFilename: file.fileName
        ) { result in
            if case .success = result { onSaved() }
        }
    }

    @ViewBuilder
    private var actions: some View {
        Button { exports = true } label: {
            Label { Text(ApplyStrings.saveToFiles) } icon: { Image(systemName: "folder") }
        }
        .buttonStyle(.bfhr(.secondary, fullWidth: true))
        .accessibilityIdentifier("apply.kit.saveToFiles.\(file.id)")
        if let url = file.temporaryURL {
            ShareLink(item: url) {
                Label { Text(ApplyStrings.share) } icon: { Image(systemName: "square.and.arrow.up") }
            }
            .buttonStyle(.bfhr(.secondary, fullWidth: true))
            .accessibilityLabel(Text(ApplyStrings.shareFile(String(localized: ApplyStrings.fileKind(file.kind)))))
            .accessibilityIdentifier("apply.kit.share.\(file.id)")
        }
    }
}

// MARK: - Attachments

/// The email's extra attachments: one row each with Remove, the total against the account's
/// limit, and "Add attachment".
struct ExtraAttachmentRows: View {
    let model: ApplyModel
    let add: () -> Void

    var body: some View {
        ForEach(model.extraFiles) { file in
            HStack(spacing: BFHRSpace.s3) {
                Image(systemName: "paperclip")
                    .foregroundStyle(BFHRColor.Accent.text)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: file.fileName).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                    Text(verbatim: ByteCountFormatter.string(fromByteCount: Int64(file.sizeBytes), countStyle: .file))
                        .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                Button { model.removeAttachment(file.id) } label: {
                    Image(systemName: "minus.circle")
                        .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                }
                .buttonStyle(.borderless)
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityLabel(Text(verbatim: "\(String(localized: ApplyStrings.remove)) \(file.fileName)"))
                .accessibilityIdentifier("apply.attach.remove.\(file.id)")
            }
        }
        Button(action: add) {
            Label { Text(ApplyStrings.addAttachment) } icon: { Image(systemName: "plus") }
        }
        .disabled(model.attachmentSlotsLeft == 0)
        .accessibilityIdentifier("apply.attach.add")
    }
}

/// "Add attachments" (medium/large sheet): your saved files with checkmarks and a tray
/// "Add 2 selected", From Files…, and the provider's limits up front.
struct AttachmentPickerSheet: View {
    let model: ApplyModel
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Set<String> = []
    @State private var importsFiles = false
    @State private var importError: LocalizedStringResource?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if model.savedAttachmentOptions.isEmpty {
                        Text(ApplyStrings.attachNoFiles)
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    ForEach(model.savedAttachmentOptions) { file in
                        RadioRow(isSelected: selected.contains(file.id)) {
                            if selected.contains(file.id) { selected.remove(file.id) } else { selected.insert(file.id) }
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: file.fileName).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                                HStack(spacing: BFHRSpace.s1) {
                                    Text(verbatim: ApplyStrings.fileDetail(file))
                                    Text(verbatim: "·")
                                    Text(file.createdAt, format: .dateTime.day().month(.abbreviated).year())
                                }
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                            }
                        } trailing: { EmptyView() }
                        .accessibilityIdentifier("apply.attach.file.\(file.id)")
                    }
                } header: {
                    Text(ApplyStrings.attachYourFiles).foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    Button { importsFiles = true } label: {
                        Label { Text(ApplyStrings.attachFromFiles) } icon: { Image(systemName: "folder") }
                    }
                    .disabled(model.attachmentSlotsLeft == 0)
                    .accessibilityIdentifier("apply.attach.fromFiles")
                    if let importError {
                        Text(importError)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRTone.warning.text)
                    }
                } header: {
                    Text(ApplyStrings.attachOther).foregroundStyle(BFHRColor.Fg.secondary)
                } footer: {
                    Text(ApplyStrings.attachLimits(Self.size(model.attachmentLimitBytes))).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(ApplyStrings.attachTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(ApplyStrings.cancel) }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !selected.isEmpty { tray }
            }
            .fileImporter(
                isPresented: $importsFiles,
                allowedContentTypes: MailSendLimits.contentTypes.compactMap { UTType(mimeType: $0) },
                allowsMultipleSelection: true
            ) { result in
                importFromFiles(result)
            }
        }
        .presentationDetents([.medium, .large])
        // Opaque like the app's other list sheets: the default glass let the composer's text and
        // its Send button show through the file rows at the medium detent.
        .presentationBackground(BFHRColor.groupedBackground)
        .accessibilityIdentifier("apply.attach.sheet")
    }

    private var tray: some View {
        let bytes = model.savedAttachmentOptions.filter { selected.contains($0.id) }.reduce(0) { $0 + $1.sizeBytes }
        let problem = model.problem(adding: selected.count, bytes: bytes)
        return ApplyBottomBar {
            if let problem {
                Text(ApplyStrings.attachProblem(problem, limit: Self.size(model.attachmentLimitBytes)))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button {
                model.attachSaved(model.savedAttachmentOptions.filter { selected.contains($0.id) }.map(\.id))
                dismiss()
            } label: { Text(ApplyStrings.attachSelected(selected.count)) }
            .buttonStyle(.bfhr(.primary, fullWidth: true))
            .disabled(problem != nil)
            .accessibilityIdentifier("apply.attach.addSelected")
        }
    }

    private func importFromFiles(_ result: Result<[URL], any Error>) {
        guard case .success(let urls) = result else { return }
        importError = nil
        var picked: [(name: String, data: Data, type: String)] = []
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else {
                importError = ApplyStrings.attachUnreadable
                continue
            }
            guard let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType,
                  MailSendLimits.contentTypes.contains(type) else {
                importError = ApplyStrings.attachUnsupported
                continue
            }
            picked.append((url.lastPathComponent, data, type))
        }
        if let problem = model.problem(adding: picked.count, bytes: picked.reduce(0) { $0 + $1.data.count }) {
            importError = ApplyStrings.attachProblem(problem, limit: Self.size(model.attachmentLimitBytes))
            return
        }
        for file in picked { model.attachFromDevice(fileName: file.name, data: file.data, contentType: file.type) }
        if importError == nil, !picked.isEmpty { dismiss() }
    }

    static func size(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
