import BFHRCore
import BFHRDesignTokens
import SwiftUI

// Settings › Mail accounts, an account's page, Job sources and Companies you follow
// (settings-account.md "Decision — iOS", connect-email.md "Settings › Mail accounts (iOS)").

extension MailAccount {
    /// "Gmail", "Outlook" or the IMAP preset's label.
    var providerLabel: String {
        switch provider {
        case .gmail: "Gmail"
        case .microsoft: "Outlook"
        case .imap: server.flatMap { ImapPreset.preset(id: $0.preset)?.label } ?? "IMAP"
        }
    }

    var needsAttention: Bool { status == .needsReauth || status == .error }
}

/// The account's status line: up to date / checking / needs reconnecting (amber icon and words).
struct MailAccountStatusLine: View {
    let account: MailAccount
    let now: Date
    @Environment(\.locale) private var locale

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
            if account.needsAttention {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(BFHRTone.warning.text)
                    .accessibilityHidden(true)
            }
            Text(text)
                .foregroundStyle(account.needsAttention ? BFHRTone.warning.text : BFHRColor.Fg.secondary)
        }
        .font(.bfhr(.footnote))
    }

    private var text: LocalizedStringResource {
        switch account.status {
        case .needsReauth: return SettingsStrings.statusNeedsReconnect
        case .error: return SettingsStrings.statusError
        case .syncing: return SettingsStrings.statusChecking
        case .connected, .disconnected:
            if let backfill = account.backfill, backfill.state == .queued || backfill.state == .running {
                return SettingsStrings.statusScanning(backfill.scanned)
            }
            guard let checked = account.lastSyncedAt else { return SettingsStrings.statusNotChecked }
            let formatter = RelativeDateTimeFormatter()
            formatter.locale = locale
            formatter.unitsStyle = .short
            return SettingsStrings.statusChecked(formatter.localizedString(for: checked, relativeTo: now))
        }
    }
}

// MARK: - Mail accounts

struct MailAccountsPage: View {
    @Bindable var model: SettingsModel
    @State private var connecting = false

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                ForEach(model.mailAccounts) { account in
                    NavigationLink(value: SettingsRoute.mailAccount(account.id)) {
                        HStack(spacing: BFHRSpace.s3) {
                            CompanyMonogram(CompanyIdentity(name: account.providerLabel), hidesAtAccessibilitySizes: true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: account.address)
                                    .font(.bfhr(.body))
                                    .foregroundStyle(BFHRColor.Fg.primary)
                                MailAccountStatusLine(account: account, now: model.now)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .accessibilityIdentifier("settings.mailAccount.\(account.address)")
                }
                if model.mailAccounts.isEmpty {
                    Text(SettingsStrings.accountsEmpty)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                Button { connecting = true } label: {
                    Label { Text(SettingsStrings.addAccount) } icon: { Image(systemName: "plus.circle.fill") }
                }
                .disabled(model.connection.isOffline)
                .accessibilityIdentifier("settings.addMailAccount")
            } header: {
                if !model.mailAccounts.isEmpty { Text(SettingsStrings.accountsHeader) }
            } footer: {
                Text(model.connection.isOffline ? SettingsStrings.needsConnection : SettingsStrings.accountsFooter)
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(SettingsStrings.mailAccounts))
        .bfhrInlineTitle()
        .bfhrMailConnectSheet(isPresented: $connecting)
        .accessibilityIdentifier("settings.mailAccountsPage")
    }
}

struct MailAccountPage: View {
    @Bindable var model: SettingsModel
    let accountId: String
    @State private var reconnecting = false
    @State private var confirmingDisconnect = false
    @State private var working = false
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale

    var body: some View {
        Group {
            if let account = model.mailAccount(accountId) {
                content(account)
            } else {
                // Disconnected meanwhile (here or on another device).
                EmptyState(.subArea, title: SettingsStrings.accountsEmpty)
            }
        }
        .navigationTitle(Text(verbatim: model.mailAccount(accountId)?.address ?? ""))
        .bfhrInlineTitle()
        .accessibilityIdentifier("settings.mailAccountPage")
    }

