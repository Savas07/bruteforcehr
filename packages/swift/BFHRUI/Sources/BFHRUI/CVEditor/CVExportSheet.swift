import BFHRCore
import BFHRDesignTokens
import SwiftUI
#if os(iOS)
import UIKit
#endif

private typealias L = CVEditorViewStrings

/// A file ready to share.
struct CVExportFile: Identifiable, Hashable {
    var url: URL
    var id: URL { url }
}

/// Builds export files into a fresh temporary folder (the share sheet reads them from there).
enum CVExporter {
    static func file(_ model: CVEditorModel, format: CVExportFormat, paper: CvPaperSize, fileName: String) async throws -> CVExportFile {
        let data: Data
        switch format {
        case .json:
            data = try model.jsonExport()
        case .docx:
            data = try await model.docxExport(paper: paper)
        case .pdf:
            #if os(iOS)
            guard let content = model.exportContent(paper: paper), let language = model.document?.language else {
                throw CVExportError.failed("No CV selected")
            }
            let rendered = try model.render(content, language: language).get()
            data = try await CVPDFRenderer().pdf(rendered).data
            #else
            throw CVExportError.noRenderer
            #endif
        }
        let folder = FileManager.default.temporaryDirectory.appending(path: "Exports/\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: sanitized(fileName, format: format))
        try data.write(to: url, options: .completeFileProtection)
        return CVExportFile(url: url)
    }

    /// A safe file name with the format's extension.
    static func sanitized(_ name: String, format: CVExportFormat) -> String {
        var base = name.trimmingCharacters(in: .whitespacesAndNewlines)
        for ext in CVExportFormat.allCases where base.lowercased().hasSuffix("." + ext.fileExtension) {
            base = String(base.dropLast(ext.fileExtension.count + 1))
        }
        base = base.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>")).joined(separator: "-")
        if base.isEmpty { base = "CV" }
        return base + "." + format.fileExtension
    }
}

/// Export options… (Craft): format, paper and file name, then the share sheet. The file name
/// defaults to `First-Last-CV.pdf`.
struct CVExportSheet: View {
    let model: CVEditorModel
    @Environment(\.dismiss) private var dismiss
    @State private var format: CVExportFormat = .pdf
    @State private var paper: CvPaperSize
    @State private var baseName: String
    @State private var working = false
    @State private var failed = false
    @State private var file: CVExportFile?

    init(model: CVEditorModel) {
        self.model = model
        _paper = State(initialValue: model.document?.content.meta.theme.paperSize ?? .a4)
        _baseName = State(initialValue: (model.exportFileName(format: .pdf) as NSString).deletingPathExtension)
    }

    private var docxAvailable: Bool { model.renderEngine?.buildsDocx ?? false }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(selection: $format) {
                        Text(verbatim: "PDF").tag(CVExportFormat.pdf)
                        if docxAvailable { Text(verbatim: "DOCX").tag(CVExportFormat.docx) }
                        Text(verbatim: "JSON").tag(CVExportFormat.json)
                    } label: {
                        Text(L.exportFormat)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("cv.export.format")
                } header: {
                    Text(L.exportFormat)
                } footer: {
                    Text(L.exportFormatFooter(format))
                }
                if format != .json {
                    Section {
                        Picker(selection: $paper) {
                            Text(verbatim: "A4").tag(CvPaperSize.a4)
                            Text(verbatim: "Letter").tag(CvPaperSize.letter)
                        } label: {
                            Text(L.paper)
                        }
                    }
                }
                Section {
                    HStack(spacing: BFHRSpace.s1) {
                        TextField(text: $baseName) { Text(L.fileName) }
                            .autocorrectionDisabled()
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            #endif
                            .accessibilityIdentifier("cv.export.fileName")
                        Text(verbatim: "." + format.fileExtension)
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .accessibilityHidden(true)
                    }
                } header: {
                    Text(L.fileName)
                }
                if failed {
                    Section {
                        InlineAlert(.error, title: L.exportFailedTitle, message: L.exportFailedBody)
                    }
                }
            }
            .navigationTitle(Text(L.exportSheetTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(L.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await share() } } label: {
                        if working { ProgressView() } else { Text(L.share).fontWeight(.semibold) }
                    }
                    .disabled(working)
                    .accessibilityIdentifier("cv.export.share")
                }
            }
            .cvShareSheet($file)
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private func share() async {
        working = true
        failed = false
        defer { working = false }
        do {
            file = try await CVExporter.file(model, format: format, paper: paper, fileName: baseName)
        } catch {
            failed = true
        }
    }
}

extension View {
    /// Presents the system share sheet for `file` while it's set.
    func cvShareSheet(_ file: Binding<CVExportFile?>) -> some View {
        #if os(iOS)
        sheet(item: file) { file in
            CVActivityView(items: [file.url])
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
        #else
        self
        #endif
    }
}

#if os(iOS)
/// `UIActivityViewController` for a file.
struct CVActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
