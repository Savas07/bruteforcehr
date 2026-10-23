import FirebaseCore
import SwiftUI

@main
struct BruteForceHRApp: App {
    init() {
        // Reads the bundled GoogleService-Info.plist (project `bruteforcehr`). Configured before
        // the first view, so `RootView` sees the restored session (`Auth.auth().currentUser`) and
        // starts on the tabs instead of flashing the sign-in screen.
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
