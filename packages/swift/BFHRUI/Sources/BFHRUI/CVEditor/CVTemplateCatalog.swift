import BFHRCore
import Foundation

/// What the template picker offers. The ids and names come from the cv-render bundle at run time
/// (`CVRenderEngine.catalog()`, `listTemplates()` / `listFontPairs()` / `listAccents()` in
/// packages/cv-render); only the defaults for a new CV live here, and they must be ids the bundle
/// knows (CVRenderEngineTests checks them).
public struct CVTemplateCatalog: Hashable, Sendable {
    public struct Template: Identifiable, Hashable, Sendable {
        public var id: String
        public var name: String
        /// One line under the name ("Single column · Serif headings").
        public var description: String
    }

    public struct FontPair: Identifiable, Hashable, Sendable {
        public var id: String
        public var name: String
    }

    public struct Accent: Identifiable, Hashable, Sendable {
        /// "#RRGGBB".
        public var id: String
        public var name: String
    }

    public var templates: [Template]
    public var fontPairs: [FontPair]
    public var accents: [Accent]

    public init(templates: [Template], fontPairs: [FontPair], accents: [Accent]) {
        self.templates = templates
        self.fontPairs = fontPairs
        self.accents = accents
    }

    public static let defaultTemplateId = "classic"
    public static let defaultFontPair = "inter-source-serif"
    public static let defaultAccent = "#2F5D8A"

    /// A new CV's theme. Paper: Letter for US time zones, A4 everywhere else (cv-editor.md).
    public static func defaultTheme(language: String, timezone: String?) -> CvTheme {
        let usesLetter = timezone.map { $0.hasPrefix("America/") && !latinAmericanZones.contains($0) } ?? false
        return CvTheme(accentColor: defaultAccent, fontPair: defaultFontPair, density: .comfortable, paperSize: usesLetter ? .letter : .a4)
    }

    private static let latinAmericanZones: Set<String> = [
        "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Lima", "America/Santiago",
        "America/Caracas", "America/Montevideo", "America/La_Paz", "America/Asuncion",
    ]

    public func templateName(_ id: String) -> String {
        templates.first { $0.id == id }?.name ?? id.capitalized
    }
}
