import BFHRDesignTokens
import SwiftUI
import UniformTypeIdentifiers

/// Settings › Data & privacy: Export everything, then Delete account last (research
/// settings-account.md, "Decision — iOS"; MacroFactor / Character AI grouping, Slack's included /
/// not included, MacroFactor's in-place progress, Monzo's separate destructive group).
///
/// Pushed inside the Settings navigation stack (the Settings shell owns the stack), so it sets a
/// title and pushes Delete account itself but never creates a `NavigationStack`.
public struct DataPrivacyView: View {
    @Bindable private var model: DataPrivacyModel

    public init(model: DataPrivacyModel) {
        self.model = model
    }

    public var body: some View {
        List {
            ExportSection(model: model)
            Section {
                ExportItemRow(text: DataPrivacyStrings.included1, included: true)
                ExportItemRow(text: DataPrivacyStrings.included2, included: true)
                ExportItemRow(text: DataPrivacyStrings.included3, included: true)
                ExportItemRow(text: DataPrivacyStrings.included4, included: true)
                ExportItemRow(text: DataPrivacyStrings.included5, included: true)
            } header: {
                Text(DataPrivacyStrings.includedTitle)
            }
            Section {
                ExportItemRow(text: DataPrivacyStrings.excluded1, included: false)
                ExportItemRow(text: DataPrivacyStrings.excluded2, included: false)
            } header: {
                Text(DataPrivacyStrings.excludedTitle)
            }
            Section {
                Button {
                    Task { await model.beginDelete() }
                } label: {
                    Text(DataPrivacyStrings.deleteOpen)
                        .foregroundStyle(model.isOnline ? BFHRTone.danger.text : BFHRColor.Fg.disabled)
                        .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .disabled(!model.isOnline)
                .accessibilityIdentifier("dataPrivacy.deleteOpen")
            } header: {
                Text(DataPrivacyStrings.deleteTitle)
            } footer: {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(DataPrivacyStrings.deleteDescription)
                    if !model.isOnline { OfflineNote() }
                }
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(DataPrivacyStrings.title))
        .bfhrInlineTitle()
        .navigationDestination(isPresented: $model.isDeletePresented) {
            DeleteAccountView(model: model)
        }
        .accessibilityIdentifier("dataPrivacy")
    }
}

/// "Needs a connection" under an action that's disabled offline.
struct OfflineNote: View {
    var body: some View {
        Label { Text(DataPrivacyStrings.offline) } icon: { Image(systemName: "wifi.slash") }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .accessibilityIdentifier("dataPrivacy.offline")
    }
}

/// One line of Included / Not included: a decorative check or minus, then the text.
struct ExportItemRow: View {
    let text: LocalizedStringResource
    let included: Bool

    var body: some View {
        Label {
            Text(text)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: included ? "checkmark" : "minus")
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(included ? BFHRTone.success.text : BFHRColor.Fg.secondary)
        }
        .labelStyle(DataPrivacyListLabelStyle())
    }
}

/// Icon in a fixed column aligned to the first text line, text wrapping beside it; the icon is
/// hidden from VoiceOver (the section header says Included / Not included).
struct DataPrivacyListLabelStyle: LabelStyle {
    @ScaledMetric(relativeTo: .body) private var iconWidth: CGFloat = 20

    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            configuration.icon
                .frame(width: iconWidth)
                .accessibilityHidden(true)
            configuration.title
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: Export

/// Description, then the action row: Create export → in-place progress → ready card (Save to
/// Files, Share) or the problem with its way forward. The retention note is the footer.
struct ExportSection: View {
    @Bindable var model: DataPrivacyModel
    @State private var savesToFiles = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Section {
            Text(DataPrivacyStrings.exportDescription)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
            actionRow
        } header: {
            Text(DataPrivacyStrings.exportTitle)
        } footer: {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                Text(DataPrivacyStrings.retention)
                if !model.isOnline, !isReady { OfflineNote() }
            }
        }
        .animation(BFHRMotion.animation(.base, reduceMotion: reduceMotion), value: model.export)
        .onChange(of: model.export) { _, state in announce(state) }
        .task(id: expiry) {
            // The server deletes the file at `expiresAt`; the card goes with it.
            guard let expiry else { return }
            let delay = expiry.timeIntervalSince(model.currentDate)
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            guard !Task.isCancelled else { return }
            model.expireExportIfNeeded()
        }
    }

    private var isReady: Bool {
        if case .ready = model.export { true } else { false }
    }

    private var expiry: Date? {
        if case .ready(let ready, _) = model.export { ready.expiresAt } else { nil }
    }

    @ViewBuilder private var actionRow: some View {
        switch model.export {
        case .idle:
            createButton(DataPrivacyStrings.create)
        case .preparing:
            ProgressRow(text: DataPrivacyStrings.preparing)
                .accessibilityIdentifier("dataPrivacy.preparing")
        case .ready(let ready, let file):
            ReadyCard(model: model, export: ready, file: file, savesToFiles: $savesToFiles)
        case .failed(let failure):
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                ExportFailureAlert(failure: failure)
                createButton(failure.isRetryable ? DataPrivacyStrings.retry : DataPrivacyStrings.create)
            }
        }
    }

    private func createButton(_ title: LocalizedStringResource) -> some View {
        Button {
            Task { await model.createExport() }
        } label: {
            Text(title)
                .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                .contentShape(Rectangle())
        }
        .foregroundStyle(model.canCreateExport ? BFHRColor.Accent.text : BFHRColor.Fg.disabled)
        .disabled(!model.canCreateExport)
        .accessibilityIdentifier("dataPrivacy.create")
    }

    private func announce(_ state: ExportState) {
        let text: LocalizedStringResource? = switch state {
        case .ready(_, .downloaded): DataPrivacyStrings.readyTitle
        case .ready(_, .failed): DataPrivacyStrings.errorDownload
        case .failed(let failure): ExportFailureAlert.text(failure)
        default: nil
        }
        if let text { DataPrivacyAnnouncement.post(text) }
    }
}

