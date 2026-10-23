#if os(iOS)
import SwiftUI
import UIKit
import WebKit

/// The cv-render HTML in a `WKWebView` (the Preview segment and the revision / compare pages).
/// The page is one continuous sheet as wide as the paper; the viewport is set to that width so
/// WebKit scales it to fit, and pinch-to-zoom works. Nothing is loaded from the network: the HTML
/// is self-contained and links open nowhere.
struct CVWebPage: UIViewRepresentable {
    let rendered: CVRenderedHTML
    var accessibilityIdentifier = "cv.preview.web"

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        configuration.dataDetectorTypes = []
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator
        webView.accessibilityIdentifier = accessibilityIdentifier
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let html = Self.withViewport(rendered)
        guard context.coordinator.loadedHTML != html else { return }
        context.coordinator.load(html, in: webView)
    }

    /// Sets `<meta name="viewport" content="width=<paper width>">` (replacing cv-render's
    /// device-width one) so WebKit scales the sheet to fit the screen.
    static func withViewport(_ rendered: CVRenderedHTML) -> String {
        let width = Int(rendered.page.widthCSSPixels.rounded(.up))
        let meta = "<meta name=\"viewport\" content=\"width=\(width), minimum-scale=0.1, maximum-scale=4\">"
        var html = rendered.html.replacingOccurrences(of: #"<meta name="viewport"[^>]*>"#, with: "", options: [.regularExpression, .caseInsensitive])
        guard let head = html.range(of: "<head>", options: .caseInsensitive) else { return meta + html }
        html.insert(contentsOf: meta, at: head.upperBound)
        return html
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loadedHTML: String?
        private var restoreOffset: CGPoint?

        /// Re-renders keep the reading position (an edit shouldn't jump back to page 1).
        func load(_ html: String, in webView: WKWebView) {
            restoreOffset = loadedHTML == nil ? nil : webView.scrollView.contentOffset
            loadedHTML = html
            webView.loadHTMLString(html, baseURL: nil)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard let offset = restoreOffset else { return }
            restoreOffset = nil
            let maxY = max(0, webView.scrollView.contentSize.height - webView.scrollView.bounds.height)
            webView.scrollView.setContentOffset(CGPoint(x: offset.x, y: min(offset.y, maxY)), animated: false)
        }

        /// Only the HTML string itself loads; links in the CV don't navigate the preview.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            action.navigationType == .other && (action.request.url?.absoluteString == "about:blank" || action.request.url == nil)
                ? .allow : .cancel
        }
    }
}

/// PDF from cv-render HTML with WebKit's print path: `UIPrintPageRenderer` pages the print
/// media of the HTML onto A4 / Letter sheets with cv-render's margins. Real, selectable text;
/// works offline.
final class CVPDFRenderer: NSObject, WKNavigationDelegate {
    struct Output {
        var data: Data
        var pageCount: Int
    }

    private var webView: WKWebView?
    private var loaded: CheckedContinuation<Void, any Error>?

    func pdf(_ rendered: CVRenderedHTML) async throws -> Output {
        let page = rendered.page
        let paper = CGRect(x: 0, y: 0, width: page.widthPt, height: page.heightPt)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let webView = WKWebView(frame: paper, configuration: configuration)
        webView.navigationDelegate = self
        self.webView = webView
        defer { self.webView = nil }
        try await withCheckedThrowingContinuation { continuation in
            loaded = continuation
            webView.loadHTMLString(rendered.html, baseURL: nil)
        }

        let margins = page.marginsMm
        let printable = CGRect(
            x: CVPageGeometry.points(margins.left), y: CVPageGeometry.points(margins.top),
            width: page.widthPt - CVPageGeometry.points(margins.left + margins.right),
            height: page.heightPt - CVPageGeometry.points(margins.top + margins.bottom)
        )
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, [
            kCGPDFContextTitle as String: rendered.title,
            kCGPDFContextCreator as String: "BruteForceHR",
        ])
        let count = renderer.numberOfPages
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: count))
        for index in 0..<count {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: index, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return Output(data: data as Data, pageCount: count)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded?.resume()
        loaded = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        loaded?.resume(throwing: error)
        loaded = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        loaded?.resume(throwing: error)
        loaded = nil
    }
}
#endif
