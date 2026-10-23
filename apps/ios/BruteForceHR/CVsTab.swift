import BFHRUI
import FirebaseAuth
import SwiftUI

/// The CVs tab with live data (M2): `CVEditorScreen` over Firestore, Cloud Storage and the AI
/// callables, rendering with the bundled cv-render. One instance per signed-in user.
struct CVsTabRoot: View {
    @State private var live: LiveCVs
    @Environment(\.bfhrAccount) private var account

    init(uid: String) {
        _live = State(initialValue: LiveCVs(uid: uid))
    }

    var body: some View {
        NavigationStack {
            CVEditorScreen(model: live.model)
                .navigationTitle(AppTab.cvs.title)
                .navigationBarTitleDisplayMode(.large)
                .accessibilityIdentifier("screen.cvs")
                .toolbar {
                    if let account {
                        ToolbarItem(placement: .topBarTrailing) {
                            AccountMenu(account) {
                                AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "")
                            }
                        }
                    }
                }
        }
        .environment(\.bfhrReload) { live.reload() }
        .onChange(of: live.model.selectedCvId, initial: true) { _, cvId in
            live.store.watchRevisions(of: cvId)
        }
        // Relative times ("Saved · 2 min ago") follow the clock.
        .task {
            while !Task.isCancelled {
                live.model.now = .now
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }
}

/// The model and its data layer, kept for the tab's lifetime.
@MainActor
final class LiveCVs {
    let model: CVEditorModel
    private(set) var store: FirestoreCVStore
    private let uid: String

    init(uid: String) {
        self.uid = uid
        model = CVEditorModel(now: .now)
        model.suggestionProvider = CloudCVAssist()
        model.importer = CloudCVImporter(uid: uid)
        // The app always bundles cv-render (the "Copy cv-render bundle" phase fails the build
        // otherwise); nil only if the file was stripped, and the Preview then says so.
        model.renderEngine = try? CVRenderEngine.bundled()
        store = FirestoreCVStore(uid: uid)
        store.start(model)
    }

    /// Try again after a failed first load: new listeners.
    func reload() {
        let selected = model.selectedCvId
        store = FirestoreCVStore(uid: uid)
        store.start(model)
        store.watchRevisions(of: selected)
    }
}
