// macOS critique helper (not shipped): prints cv-render HTML to PDF with WKWebView + NSPrintOperation,
// the WebKit/Quartz path the desktop (macOS) and iOS exports use, so scripts/critique.ts can read the
// text layer back the way it does for Chromium.
// Usage: webkit-print <in.html> <out.pdf> <paper width pt> <paper height pt>
import AppKit
import WebKit

final class Printer: NSObject, WKNavigationDelegate {
    let web: WKWebView
    let input: URL
    let output: URL
    let paper: NSSize

    init(input: URL, output: URL, paper: NSSize) {
        self.input = input
        self.output = output
        self.paper = paper
        // Lay out at the paper width (pt = CSS px at print scale 1), as the app exporters do.
        web = WKWebView(frame: NSRect(origin: .zero, size: paper))
        super.init()
        web.navigationDelegate = self
    }

    func start() throws {
        web.loadHTMLString(try String(contentsOf: input, encoding: .utf8), baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("document.fonts.ready.then(() => true)") { _, _ in
            // Same NSPrintInfo as the desktop exporter (apps/desktop/src-tauri/src/cv_pdf/native.rs):
            // no margins of its own (the document's @page rule has them), fit to width, no header.
            let info = NSPrintInfo()
            info.paperSize = self.paper
            info.orientation = .portrait
            info.topMargin = 0
            info.bottomMargin = 0
            info.leftMargin = 0
            info.rightMargin = 0
            info.isHorizontallyCentered = false
            info.isVerticallyCentered = false
            info.horizontalPagination = .fit
            info.verticalPagination = .automatic
            info.jobDisposition = .save
            info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = self.output
            info.dictionary()[NSPrintInfo.AttributeKey.headerAndFooter] = false
            self.web.configuration.preferences.shouldPrintBackgrounds = true
            let operation = self.web.printOperation(with: info)
            operation.showsPrintPanel = false
            operation.showsProgressPanel = false
            operation.view?.frame = self.web.frame
            operation.runModal(for: NSWindow(), delegate: self, didRun: #selector(self.done), contextInfo: nil)
        }
    }

    @objc func done() {
        exit(0)
    }
}

let arguments = CommandLine.arguments
guard arguments.count == 5, let width = Double(arguments[3]), let height = Double(arguments[4]) else {
    FileHandle.standardError.write(Data("usage: webkit-print <in.html> <out.pdf> <width pt> <height pt>\n".utf8))
    exit(2)
}
let printer = Printer(
    input: URL(fileURLWithPath: arguments[1]).absoluteURL,
    output: URL(fileURLWithPath: arguments[2]).absoluteURL,
    paper: NSSize(width: width, height: height)
)
try printer.start()
NSApplication.shared.run()
