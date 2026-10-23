import BFHRUI
import FirebaseFirestore
import Foundation

/// Reads the public `appConfig/ios` document (no sign-in; `firebase/firestore.rules` allows public
/// reads) for the update gate (`UpdateGateModel`).
enum AppConfigReader {
    /// A server read: offline or unreachable throws instead of answering from the cache, so the
    /// gate fails open (docs/design/research/ios-update.md, decision 5). A missing document or
    /// field reads as nil.
    static func iosVersions() async throws -> AppConfigVersions {
        let snapshot = try await Firestore.firestore().document("appConfig/ios").getDocument(source: .server)
        return AppConfigVersions(
            latestVersion: snapshot.get("latestVersion") as? String,
            minSupportedVersion: snapshot.get("minSupportedVersion") as? String
        )
    }
}
