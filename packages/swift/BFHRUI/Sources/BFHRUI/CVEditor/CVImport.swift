import BFHRCore
import Foundation
import NaturalLanguage
import Observation

// Import (cv-editor.md "Import"): pick a file → upload to `users/{uid}/cv-imports/{id}` →
// `cvImport` reads it (Claude for PDF/DOCX, deterministic mappers for JSON Resume and LinkedIn
// exports) → the review screen highlights fields the reader wasn't sure about → Create CV.

/// The file kinds `cvImport` reads.
public enum CVImportFileKind: String, Hashable, Sendable, CaseIterable {
    case pdf
    case docx
    case json
    case linkedinZip = "linkedin-zip"

    /// From the picked file's extension; nil for anything else.
    public init?(fileExtension: String) {
        switch fileExtension.lowercased() {
        case "pdf": self = .pdf
        case "docx": self = .docx
        case "json": self = .json
        case "zip": self = .linkedinZip
        default: return nil
        }
    }

    /// `Cv.importedFrom.kind`.
    public var storedKind: CvImportKind {
        switch self {
        case .pdf: .pdf
        case .docx: .docx
        case .json: .jsonResume
        case .linkedinZip: .linkedinZip
        }
    }

    public var contentType: String {
        switch self {
        case .pdf: "application/pdf"
        case .docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case .json: "application/json"
        case .linkedinZip: "application/zip"
        }
    }

    /// The storage rule's limit (firebase/storage.rules).
    public static let maxBytes = 20 * 1024 * 1024
}

/// What `cvImport` read.
public struct CVImportResult: Sendable {
    /// JSON Resume sections without `meta` (the editor adds it).
    public var resumeJSON: Data
    /// JSON pointer ("/work/0/endDate") → confidence 0…1. Missing pointers count as sure.
    public var confidence: [String: Double]
    public var warnings: [String]

    public init(resumeJSON: Data, confidence: [String: Double], warnings: [String]) {
        self.resumeJSON = resumeJSON
        self.confidence = confidence
        self.warnings = warnings
    }
}

public enum CVImportError: Error, Hashable, Sendable {
    case offline
    case tooLarge
    case unsupported
    /// The file has no readable text (a scan) or couldn't be opened.
    case unreadable
    /// AI is off for this account.
    case aiDisabled
    /// Today's AI budget is used up.
    case dailyLimit
    case other(String)
}

/// Uploads and reads CV files (Cloud Storage + `cvImport` in the app).
public protocol CVImporter: AnyObject {
    /// Uploads the file and returns its storage path.
    func upload(_ data: Data, kind: CVImportFileKind) async throws(CVImportError) -> String
    func read(storagePath: String, kind: CVImportFileKind) async throws(CVImportError) -> CVImportResult
}

extension CvContent {
    /// Imported JSON Resume sections with a new CV's `meta`: the default template and theme, and
    /// the sections that hold something in cv-render's standard order.
    static func imported(resumeJSON: Data, language: String, timezone: String?) throws -> CvContent {
        guard var object = try JSONSerialization.jsonObject(with: resumeJSON) as? [String: Any] else {
            throw CVImportError.unreadable
        }
        let standard = ["basics"] + CVSectionKind.standardListSections.map(\.orderKey)
        let order = standard.filter { key in
            if key == "basics" { return true }
            return (object[key] as? [Any]).map { !$0.isEmpty } ?? false
        }
        let theme = CVTemplateCatalog.defaultTheme(language: language, timezone: timezone)
        let meta = CvMeta(template: CVTemplateCatalog.defaultTemplateId, theme: theme, sectionOrder: order, customSections: [])
        object["meta"] = try JSONSerialization.jsonObject(with: BFHRJSON.encoder().encode(meta))
        return try BFHRJSON.decoder().decode(CvContent.self, from: JSONSerialization.data(withJSONObject: object))
    }

    /// The CV's language from its prose: en, de or tr, else `fallback`.
    func detectedLanguage(fallback: String) -> String {
        var texts = [basics?.label, basics?.summary].compactMap { $0 }
        for item in work ?? [] { texts += [item.position, item.summary].compactMap { $0 } + (item.highlights ?? []) }
        let recognizer = NLLanguageRecognizer()
        recognizer.languageConstraints = [.english, .german, .turkish]
        recognizer.processString(texts.joined(separator: "\n"))
        return recognizer.dominantLanguage.map(\.rawValue) ?? fallback
    }
}

/// A field the reader wasn't sure about, on the review screen.
public struct CVImportFlag: Hashable, Sendable, Identifiable {
    public enum Field: Hashable, Sendable {
        case date
        case name
        case text
    }

    /// The JSON pointer ("/work/0/endDate").
    public var id: String
    public var sectionKey: String
    /// Item index for list sections; nil for `basics`.
    public var index: Int?
    public var field: Field
    public var confidence: Double
}

/// The import flow: picking → reading → review (a scratch editor over the imported content, so
/// the normal edit sheets work) → Create CV.
@Observable
public final class CVImportFlow: Identifiable {
    public enum Step: Equatable {
        case reading(fileName: String)
        case review
        case failed(CVImportError)
    }

    /// Below this confidence a field is flagged ("We weren't sure about this").
    public static let flagThreshold = 0.8

    public let id = UUID()
    public private(set) var step: Step
    public private(set) var fileName: String
    /// The review editor: the imported CV as an unsaved CV (no writer), edited with the usual
    /// sheets. Nil until the file is read.
    public private(set) var review: CVEditorModel?
    public private(set) var flags: [CVImportFlag] = []
    /// Flags the user opened or confirmed.
    public private(set) var resolved: Set<String> = []
    public private(set) var fieldCount = 0
    public private(set) var language = "en"
    public var showsOnlyFlagged = false

