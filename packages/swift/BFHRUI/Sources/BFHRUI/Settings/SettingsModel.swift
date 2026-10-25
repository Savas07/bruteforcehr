import BFHRCore
import Foundation
import Observation

/// Where iOS stands on notifications for this app (`UNAuthorizationStatus`, read by the app).
public enum NotificationPermission: Hashable, Sendable {
    case notDetermined
    case denied
    case authorized
    /// Delivered quietly (no sound or banner).
    case provisional
}

/// The Settings sheet's pages (IA.md "Deep links": `bruteforcehr://settings/{page}`).
public enum SettingsRoute: Hashable, Sendable {
    /// Job preferences (Onboarding/JobPreferencesPage.swift) and one of its section editors.
    case jobPreferences
    case jobPreference(JobPreferenceSection)
    case mailAccounts
    case mailAccount(String)
    case jobSources
    case companies
    case notifications
    case ai
    case dataPrivacy

    /// `bruteforcehr://settings/…` → the pages to push (nil: the root). `desktop-app` and
    /// `updates` are desktop-only and open the root.
    public static func path(for url: URL) -> [SettingsRoute]? {
        guard url.scheme?.lowercased() == "bruteforcehr", url.host()?.lowercased() == "settings" else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch parts.first {
        case "job-preferences":
            if let section = parts.dropFirst().first.flatMap(JobPreferenceSection.init(rawValue:)) {
                return [.jobPreferences, .jobPreference(section)]
            }
            return [.jobPreferences]
        case "mail-accounts":
            if let id = parts.dropFirst().first, id != "add" { return [.mailAccounts, .mailAccount(id)] }
            return [.mailAccounts]
        case "job-sources": return [.jobSources]
        case "companies": return [.jobSources, .companies]
        case "notifications": return [.notifications]
        case "ai": return [.ai]
        case "data-privacy": return [.dataPrivacy]
        default: return []
        }
    }
}