    private func content(_ account: MailAccount) -> some View {
        List {
            ConnectionBannerSection(model.connection)
            if account.needsAttention {
                Section {
                    InlineAlert(
                        .warning,
                        title: account.status == .needsReauth ? SettingsStrings.statusNeedsReconnect : SettingsStrings.statusError,
                        message: account.status == .needsReauth ? SettingsStrings.reconnectBody : SettingsStrings.errorBody,
                        actionTitle: SettingsStrings.reconnect,
                        action: { reconnecting = true }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .accessibilityIdentifier("settings.account.reconnect")
                }
            }
            Section {
                LabeledContent { MailAccountStatusLine(account: account, now: model.now) } label: { Text(SettingsStrings.status) }
                LabeledContent { Text(verbatim: account.providerLabel) } label: { Text(SettingsStrings.provider) }
                LabeledContent { Text(SettingsStrings.foldersValue) } label: { Text(SettingsStrings.folders) }
                LabeledContent { Text(verbatim: "\(model.storedEmails(account.id))") } label: { Text(SettingsStrings.storedEmails) }
                LabeledContent { Text(account.canSend ? SettingsStrings.sendingOn : SettingsStrings.sendingOff) } label: { Text(SettingsStrings.sending) }
                if let backfill = account.backfill {
                    LabeledContent { Text(SettingsStrings.lookbackValue(backfill.lookbackDays)) } label: { Text(SettingsStrings.pastEmails) }
                }
            }
            // While the account needs the user, Reconnect is the only useful action.
            if !account.needsAttention {
            Section {
                Button { run { await model.checkNow(account.id) } } label: { Text(SettingsStrings.checkNow) }
                    .accessibilityIdentifier("settings.account.checkNow")
                Menu {
                    ForEach(mailLookbackDays, id: \.self) { days in
                        Button { run { await model.checkPastEmails(account.id, days: days) } } label: {
                            Text(SettingsStrings.lookbackValue(days))
                        }
                    }
                } label: {
                    Text(SettingsStrings.checkAgain)
                }
                .accessibilityIdentifier("settings.account.checkAgain")
                Button { reconnecting = true } label: { Text(SettingsStrings.reconnect) }
            } footer: {
                Text(model.connection.isOffline ? SettingsStrings.needsConnection : SettingsStrings.checkAgainFooter)
            }
            .disabled(working || model.connection.isOffline)
            }
            if let server = account.server {
                Section {
                    LabeledContent { Text(verbatim: "\(server.imap.host):\(server.imap.port)") } label: { Text(verbatim: "IMAP") }
                    if let smtp = server.smtp {
                        LabeledContent { Text(verbatim: "\(smtp.host):\(smtp.port)") } label: { Text(verbatim: "SMTP") }
                    }
                    LabeledContent { Text(verbatim: server.username) } label: { Text(MailConnectStrings.username) }
                } header: {
                    Text(SettingsStrings.serverDetails)
                }
            }
            Section {
                Button(role: .destructive) { confirmingDisconnect = true } label: { Text(SettingsStrings.disconnect) }
                    .disabled(working || model.connection.isOffline)
                    .accessibilityIdentifier("settings.account.disconnect")
            }
        }
        .bfhrInsetGroupedList()
        .bfhrMailConnectSheet(isPresented: $reconnecting, reconnecting: account)
        .confirmationDialog(
            Text(SettingsStrings.disconnectTitle(account.address)),
            isPresented: $confirmingDisconnect,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                working = true
                Task {
                    let toast = await model.disconnect(account.id)
                    working = false
                    toasts?.show(toast)
                    dismiss()
                }
            } label: {
                Text(SettingsStrings.disconnectConfirm)
            }
            .accessibilityIdentifier("settings.account.disconnectConfirm")
            Button(role: .cancel) {} label: { Text(SettingsStrings.keepConnected) }
        } message: {
            Text(SettingsStrings.disconnectBody(model.storedEmails(account.id)))
        }
    }

    private func run(_ action: @escaping () async -> ToastItem) {
        working = true
        Task {
            let toast = await action()
            working = false
            toasts?.show(toast)
        }
    }
}

// MARK: - Job sources

struct JobSourcesPage: View {
    @Bindable var model: SettingsModel
    @Environment(\.locale) private var locale

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            if model.data.jobSources.isEmpty {
                Section {
                    Text(SettingsStrings.sourcesEmpty)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            sources(model.troubledSources, title: SettingsStrings.sourcesAttention)
            sources(model.workingSources, title: SettingsStrings.sourcesWorking)
            sources(model.skippedSources, title: SettingsStrings.sourcesSkipped)
            Section {
                NavigationLink(value: SettingsRoute.companies) {
                    LabeledContent {
                        if !model.companies.isEmpty { Text(SettingsStrings.companyCount(model.companies.count)) }
                    } label: {
                        Text(SettingsStrings.companies)
                    }
                }
            } footer: {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(SettingsStrings.sourcesCompaniesFooter)
                    Text(SettingsStrings.sourcesFooter)
                }
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(SettingsStrings.jobSources))
        .bfhrInlineTitle()
        .accessibilityIdentifier("settings.jobSourcesPage")
    }

    @ViewBuilder
    private func sources(_ list: [JobSourceStatus], title: LocalizedStringResource) -> some View {
        if !list.isEmpty {
            Section {
                ForEach(list) { source in
                    JobSourceRow(source: source, now: model.now)
                }
            } header: {
                Text(title)
            }
        }
    }
}

private struct JobSourceRow: View {
    let source: JobSourceStatus
    let now: Date
    @Environment(\.locale) private var locale

