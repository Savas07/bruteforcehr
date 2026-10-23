import Foundation
import Observation

/// The two fields of `appConfig/ios` the update gate reads (ADR 0004 §3). Strings as stored; nil
/// when the document or the field is missing.
public nonisolated struct AppConfigVersions: Hashable, Sendable {
    public var latestVersion: String?
    public var minSupportedVersion: String?

    public init(latestVersion: String?, minSupportedVersion: String?) {
        self.latestVersion = latestVersion
        self.minSupportedVersion = minSupportedVersion
    }
}

/// What the installed build should do about `appConfig/ios`.
public nonisolated enum UpdateStatus: Hashable, Sendable {
    /// Nothing to show: up to date, newer than the config, or the config is unknown (fail open).
    case upToDate
    /// A newer build is in TestFlight: the dismissible banner.
    case available(installed: AppVersion, latest: AppVersion)
    /// The installed build is below `minSupportedVersion`: the blocking screen.
    case required(installed: AppVersion, minimum: AppVersion)

    /// Required wins over available. Anything missing or unparseable fails open (`upToDate`).
    public static func evaluate(installed: AppVersion?, latest: AppVersion?, minimum: AppVersion?) -> UpdateStatus {
        guard let installed else { return .upToDate }
        if let minimum, installed < minimum { return .required(installed: installed, minimum: minimum) }
        if let latest, installed < latest { return .available(installed: installed, latest: latest) }
        return .upToDate
    }
}

/// The iOS version gate (PRD M1-UPD-2, docs/design/research/ios-update.md): the app calls
/// `check(_:)` at launch and on every return to the foreground with a server read of
/// `appConfig/ios`; `RootView` shows the banner (`.bfhrUpdateBanner`) and the blocking screen
/// (`.bfhrUpdateGate`) from it.
///
/// Fail open: before the first read, after a missing document and after a failed read nothing
/// blocks. A failed re-check hides the banner (TestFlight can't download offline either) but keeps
/// a block the server already confirmed this session.
@Observable
public final class UpdateGateModel {
    /// The running build (`CFBundleShortVersionString`); nil when unparseable (never blocks).
    public let installedVersion: AppVersion?
    public private(set) var status: UpdateStatus = .upToDate
    /// The newest version whose banner the user closed; the banner returns for a newer one.
    public private(set) var dismissedVersion: AppVersion?
    private let defaults: UserDefaults?
    private var isChecking = false

    static let dismissedVersionKey = "bfhr.update.dismissedVersion"

    /// - Parameters:
    ///   - installedVersion: the app's `CFBundleShortVersionString`.
    ///   - defaults: where the dismissed version is remembered; nil keeps it in memory only
    ///     (design mode, previews, tests).
    public init(installedVersion: String?, defaults: UserDefaults? = .standard) {
        self.installedVersion = installedVersion.flatMap(AppVersion.init)
        self.defaults = defaults
        dismissedVersion = defaults?.string(forKey: Self.dismissedVersionKey).flatMap(AppVersion.init)
    }

    /// The version the banner offers; nil when there's no banner (up to date, blocked, or closed
    /// for this version or a newer one).
    public var bannerVersion: AppVersion? {
        guard case .available(_, let latest) = status else { return nil }
        if let dismissedVersion, dismissedVersion >= latest { return nil }
        return latest
    }

    /// Installed and required versions while blocked.
    public var requirement: (installed: AppVersion, minimum: AppVersion)? {
        guard case .required(let installed, let minimum) = status else { return nil }
        return (installed, minimum)
    }

    public var isBlocked: Bool { requirement != nil }

    /// Applies a successful read of `appConfig/ios`.
    public func apply(_ config: AppConfigVersions) {
        status = .evaluate(
            installed: installedVersion,
            latest: config.latestVersion.flatMap(AppVersion.init),
            minimum: config.minSupportedVersion.flatMap(AppVersion.init)
        )
    }

    /// A read that failed (offline, timeout, permission): no banner; a confirmed block stays.
    public func applyFailure() {
        if case .available = status { status = .upToDate }
    }

    /// Reads the config with `fetch` and applies it; overlapping calls (launch + foreground) run
    /// once.
    public func check(_ fetch: () async throws -> AppConfigVersions) async {
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }
        do {
            apply(try await fetch())
        } catch {
            applyFailure()
        }
    }

    /// Closes the banner until a newer version than the one offered appears.
    public func dismissBanner() {
        guard let version = bannerVersion else { return }
        dismissedVersion = version
        defaults?.set(version.description, forKey: Self.dismissedVersionKey)
    }
}
