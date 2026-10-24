import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Connect email (connect-email.md "Decision — iOS"), presented as a large-detent sheet from
/// Settings › Mail accounts, the Mail tab's empty state and Today's connect card: the provider list
/// (Screen A) → the pre-permission screen of Google / Microsoft (B) or the app-password form (C) →
/// the inbox check (D/E). Reconnect starts at B or C for that account.
public struct MailConnectSheet: View {
    @Bindable private var model: MailConnectModel
    private let onReview: () -> Void
    @Environment(\.dismiss) private var dismiss

    /// `onReview` opens Mail › To review after the check (the sheet closes first).
    public init(model: MailConnectModel, onReview: @escaping () -> Void) {
        self.model = model
        self.onReview = onReview
    }

    public var body: some View {
        NavigationStack(path: $model.path) {
            Group {
                if let root = model.rootStep {
                    destination(root)
                } else {
                    ProviderList(model: model)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(MailConnectStrings.cancel) }
                        .accessibilityIdentifier("connect.cancel")
                }
            }
            .navigationDestination(for: MailConnectModel.Step.self, destination: destination)
        }
        .interactiveDismissDisabled(model.formState == .testing || model.oauthState == .working)
    }

    @ViewBuilder
    private func destination(_ step: MailConnectModel.Step) -> some View {
        switch step {
        case .oauth(let provider): OAuthPermissionView(model: model, provider: provider)
        case .appPassword: AppPasswordForm(model: model)
        case .scanning:
            ScanProgressView(model: model, onDone: { dismiss() }, onReview: {
                dismiss()
                onReview()
            })
        }
    }
}

extension OAuthMailProvider {
    /// The company name ("Continue to Google").
    var companyName: String {
        switch self {
        case .google: "Google"
        case .microsoft: "Microsoft"
        }
    }

    /// The product name ("Connect Gmail").
    var productName: String {
        switch self {
        case .google: "Gmail"
        case .microsoft: "Outlook"
        }
    }
}

// MARK: - Screen A: providers

private struct ProviderList: View {
    @Bindable var model: MailConnectModel

    /// App-password providers in market order (DE: GMX, WEB.DE; TR: Yandex).
    private static let appPasswordPresets = ["icloud", "yahoo", "gmx", "webde", "yandex"]

