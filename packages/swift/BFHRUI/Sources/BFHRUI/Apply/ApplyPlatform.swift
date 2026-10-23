import BFHRCore
import SwiftUI
#if os(iOS)
import MessageUI
import SafariServices
import UIKit
#endif

extension View {
    /// The company site in SFSafariViewController (BRIEF §4.4: in-app Safari) and the email in
    /// Mail's compose sheet with the PDFs attached; macOS (package tests) shows neither.
    func bfhrApplyPresentations(
        model: ApplyModel,
        siteURL: Binding<URL?>,
        composesMail: Binding<Bool>,
        toasts: ToastCenter?,
        dismiss: DismissAction
    ) -> some View {
        #if os(iOS)
        modifier(ApplyPresentations(model: model, siteURL: siteURL, composesMail: composesMail, toasts: toasts, dismiss: dismiss))
        #else
        self
        #endif
    }
}

#if os(iOS)
private struct ApplyPresentations: ViewModifier {
    let model: ApplyModel
    @Binding var siteURL: URL?
    @Binding var composesMail: Bool
    let toasts: ToastCenter?
    let dismiss: DismissAction
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content
            .fullScreenCover(item: $siteURL, onDismiss: model.returnedFromSite) { url in
                SafariView(url: url).ignoresSafeArea()
            }
            .onChange(of: composesMail) { _, composes in
                // No mail account on the device (and the simulator): the mailto link, then "Did
                // you send it?".
                guard composes, !MFMailComposeViewController.canSendMail() else { return }
                composesMail = false
                if let url = Self.mailtoURL(model.email) { openURL(url) }
                model.openedMailLink()
            }
            .sheet(isPresented: Binding(get: { composesMail && MFMailComposeViewController.canSendMail() }, set: { composesMail = $0 })) {
                MailComposeView(draft: model.email, files: model.files.files) { result in
                    composesMail = false
                    guard result == .sent else { return }
                    if let toast = try? model.sentFromMail() { toasts?.show(toast) }
                    dismiss()
                }
                .ignoresSafeArea()
            }
    }

    static func mailtoURL(_ draft: ApplyEmailDraft) -> URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = draft.to
        components.queryItems = [URLQueryItem(name: "subject", value: draft.subject), URLQueryItem(name: "body", value: draft.body)]
        return components.url
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

/// SFSafariViewController: the posting in Safari's view, with Done bringing the user back.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.dismissButtonStyle = .done
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// Mail's compose sheet, prefilled, with the CV and cover letter PDFs attached.
struct MailComposeView: UIViewControllerRepresentable {
    let draft: ApplyEmailDraft
    let files: [ApplyFile]
    let onFinish: (MFMailComposeResult) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.mailComposeDelegate = context.coordinator
        controller.setToRecipients([draft.to])
        controller.setSubject(draft.subject)
        controller.setMessageBody(draft.body, isHTML: false)
        for file in files {
            controller.addAttachmentData(file.data, mimeType: "application/pdf", fileName: file.fileName)
        }
        return controller
    }

    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}

    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let onFinish: (MFMailComposeResult) -> Void

        init(onFinish: @escaping (MFMailComposeResult) -> Void) {
            self.onFinish = onFinish
        }

        func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: (any Error)?) {
            onFinish(result)
        }
    }
}

/// The PDFs made on the device: the CV with cv-render (the same renderer as the desktop and the
/// server) and WebKit's print path; the cover letter as a plain A4 page.
public final class DeviceApplyRenderer: ApplyRenderer {
    private let engine: CVRenderEngine

    public init(engine: CVRenderEngine) {
        self.engine = engine
    }

    public func cvPDF(_ revision: CvRevision, language: String) async throws -> (fileName: String, data: Data) {
        let rendered = try engine.render(CVRenderInput(content: revision.content, locale: language))
        let data = try await CVPDFRenderer().pdf(rendered).data
        let fileName = (try? engine.fileName(name: revision.content.basics?.name, company: nil, ext: "pdf")) ?? "CV.pdf"
        return (fileName, data)
    }

    public func letterPDF(title: String, body: String, language: String) async throws -> Data {
        let escaped = body
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let paragraphs = escaped.components(separatedBy: "\n\n").map { "<p>\($0.replacingOccurrences(of: "\n", with: "<br>"))</p>" }.joined()
        let html = """
        <!doctype html><html lang="\(language)"><head><meta charset="utf-8"><title>\(title)</title>
        <style>body{font:11pt/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:0}p{margin:0 0 10pt}</style>
        </head><body>\(paragraphs)</body></html>
        """
        let page = CVPageGeometry(
            paper: "A4", widthPt: 595.28, heightPt: 841.89, widthMm: 210, heightMm: 297,
            marginsMm: .init(top: 25, right: 25, bottom: 25, left: 25)
        )
        return try await CVPDFRenderer().pdf(CVRenderedHTML(html: html, title: title, page: page)).data
    }
}
#endif
