#if DEBUG
import SwiftUI

// Design mode for Settings › Data & privacy (Debug builds only): `-BFHRDataPrivacy <state>` shows
// the page (or the pushed Delete account screen) in that state without Firebase, hosted in its own
// navigation stack until the Settings shell hosts it. Release builds compile none of this.

/// The Data & privacy capture states.
public enum DesignDataPrivacyState: String, CaseIterable, Sendable {
    /// Create export.
    case idle
    /// The ZIP is being built.
    case preparing
    /// Ready, downloading to the iPhone.
    case downloading
    /// Ready: Save to Files and Share.
    case ready
    /// Ready and saved with Save to Files.
    case saved
    /// Ready, but the download failed.
    case downloadError
    case tooSoon
    case dailyLimit
    case tooLarge
    /// Any other export failure.
    case exportError
    /// No connection: Create export and Delete account disabled.
    case offline
    /// Delete account pushed, recent sign-in, empty field.
    case deleteEmpty
    /// The word typed: Delete everything enabled.
    case deleteTyped
    /// The sign-in is old: "Confirm it's you" with Send link.
    case reauthNeeded
    /// The link was sent.
    case linkSent
    /// The opened link was expired.
    case linkExpired
    /// Signed in again, word typed.
    case reauthDone
    case deleting
    case deleteError
    /// Delete account pushed while offline.
    case deleteOffline

    /// Parses `-BFHRDataPrivacy`; nil when absent or unknown.
    public static func parse(arguments: [String]) -> DesignDataPrivacyState? {
        guard let index = arguments.firstIndex(of: "-BFHRDataPrivacy"), arguments.indices.contains(index + 1) else { return nil }
        return DesignDataPrivacyState(rawValue: arguments[index + 1])
    }

    /// The state this process was launched with, if any.
    public static let launch: DesignDataPrivacyState? = parse(arguments: ProcessInfo.processInfo.arguments)

    /// The fixture clock (foundation-ios.md): 2026-10-22 07:30 UTC.
    static let now = Date(timeIntervalSince1970: 1_792_654_200)
    static let address = "deniz.aksoy@example.com"
    static let export = AccountExport(
        exportId: "design",
        storagePath: "users/design/exports/design.zip",
        fileName: "bruteforcehr-export-2026-10-22.zip",
        sizeBytes: 14_200_000,
        documentCount: 412,
        fileCount: 9,
        createdAt: now,
        expiresAt: now.addingTimeInterval(7 * 86_400)
    )

    private var opensDelete: Bool {
        switch self {
        case .deleteEmpty, .deleteTyped, .reauthNeeded, .linkSent, .linkExpired, .reauthDone, .deleting, .deleteError, .deleteOffline: true
        default: false
        }
    }

    private var signInIsRecent: Bool {
        switch self {
        case .reauthNeeded, .linkSent, .linkExpired: false
        default: true
        }
    }

    /// A model in this state, for the app's language. Its service answers instantly from the
    /// fixture, so the flow can be clicked through without Firebase.
    public func model(languageCode: String) -> DataPrivacyModel {
        let service = DesignAccountDataService(signInIsRecent: signInIsRecent)
        let model = DataPrivacyModel(service: service, email: Self.address, languageCode: languageCode) { Self.now }
        switch self {
        case .idle: break
        case .preparing: model.export = .preparing
        case .downloading: model.export = .ready(Self.export, .downloading)
        case .ready: model.export = .ready(Self.export, .downloaded(service.fileURL))
        case .saved:
            model.export = .ready(Self.export, .downloaded(service.fileURL))
            model.savedFileName = Self.export.fileName
        case .downloadError: model.export = .ready(Self.export, .failed)
        case .tooSoon: model.export = .failed(.tooSoon)
        case .dailyLimit: model.export = .failed(.dailyLimit)
        case .tooLarge: model.export = .failed(.tooLarge)
        case .exportError: model.export = .failed(.generic)
        case .offline, .deleteOffline: model.isOnline = false
        default: break
        }
        guard opensDelete else { return model }
        model.isDeletePresented = true
        model.reauth = signInIsRecent ? .notNeeded : .needed
        switch self {
        case .deleteTyped, .deleteError:
            model.confirmationText = model.confirmWord
        case .linkSent:
            model.reauth = .sent
        case .linkExpired:
            model.reauthProblem = .linkExpired
        case .reauthDone:
            model.reauth = .done
            model.confirmationText = model.confirmWord
        case .deleting:
            model.confirmationText = model.confirmWord
            model.deletion = .deleting
        default: break
        }
        if self == .deleteError { model.deletion = .failed }
        return model
    }
}

/// Design mode's stand-in for Firebase: exports and links succeed at once, deleting fails (so the
/// app never leaves the design screen).
final class DesignAccountDataService: AccountDataService {
    let signInIsRecent: Bool
    /// An empty ZIP in the temporary folder, so Save to Files and Share have a real file.
    let fileURL: URL

    init(signInIsRecent: Bool) {
        self.signInIsRecent = signInIsRecent
        let url = FileManager.default.temporaryDirectory.appending(path: DesignDataPrivacyState.export.fileName)
        // End-of-central-directory record of an empty archive.
        try? Data([0x50, 0x4B, 0x05, 0x06] + [UInt8](repeating: 0, count: 18)).write(to: url, options: .atomic)
        fileURL = url
    }

    func createExport() async throws -> AccountExport { DesignDataPrivacyState.export }
    func download(_ export: AccountExport) async throws -> URL { fileURL }
    func lastSignInDate() async throws -> Date {
        DesignDataPrivacyState.now.addingTimeInterval(signInIsRecent ? -60 : -86_400)
    }
    func sendReauthLink(to email: String) async throws {}
    func reauthenticate(email: String, actionLink: String) async throws {}
    func deleteAccount() async throws { throw AccountDataError.other("design mode") }
    func finishDeletion() {}
}

/// The page in a navigation stack of its own (the Settings shell's stack in the app), in the
/// app's language.
public struct DesignDataPrivacyScreen: View {
    @State private var model: DataPrivacyModel

    public init(_ state: DesignDataPrivacyState, languageCode: String) {
        _model = State(initialValue: state.model(languageCode: languageCode))
    }

    public var body: some View {
        NavigationStack {
            DataPrivacyView(model: model)
        }
    }
}
#endif
