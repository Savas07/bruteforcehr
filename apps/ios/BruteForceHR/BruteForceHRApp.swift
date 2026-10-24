import BFHRUI
import FirebaseCore
import FirebaseFirestore
import SwiftUI

@main
struct BruteForceHRApp: App {
    /// APNs registration callbacks for remote notifications (PushNotifications.swift).
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate

    init() {
        // Reads the bundled GoogleService-Info.plist (project `bruteforcehr`). Configured before
        // the first view, so `RootView` sees the restored session (`Auth.auth().currentUser`) and
        // starts on the tabs instead of flashing the sign-in screen.
        FirebaseApp.configure()
        // The session lives in the keychain group the Share Extension reads too; a session from
        // before this build is carried over (SharedSession).
        SharedSession.useSharedKeychain()
        // Firestore's on-disk cache is the offline outbox (ADR 0002): reads work offline and
        // writes made offline survive a relaunch until they sync.
        let settings = Firestore.firestore().settings
        settings.cacheSettings = PersistentCacheSettings()
        Firestore.firestore().settings = settings
        // Before launch finishes, so a reminder tap that launched the app is delivered.
        NotificationRouter.shared.install()
        PushRegistrar.shared.install()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let state = JobImportShareDesignState.launch {
                // `-BFHRShareSheet <state>`: the Share Extension's sheet with fixture data, for
                // captures and the accessibility audit (the extension itself can't take arguments).
                ShareSheetDesignHost(state: state)
            } else {
                RootView()
            }
            #else
            RootView()
            #endif
        }
    }
}

#if DEBUG
/// The share sheet over a blank backdrop, presented like the system presents the extension.
private struct ShareSheetDesignHost: View {
    let state: JobImportShareDesignState
    @State private var model: JobImportShareModel?
    @State private var presented = true

    var body: some View {
        Color(.secondarySystemBackground)
            .ignoresSafeArea()
            .sheet(isPresented: $presented) {
                if let model { JobImportShareSheet(model: model) {} }
            }
            .onAppear { model = state.model() }
    }
}
#endif
