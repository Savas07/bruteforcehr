import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

/// Records commits like the Firestore store does.
final class SettingsWriter: UserDataWriter {
    var batches: [UserDataChanges] = []
    var fails = false

    func commit(_ changes: UserDataChanges) async throws {
        batches.append(changes)
        if fails { throw URLError(.notConnectedToInternet) }
    }
}

@Suite("Settings model")
struct SettingsModelTests {
    private func model() throws -> SettingsModel {
        let document = try FixtureStore.document(.populated)
        let model = SettingsModel(now: document.now)
        var data = UserData(document)
        data.jobSources = Self.sources(at: document.now)
        model.load(data)
        return model
    }

    static func sources(at now: Date) -> [JobSourceStatus] {
        func source(_ id: String, _ label: String, _ state: JobSourceState, _ reason: JobSourceReason?) -> JobSourceStatus {
            JobSourceStatus(
                id: id, label: label, kind: .keyless, markets: ["EU"], state: state, reason: reason,
                lastRunAt: now.addingTimeInterval(-3_600), lastSuccessAt: state == .ok ? now : nil, lastError: nil,
                lastResultCount: 12, quota: nil, attribution: JobSourceAttribution(label: label, url: "https://example.com", minSize: nil),
                updatedAt: now
            )
        }
        return [
            source("remotive", "Remotive", .ok, nil),
            source("arbeitnow", "Arbeitnow", .degraded, .rateLimited),
            source("adzuna", "Adzuna", .skipped, .noKey),
            source("greenhouse", "Greenhouse", .ok, nil),
        ]
    }

    @Test("Mail accounts, attention and stored email counts")
    func mailAccounts() throws {
        let model = try model()
        #expect(model.mailAccounts.map(\.id) == ["acc-gmail", "acc-icloud"])
        #expect(model.mailNeedsAttention)
        #expect(model.storedEmails("acc-icloud") == model.data.mailMessages.filter { $0.accountId == "acc-icloud" }.count)
        #expect(model.mailAccount("acc-unknown") == nil)
    }

    @Test("Notification toggles write the whole settings.notifications object")
    func notifications() async throws {
        let model = try model()
        let writer = SettingsWriter()
        model.writer = writer
        #expect(model.data.profile?.settings.notifications == nil)
        #expect(model.notificationPreferences.interviews)

        model.setNotification(\.offers, false)
        #expect(model.notificationPreferences == NotificationPreferences(interviews: true, offers: false, assessments: true, autoApplied: true, jobAlerts: true))
        model.setNotifyRejections(false)
        #expect(!model.notifyRejections)
        try await Task.sleep(for: .milliseconds(50))
        #expect(writer.batches.count == 2)
        guard case .updated(_, let after)? = writer.batches.first?.profile else {
            Issue.record("expected a profile update")
            return
        }
        #expect(after.settings.notifications?.offers == false)
    }

    @Test("Quiet hours turn on with a default window, edit each end and turn off")
    func quietHours() throws {
        let model = try model()
        #expect(model.quietHours == QuietHours(start: "22:30", end: "08:00"))
        model.setQuietHoursEnabled(false)
        #expect(model.quietHours == nil)
        model.setQuietHoursEnabled(true)
        #expect(model.quietHours == QuietHours(start: "22:00", end: "08:00"))
        model.setQuietHours(start: "21:15")
        model.setQuietHours(end: "07:30")
        #expect(model.quietHours == QuietHours(start: "21:15", end: "07:30"))
        #expect(model.profileTimeZone.identifier == model.data.profile?.timezone)
    }

    @Test("AI switches and a refused write counts as a failure")
    func ai() async throws {
        let model = try model()
        let writer = SettingsWriter()
        writer.fails = true
        model.writer = writer
        #expect(model.aiEnabled && model.aiMailTextAllowed)
        model.setAIMailTextAllowed(false)
        model.setAIEnabled(false)
        #expect(!model.aiEnabled && !model.aiMailTextAllowed)
        try await Task.sleep(for: .milliseconds(50))
        #expect(model.writeFailures == 2)
    }

    @Test("Job sources group by state")
    func jobSources() throws {
        let model = try model()
        #expect(model.workingSources.map(\.id) == ["greenhouse", "remotive"])
        #expect(model.troubledSources.map(\.id) == ["arbeitnow"])
        #expect(model.skippedSources.map(\.id) == ["adzuna"])
    }

    @Test("Follow a company (pending, client fields only), pause it, unfollow with Undo")
    func companies() async throws {
        let model = try model()
        let writer = SettingsWriter()
        model.writer = writer
        #expect(SettingsModel.careersURL("jobs.lever.co/acme") == "https://jobs.lever.co/acme")
        #expect(SettingsModel.careersURL("not a url") == nil)
        #expect(SettingsModel.careersURL("ftp://example.com") == nil)
        #expect(model.follow(name: "Acme", careersUrl: "nope") == nil)

        let toast = try #require(model.follow(name: " Acme ", careersUrl: "jobs.lever.co/acme"))
        #expect(toast.resolvedMessage == "Following Acme")
        let company = try #require(model.companies.first { $0.name == "Acme" })
        #expect(company.status == .pending && company.enabled && company.ats == nil && company.openJobs == nil)

        model.setFollowing(company.id, enabled: false)
        #expect(model.companies.first { $0.id == company.id }?.enabled == false)

        let unfollow = try #require(model.unfollow(company.id))
        #expect(!model.companies.contains { $0.id == company.id })
        unfollow.action?.perform()
        #expect(model.companies.first { $0.id == company.id }?.status == .pending)
        try await Task.sleep(for: .milliseconds(50))
        #expect(writer.batches.map(\.watchlist.count) == [1, 1, 1, 1])
    }

    @Test("Settings links open their page")
    func routes() throws {
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings")!) == [])
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings/mail-accounts")!) == [.mailAccounts])
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings/mail-accounts/acc-1")!) == [.mailAccounts, .mailAccount("acc-1")])
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings/notifications")!) == [.notifications])
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings/data-privacy")!) == [.dataPrivacy])
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://settings/updates")!) == [])
        #expect(SettingsRoute.path(for: URL(string: "bruteforcehr://mail")!) == nil)
    }
}