    private var original: CvImportedFile?
    private let importer: any CVImporter
    private let timezone: String?

    /// The file couldn't be read before upload (wrong type, no access).
    public func fail(_ error: CVImportError) {
        step = .failed(error)
    }
    private let uiLanguage: String

    public init(fileName: String, importer: any CVImporter, timezone: String?, uiLanguage: String) {
        self.fileName = fileName
        self.importer = importer
        self.timezone = timezone
        self.uiLanguage = uiLanguage
        step = .reading(fileName: fileName)
    }

    /// Uploads and reads the file.
    public func run(data: Data, kind: CVImportFileKind, renderEngine: CVRenderEngine?, now: Date) async {
        step = .reading(fileName: fileName)
        guard data.count <= CVImportFileKind.maxBytes else {
            step = .failed(.tooLarge)
            return
        }
        do {
            let path = try await importer.upload(data, kind: kind)
            let result = try await importer.read(storagePath: path, kind: kind)
            var content = try CvContent.imported(resumeJSON: result.resumeJSON, language: uiLanguage, timezone: timezone)
            language = content.detectedLanguage(fallback: uiLanguage)
            content.meta.theme = CVTemplateCatalog.defaultTheme(language: language, timezone: timezone)
            original = CvImportedFile(kind: kind.storedKind, storagePath: path, fileName: String(fileName.prefix(255)))
            fieldCount = Self.leafCount(result.resumeJSON)
            flags = Self.flags(result.confidence)
            review = Self.reviewModel(content: content, language: language, title: Self.title(for: content, fileName: fileName),
                                      renderEngine: renderEngine, now: now)
            step = .review
        } catch let error as CVImportError {
            step = .failed(error)
        } catch {
            step = .failed(.unreadable)
        }
    }

    /// Flags still to look at.
    public var openFlags: [CVImportFlag] { flags.filter { !resolved.contains($0.id) } }

    /// Opening a flagged item's sheet (or confirming it) resolves its flags.
    public func resolve(sectionKey: String, index: Int?) {
        for flag in flags where flag.sectionKey == sectionKey && flag.index == index {
            resolved.insert(flag.id)
        }
    }

    public func flags(sectionKey: String, index: Int?) -> [CVImportFlag] {
        openFlags.filter { $0.sectionKey == sectionKey && $0.index == index }
    }

    /// Create CV: the reviewed content as a new CV in `editor`. Returns its id.
    @discardableResult
    public func create(in editor: CVEditorModel) -> String? {
        guard let review, let document = review.document, let original else { return nil }
        return editor.createImported(document.content, language: document.language, title: document.title, original: original)
    }

    // MARK: Helpers

    static func reviewModel(content: CvContent, language: String, title: String, renderEngine: CVRenderEngine?, now: Date) -> CVEditorModel {
        let cvId = "import-review"
        let revision = CvRevision(id: "import-review-rev", cvId: cvId, content: content, source: .import,
                                  basedOnRevisionId: nil, jobId: nil, diffSummary: nil, createdAt: now)
        let cv = Cv(id: cvId, title: title, language: language, parentCvId: nil, currentRevisionId: revision.id,
                    templateId: content.meta.template, theme: content.meta.theme, isDefault: false, archivedAt: nil,
                    version: 1, importedFrom: nil, createdAt: now, updatedAt: now)
        let model = CVEditorModel(selectedCvId: cvId, now: now)
        model.renderEngine = renderEngine
        model.load(UserData(cvs: [cv], cvRevisions: [revision]))
        return model
    }

    /// "Deniz Aksoy — CV" from the name in the file, else the file name without extension.
    static func title(for content: CvContent, fileName: String) -> String {
        if let name = content.basics?.name?.nilIfBlank { return String(localized: CVEditorViewStrings.importedTitle(name)) }
        return (fileName as NSString).deletingPathExtension.nilIfBlank ?? CVEditorStrings.untitledTitle
    }

    static func flags(_ confidence: [String: Double]) -> [CVImportFlag] {
        confidence
            .filter { $0.value < flagThreshold }
            .compactMap { pointer, value -> CVImportFlag? in
                let parts = pointer.split(separator: "/").map(String.init)
                guard let key = parts.first else { return nil }
                let index = parts.count > 1 ? Int(parts[1]) : nil
                let leaf = parts.last?.lowercased() ?? ""
                let field: CVImportFlag.Field = leaf.contains("date") ? .date
                    : ["name", "institution", "issuer", "awarder", "publisher", "organization", "entity"].contains(leaf) ? .name : .text
                return CVImportFlag(id: pointer, sectionKey: key, index: key == "basics" ? nil : index, field: field, confidence: value)
            }
            .sorted { $0.id < $1.id }
    }

    /// How many values the reader filled in (strings and numbers in the JSON).
    static func leafCount(_ json: Data) -> Int {
        func count(_ value: Any) -> Int {
            switch value {
            case let object as [String: Any]: object.values.reduce(0) { $0 + count($1) }
            case let array as [Any]: array.reduce(0) { $0 + count($1) }
            case let string as String: string.nilIfBlank == nil ? 0 : 1
            case is NSNumber: 1
            default: 0
            }
        }
        return (try? JSONSerialization.jsonObject(with: json)).map(count) ?? 0
    }
}