    var body: some View {
        List {
            Section {
                ForEach(OAuthMailProvider.allCases, id: \.self) { provider in
                    Button { model.chooseOAuth(provider) } label: {
                        ProviderRow(
                            name: provider.productName,
                            caption: provider == .google ? MailConnectStrings.gmailCaption : MailConnectStrings.outlookCaption,
                            tag: model.unavailableProviders.contains(provider) ? MailConnectStrings.notAvailableYet : MailConnectStrings.recommended
                        )
                    }
                    .accessibilityIdentifier("connect.provider.\(provider.rawValue)")
                }
            } header: {
                VStack(alignment: .leading, spacing: BFHRSpace.s4) {
                    Text(MailConnectStrings.body)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .textCase(nil)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(MailConnectStrings.signInSection)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            Section {
                ForEach(Self.appPasswordPresets, id: \.self) { id in
                    if let preset = ImapPreset.preset(id: id) {
                        Button { model.chooseAppPassword(id) } label: {
                            ProviderRow(name: preset.label, caption: MailConnectStrings.appPasswordCaption, tag: nil)
                        }
                        .accessibilityIdentifier("connect.provider.\(id)")
                    }
                }
                Button { model.chooseAppPassword(ImapPreset.otherID) } label: {
                    ProviderRow(name: String(localized: MailConnectStrings.otherTitle), caption: MailConnectStrings.otherCaption, tag: nil)
                }
                .accessibilityIdentifier("connect.provider.other")
            } header: {
                Text(MailConnectStrings.appPasswordSection)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                Label { Text(MailConnectStrings.trust) } icon: { Image(systemName: "lock.shield") }
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .padding(.top, BFHRSpace.s2)
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(MailConnectStrings.title))
        .bfhrInlineTitle()
        .accessibilityIdentifier("connect.providers")
    }
}

/// A provider: monogram, name, one-line caption, optional quiet tag, chevron.
private struct ProviderRow: View {
    let name: String
    let caption: LocalizedStringResource
    let tag: LocalizedStringResource?

    var body: some View {
        HStack(spacing: BFHRSpace.s3) {
            CompanyMonogram(CompanyIdentity(name: name), hidesAtAccessibilitySizes: true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: name)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(caption)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                if let tag {
                    Text(tag)
                        .font(.bfhr(.caption1, emphasized: true))
                        .foregroundStyle(BFHRColor.Accent.text)
                }
            }
            Spacer(minLength: BFHRSpace.s2)
            Image(systemName: "chevron.forward")
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.tertiary)
                .accessibilityHidden(true)
        }
        .frame(minHeight: 52)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Lookback

/// "Look back · 90 days, since 26 Jul" as a menu of 30 / 90 / 180 days.
struct LookbackPicker: View {
    @Binding var days: Int
    let start: Date
    @Environment(\.locale) private var locale

    var body: some View {
        Picker(selection: $days) {
            ForEach(mailLookbackDays, id: \.self) { option in
                Text(MailConnectStrings.lookbackDays(option)).tag(option)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(MailConnectStrings.lookback)
                Text(MailConnectStrings.lookbackSince(start.formatted(Date.FormatStyle(locale: locale).day().month(.abbreviated).year())))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier("connect.lookback")
    }
}

// MARK: - Screen B: pre-permission

private struct OAuthPermissionView: View {
    @Bindable var model: MailConnectModel
    let provider: OAuthMailProvider

    var body: some View {
        List {
            switch model.oauthState {
            case .notConfigured:
                Section {
                    // The way forward is the button bar below; the card only explains.
                    InlineAlert(
                        .info,
                        title: MailConnectStrings.notConfiguredTitle(provider.companyName),
                        message: provider == .google ? MailConnectStrings.notConfiguredGoogle : MailConnectStrings.notConfiguredMicrosoft
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .accessibilityIdentifier("connect.notConfigured")
                }
            case .failed(let error):
                if let message = MailConnectStrings.message(for: error, imap: model.imap, smtp: model.smtp) {
                    Section {
                        InlineAlert(.warning, title: message)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                            .accessibilityIdentifier("connect.oauthError")
                    }
                }
            case .idle, .working:
                EmptyView()
            }
            Section {
                PromiseRow(glyph: "magnifyingglass", title: MailConnectStrings.promiseFindTitle, message: MailConnectStrings.promiseFindBody)
                PromiseRow(glyph: "sparkles", title: MailConnectStrings.promiseAITitle, message: MailConnectStrings.promiseAIBody)
                PromiseRow(glyph: "xmark.circle", title: MailConnectStrings.promiseDisconnectTitle, message: MailConnectStrings.promiseDisconnectBody)
            }
            Section {
                LookbackPicker(days: $model.lookbackDays, start: model.lookbackStart)
            } header: {
                Text(MailConnectStrings.promiseLookbackTitle)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            if model.oauthState != .notConfigured {
                Section {
                    VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                        Text(bfhrPlain: MailConnectStrings.expectation(
                            provider.companyName,
                            scope: String(localized: provider == .google ? MailConnectStrings.googleScope : MailConnectStrings.microsoftScope)
                        ))
                        Text(provider == .google ? MailConnectStrings.googleUnverified : MailConnectStrings.microsoftKeepAccess)
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    .font(.bfhr(.subheadline))
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
        .navigationTitle(Text(MailConnectStrings.oauthTitle(provider.productName)))
        .bfhrInlineTitle()
        .accessibilityIdentifier("connect.oauth")
    }

    @ViewBuilder private var actions: some View {
        VStack(spacing: BFHRSpace.s2) {
            if model.oauthState == .notConfigured {
                if provider == .google {
                    Button { model.chooseAppPassword("gmail") } label: { Text(MailConnectStrings.useAppPassword) }
                        .buttonStyle(.bfhr(.primary, fullWidth: true))
                        .accessibilityIdentifier("connect.useAppPassword")
                }
                if model.rootStep == nil {
                    Button { model.path.removeLast() } label: { Text(MailConnectStrings.chooseAnother) }
                        .buttonStyle(.bfhr(provider == .google ? .plain : .secondary, fullWidth: true))
                }
            } else {
                Button {
                    Task { await model.continueOAuth(provider) }
                } label: {
                    if model.oauthState == .working {
                        HStack(spacing: BFHRSpace.s2) {
                            ProgressView()
                            Text(MailConnectStrings.working)
                        }
                    } else {
                        Text(MailConnectStrings.continueTo(provider.companyName))
                    }
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .disabled(model.oauthState == .working)
                .accessibilityIdentifier("connect.continue")
            }
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s3)
        // Opaque, capped at AX1 like every sticky bar (Large Content Viewer covers larger sizes).
        .background(BFHRColor.groupedBackground)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .accessibilityIdentifier("sheet.bar")
    }
}

/// One promise: symbol + bold lead + sentence.
private struct PromiseRow: View {
    let glyph: String
    let title: LocalizedStringResource
    let message: LocalizedStringResource

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            Image(systemName: glyph)
                .foregroundStyle(BFHRColor.Accent.text)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(message)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Screen C: app password

private struct AppPasswordForm: View {
    @Bindable var model: MailConnectModel
    @State private var showsPassword = false
    @Environment(\.openURL) private var openURL
    @FocusState private var focus: Field?

    private enum Field: Hashable {
        case address, password
    }

    private var providerLabel: String { model.preset?.label ?? "" }

    var body: some View {
        Form {
            if model.addressNeedsOAuth {
                Section {
                    InlineAlert(
                        .info,
                        title: MailConnectStrings.outlookNeedsOAuthTitle,
                        message: MailConnectStrings.outlookNeedsOAuthBody,
                        actionTitle: MailConnectStrings.useMicrosoft,
                        action: { model.chooseOAuth(.microsoft) }
                    )
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            help
            accountSection
            Section {
                LookbackPicker(days: $model.lookbackDays, start: model.lookbackStart)
            }
            Section {
                DisclosureGroup(isExpanded: $model.showsServerSettings) {
                    TextField(text: $model.username, prompt: Text(MailConnectStrings.usernamePrompt)) { Text(MailConnectStrings.username) }
                        .bfhrLiteralInput()
                    EndpointFields(title: MailConnectStrings.incoming, endpoint: $model.imap, kind: .imap)
                    if model.errorField == .imapHost, let message = formError {
                        FieldError(message)
                    } else if model.portProblem == .imapHost {
                        FieldError(MailConnectStrings.errorPortNotAllowed)
                    }
                    EndpointFields(title: MailConnectStrings.outgoing, endpoint: $model.smtp, kind: .smtp)
                    if model.errorField == .smtpHost, let message = formError {
                        FieldError(message)
                    } else if model.portProblem == .smtpHost {
                        FieldError(MailConnectStrings.errorPortNotAllowed)
                    }
                } label: {
                    Text(MailConnectStrings.serverSettings)
                }
                .accessibilityIdentifier("connect.serverSettings")
            } footer: {
                if model.showsServerSettings { Text(MailConnectStrings.outgoingOptional).foregroundStyle(BFHRColor.Fg.secondary) }
            }
            Section {
                Button {
                    focus = nil
                    Task { await model.connectImap() }
                } label: {
                    Text(MailConnectStrings.connect)
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .disabled(!model.canConnect)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .accessibilityIdentifier("connect.submit")
            } footer: {
                Label { Text(MailConnectStrings.imapTrust) } icon: { Image(systemName: "lock") }
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .padding(.top, BFHRSpace.s2)
            }
        }
        .disabled(model.formState == .testing)
        .overlay {
            if model.formState == .testing {
                TestingHUD()
            }
        }
        // A failed test is spoken: the message sits under a field VoiceOver may not be on.
        .onChange(of: model.formState) {
            guard let message = formError else { return }
            AccessibilityNotification.Announcement(String(localized: message)).post()
        }
        .onChange(of: model.address) { model.editedForm() }
        .onChange(of: model.password) { model.editedForm() }
        .navigationTitle(Text(model.preset.map { MailConnectStrings.appPasswordTitle($0.label) } ?? MailConnectStrings.otherTitleForm))
        .bfhrInlineTitle()
        .accessibilityIdentifier("connect.appPassword")
    }

    /// The failed test's message, if the form shows one.
    private var formError: LocalizedStringResource? {
        guard case .failed(let error) = model.formState else { return nil }
        return MailConnectStrings.message(for: error, imap: model.imap, smtp: model.smtp)
    }

    private var accountSection: some View {
        Section {
            TextField(text: $model.address, prompt: Text(verbatim: "name@example.com")) {
                Text(MailConnectStrings.address)
            }
            .bfhrEmailInput()
            .focused($focus, equals: .address)
            .disabled(model.reconnecting != nil)
            .accessibilityIdentifier("connect.address")
            HStack {
                passwordField
                    .textContentType(.password)
                    .bfhrLiteralInput()
                    .focused($focus, equals: .password)
                    .accessibilityIdentifier("connect.password")
                Button { showsPassword.toggle() } label: {
                    Image(systemName: showsPassword ? "eye.slash" : "eye")
                        .frame(width: BFHRHitTarget.minimum, height: BFHRHitTarget.minimum)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(width: BFHRHitTarget.minimum, height: BFHRHitTarget.minimum)
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityLabel(Text(showsPassword ? MailConnectStrings.hidePassword : MailConnectStrings.showPassword))
            }
        } header: {
            Text(MailConnectStrings.yourAccount)
                .foregroundStyle(BFHRColor.Fg.secondary)
        } footer: {
            // Errors of the password (or without a field) replace the caption.
            if let message = formError, model.errorField == .password || model.errorField == nil {
                FieldError(message)
            } else {
                Text(MailConnectStrings.passwordCaption)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
    }

    @ViewBuilder private var passwordField: some View {
        if showsPassword {
            TextField(text: $model.password) { Text(MailConnectStrings.appPassword) }
        } else {
            SecureField(text: $model.password) { Text(MailConnectStrings.appPassword) }
        }
    }

    @ViewBuilder private var help: some View {
        if let preset = model.preset {
            Section {
                HelpStep(number: 1, text: MailConnectStrings.helpOpen(preset.label))
                HelpStep(number: 2, text: MailConnectStrings.helpCreate)
                if preset.id == "gmx" || preset.id == "webde" {
                    HelpStep(number: 3, text: MailConnectStrings.helpImapAccess(preset.label))
                    HelpStep(number: 4, text: MailConnectStrings.helpPaste)
                } else {
                    HelpStep(number: 3, text: MailConnectStrings.helpPaste)
                }
                if let link = preset.appPasswordUrl.flatMap(URL.init(string:)) {
                    Button { openURL(link) } label: {
                        Label { Text(MailConnectStrings.openSettings(preset.label)) } icon: { Image(systemName: "arrow.up.forward.square") }
                    }
                    .accessibilityIdentifier("connect.help.open")
                }
            } header: {
                Text(MailConnectStrings.helpHeader)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        } else {
            Section {
                Text(MailConnectStrings.helpOther)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
    }
}

private struct HelpStep: View {
    let number: Int
    let text: LocalizedStringResource

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            Text(verbatim: "\(number).")
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Accent.text)
                .monospacedDigit()
            Text(bfhrPlain: text)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct FieldError: View {
    let message: LocalizedStringResource

    init(_ message: LocalizedStringResource) {
        self.message = message
    }

    var body: some View {
        Label { Text(bfhrPlain: message) } icon: { Image(systemName: "exclamationmark.triangle") }
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRTone.warning.text)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("connect.fieldError")
    }
}

private struct EndpointFields: View {
    let title: LocalizedStringResource
    @Binding var endpoint: MailEndpoint
    let kind: MailEndpointKind
    private var identifier: String { kind.rawValue }

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            Text(title)
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityAddTraits(.isHeader)
            // Wraps at large text sizes instead of clipping a long host name.
            TextField(text: $endpoint.host, prompt: Text(verbatim: identifier == "imap" ? "imap.example.com" : "smtp.example.com"), axis: .vertical) {
                Text(MailConnectStrings.host)
            }
            .lineLimit(1...3)
            .bfhrLiteralInput()
            .accessibilityLabel(Text(MailConnectStrings.host))
            .accessibilityIdentifier("connect.\(identifier).host")
            LabeledContent {
                TextField(value: $endpoint.port, format: .number.grouping(.never)) { Text(MailConnectStrings.port) }
                    .bfhrPortInput()
                    .multilineTextAlignment(.trailing)
            } label: {
                Text(MailConnectStrings.port)
            }
            Picker(selection: $endpoint.security) {
                Text(MailConnectStrings.securityTLS).tag(MailSecurity.tls)
                Text(MailConnectStrings.securitySTARTTLS).tag(MailSecurity.starttls)
            } label: {
                Text(MailConnectStrings.security)
            }
            // The usual port follows the security choice (993/143, 465/587).
            .onChange(of: endpoint.security) { _, security in
                endpoint.port = MailEndpoint.defaultPort(kind, security: security)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }
}

/// "Testing connection…" over the form (Spark's HUD).
private struct TestingHUD: View {
    var body: some View {
        VStack(spacing: BFHRSpace.s3) {
            ProgressView()
            Text(MailConnectStrings.testing)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
        }
        .padding(BFHRSpace.s6)
        .background(.regularMaterial, in: BFHRRadius.shape(BFHRRadius.lg))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("connect.testing")
    }
}

// MARK: - Screen D/E: the inbox check

private struct ScanProgressView: View {
    @Bindable var model: MailConnectModel
    let onDone: () -> Void
    let onReview: () -> Void

    var body: some View {
        List {
            Section {
                if let address = model.connectedAccount?.address ?? model.connectedAddress {
                    HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(BFHRTone.success.text)
                            .accessibilityHidden(true)
                        Text(bfhrPlain: model.reconnected ? MailConnectStrings.reconnectedTo(address) : MailConnectStrings.connectedTo(address))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .font(.bfhr(.headline))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("connect.scan.connected")
                } else {
                    HStack(spacing: BFHRSpace.s3) {
                        ProgressView()
                        Text(MailConnectStrings.finishing)
                    }
                }
                if model.smtpWarning != nil {
                    InlineAlert(.warning, title: MailConnectStrings.smtpWarning)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
            if model.reconnected {
                Section {
                    Text(MailConnectStrings.reconnectedBody)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            } else if let account = model.connectedAccount {
                content(account)
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(MailConnectStrings.title))
        .bfhrInlineTitle()
        .navigationBarBackButtonHidden()
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
        .accessibilityIdentifier("connect.scan")
    }

    @ViewBuilder
    private func content(_ account: MailAccount) -> some View {
        let backfill = account.backfill
        switch backfill?.state {
        case .done?:
            if let backfill, backfill.jobMessages == 0 {
                Section {
                    VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                        Text(MailConnectStrings.emptyTitle(backfill.lookbackDays)).font(.bfhr(.headline))
                        Text(MailConnectStrings.emptyBody).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    if backfill.lookbackDays < 180 {
                        Button { Task { await longerScan(account) } } label: { Text(MailConnectStrings.scanLonger) }
                    }
                }
            } else if let backfill {
                Section {
                    Text(MailConnectStrings.resultTitle)
                        .font(.bfhr(.headline))
                        .accessibilityAddTraits(.isHeader)
                    resultRow(MailConnectStrings.resultApplications, backfill.applications)
                    resultRow(MailConnectStrings.resultInvites, backfill.interviewInvites)
                    if backfill.jobAlerts > 0 { resultRow(MailConnectStrings.resultAlerts, backfill.jobAlerts) }
                    resultRow(MailConnectStrings.resultPending, backfill.pendingReview)
                } footer: {
                    Text(MailConnectStrings.resultFooter)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                .accessibilityIdentifier("connect.scan.result")
            }
        case .failed?:
            Section {
                InlineAlert(
                    .warning,
                    title: MailConnectStrings.failedTitle(account.address),
                    message: model.backfillRetryFailed ? MailConnectStrings.retryFailed : MailConnectStrings.failedBody,
                    actionTitle: MailConnectStrings.retry,
                    action: { Task { await model.retryScan() } }
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
        default:
            Section {
                ScanStageRow(title: MailConnectStrings.stageScanning(backfill?.lookbackDays ?? model.lookbackDays), state: stageState(.scanning, backfill), detail: backfill.map { MailConnectStrings.checked($0.scanned) })
                ScanStageRow(title: MailConnectStrings.stageClassifying, state: stageState(.classifying, backfill), detail: nil)
                ScanStageRow(title: MailConnectStrings.stageMatching, state: stageState(.matching, backfill), detail: nil)
                ScanStageRow(title: MailConnectStrings.stagePreparing, state: stageState(.preparing, backfill), detail: nil)
            } footer: {
                Text(MailConnectStrings.leave)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .accessibilityIdentifier("connect.scan.progress")
        }
    }

    private func resultRow(_ label: LocalizedStringResource, _ count: Int) -> some View {
        LabeledContent {
            Text(count, format: .number).monospacedDigit().foregroundStyle(BFHRColor.Fg.secondary)
        } label: {
            Text(label)
        }
    }

    private func longerScan(_ account: MailAccount) async {
        model.lookbackDays = 180
        await model.retryScan()
    }

    private func stageState(_ stage: MailBackfillStage, _ backfill: MailBackfill?) -> ScanStageRow.State {
        let order: [MailBackfillStage] = [.scanning, .classifying, .matching, .preparing]
        guard let backfill, backfill.state == .running, let current = order.firstIndex(of: backfill.stage),
              let index = order.firstIndex(of: stage) else { return stage == .scanning ? .current : .pending }
        return index < current ? .done : index == current ? .current : .pending
    }

    @ViewBuilder private var actions: some View {
        let account = model.connectedAccount
        VStack(spacing: BFHRSpace.s2) {
            if account?.backfill?.state == .done, (account?.backfill?.pendingReview ?? 0) > 0 {
                Button(action: onReview) { Text(MailConnectStrings.reviewNow) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .accessibilityIdentifier("connect.scan.review")
                Button(action: onDone) { Text(MailConnectStrings.done) }
                    .buttonStyle(.bfhr(.plain, fullWidth: true))
            } else {
                Button(action: onDone) {
                    Text(account?.backfill?.state == .done ? MailConnectStrings.done : MailConnectStrings.continueAction)
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .accessibilityIdentifier("connect.scan.done")
            }
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s3)
        // Opaque, capped at AX1 like every sticky bar (Large Content Viewer covers larger sizes).
        .background(BFHRColor.groupedBackground)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .accessibilityIdentifier("sheet.bar")
    }
}

/// One stage of the check: ✓ done, spinner current, dimmed pending (the state is also spoken).
private struct ScanStageRow: View {
    enum State {
        case done, current, pending
    }

    let title: LocalizedStringResource
    let state: State
    let detail: LocalizedStringResource?
    /// The title's first line, so the symbol centres on it.
    @ScaledMetric(relativeTo: .body) private var stageLine: CGFloat = 22

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Group {
                switch state {
                case .done: Image(systemName: "checkmark.circle.fill").foregroundStyle(BFHRTone.success.text)
                case .current: ProgressView().controlSize(.small)
                case .pending: Image(systemName: "circle").foregroundStyle(BFHRColor.Fg.tertiary)
                }
            }
            .font(.bfhr(.body))
            .frame(width: 24, height: stageLine)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.bfhr(.body, emphasized: state == .current))
                    .foregroundStyle(state == .pending ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
                if let detail, state != .pending {
                    Text(detail)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .monospacedDigit()
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(Text(state == .done ? MailConnectStrings.stageDone : state == .current ? MailConnectStrings.stageCurrent : MailConnectStrings.stagePending))
    }
}