/// A spinner and a sentence in place of a button.
struct ProgressRow: View {
    let text: LocalizedStringResource

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            ProgressView()
                .accessibilityHidden(true)
            Text(text)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: BFHRHitTarget.minimum)
        .accessibilityElement(children: .combine)
    }
}

/// The export's problem; too soon and the daily limit are information, not errors.
struct ExportFailureAlert: View {
    let failure: ExportFailure
    @Environment(\.openURL) private var openURL

    /// Support is GitHub issues only, on the public releases repository (kickoff).
    static let newIssueURL = URL(string: "https://github.com/Savas07/bruteforcehr-releases/issues/new")!

    static func text(_ failure: ExportFailure) -> LocalizedStringResource {
        switch failure {
        case .tooSoon: DataPrivacyStrings.errorTooSoon
        case .dailyLimit: DataPrivacyStrings.errorDailyLimit
        case .tooLarge: DataPrivacyStrings.errorTooLarge
        case .generic: DataPrivacyStrings.errorGeneric
        }
    }

    var body: some View {
        let tone: InlineAlert.Tone = switch failure {
        case .tooSoon, .dailyLimit: .info
        case .tooLarge: .warning
        case .generic: .error
        }
        if failure == .tooLarge {
            InlineAlert(tone, title: Self.text(failure), actionTitle: DataPrivacyStrings.openGitHub) {
                openURL(Self.newIssueURL)
            }
            .accessibilityIdentifier("dataPrivacy.exportError")
        } else {
            InlineAlert(tone, title: Self.text(failure))
                .accessibilityIdentifier("dataPrivacy.exportError")
        }
    }
}

/// "Export ready · 14 MB · available until 25 Oct, 09:41" with Save to Files and Share once the
/// ZIP is on the iPhone.
struct ReadyCard: View {
    let model: DataPrivacyModel
    let export: AccountExport
    let file: ExportFile
    @Binding var savesToFiles: Bool
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Label {
                    Text(DataPrivacyStrings.readyTitle)
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                } icon: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(BFHRTone.success.text)
                }
                .labelStyle(DataPrivacyListLabelStyle())
                Text(DataPrivacyStrings.readyMeta(size, date: expiry))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("dataPrivacy.ready")
            switch file {
            case .downloading:
                ProgressRow(text: DataPrivacyStrings.saving)
            case .downloaded(let url):
                ButtonPair {
                    Button {
                        savesToFiles = true
                    } label: {
                        Label { Text(DataPrivacyStrings.save) } icon: { Image(systemName: "folder") }
                            .labelStyle(.bfhrCompact)
                    }
                    .accessibilityIdentifier("dataPrivacy.save")
                } secondary: {
                    ShareLink(item: url) {
                        Label { Text(DataPrivacyStrings.share) } icon: { Image(systemName: "square.and.arrow.up") }
                            .labelStyle(.bfhrCompact)
                    }
                    .accessibilityIdentifier("dataPrivacy.share")
                }
                .fileExporter(
                    isPresented: $savesToFiles,
                    document: ExportZipDocument(url: url),
                    contentType: .zip,
                    defaultFilename: export.fileName
                ) { result in
                    if case .success(let saved) = result { model.exportSaved(to: saved) }
                }
                if let saved = model.savedFileName {
                    Label {
                        Text(bfhrPlain: DataPrivacyStrings.saved(saved))
                            .fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: "checkmark")
                    }
                    .labelStyle(DataPrivacyListLabelStyle())
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRTone.success.text)
                    .accessibilityIdentifier("dataPrivacy.saved")
                }
            case .failed:
                InlineAlert(.error, title: DataPrivacyStrings.errorDownload, actionTitle: DataPrivacyStrings.retry) {
                    Task { await model.retryDownload() }
                }
                .accessibilityIdentifier("dataPrivacy.downloadError")
            }
        }
        .padding(.vertical, BFHRSpace.s2)
    }

    private var size: String {
        export.sizeBytes.formatted(.byteCount(style: .file).locale(locale))
    }

    private var expiry: String {
        var style = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
        style = style.day().month(.abbreviated).hour().minute()
        return export.expiresAt.formatted(style)
    }
}

/// The downloaded ZIP for Save to Files, read lazily from its temporary file. SwiftUI writes it
/// off the main actor.
nonisolated struct ExportZipDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.zip] }

    let url: URL

    init(url: URL) {
        self.url = url
    }

    init(configuration: ReadConfiguration) throws {
        throw CocoaError(.fileReadUnsupportedScheme)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        try FileWrapper(url: url)
    }
}

/// VoiceOver announcements for results that appear without a focus change.
enum DataPrivacyAnnouncement {
    static func post(_ text: LocalizedStringResource) {
        #if os(iOS)
        AccessibilityNotification.Announcement(String(localized: text)).post()
        #endif
    }
}
