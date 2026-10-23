import BFHRCore
import FirebaseFirestore
import FirebaseMessaging
import Foundation
import UIKit
import UserNotifications

/// Remote notifications through FCM → APNs (docs/runbooks/notifications.md "Client contract"):
/// the app registers with APNs, hands the device token to FCM, and writes the FCM registration
/// token to `users/{uid}/devices/{deviceId}` (one document per install, `identifierForVendor`).
/// Permission is asked in context only (decisions.md D25: the first saved-search alert turned on,
/// or after the first mail import), never at launch. A tap opens `userInfo["link"]` through
/// `NotificationRouter`, like local reminders. Until the owner uploads the APNs key, FCM returns
/// no token on device builds and nothing is written.
@MainActor
final class PushRegistrar: NSObject, MessagingDelegate {
    static let shared = PushRegistrar()

    private var uid: String?
    private var token: String?

    /// A stable id per install.
    static var deviceId: String {
        UIDevice.current.identifierForVendor?.uuidString.lowercased() ?? "ios-unknown"
    }

    func install() {
        Messaging.messaging().delegate = self
    }

    /// Signed in: register again (APNs hands out the token without a prompt once allowed) and
    /// keep the device document current.
    func signedIn(uid: String) {
        self.uid = uid
        Task {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
            UIApplication.shared.registerForRemoteNotifications()
            await refreshToken()
        }
    }

    /// Signed out: the device stops receiving this account's pushes.
    func signedOut() {
        guard let uid else { return }
        self.uid = nil
        Firestore.firestore().collection("users").document(uid).collection("devices").document(Self.deviceId)
            .updateData(["pushToken": NSNull(), "lastSeenAt": Timestamp(date: .now)])
    }

    /// Asks for permission in context (D25) and registers. Returns whether alerts are allowed.
    @discardableResult
    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let allowed = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if allowed {
            UIApplication.shared.registerForRemoteNotifications()
            await refreshToken()
        }
        return allowed
    }

    func didRegister(deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Task { await refreshToken() }
    }

    private func refreshToken() async {
        guard let token = try? await Messaging.messaging().token() else { return }
        store(token)
    }

    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { @MainActor in self.store(fcmToken) }
    }

    /// `Device` (ADR 0002): created with `set` (merge keeps `createdAt`), refreshed on every
    /// launch and token change.
    private func store(_ token: String) {
        self.token = token
        guard let uid else { return }
        let document = Firestore.firestore().collection("users").document(uid).collection("devices").document(Self.deviceId)
        let now = Timestamp(date: .now)
        document.getDocument { snapshot, _ in
            let fields: [String: Any] = [
                "platform": Platform.ios.rawValue,
                "pushToken": token,
                "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0",
                "osVersion": UIDevice.current.systemVersion,
                "locale": Locale.current.identifier,
                "lastSeenAt": now,
                "schemaVersion": 1,
            ]
            if snapshot?.exists == true {
                document.updateData(fields)
            } else {
                document.setData(fields.merging(["createdAt": now]) { current, _ in current })
            }
        }
    }
}

/// The APNs callbacks SwiftUI doesn't expose.
final class PushAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushRegistrar.shared.didRegister(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        // Simulator without APNs, or the capability missing from the profile: no remote pushes,
        // local reminders keep working.
    }
}
