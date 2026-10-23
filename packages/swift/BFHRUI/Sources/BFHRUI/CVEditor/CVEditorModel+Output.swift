import BFHRCore
import Foundation

/// Export formats (Export options…).
public enum CVExportFormat: String, Hashable, Sendable, CaseIterable, Identifiable {
    case pdf
    case docx
    case json

    public var id: Self { self }

    public var fileExtension: String { rawValue }

    public var mimeType: String {
        switch self {
        case .pdf: "application/pdf"
        case .docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case .json: "application/json"
        }
    }
}

public enum CVExportError: Error, Hashable, Sendable {
    case noRenderer
    case failed(String)
}

extension CVEditorModel {
    // MARK: Rendering

    /// cv-render's HTML for `content` in `language`.
    public func render(_ content: CvContent, language: String) -> Result<CVRenderedHTML, CVRenderError> {
        guard let renderEngine else { return .failure(.bundleMissing) }
        let input = CVRenderInput(content: content, locale: language)
        if let cached = renderCache[input] { return .success(cached) }
        do {
            let rendered = try renderEngine.render(input)
            if renderCache.count >= 12 { renderCache.removeAll() }
            renderCache[input] = rendered
            return .success(rendered)
        } catch let error as CVRenderError {
            return .failure(error)
        } catch {
            return .failure(.script(String(describing: error)))
        }
    }

    /// The selected CV's HTML.
    public var renderedDocument: Result<CVRenderedHTML, CVRenderError>? {
        document.map { render($0.content, language: $0.language) }
    }

    /// Templates, font pairs and accents in the UI language (from the bundle; cached).
    public func catalog(locale: String = CVEditorModel.uiLanguage) -> CVTemplateCatalog? {
        if let cached = catalogCache[locale] { return cached }
        guard let catalog = try? renderEngine?.catalog(locale: locale) else { return nil }
        catalogCache[locale] = catalog
        return catalog
    }

    /// The app's UI language ("en", "tr" or "de").
    public static var uiLanguage: String {
        let code = Bundle.main.preferredLocalizations.first.map { Locale(identifier: $0).language.languageCode?.identifier ?? "en" } ?? "en"
        return ["en", "de", "tr"].contains(code) ? code : "en"
    }

    // MARK: Export

    /// The default file name: `First-Last-CV[-Company].<ext>` from the CV's own name.
    public func exportFileName(format: CVExportFormat, company: String? = nil) -> String {
        let name = document?.content.basics?.name
        if let engine = renderEngine, let fileName = try? engine.fileName(name: name, company: company, ext: format.fileExtension) {
            return fileName
        }
        let parts = (name ?? "").split(whereSeparator: \.isWhitespace).map(String.init) + ["CV"] + [company?.nilIfBlank].compactMap { $0 }
        return parts.joined(separator: "-") + "." + format.fileExtension
    }

    /// The selected CV's content with the paper chosen in Export options.
    func exportContent(paper: CvPaperSize) -> CvContent? {
        guard var content = document?.content else { return nil }
        content.meta.theme.paperSize = paper
        return content
    }

    /// JSON export: the JSON Resume with its `meta` (lossless re-import).
    public func jsonExport() throws -> Data {
        guard let content = document?.content else { throw CVExportError.failed("No CV selected") }
        let encoder = BFHRJSON.encoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(content)
    }

    /// DOCX from the same JSON (the bundle's `docx` builder, on the device).
    public func docxExport(paper: CvPaperSize) async throws -> Data {
        guard let renderEngine, renderEngine.buildsDocx else { throw CVExportError.noRenderer }
        guard let content = exportContent(paper: paper), let language = document?.language else { throw CVExportError.failed("No CV selected") }
        return try await renderEngine.docx(CVRenderInput(content: content, locale: language))
    }
}
