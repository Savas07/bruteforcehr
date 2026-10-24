import Foundation
import Observation

/// The account-data callables and the session calls around them (the app implements it with
/// Firebase in AccountDataService.swift; BFHRUI never imports Firebase).
public protocol AccountDataService: AnyObject {
    /// `accountExport`. Throws `AccountDataError`.
    func createExport() async throws -> AccountExport
    /// Downloads the export's ZIP from Cloud Storage to a temporary file named `fileName`.
    func download(_ export: AccountExport) async throws -> URL
    /// The ID token's `auth_time`: when the user last signed in with a link.
    func lastSignInDate() async throws -> Date
    /// Sends the normal sign-in link to `email` (the signed-in address). Throws `SignInError`.
    func sendReauthLink(to email: String) async throws
    /// Re-authenticates the signed-in user with an opened sign-in link. Throws `SignInError`.
    func reauthenticate(email: String, actionLink: String) async throws
    /// `accountDelete` with `{ confirm: true }`. Throws `AccountDataError`.
    func deleteAccount() async throws
    /// After a successful deletion: sign out locally and show the welcome screen's notice.
    func finishDeletion()
}

/// Settings › Data & privacy (docs/design/research/settings-account.md, "Decision — iOS"):
/// Export everything (create → download → Save to Files / Share) and Delete account (pushed
/// explanation screen, type-to-confirm, re-authentication when the sign-in is older than five
/// minutes, deletion, sign-out). One instance per signed-in user, kept by the app for the session
/// so an export and a pending re-authentication survive leaving the page.
@Observable
public final class DataPrivacyModel {
    /// `ACCOUNT_RECENT_SIGN_IN_SECONDS` in `@bfhr/core`.
    public static let recentSignInSeconds: TimeInterval = 300
    /// Clock skew tolerated for a sign-in "in the future" (`isRecentSignIn` in `@bfhr/core`).
    static let clockSkewSeconds: TimeInterval = 60

    // MARK: Export

    public internal(set) var export: ExportState = .idle
    /// The file name the export was saved under with Save to Files.
    public internal(set) var savedFileName: String?

    // MARK: Delete

    /// Drives the pushed Delete account screen.
    public var isDeletePresented = false
    /// The type-to-confirm field.
    public var confirmationText = ""
    public internal(set) var reauth: ReauthStep = .checking
    public internal(set) var reauthProblem: ReauthProblem?
    public internal(set) var deletion: DeletePhase = .editing

    /// The app's connection (NWPathMonitor). Offline, Create export and Delete account are disabled.
    public var isOnline: Bool

    /// The signed-in address the re-authentication link goes to.
    public let email: String
    /// `delete.confirm.word` in the app's language ("DELETE", "SİL", "LÖSCHEN").
    public let confirmWord: String

    private let service: AccountDataService
    private let locale: Locale
    private let now: () -> Date
    /// The last opened re-authentication link, for Try again after a connection problem.
    private var pendingActionLink: String?

    /// - Parameters:
    ///   - email: the signed-in address.
    ///   - languageCode: the UI language (en, tr, de): the confirm word and its matching.
    public init(
        service: AccountDataService,
        email: String,
        languageCode: String,
        isOnline: Bool = true,
        now: @escaping () -> Date = Date.init
    ) {
        self.service = service
        self.email = email
        self.isOnline = isOnline
        self.now = now
        let locale = Locale(identifier: languageCode)
        self.locale = locale
        var word = DataPrivacyStrings.confirmWord
        word.locale = locale
        confirmWord = String(localized: word)
    }

    /// The model's clock (fixed in design mode).
    public var currentDate: Date { now() }

    // MARK: Export

    public var isExportBusy: Bool {
        switch export {
        case .preparing, .ready(_, .downloading): true
        default: false
        }
    }

    public var canCreateExport: Bool { isOnline && !isExportBusy }

    /// Builds a new export, then downloads it.
    public func createExport() async {
        guard canCreateExport else { return }
        export = .preparing
        savedFileName = nil
        do {
            let created = try await service.createExport()
            export = .ready(created, .downloading)
            await download(created)
        } catch {
            export = .failed(ExportFailure(error))
        }
    }

    /// Downloads a ready export again after a failed download.
    public func retryDownload() async {
        guard case .ready(let ready, .failed) = export else { return }
        export = .ready(ready, .downloading)
        await download(ready)
    }

    private func download(_ ready: AccountExport) async {
        let result: ExportFile
        do {
            result = .downloaded(try await service.download(ready))
        } catch {
            result = .failed
        }
        // A newer export or the expiry replaced this one meanwhile.
        guard case .ready(let current, _) = export, current == ready else { return }
        export = .ready(ready, result)
    }

    /// Save to Files finished.
    public func exportSaved(to url: URL) {
        savedFileName = url.lastPathComponent
    }

