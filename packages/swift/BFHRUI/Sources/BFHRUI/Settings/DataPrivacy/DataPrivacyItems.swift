import Foundation

/// A finished `accountExport`: `AccountExportResponse` in `@bfhr/core` (src/account). The ZIP sits
/// at `storagePath` (owner-readable in Cloud Storage) until `expiresAt`.
public nonisolated struct AccountExport: Equatable, Sendable {
    public let exportId: String
    public let storagePath: String
    public let fileName: String
    public let sizeBytes: Int64
    public let documentCount: Int
    public let fileCount: Int
    public let createdAt: Date
    public let expiresAt: Date

    public init(
        exportId: String,
        storagePath: String,
        fileName: String,
        sizeBytes: Int64,
        documentCount: Int,
        fileCount: Int,
        createdAt: Date,
        expiresAt: Date
    ) {
        self.exportId = exportId
        self.storagePath = storagePath
        self.fileName = fileName
        self.sizeBytes = sizeBytes
        self.documentCount = documentCount
        self.fileCount = fileCount
        self.createdAt = createdAt
        self.expiresAt = expiresAt
    }
}

/// Why `accountExport` or `accountDelete` failed, in the terms the page needs. The app maps the
/// callables' `HttpsError` codes and `details.reason` onto these (AccountDataService.swift).
public nonisolated enum AccountDataError: Error, Equatable, Sendable {
    /// `export_too_soon`: less than two minutes since the previous export.
    case exportTooSoon
    /// `export_daily_limit`: five exports today (UTC).
    case exportDailyLimit
    /// `export_too_large`: more data than one export holds.
    case exportTooLarge
    /// `email_unverified` (can't happen with email-link sign-in; shown as the generic error).
    case emailUnverified
    /// `accountDelete`: the sign-in is older than five minutes.
    case recentSignInRequired
    /// No connection, or the request timed out.
    case offline
    /// Anything else; the text is for logs only.
    case other(String)
}

/// The export problem shown under Create export.
public nonisolated enum ExportFailure: Equatable, Sendable {
    case tooSoon
    case dailyLimit
    case tooLarge
    /// Connection, server, or a reason the page has no copy for.
    case generic

    public init(_ error: any Error) {
        switch error as? AccountDataError {
        case .exportTooSoon: self = .tooSoon
        case .exportDailyLimit: self = .dailyLimit
        case .exportTooLarge: self = .tooLarge
        default: self = .generic
        }
    }

    /// The same request can work again: Try again instead of Create export.
    public var isRetryable: Bool { self == .generic }
}

/// The "Export everything" section.
public nonisolated enum ExportState: Equatable, Sendable {
    case idle
    /// `accountExport` is building the ZIP.
    case preparing
    /// The ZIP exists; the app downloads it to a temporary file for Save to Files and Share.
    case ready(AccountExport, ExportFile)
    case failed(ExportFailure)
}

/// The downloaded copy of a ready export.
public nonisolated enum ExportFile: Equatable, Sendable {
    case downloading
    case downloaded(URL)
    /// The download failed; the export itself is still on the server.
    case failed
}

/// The re-authentication step of Delete account: `accountDelete` needs a sign-in at most five
/// minutes old, confirmed with a fresh email link to the signed-in address.
public nonisolated enum ReauthStep: Equatable, Sendable {
    /// Reading the ID token's `auth_time`.
    case checking
    /// The sign-in is recent: no step shown.
    case notNeeded
    /// "Confirm it's you" with Send link.
    case needed
    case sending
    /// The link went out; waiting for the user to open it on this device.
    case sent
    /// Re-authenticating with the opened link.
    case verifying
    /// Signed in again: Delete everything can be used.
    case done
}

/// A problem in the re-authentication step, shown as an alert in it (sign-in copy).
public nonisolated enum ReauthProblem: Equatable, Sendable {
    case sendOffline
    case sendTooManyRequests
    case sendOther
    case linkExpired
    /// Used, replaced, cut off, or for another account.
    case linkUnusable
    /// The link is fine but the connection failed: Try again uses it again.
    case linkOffline
    case linkOther

    init(sendError error: any Error) {
        switch (error as? SignInError) ?? .other {
        case .offline: self = .sendOffline
        case .tooManyRequests: self = .sendTooManyRequests
        default: self = .sendOther
        }
    }

    /// Whether the same link can be tried again.
    public var isRetryable: Bool { self == .linkOffline || self == .linkOther }
}

/// The deletion itself.
public nonisolated enum DeletePhase: Equatable, Sendable {
    case editing
    case deleting
    /// `accountDelete` failed; Delete everything tries again (the server continues where it stopped).
    case failed
    /// Done: the app signs out and the welcome screen says so.
    case deleted
}

/// The type-to-confirm rule, the same on desktop: trim, then lowercase (root, and separately in
/// the app's locale), then fold the Turkish dotless "ı" into "i" and drop the combining dot above
/// (U+0307). The input matches when either candidate folds to the same text as the word, so
/// "SIL", "sil" and "SİL" all confirm the Turkish "SİL", while German umlauts stay significant.
public nonisolated enum DeleteConfirmation {
    public static func matches(_ input: String, word: String, locale: Locale) -> Bool {
        guard !word.isEmpty else { return false }
        return fold(input, locale: nil) == fold(word, locale: nil)
            || fold(input, locale: locale) == fold(word, locale: locale)
    }

    static func fold(_ text: String, locale: Locale?) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowered = locale.map { trimmed.lowercased(with: $0) } ?? trimmed.lowercased()
        var scalars = String.UnicodeScalarView()
        for scalar in lowered.unicodeScalars where scalar != "\u{0307}" {
            scalars.append(scalar == "\u{0131}" ? "i" : scalar)
        }
        return String(scalars)
    }
}
