import BFHRCore
import Foundation
import JavaScriptCore

/// Page geometry cv-render reports with each render: paper size and the margins the print path
/// must leave (WebKit's print formatter ignores CSS `@page`, so the PDF renderer insets the
/// printable rect by these).
public struct CVPageGeometry: Hashable, Sendable, Decodable {
    public struct Margins: Hashable, Sendable, Decodable {
        public var top: Double
        public var right: Double
        public var bottom: Double
        public var left: Double
    }

    public var paper: String
    public var widthPt: Double
    public var heightPt: Double
    public var widthMm: Double
    public var heightMm: Double
    public var marginsMm: Margins

    /// Millimetres → PDF points.
    public static func points(_ mm: Double) -> Double { mm * 72 / 25.4 }

    /// The sheet's width in CSS pixels (96 per inch), for the preview's viewport.
    public var widthCSSPixels: Double { widthMm * 96 / 25.4 }
}

/// One render of a CV: self-contained HTML (fonts embedded, real text), its title and page.
public struct CVRenderedHTML: Hashable, Sendable {
    public var html: String
    public var title: String
    public var page: CVPageGeometry
}

/// What cv-render needs to render a CV.
public struct CVRenderInput: Hashable, Sendable {
    public var content: CvContent
    /// The CV's language (BCP 47): headings, dates and casing on the page.
    public var locale: String

    public init(content: CvContent, locale: String) {
        self.content = content
        self.locale = locale
    }

    /// The `renderCvHtml` input object as JSON (`packages/cv-render`).
    func json() throws -> String {
        let encoded = try BFHRJSON.encoder().encode(content)
        guard var resume = try JSONSerialization.jsonObject(with: encoded) as? [String: Any],
              let meta = resume.removeValue(forKey: "meta") else { throw CVRenderError.badInput }
        let theme = content.meta.theme
        let input: [String: Any] = [
            "resume": resume,
            "meta": meta,
            "templateId": content.meta.template,
            "theme": ["accent": theme.accentColor, "fontPair": theme.fontPair, "density": theme.density.rawValue],
            "paper": theme.paperSize.rawValue,
            "locale": locale,
        ]
        return String(decoding: try JSONSerialization.data(withJSONObject: input), as: UTF8.self)
    }
}

public enum CVRenderError: Error, Hashable, Sendable {
    /// The bundled `cv-render.iife.js` is missing or didn't define `BFHRCvRender`.
    case bundleMissing
    case badInput
    /// The renderer threw; the message is for "Copy details".
    case script(String)
}

/// cv-render's IIFE bundle (`packages/cv-render/dist/cv-render.iife.js`, copied into the app by
/// the "Copy cv-render bundle" build phase) running in JavaScriptCore: the same renderer as the
/// desktop and the server, on the device and offline (docs/adr/0009-cv-studio.md).
public final class CVRenderEngine {
    private let context: JSContext
    private let api: JSValue

    /// Loads the bundle. Throws `.bundleMissing` when the file or its global is missing.
    public init(scriptURL: URL) throws {
        guard let source = try? String(contentsOf: scriptURL, encoding: .utf8), let context = JSContext() else {
            throw CVRenderError.bundleMissing
        }
        context.name = "cv-render"
        context.evaluateScript(source, withSourceURL: scriptURL)
        // Thin wrappers: JSON in, JSON out, so no object bridging surprises.
        context.evaluateScript("""
        var __bfhr = {
          render: function (json) { return JSON.stringify(BFHRCvRender.renderCvHtml(JSON.parse(json))); },
          catalog: function (locale) {
            return JSON.stringify({
              templates: BFHRCvRender.listTemplates(locale),
              fontPairs: BFHRCvRender.listFontPairs ? BFHRCvRender.listFontPairs(locale) : [],
              accents: BFHRCvRender.listAccents ? BFHRCvRender.listAccents(locale) : []
            });
          },
          fileName: function (json) { return BFHRCvRender.exportFileName(JSON.parse(json)); },
          docx: function (json, done, fail) {
            BFHRCvRender.buildCvDocxBase64(JSON.parse(json)).then(done, function (e) { fail(String(e && e.stack || e)); });
          },
          hasDocx: function () { return typeof BFHRCvRender.buildCvDocxBase64 === 'function'; }
        };
        """)
        guard let api = context.objectForKeyedSubscript("__bfhr"), context.exception == nil,
              context.objectForKeyedSubscript("BFHRCvRender")?.isObject == true else {
            throw CVRenderError.bundleMissing
        }
        self.context = context
        self.api = api
    }