    /// Hides the ready card once the server has deleted the file (`expiresAt`).
    public func expireExportIfNeeded() {
        guard case .ready(let ready, let file) = export, ready.expiresAt <= now() else { return }
        if case .downloaded(let url) = file { try? FileManager.default.removeItem(at: url) }
        export = .idle
        savedFileName = nil
    }

    // MARK: Delete

    /// Opens the Delete account screen with an empty field and checks how recent the sign-in is.
    public func beginDelete() async {
        confirmationText = ""
        deletion = .editing
        reauthProblem = nil
        isDeletePresented = true
        await checkSignIn()
    }

    /// Back to the page (Keep my account, Export my data first).
    public func endDelete() {
        guard deletion != .deleting else { return }
        isDeletePresented = false
    }

    /// The typed text matches `confirmWord`.
    public var confirmationMatches: Bool {
        DeleteConfirmation.matches(confirmationText, word: confirmWord, locale: locale)
    }

    /// The re-authentication step is shown.
    public var showsReauth: Bool {
        reauth != .checking && reauth != .notNeeded
    }

    public var isSignInConfirmed: Bool { reauth == .notNeeded || reauth == .done }

    public var canDelete: Bool {
        isOnline && confirmationMatches && isSignInConfirmed && deletion != .deleting && deletion != .deleted
    }

    /// Whether a sign-in at `authDate` is recent enough for `accountDelete` at `date`.
    public static func isRecentSignIn(_ authDate: Date, at date: Date) -> Bool {
        let age = date.timeIntervalSince(authDate)
        return age >= -clockSkewSeconds && age <= recentSignInSeconds
    }

    private func signInIsRecent() async -> Bool {
        guard let date = try? await service.lastSignInDate() else { return false }
        return Self.isRecentSignIn(date, at: now())
    }

    /// Reads `auth_time`: a recent sign-in needs no step; an old one shows "Confirm it's you"
    /// unless a link is already on its way.
    func checkSignIn() async {
        let recent = await signInIsRecent()
        if recent {
            if reauth != .done { reauth = .notNeeded }
        } else if [.checking, .notNeeded, .done].contains(reauth) {
            reauth = .needed
        }
    }

    /// Deletes the account. The sign-in is checked again first: it may have aged past five
    /// minutes while the user read and typed.
    public func delete() async {
        guard canDelete else { return }
        deletion = .deleting
        guard await signInIsRecent() else {
            requireReauth()
            return
        }
        do {
            try await service.deleteAccount()
        } catch AccountDataError.recentSignInRequired {
            requireReauth()
            return
        } catch {
            deletion = .failed
            return
        }
        deletion = .deleted
        service.finishDeletion()
    }

    private func requireReauth() {
        reauth = .needed
        reauthProblem = nil
        deletion = .editing
    }

    // MARK: Re-authentication

    /// Sends the sign-in link to the signed-in address (again from "Link sent").
    public func sendReauthLink() async {
        guard isOnline, reauth == .needed || reauth == .sent else { return }
        let previous = reauth
        reauth = .sending
        reauthProblem = nil
        do {
            try await service.sendReauthLink(to: email)
            reauth = .sent
        } catch {
            reauth = previous
            reauthProblem = ReauthProblem(sendError: error)
        }
    }

    /// Whether an opened sign-in link is for this step (while signed in, the sign-in flow
    /// ignores links; the app hands them here instead).
    public var acceptsReauthLink: Bool {
        reauth == .needed || reauth == .sent
    }

    /// Opens a sign-in URL while signed in. Returns false when the URL isn't a sign-in link or no
    /// re-authentication is waiting, so the caller can treat it otherwise.
    @discardableResult
    public func openReauthLink(_ url: URL) async -> Bool {
        guard acceptsReauthLink, let link = SignInLink(url: url) else { return false }
        guard case .signIn(let actionLink) = link else {
            reauthProblem = .linkUnusable
            return true
        }
        await verify(actionLink)
        return true
    }

    /// Tries the last link again after a connection or server problem.
    public func retryReauth() async {
        guard let link = pendingActionLink, reauthProblem?.isRetryable == true else { return }
        await verify(link)
    }

    private func verify(_ actionLink: String) async {
        reauth = .verifying
        reauthProblem = nil
        pendingActionLink = actionLink
        do {
            try await service.reauthenticate(email: email, actionLink: actionLink)
        } catch {
            switch (error as? SignInError) ?? .other {
            case .expired:
                reauth = .needed
                reauthProblem = .linkExpired
                pendingActionLink = nil
            case .unusable, .invalidEmail, .accountDisabled:
                reauth = .needed
                reauthProblem = .linkUnusable
                pendingActionLink = nil
            case .offline:
                reauth = .sent
                reauthProblem = .linkOffline
            case .tooManyRequests, .other:
                reauth = .sent
                reauthProblem = .linkOther
            }
            return
        }
        pendingActionLink = nil
        reauth = .done
    }
}
