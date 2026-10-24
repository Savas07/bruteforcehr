import BFHRCore
import BFHRDesignTokens
import SwiftUI
#if os(iOS)
import UIKit
#endif

/// The app's appearance, per device (`@AppStorage(AppAppearance.storageKey)`; the app root applies
/// it with `.preferredColorScheme`).
public enum AppAppearance: String, CaseIterable, Sendable {
    case system
    case light
    case dark

    public static let storageKey = "bfhr.appearance"

    public var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var title: LocalizedStringResource {
        switch self {
        case .system: SettingsStrings.appearanceSystem
        case .light: SettingsStrings.appearanceLight
        case .dark: SettingsStrings.appearanceDark
        }
    }
}

/// Settings (settings-account.md "Decision — iOS"; IA.md: the avatar's menu opens it as a sheet
/// with "Done"). Inset-grouped rows with SF Symbol tiles and trailing values; pages push inside
/// the sheet's stack. `dataPrivacy` is the Data & privacy page (export, delete account), supplied
/// by the app.
public struct SettingsScreen<DataPrivacy: View>: View {
    @Bindable private var model: SettingsModel
    @Binding private var path: [SettingsRoute]
    private let dataPrivacy: (() -> DataPrivacy)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bfhrAccount) private var account
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @Environment(\.locale) private var locale
    @AppStorage(AppAppearance.storageKey) private var appearance: AppAppearance = .system

    public init(model: SettingsModel, path: Binding<[SettingsRoute]>, @ViewBuilder dataPrivacy: @escaping () -> DataPrivacy) {
        self.model = model
        _path = path
        self.dataPrivacy = dataPrivacy
    }

    public var body: some View {
        NavigationStack(path: $path) {
            List {
                ConnectionBannerSection(model.connection)
                if let account {
                    Section {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(SettingsStrings.signedInAs)
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                            Text(verbatim: account.email)
                                .font(.bfhr(.body))
                                .foregroundStyle(BFHRColor.Fg.primary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                Section {
                    NavigationLink(value: SettingsRoute.mailAccounts) {
                        SettingsRow(SettingsStrings.mailAccounts, glyph: "envelope", tile: BFHRTone.info.solid) {
                            mailValue
                        }
                    }
                    .accessibilityIdentifier("settings.mailAccounts")
                    NavigationLink(value: SettingsRoute.jobSources) {
                        // Source trouble is ours to fix, not the user's: a count, never an alert.
                        SettingsRow(SettingsStrings.jobSources, glyph: "antenna.radiowaves.left.and.right", tile: BFHRTone.success.solid) {
                            if !model.workingSources.isEmpty {
                                Text(SettingsStrings.workingCount(model.workingSources.count))
                            }
                        }
                    }
                    .accessibilityIdentifier("settings.jobSources")
                    NavigationLink(value: SettingsRoute.companies) {
                        SettingsRow(SettingsStrings.companies, glyph: "building.2", tile: BFHRColor.Accent.solid) {
                            if !model.companies.isEmpty { Text(SettingsStrings.companyCount(model.companies.count)) }
                        }
                    }
                    .accessibilityIdentifier("settings.companies")
                } header: {
                    Text(SettingsStrings.connections)
                }
                Section {
                    NavigationLink(value: SettingsRoute.notifications) {
                        SettingsRow(SettingsStrings.notifications, glyph: "bell.badge", tile: BFHRTone.warning.solid) {
                            if model.permission == .denied {
                                Text(SettingsStrings.offInSystem)
                            } else if let quiet = model.quietHours {
                                Image(systemName: "moon")
                                    .accessibilityHidden(true)
                                Text(verbatim: "\(quiet.start)–\(quiet.end)")
                                    .accessibilityLabel(Text(SettingsStrings.quietValue(quiet.start, quiet.end)))
                            }
                        }
                    }
                    .accessibilityIdentifier("settings.notifications")
                    NavigationLink(value: SettingsRoute.ai) {
                        SettingsRow(SettingsStrings.ai, glyph: "sparkles", tile: BFHRColor.Accent.solid) {
                            Text(model.aiEnabled ? SettingsStrings.on : SettingsStrings.off)
                        }
                    }
                    .accessibilityIdentifier("settings.ai")
                    Button(action: openAppSettings) {
                        SettingsRow(SettingsStrings.language, glyph: "globe", tile: BFHRTone.info.solid) {
                            Text(verbatim: Self.languageName(locale: locale))
                            Image(systemName: "arrow.up.forward")
                                .font(.bfhr(.footnote))
                                .accessibilityHidden(true)
                        }
                    }
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .accessibilityIdentifier("settings.language")
                    Picker(selection: $appearance) {
                        ForEach(AppAppearance.allCases, id: \.self) { option in
                            Text(option.title).tag(option)
                        }
                    } label: {
                        SettingsRow(SettingsStrings.appearance, glyph: "circle.lefthalf.filled", tile: SettingsRow<EmptyView>.neutralTile) { EmptyView() }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("settings.appearance")
                } header: {
                    Text(SettingsStrings.preferences)
                } footer: {
                    Text(SettingsStrings.languageFooter)
                }
                if dataPrivacy != nil {
                    Section {
                        NavigationLink(value: SettingsRoute.dataPrivacy) {
                            SettingsRow(SettingsStrings.dataPrivacy, glyph: "hand.raised", tile: SettingsRow<EmptyView>.neutralTile) { EmptyView() }
                        }
                        .accessibilityIdentifier("settings.dataPrivacy")
                    }
                }
                Section {
                    LabeledContent {
                        Text(verbatim: model.appVersion)
                    } label: {
                        Text(SettingsStrings.version)
                    }
                } header: {
                    Text(SettingsStrings.about)
                } footer: {
                    Text(SettingsStrings.updatesFooter)
                }
                if account != nil {
                    Section {
                        Button(action: signOut) { Text(SettingsStrings.signOut) }
                            .accessibilityIdentifier("settings.signOut")
                    }
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(SettingsStrings.title))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(SettingsStrings.done) }
                        .accessibilityIdentifier("settings.done")
                }
            }
            .navigationDestination(for: SettingsRoute.self) { route in
                switch route {
                case .mailAccounts: MailAccountsPage(model: model)
                case .mailAccount(let id): MailAccountPage(model: model, accountId: id)
                case .jobSources: JobSourcesPage(model: model)
                case .companies: CompaniesPage(model: model)
                case .notifications: NotificationsPage(model: model)
                case .ai: AISettingsPage(model: model)
                case .dataPrivacy: dataPrivacy?()
                }
            }
            .bfhrToastHost()
        }
        .accessibilityIdentifier("settings")
        .onChange(of: model.writeFailures) { _, _ in
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: SettingsStrings.saveFailed))
        }
    }

    @ViewBuilder private var mailValue: some View {
        if model.mailNeedsAttention {
            AttentionValue()
        } else if model.mailAccounts.isEmpty {
            Text(SettingsStrings.noneConnected)
        } else {
            Text(SettingsStrings.connectedCount(model.mailAccounts.count))
        }
    }

    private func signOut() {
        do {
            try account?.signOut()
            dismiss()
        } catch {
            toasts?.show(ToastItem(glyph: "exclamationmark.circle", message: SignInStrings.signOutFailed))
        }
    }

    /// The app's page in iOS Settings (language, notifications).
    private func openAppSettings() {
        #if os(iOS)
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        #endif
    }

    /// The language this app runs in ("English", "Türkçe", "Deutsch"), in that language.
    static func languageName(locale: Locale) -> String {
        let code = Bundle.main.preferredLocalizations.first ?? locale.language.languageCode?.identifier ?? "en"
        let own = Locale(identifier: code)
        return own.localizedString(forLanguageCode: code)?.capitalized(with: own) ?? code
    }
}