    private var troubled: Bool { source.state == .degraded || source.state == .failing }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            Image(systemName: glyph)
                .foregroundStyle(troubled ? BFHRTone.warning.text : source.state == .ok ? BFHRTone.success.text : BFHRColor.Fg.tertiary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: source.label)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if !source.markets.isEmpty {
                    Text(verbatim: source.markets.joined(separator: " · "))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                Text(lastRun)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                if let reason = source.reason, source.state != .ok {
                    Text(SettingsStrings.sourceReason(reason))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(troubled ? BFHRTone.warning.text : BFHRColor.Fg.secondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var glyph: String {
        switch source.state {
        case .ok: "checkmark.circle.fill"
        case .degraded, .failing: "exclamationmark.triangle.fill"
        case .skipped: "pause.circle"
        }
    }

    private var lastRun: LocalizedStringResource {
        guard let at = source.lastRunAt else { return SettingsStrings.notRunYet }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .short
        return SettingsStrings.lastRun(formatter.localizedString(for: at, relativeTo: now), jobs: source.lastResultCount ?? 0)
    }
}

// MARK: - Companies you follow

struct CompaniesPage: View {
    @Bindable var model: SettingsModel
    @State private var adding = false
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                if model.companies.isEmpty {
                    Text(SettingsStrings.companiesEmpty)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                ForEach(model.companies) { company in
                    CompanyRow(company: company)
                        .bfhrRowActions([
                            RowAction(company.enabled ? SettingsStrings.pause : SettingsStrings.resume, systemImage: company.enabled ? "pause.circle" : "play.circle", edge: .leading) {
                                model.setFollowing(company.id, enabled: !company.enabled)
                            },
                            RowAction(SettingsStrings.unfollow, systemImage: "minus.circle", edge: .trailing) {
                                if let toast = model.unfollow(company.id) { toasts?.show(toast) }
                            },
                        ])
                }
                Button { adding = true } label: {
                    Label { Text(SettingsStrings.addCompany) } icon: { Image(systemName: "plus.circle.fill") }
                }
                .accessibilityIdentifier("settings.companies.add")
            } footer: {
                Text(SettingsStrings.companiesFooter)
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(SettingsStrings.companies))
        .bfhrInlineTitle()
        .sheet(isPresented: $adding) {
            FollowCompanySheet { name, url in
                if let toast = model.follow(name: name, careersUrl: url) {
                    toasts?.show(toast)
                    return true
                }
                return false
            }
            .presentationDetents([.medium, .large])
        }
        .accessibilityIdentifier("settings.companiesPage")
    }
}

private struct CompanyRow: View {
    let company: WatchedCompany

    var body: some View {
        HStack(spacing: BFHRSpace.s3) {
            CompanyMonogram(CompanyIdentity(name: company.name, domain: company.companyDomain), hidesAtAccessibilitySizes: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: company.name)
                    .font(.bfhr(.body))
                    .foregroundStyle(company.enabled ? BFHRColor.Fg.primary : BFHRColor.Fg.secondary)
                Text(verbatim: URL(string: company.careersUrl)?.host() ?? company.careersUrl)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                status
                    .font(.bfhr(.footnote))
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var status: some View {
        if !company.enabled {
            Text(SettingsStrings.companyPaused).foregroundStyle(BFHRColor.Fg.secondary)
        } else {
            switch company.status {
            case .pending: Text(SettingsStrings.companyChecking).foregroundStyle(BFHRColor.Fg.secondary)
            case .ok: Text(SettingsStrings.openJobs(company.openJobs ?? 0)).foregroundStyle(BFHRTone.success.text)
            case .notFound: warning(SettingsStrings.companyNotFound)
            case .error: warning(SettingsStrings.companyError)
            }
        }
    }
}

extension CompanyRow {
    /// Amber symbol + words, aligned on the first line.
    fileprivate func warning(_ text: LocalizedStringResource) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
            Image(systemName: "exclamationmark.triangle").accessibilityHidden(true)
            Text(text)
        }
        .foregroundStyle(BFHRTone.warning.text)
    }
}

private struct FollowCompanySheet: View {
    /// Returns false when the input isn't valid.
    let onFollow: (String, String) -> Bool
    @State private var name = ""
    @State private var url = ""
    @State private var showsInvalid = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(text: $name) { Text(SettingsStrings.companyName) }
                        .accessibilityIdentifier("settings.companies.name")
                    TextField(text: $url, prompt: Text(verbatim: "https://jobs.lever.co/acme")) { Text(SettingsStrings.careersURL) }
                        .bfhrWebAddressInput()
                        .accessibilityIdentifier("settings.companies.url")
                } footer: {
                    VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                        if showsInvalid {
                            Label { Text(SettingsStrings.invalidURL) } icon: { Image(systemName: "exclamationmark.triangle") }
                                .foregroundStyle(BFHRTone.warning.text)
                        }
                        Text(SettingsStrings.careersURLFooter)
                    }
                }
            }
            .navigationTitle(Text(SettingsStrings.addCompany))
            .bfhrInlineTitle()
            .onChange(of: url) { showsInvalid = false }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(SettingsStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        if onFollow(name, url) { dismiss() } else { showsInvalid = true }
                    } label: {
                        Text(SettingsStrings.follow)
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || url.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("settings.companies.follow")
                }
            }
        }
    }
}
