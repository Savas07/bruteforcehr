import BFHRUI
import FirebaseCore
import FirebaseFirestore
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "Save to BruteForceHR" in the system share sheet (Safari, the LinkedIn app, any app sharing a
/// link or text). Reads the shared URL (or the first link in shared text), signs in through the
/// app's shared keychain group and shows `JobImportShareSheet`.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
            // No disk cache in the extension: the app owns the offline outbox.
            let settings = Firestore.firestore().settings
            settings.cacheSettings = MemoryCacheSettings()
            Firestore.firestore().settings = settings
        }
        SharedSession.useSharedKeychain()
        Task { await present(sharedText: await Self.sharedText(from: extensionContext)) }
    }

    private func present(sharedText: String) async {
        let service = FirebaseShareService()
        let model = JobImportShareModel(sharedText: sharedText, service: service)
        if !service.isSignedIn {
            // Handed to the app (App Group), which offers it again after sign-in.
            SharedSession.sharedDefaults?.set(sharedText, forKey: SharedSession.pendingSharedURLKey)
        }
        let host = UIHostingController(rootView: JobImportShareSheet(model: model) { [weak self] in self?.finish() })
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        await model.start()
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// The shared URL, else the shared text (the server finds the link in it).
    private static func sharedText(from context: NSExtensionContext?) async -> String {
        let providers = (context?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                return url.absoluteString
            }
        }
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                return text
            }
        }
        return ""
    }
}
