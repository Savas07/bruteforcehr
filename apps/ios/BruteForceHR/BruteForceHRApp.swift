import FirebaseCore
import SwiftUI

@main
struct BruteForceHRApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Reads the bundled GoogleService-Info.plist (project `bruteforcehr`).
        FirebaseApp.configure()
        return true
    }
}
