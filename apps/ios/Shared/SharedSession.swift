import FirebaseAuth
import Foundation

/// What the app and its Share Extension share (both targets compile this folder): the Firebase Auth
/// session in one keychain access group, and an App Group for handing a shared link to the app.
enum SharedSession {
    /// `group.com.savas07.bruteforcehr` (both targets' entitlements).
    static let appGroup = "group.com.savas07.bruteforcehr"
    /// A link shared while signed out, offered again by the app after sign-in.
    static let pendingSharedURLKey = "pendingSharedJobURL"

    /// `<TeamID>.com.savas07.bruteforcehr.shared`, from Info.plist `BFHRKeychainAccessGroup`
    /// (`$(AppIdentifierPrefix)` expands at build time).
    static var keychainAccessGroup: String? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "BFHRKeychainAccessGroup") as? String,
              !group.hasPrefix("$("), !group.hasPrefix(".") else { return nil }
        return group
    }

    /// Stores the Firebase Auth session in the shared keychain group, after `FirebaseApp.configure()`.
    /// A user signed in before the switch (default group) is carried over, so updating the app never
    /// signs anyone out. Unsigned builds (CI) have no keychain entitlement and keep the default.
    static func useSharedKeychain() {
        guard let group = keychainAccessGroup else { return }
        let previous = Auth.auth().currentUser
        do {
            try Auth.auth().useUserAccessGroup(group)
        } catch {
            return
        }
        if Auth.auth().currentUser == nil, let previous {
            Auth.auth().updateCurrentUser(previous) { _ in }
        }
    }

    static var sharedDefaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
}