    /// The bundle inside the app (`cv-render.iife.js` next to the app's resources).
    public static func bundled(in bundle: Bundle = .main) throws -> CVRenderEngine {
        guard let url = bundle.url(forResource: "cv-render.iife", withExtension: "js") else { throw CVRenderError.bundleMissing }
        return try CVRenderEngine(scriptURL: url)
    }

    private func call(_ name: String, _ arguments: [Any]) throws -> String {
        context.exception = nil
        let result = api.invokeMethod(name, withArguments: arguments)
        if let exception = context.exception {
            context.exception = nil
            throw CVRenderError.script(exception.toString() ?? "JavaScript exception")
        }
        guard let string = result?.toString(), result?.isString == true else { throw CVRenderError.script("\(name) returned no string") }
        return string
    }

    /// Renders a CV to HTML (`renderCvHtml`).
    public func render(_ input: CVRenderInput) throws -> CVRenderedHTML {
        struct Output: Decodable {
            var html: String
            var title: String
            var page: CVPageGeometry
        }
        let json = try call("render", [try input.json()])
        let output = try JSONDecoder().decode(Output.self, from: Data(json.utf8))
        return CVRenderedHTML(html: output.html, title: output.title, page: output.page)
    }

    /// Templates, font pairs and accents (`listTemplates`, `listFontPairs`, `listAccents`).
    public func catalog(locale: String) throws -> CVTemplateCatalog {
        struct Named: Decodable {
            var id: String
            var name: String?
            var label: String?
            var description: String?
            var hex: String?
        }
        struct Output: Decodable {
            var templates: [Named]
            var fontPairs: [Named]
            var accents: [Named]
        }
        let output = try JSONDecoder().decode(Output.self, from: Data(try call("catalog", [locale]).utf8))
        return CVTemplateCatalog(
            templates: output.templates.map { .init(id: $0.id, name: $0.name ?? $0.label ?? $0.id, description: $0.description ?? "") },
            fontPairs: output.fontPairs.map { .init(id: $0.id, name: $0.name ?? $0.label ?? $0.id) },
            accents: output.accents.map { .init(id: $0.hex ?? $0.id, name: $0.name ?? $0.label ?? $0.id) }
        )
    }

    /// The default export name, `First-Last-CV[-Company].<ext>` (`exportFileName`).
    public func fileName(name: String?, company: String?, ext: String) throws -> String {
        let parts = (name ?? "").split(whereSeparator: \.isWhitespace).map(String.init)
        var input: [String: Any] = ["firstName": parts.first ?? "", "lastName": parts.dropFirst().joined(separator: " "), "ext": ext]
        if let company = company?.nilIfBlank { input["company"] = company }
        let json = String(decoding: try JSONSerialization.data(withJSONObject: input), as: UTF8.self)
        return try call("fileName", [json])
    }

    /// Whether this bundle can build DOCX files on the device.
    public var buildsDocx: Bool {
        api.invokeMethod("hasDocx", withArguments: [])?.toBool() ?? false
    }

    /// A DOCX of the CV (`buildCvDocxBase64`, the `docx` package inside the bundle).
    public func docx(_ input: CVRenderInput) async throws -> Data {
        let json = try input.json()
        let base64: String = try await withCheckedThrowingContinuation { continuation in
            let done: @convention(block) (String) -> Void = { continuation.resume(returning: $0) }
            let fail: @convention(block) (String) -> Void = { continuation.resume(throwing: CVRenderError.script($0)) }
            context.exception = nil
            api.invokeMethod("docx", withArguments: [json, done, fail])
            if let exception = context.exception {
                context.exception = nil
                continuation.resume(throwing: CVRenderError.script(exception.toString() ?? "JavaScript exception"))
            }
        }
        guard let data = Data(base64Encoded: base64) else { throw CVRenderError.script("DOCX wasn't base64") }
        return data
    }
}