extension SettingsScreen where DataPrivacy == EmptyView {
    /// Settings without the Data & privacy page (design previews before it lands).
    public init(model: SettingsModel, path: Binding<[SettingsRoute]>) {
        self.model = model
        _path = path
        dataPrivacy = nil
    }
}

/// A settings row: a tinted symbol tile, the title, and a trailing value.
struct SettingsRow<Value: View>: View {
    private let title: LocalizedStringResource
    private let glyph: String
    private let tile: Color
    private let value: Value
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var tileSize: CGFloat = 29

    /// A grey tile that keeps its white symbol readable in light and dark.
    static var neutralTile: Color { Color(red: 0.45, green: 0.47, blue: 0.52) }

    init(_ title: LocalizedStringResource, glyph: String, tile: Color, @ViewBuilder value: () -> Value) {
        self.title = title
        self.glyph = glyph
        self.tile = tile
        self.value = value()
    }

    var body: some View {
        let stacked = dynamicTypeSize.isAccessibilitySize
        let layout = stacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(spacing: BFHRSpace.s3))
        HStack(spacing: BFHRSpace.s3) {
            if !stacked {
                Image(systemName: glyph)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(.white)
                    .frame(width: tileSize, height: tileSize)
                    .background(tile, in: BFHRRadius.shape(BFHRRadius.sm))
                    .accessibilityHidden(true)
            }
            layout {
                Text(title)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if !stacked { Spacer(minLength: BFHRSpace.s2) }
                HStack(spacing: BFHRSpace.s1) { value }
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .multilineTextAlignment(stacked ? .leading : .trailing)
            }
        }
        .frame(minHeight: BFHRHitTarget.minimum)
        .accessibilityElement(children: .combine)
    }
}

