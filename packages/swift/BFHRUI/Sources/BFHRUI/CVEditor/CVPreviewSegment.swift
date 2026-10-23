import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// The Preview segment: the real cv-render HTML of the CV (the same file the PDF is printed from)
/// in a web view, scaled to the screen width with pinch-to-zoom. A pill names the page count,
/// paper and template; the bottom bar shares the PDF or opens Export options.
struct CVPreviewSegment: View {
    let model: CVEditorModel
    let document: CVDocument
    let onExport: () -> Void
    let onShare: () -> Void

    var body: some View {
        Group {
            switch model.render(document.content, language: document.language) {
            case .success(let rendered):
                CVRenderedPage(rendered: rendered, templateName: model.catalog()?.templateName(document.templateId) ?? document.templateId.capitalized)
            case .failure(let error):
                PaneError(LoadFailure(.unknown, details: String(describing: error)), title: L.previewFailedTitle, message: L.previewFailedBody)
            }
        }
        .background(BFHRColor.groupedBackground)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ButtonPair {
                Button(action: onShare) {
                    Label { Text(L.sharePDF) } icon: { Image(systemName: "square.and.arrow.up") }
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .accessibilityIdentifier("cv.preview.share")
            } secondary: {
                Button(action: onExport) { Text(L.exportOptions) }
                    .buttonStyle(.bfhr(.secondary, fullWidth: true))
                    .accessibilityIdentifier("cv.preview.export")
            }
            .padding(.horizontal, BFHRSpace.s4)
            .padding(.vertical, BFHRSpace.s3)
            .background(.bar)
        }
    }
}

/// One rendered CV: the web page with a page-count pill. Used by Preview, revision and compare.
struct CVRenderedPage: View {
    let rendered: CVRenderedHTML
    let templateName: String
    @State private var pageCount: Int?

    var body: some View {
        #if os(iOS)
        CVWebPage(rendered: rendered)
            .padding(.horizontal, BFHRSpace.s2)
            .overlay(alignment: .top) { pill.padding(.top, BFHRSpace.s2) }
            .task(id: rendered) {
                // Debounced: typing in the editor re-renders often; count pages once it settles.
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                pageCount = try? await CVPDFRenderer().pdf(rendered).pageCount
            }
        #else
        Text(verbatim: rendered.title)
        #endif
    }

    @ViewBuilder
    private var pill: some View {
        if let pageCount {
            Text(L.previewFooter(pageCount, rendered.page.paper == "letter" ? "Letter" : "A4", templateName))
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
                .padding(.horizontal, BFHRSpace.s3)
                .padding(.vertical, BFHRSpace.s1)
                .background(.regularMaterial, in: Capsule())
                .accessibilityIdentifier("cv.preview.pages")
        }
    }
}
