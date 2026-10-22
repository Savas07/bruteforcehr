import Foundation
import Observation

/// Where a screen's data stands (docs/design/research/states.md, "Cross-platform rules"). Cached
/// data always wins: a screen with anything to show is `.loaded`, and a failed refresh over cached
/// data is an `InlineAlert`, not `.failed`.
public enum LoadPhase: Hashable, Sendable {
    /// Cold load with nothing cached: the screen shows its skeleton (after
    /// `BFHRTiming.skeletonDelay`, kept for at least `BFHRTiming.skeletonMin`).
    case loading
    /// Nothing cached and the load failed: the screen shows `PaneError` under real chrome.
    case failed(LoadFailure)
    /// Data is on screen, from the server or the cache. "Nothing here yet" is a loaded state too.
    case loaded
}

/// A load failure. The kind picks the copy (what happened + how to fix it); `details` goes behind
/// "Copy details" and never into the body text.
public struct LoadFailure: Hashable, Sendable {
    public enum Kind: String, Hashable, Sendable, CaseIterable {
        /// The request didn't reach the server or timed out: Try again.
        case network
        /// The server refused (signed out, rules): Try again after signing in.
        case permission
        /// The document no longer exists: offer navigation, never Try again.
        case notFound
        /// Anything else: Try again.
        case unknown
    }

    public var kind: Kind
    public var details: String?

    public init(_ kind: Kind, details: String? = nil) {
        self.kind = kind
        self.details = details
    }

    /// Not-found errors offer navigation, not retry (states.md rule 5).
    public var isRetryable: Bool { kind != .notFound }
}

/// The device's connection as the screen shows it (`ConnectionBanner`). The data layer debounces
/// `offline` by `BFHRTiming.offlineDebounce` and holds `backOnline` for `BFHRTiming.backOnline`.
public enum ConnectionState: Hashable, Sendable {
    case online
    /// Reads come from the cache; writes queue. `lastSyncedAt` drives "Updated 09:12".
    case offline(lastSyncedAt: Date?)
    /// Just reconnected; `syncedChanges` > 0 adds "All changes synced".
    case backOnline(syncedChanges: Int)

    public var isOffline: Bool {
        if case .offline = self { true } else { false }
    }
}

/// The contract every screen view model follows, so design builds, previews and (later) the
/// Firestore data layer drive them the same way.
///
/// - `load(_:)` replaces the model's data and sets `phase = .loaded`.
/// - The data layer (or a design scenario) sets `phase` to `.loading` / `.failed` and
///   `connection` directly.
/// - Mutations are optimistic: they change the model at once and return a `ToastItem` whose Undo
///   restores the previous state. While offline, the touched row's id goes into `pendingSyncIDs`
///   (it shows `SyncGlyph`).
public protocol ScreenModel: AnyObject, Observable {
    var phase: LoadPhase { get set }
    var connection: ConnectionState { get set }
    /// Ids of rows changed while offline that haven't synced yet.
    var pendingSyncIDs: Set<String> { get set }
    func load(_ data: UserData)
}

extension ScreenModel {
    /// Marks `id` as waiting to sync if the change was made offline.
    public func recordWrite(_ id: String) {
        if connection.isOffline { pendingSyncIDs.insert(id) }
    }

    public var isLoaded: Bool { phase == .loaded }
}