/// "● Needs attention": an amber dot and the words (never color alone, never red); "● Check"
/// when the long form doesn't fit on one line.
struct AttentionValue: View {
    var body: some View {
        HStack(spacing: BFHRSpace.s1) {
            ToneDot(tone: .warning)
            ViewThatFits(in: .horizontal) {
                Text(SettingsStrings.needsAttention).lineLimit(1)
                Text(SettingsStrings.needsAttentionShort).lineLimit(1)
            }
            .foregroundStyle(BFHRTone.warning.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(SettingsStrings.needsAttention))
    }
}

// MARK: - AI

struct AISettingsPage: View {
    @Bindable var model: SettingsModel

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                Toggle(isOn: Binding(get: { model.aiEnabled }, set: { model.setAIEnabled($0) })) {
                    Text(SettingsStrings.aiEnabled)
                }
                .accessibilityIdentifier("settings.ai.enabled")
            } footer: {
                Text(SettingsStrings.aiEnabledFooter)
            }
            Section {
                Toggle(isOn: Binding(get: { model.aiMailTextAllowed }, set: { model.setAIMailTextAllowed($0) })) {
                    Text(SettingsStrings.aiMailText)
                }
                .disabled(!model.aiEnabled)
                .accessibilityIdentifier("settings.ai.mailText")
            } footer: {
                Text(SettingsStrings.aiMailTextFooter)
            }
            Section {
                LabeledContent {
                    Text(verbatim: "Anthropic Claude")
                } label: {
                    Text(SettingsStrings.aiProvider)
                }
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(SettingsStrings.ai))
        .bfhrInlineTitle()
        .accessibilityIdentifier("settings.aiPage")
    }
}

// MARK: - Notifications

