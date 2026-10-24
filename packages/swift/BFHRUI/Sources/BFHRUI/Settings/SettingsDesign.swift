#if DEBUG
import BFHRCore
import BFHRUIFixtures
import Foundation
import SwiftUI

// Design mode for Settings (Debug builds only): `-BFHRScreen settings` opens the Settings sheet
// over Today on the scenario's fixtures; `-BFHRSettingsPage <page>` pushes a page
// (mail-accounts, mail-account, job-sources, companies, notifications, notifications-off, ai,
// data-privacy, answers, answer-editor). Release builds compile none of this.

/// The page `-BFHRSettingsPage` asks for.
public enum DesignSettingsPage: String, CaseIterable, Sendable {
    case root
    case mailAccounts = "mail-accounts"
    case mailAccount = "mail-account"
    case jobSources = "job-sources"
    case companies
    case notifications
    /// Notifications with iOS permission denied.
    case notificationsOff = "notifications-off"
    case ai
    case dataPrivacy = "data-privacy"
    /// Application answers (the kit's answers library).
    case answers
    /// Application answers with the editor sheet open on the first answer.
    case answerEditor = "answer-editor"

    public static var launch: DesignSettingsPage {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BFHRSettingsPage"), arguments.indices.contains(index + 1) else { return .root }
        return DesignSettingsPage(rawValue: arguments[index + 1]) ?? .root
    }

    public var path: [SettingsRoute] {
        switch self {
        case .root: []
        case .mailAccounts: [.mailAccounts]
        case .mailAccount: [.mailAccounts, .mailAccount("acc-icloud")]
        case .jobSources: [.jobSources]
        case .companies: [.jobSources, .companies]
        case .notifications, .notificationsOff: [.notifications]
        case .ai: [.ai]
        case .dataPrivacy: [.dataPrivacy]
        case .answers, .answerEditor: [.answers]
        }
    }
}

extension DesignScenario {
    /// Settings in this scenario: the fixture profile and accounts, a realistic set of job
    /// sources and followed companies (populated), nothing connected (empty).
    public func settingsModel(page: DesignSettingsPage = .launch) -> SettingsModel {
        let model = SettingsModel(now: now)
        model.appVersion = "1.0 (1)"
        model.permission = page == .notificationsOff ? .denied : .authorized
        model.mailService = DesignMailService()
        var data = self.data
        if dataset == .populated {
            data.jobSources = Self.designJobSources(now: now)
            data.watchlist = Self.designWatchlist(now: now)
        }
        switch condition {
        case .loading:
            model.phase = .loading
        case .error:
            model.phase = .failed(LoadFailure(.network, details: "Design scenario (-BFHRState error)"))
        case .offline:
            model.load(data)
            model.connection = .offline(lastSyncedAt: now.addingTimeInterval(-18 * 60))
        case nil:
            model.load(data)
        }
        return model
    }

    static func designJobSources(now: Date) -> [JobSourceStatus] {
        func source(_ id: String, _ label: String, _ markets: [String], _ state: JobSourceState, _ reason: JobSourceReason?, _ count: Int?, _ hoursAgo: Double?) -> JobSourceStatus {
            JobSourceStatus(
                id: id, label: label, kind: reason == .noKey ? .keyed : .keyless, markets: markets, state: state, reason: reason,
                lastRunAt: hoursAgo.map { now.addingTimeInterval(-$0 * 3_600) }, lastSuccessAt: state == .ok ? now : nil, lastError: nil,
                lastResultCount: count, quota: nil,
                attribution: JobSourceAttribution(label: label, url: "https://example.com", minSize: nil), updatedAt: now
            )
        }
        return [
            source("remotive", "Remotive", ["Remote"], .ok, nil, 18, 1),
            source("arbeitnow", "Arbeitnow", ["DE", "EU"], .ok, nil, 42, 1),
            source("greenhouse", "Greenhouse boards", ["Worldwide"], .ok, nil, 9, 1),
            source("lever", "Lever boards", ["Worldwide"], .degraded, .rateLimited, 3, 1),
            source("adzuna", "Adzuna", ["UK", "DE", "NL"], .skipped, .noKey, nil, nil),
            source("reed", "Reed", ["UK"], .skipped, .noKey, nil, nil),
        ]
    }

    static func designWatchlist(now: Date) -> [WatchedCompany] {
        func company(_ id: String, _ name: String, _ url: String, _ status: WatchedCompanyStatus, _ open: Int?, enabled: Bool = true) -> WatchedCompany {
            WatchedCompany(
                id: id, name: name, careersUrl: url, enabled: enabled, ats: status == .ok ? "greenhouse" : nil, boardToken: nil,
                companyDomain: nil, status: status, lastError: nil, openJobs: open, lastFetchedAt: status == .ok ? now : nil,
                createdAt: now, updatedAt: now
            )
        }
        return [
            company("w-brightwave", "Brightwave", "https://boards.greenhouse.io/brightwave", .ok, 7),
            company("w-nordlicht", "Nordlicht Mobility", "https://jobs.lever.co/nordlicht", .ok, 3),
            company("w-kumsal", "Kumsal Yazılım", "https://kumsal.example/kariyer", .notFound, nil),
            company("w-fjordline", "Fjordline", "https://jobs.ashbyhq.com/fjordline", .pending, nil),
            company("w-quill", "Quill Docs", "https://apply.workable.com/quill", .ok, 2, enabled: false),
        ]
    }
}

/// The Settings sheet over Today in design mode.
public struct DesignSettingsSheet: View {
    @Binding private var path: [SettingsRoute]
    @State private var model: SettingsModel
    @State private var dataPrivacy: DataPrivacyModel

    public init(path: Binding<[SettingsRoute]>) {
        _path = path
        let scenario = DesignScenario.launch ?? DesignScenario()
        _model = State(initialValue: scenario.settingsModel())
        _dataPrivacy = State(initialValue: DesignDataPrivacyState.idle.model(languageCode: Locale.current.language.languageCode?.identifier ?? "en"))
    }

    public var body: some View {
        SettingsScreen(model: model, path: $path) {
            DataPrivacyView(model: dataPrivacy)
        }
        .environment(\.bfhrAccount, AccountContext(email: "deniz.aksoy@example.com") {})
    }
}
#endif
