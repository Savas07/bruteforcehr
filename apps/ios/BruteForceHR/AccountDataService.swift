import BFHRUI
import FirebaseAuth
import FirebaseFunctions
import FirebaseStorage
import Foundation
import Network

/// Settings › Data & privacy on Firebase (docs/runbooks/account.md): the `accountExport` and
/// `accountDelete` callables (europe-west1), the export ZIP from Cloud Storage, the ID token's
/// `auth_time`, and re-authentication with the normal sign-in email link (EmailLinkAuth.swift).
final class FirebaseAccountDataService: AccountDataService {
    private let signIn: SignInModel
    private let links = FirebaseEmailLinkService()

    init(signIn: SignInModel) {
        self.signIn = signIn
    }

    /// The page's model for the signed-in user, following the connection.
    static func makeModel(signIn: SignInModel, email: String) -> DataPrivacyModel {
        let model = DataPrivacyModel(
            service: FirebaseAccountDataService(signIn: signIn),
            email: email,
            languageCode: FirebaseEmailLinkService.languageCode
        )
        ConnectionMonitor.shared.observe(model)
        return model
    }

    // MARK: Export

    func createExport() async throws -> AccountExport {
        let result: HTTPSCallableResult
        do {
            // Building the ZIP reads every collection and file; allow more than the 70 s default.
            let callable = CVCallables.functions.httpsCallable("accountExport")
            callable.timeoutInterval = 300
            result = try await callable.call([String: Any]())
        } catch {
            throw Self.accountError(error)
        }
        guard let data = result.data as? [String: Any], let export = Self.export(data) else {
            throw AccountDataError.other("accountExport returned an unexpected response")
        }
        return export
    }

    /// `AccountExportResponse` (`@bfhr/core` src/account).
    static func export(_ data: [String: Any]) -> AccountExport? {
        guard let exportId = data["exportId"] as? String, let storagePath = data["storagePath"] as? String,
              let fileName = data["fileName"] as? String, let size = data["sizeBytes"] as? NSNumber,
              let createdAt = (data["createdAt"] as? String).flatMap(date), let expiresAt = (data["expiresAt"] as? String).flatMap(date)
        else { return nil }
        return AccountExport(
            exportId: exportId,
            storagePath: storagePath,
            fileName: fileName,
            sizeBytes: size.int64Value,
            documentCount: (data["documentCount"] as? NSNumber)?.intValue ?? 0,
            fileCount: (data["fileCount"] as? NSNumber)?.intValue ?? 0,
            createdAt: createdAt,
            expiresAt: expiresAt
        )
    }

    /// ISO 8601 from `Date.prototype.toISOString` (with milliseconds) or without them.
    private static func date(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }

    /// Downloads into `tmp/AccountExport/<exportId>/<fileName>`, replacing an earlier download.
    func download(_ export: AccountExport) async throws -> URL {
        let root = FileManager.default.temporaryDirectory.appending(path: "AccountExport", directoryHint: .isDirectory)
        // Only the latest export exists on the server; drop older local copies with it.
        try? FileManager.default.removeItem(at: root)
        let folder = root.appending(path: export.exportId, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: Self.safeFileName(export.fileName))
        do {
            return try await Storage.storage().reference(withPath: export.storagePath).writeAsync(toFile: url)
        } catch {
            throw Self.accountError(error)
        }
    }

    /// The server's name without path separators.
    static func safeFileName(_ name: String) -> String {
        let cleaned = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        return cleaned.isEmpty ? "bruteforcehr-export.zip" : cleaned
    }

    // MARK: Delete

    func lastSignInDate() async throws -> Date {
        guard let user = Auth.auth().currentUser else { throw AccountDataError.other("signed out") }
        return try await user.getIDTokenResult(forcingRefresh: false).authDate
    }

    func sendReauthLink(to email: String) async throws {
        try await links.sendSignInLink(to: email, languageCode: FirebaseEmailLinkService.languageCode)
    }

    /// `reauthenticate(with:)` keeps the uid and refreshes `auth_time`; a link sent to another
    /// address fails with `userMismatch` (shown as "This link doesn't work anymore").
    func reauthenticate(email: String, actionLink: String) async throws {
        guard let user = Auth.auth().currentUser else { throw SignInError.other }
        guard links.isSignInLink(actionLink) else { throw SignInError.unusable }
        do {
            _ = try await user.reauthenticate(with: EmailAuthProvider.credential(withEmail: email, link: actionLink))
            // The callable sends the cached ID token: make sure it carries the new `auth_time`.
            _ = try await user.getIDTokenResult(forcingRefresh: true)
        } catch {
            let nsError = error as NSError
            if nsError.domain == AuthErrors.domain, nsError.code == AuthErrorCode.userMismatch.rawValue {
                throw SignInError.unusable
            }
            throw FirebaseEmailLinkService.signInError(error)
        }
    }

    func deleteAccount() async throws {
        do {
            let callable = CVCallables.functions.httpsCallable("accountDelete")
            callable.timeoutInterval = 300
            _ = try await callable.call(["confirm": true])
        } catch {
            throw Self.accountError(error)
        }
    }

    /// The Auth user no longer exists: sign out here and show the welcome screen's notice.
    func finishDeletion() {
        try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory.appending(path: "AccountExport"))
        signIn.accountDeleted()
    }

    // MARK: Errors

    /// Functions and Storage errors in the page's terms (`details.reason` from the callables).
    static func accountError(_ error: any Error) -> AccountDataError {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain { return .offline }
        if nsError.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: nsError.code) {
            let reason = (nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any])?["reason"] as? String
            switch reason {
            case "export_too_soon": return .exportTooSoon
            case "export_daily_limit": return .exportDailyLimit
            case "export_too_large": return .exportTooLarge
            case "email_unverified": return .emailUnverified
            case "recent_sign_in_required": return .recentSignInRequired
            default: break
            }
            switch code {
            case .unavailable, .deadlineExceeded: return .offline
            default: return .other("\(code.rawValue) \(nsError.localizedDescription)")
            }
        }
        if nsError.domain == StorageErrorDomain, nsError.code == StorageErrorCode.retryLimitExceeded.rawValue { return .offline }
        return .other("\(nsError.domain) \(nsError.code): \(nsError.localizedDescription)")
    }
}

/// The device's connection for the Data & privacy page (offline: Create export and Delete account
/// are disabled with "Needs a connection").
@MainActor
final class ConnectionMonitor {
    static let shared = ConnectionMonitor()

    private let monitor = NWPathMonitor()
    private var isOnline = true
    private weak var model: DataPrivacyModel?

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in self?.update(online: online) }
        }
        monitor.start(queue: .main)
    }

    func observe(_ model: DataPrivacyModel) {
        self.model = model
        model.isOnline = isOnline
    }

    private func update(online: Bool) {
        isOnline = online
        model?.isOnline = online
    }
}