struct NotificationsPage: View {
    @Bindable var model: SettingsModel
    @Environment(\.openURL) private var openURL
    @Environment(\.locale) private var locale
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            permissionSection
            Section {
                toggle(SettingsStrings.interviews, \.interviews, id: "interviews")
                toggle(SettingsStrings.offers, \.offers, id: "offers")
                toggle(SettingsStrings.assessments, \.assessments, id: "assessments")
                Toggle(isOn: Binding(get: { model.notifyRejections }, set: { model.setNotifyRejections($0) })) {
                    Text(SettingsStrings.decisions)
                }
                .accessibilityIdentifier("settings.notifications.decisions")
                toggle(SettingsStrings.autoApplied, \.autoApplied, id: "autoApplied")
            } header: {
                Text(SettingsStrings.fromMail)
            } footer: {
                Text(SettingsStrings.fromMailFooter)
            }
            Section {
                toggle(SettingsStrings.jobAlerts, \.jobAlerts, id: "jobAlerts")
            } header: {
                Text(SettingsStrings.jobs)
            } footer: {
                Text(SettingsStrings.jobAlertsFooter)
            }
            quietSection
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(SettingsStrings.notifications))
        .bfhrInlineTitle()
        .accessibilityIdentifier("settings.notificationsPage")
    }

    private func toggle(_ title: LocalizedStringResource, _ keyPath: WritableKeyPath<NotificationPreferences, Bool>, id: String) -> some View {
        Toggle(isOn: Binding(get: { model.notificationPreferences[keyPath: keyPath] }, set: { model.setNotification(keyPath, $0) })) {
            Text(title)
        }
        .accessibilityIdentifier("settings.notifications.\(id)")
    }

    @ViewBuilder private var permissionSection: some View {
        switch model.permission {
        case .denied, .provisional:
            Section {
                InlineAlert(
                    model.permission == .denied ? .warning : .info,
                    title: model.permission == .denied ? SettingsStrings.permissionOff : SettingsStrings.permissionQuiet,
                    message: SettingsStrings.permissionKept,
                    actionTitle: SettingsStrings.openSettings,
                    action: openNotificationSettings
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .accessibilityIdentifier("settings.notifications.permission")
            }
        case .notDetermined:
            if let request = model.requestPermission {
                Section {
                    InlineAlert(
                        .info,
                        title: SettingsStrings.permissionAsk,
                        actionTitle: SettingsStrings.allow,
                        action: { Task { await request() } }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .accessibilityIdentifier("settings.notifications.permission")
                }
            }
        case .authorized:
            EmptyView()
        }
    }

    @ViewBuilder private var quietSection: some View {
        let zone = model.profileTimeZone
        Section {
            Toggle(isOn: Binding(get: { model.quietHours != nil }, set: { model.setQuietHoursEnabled($0) })) {
                Text(SettingsStrings.quietHours)
            }
            .accessibilityIdentifier("settings.notifications.quiet")
            if let quiet = model.quietHours {
                DatePicker(selection: timeBinding(quiet.start, zone: zone) { model.setQuietHours(start: $0) }, displayedComponents: .hourAndMinute) {
                    Text(SettingsStrings.quietFrom)
                }
                .accessibilityIdentifier("settings.notifications.quietFrom")
                DatePicker(selection: timeBinding(quiet.end, zone: zone) { model.setQuietHours(end: $0) }, displayedComponents: .hourAndMinute) {
                    Text(SettingsStrings.quietTo)
                }
                .accessibilityIdentifier("settings.notifications.quietTo")
                VStack(alignment: .leading, spacing: 2) {
                    Text(SettingsStrings.quietSummary(Self.display(quiet.start, zone: zone, locale: locale), Self.display(quiet.end, zone: zone, locale: locale)))
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(SettingsStrings.quietZone(zone.localizedName(for: .generic, locale: locale) ?? zone.identifier))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        } footer: {
            Text(SettingsStrings.quietFooter)
        }
        .environment(\.timeZone, zone)
    }

    /// "22:00" ↔ today at that time in the profile's zone.
    private func timeBinding(_ value: String, zone: TimeZone, set: @escaping (String) -> Void) -> Binding<Date> {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return Binding(
            get: { Self.date(value, calendar: calendar) },
            set: { date in
                let parts = calendar.dateComponents([.hour, .minute], from: date)
                set(String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0))
            }
        )
    }

    static func date(_ value: String, calendar: Calendar) -> Date {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        let day = calendar.startOfDay(for: .now)
        return calendar.date(bySettingHour: parts.first ?? 0, minute: parts.dropFirst().first ?? 0, second: 0, of: day) ?? day
    }

    /// "22:00" in the locale's clock (24 h in TR/DE, "10:00 PM" in en-US).
    static func display(_ value: String, zone: TimeZone, locale: Locale) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return date(value, calendar: calendar).formatted(Date.FormatStyle(locale: locale, timeZone: zone).hour().minute())
    }

    private func openNotificationSettings() {
        #if os(iOS)
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
        #endif
    }
}