/// Settings (settings-account.md "Decision — iOS"): the account, connections (mail accounts, job
/// sources, companies you follow), notifications with quiet hours, AI, and the app's language and
/// appearance. Every setting saves at once (optimistic, a toast on a refused write); account
/// actions go through the mail callables.
@Observable
public final class SettingsModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    public var now: Date
    public private(set) var data: UserData = .empty

    /// Persists profile and watchlist changes (the app's Firestore store); nil in tests and design.
    public weak var writer: (any UserDataWriter)?
    /// The mail callables (Check now, past emails, disconnect).
    public var mailService: (any MailConnectService)?
    public var usesSystemClock = false
    public private(set) var writeFailures = 0

    /// iOS's notification permission for this app (the app reads it on appear and on return).
    public var permission: NotificationPermission = .notDetermined
    /// Asks iOS for permission (in context, decisions.md D25); the app registers for pushes.
    public var requestPermission: (() async -> Void)?

    /// "1.4 (37)" for About.
    public var appVersion = ""

    var writeTime: Date { usesSystemClock ? .now : now }

    public init(now: Date = .now) {
        self.now = now
    }

    public func load(_ data: UserData) {
        self.data = data
        phase = .loaded
    }

    @discardableResult
    func mutate<Result>(_ body: (inout UserData) throws -> Result) rethrows -> Result {
        let before = data
        let result = try body(&data)
        let changes = UserDataChanges(from: before, to: data)
        if !changes.isEmpty, let writer {
            Task { [weak self] in
                do {
                    try await writer.commit(changes)
                } catch {
                    self?.writeFailures += 1
                }
            }
        }
        return result
    }

    // MARK: Mail accounts

    /// Connected accounts (a disconnecting account leaves at once).
    public var mailAccounts: [MailAccount] {
        data.mailAccounts.filter { $0.status != .disconnected }.sorted { $0.connectedAt < $1.connectedAt }
    }

    public var mailNeedsAttention: Bool {
        mailAccounts.contains { $0.status == .needsReauth || $0.status == .error }
    }

    public func mailAccount(_ id: String) -> MailAccount? { mailAccounts.first { $0.id == id } }

    /// Job emails stored from an account (the disconnect sheet's count).
    public func storedEmails(_ accountId: String) -> Int {
        data.mailMessages.filter { $0.accountId == accountId }.count
    }

    /// "Check now": `mailSyncNow`.
    public func checkNow(_ accountId: String) async -> ToastItem {
        do {
            try await mailService?.syncNow(accountId: accountId)
            return ToastItem(glyph: "arrow.clockwise", message: SettingsStrings.checkQueued)
        } catch {
            return ToastItem(glyph: ToastGlyph.info, message: SettingsStrings.actionFailed)
        }
    }

    /// "Check past emails again": `mailBackfillStart` over `days`.
    public func checkPastEmails(_ accountId: String, days: Int) async -> ToastItem {
        do {
            try await mailService?.startBackfill(accountId: accountId, lookbackDays: days)
            return ToastItem(glyph: "arrow.clockwise", message: SettingsStrings.scanQueued)
        } catch {
            return ToastItem(glyph: ToastGlyph.info, message: SettingsStrings.actionFailed)
        }
    }

    /// Disconnect and delete: `mailDisconnect`. No Undo (the server revoked access and deleted
    /// the emails); the confirmation said so.
    public func disconnect(_ accountId: String) async -> ToastItem {
        let address = mailAccount(accountId)?.address ?? ""
        do {
            _ = try await mailService?.disconnect(accountId: accountId)
            return ToastItem(glyph: ToastGlyph.removed, message: SettingsStrings.disconnected(address))
        } catch {
            return ToastItem(glyph: ToastGlyph.info, message: SettingsStrings.actionFailed)
        }
    }

    // MARK: Notifications

    /// `settings.notifications`; null means every category on.
    public var notificationPreferences: NotificationPreferences {
        data.profile?.settings.notifications
            ?? NotificationPreferences(interviews: true, offers: true, assessments: true, autoApplied: true, jobAlerts: true)
    }

    public var notifyRejections: Bool { data.profile?.settings.notifyRejections ?? true }

    /// Writes the whole `settings.notifications` object (the client contract).
    public func setNotification(_ keyPath: WritableKeyPath<NotificationPreferences, Bool>, _ isOn: Bool) {
        var preferences = notificationPreferences
        preferences[keyPath: keyPath] = isOn
        updateProfile { $0.settings.notifications = preferences }
    }

    public func setNotifyRejections(_ isOn: Bool) {
        updateProfile { $0.settings.notifyRejections = isOn }
    }

    public var quietHours: QuietHours? { data.profile?.settings.quietHours }

    /// Quiet hours on (22:00–08:00 to start) or off.
    public func setQuietHoursEnabled(_ isOn: Bool) {
        updateProfile { $0.settings.quietHours = isOn ? QuietHours(start: "22:00", end: "08:00") : nil }
    }

    /// One end of the quiet hours, as "HH:mm" in the profile's time zone.
    public func setQuietHours(start: String? = nil, end: String? = nil) {
        guard let current = quietHours else { return }
        updateProfile { $0.settings.quietHours = QuietHours(start: start ?? current.start, end: end ?? current.end) }
    }

    /// The profile's IANA zone (quiet hours are kept in it).
    public var profileTimeZone: TimeZone {
        data.profile.flatMap { TimeZone(identifier: $0.timezone) } ?? .current
    }

    // MARK: AI

    public var aiEnabled: Bool { data.profile?.aiEnabled ?? true }
    public var aiMailTextAllowed: Bool { data.profile?.settings.aiMailTextAllowed ?? false }

    public func setAIEnabled(_ isOn: Bool) {
        updateProfile { $0.aiEnabled = isOn }
    }

    public func setAIMailTextAllowed(_ isOn: Bool) {
        updateProfile { $0.settings.aiMailTextAllowed = isOn }
    }

    private func updateProfile(_ change: (inout Profile) -> Void) {
        guard data.profile != nil else { return }
        let at = writeTime
        mutate { data in
            guard var profile = data.profile else { return }
            change(&profile)
            profile.updatedAt = at
            data.profile = profile
        }
        if let id = data.profile?.id { recordWrite(id) }
    }

    // MARK: Job sources

    /// Sources that ran fine.
    public var workingSources: [JobSourceStatus] { sources(in: [.ok]) }
    /// Degraded or failing.
    public var troubledSources: [JobSourceStatus] { sources(in: [.degraded, .failing]) }
    /// Skipped (no key, turned off).
    public var skippedSources: [JobSourceStatus] { sources(in: [.skipped]) }

    private func sources(in states: Set<JobSourceState>) -> [JobSourceStatus] {
        data.jobSources.filter { states.contains($0.state) }.sorted { $0.label.localizedStandardCompare($1.label) == .orderedAscending }
    }

    // MARK: Companies you follow

    public var companies: [WatchedCompany] {
        data.watchlist.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    /// A careers page address the server can resolve (https, with a host), normalised.
    public static func careersURL(_ text: String) -> String? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains(" ") else { return nil }
        if !trimmed.lowercased().hasPrefix("http://") && !trimmed.lowercased().hasPrefix("https://") {
            trimmed = "https://" + trimmed
        }
        guard let components = URLComponents(string: trimmed), let host = components.host, host.contains("."),
              components.scheme?.lowercased() == "https" || components.scheme?.lowercased() == "http" else { return nil }
        return components.string
    }

    /// Follows a company (created `pending`; the server finds its board). Undo removes it.
    @discardableResult
    public func follow(name: String, careersUrl: String) -> ToastItem? {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, let url = Self.careersURL(careersUrl) else { return nil }
        let at = writeTime
        let company = WatchedCompany(
            id: UserData.makeID(), name: name, careersUrl: url, enabled: true,
            ats: nil, boardToken: nil, companyDomain: nil, status: .pending, lastError: nil,
            openJobs: nil, lastFetchedAt: nil, createdAt: at, updatedAt: at
        )
        mutate { $0.watchlist.append(company) }
        recordWrite(company.id)
        return ToastItem(glyph: ToastGlyph.saved, message: SettingsStrings.followed(name), action: .undo { [weak self] in
            self?.mutate { $0.watchlist.removeAll { $0.id == company.id } }
        })
    }

    /// Unfollows a company. Undo follows it again (the same document, re-created pending).
    public func unfollow(_ id: String) -> ToastItem? {
        guard let company = data.watchlist.first(where: { $0.id == id }) else { return nil }
        mutate { $0.watchlist.removeAll { $0.id == id } }
        return ToastItem(glyph: ToastGlyph.removed, message: SettingsStrings.unfollowed(company.name), action: .undo { [weak self] in
            guard let self else { return }
            var again = company
            again.status = .pending
            again.ats = nil
            again.boardToken = nil
            again.companyDomain = nil
            again.lastError = nil
            again.openJobs = nil
            again.lastFetchedAt = nil
            again.updatedAt = self.writeTime
            mutate { $0.watchlist.append(again) }
        })
    }

    /// Pauses or resumes checking a company's board.
    public func setFollowing(_ id: String, enabled: Bool) {
        let at = writeTime
        mutate { data in
            guard let index = data.watchlist.firstIndex(where: { $0.id == id }) else { return }
            data.watchlist[index].enabled = enabled
            data.watchlist[index].updatedAt = at
        }
        recordWrite(id)
    }
}
