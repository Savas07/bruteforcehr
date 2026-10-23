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
            RootView()
        }
    }
}
