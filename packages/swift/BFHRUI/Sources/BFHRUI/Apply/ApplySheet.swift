import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The Apply sheet (docs/design/research/apply.md "Decision — iOS"): one review-first checklist
/// (CV · Cover letter · Send via) with the bottom button naming the next step ("Open company
/// site" / "Review email"), then the application kit with "Did you apply?", or the email review.
/// Company and role stay in the navigation header on every page.
public struct ApplySheet: View {
    @Bindable private var model: ApplyModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bfhrReload) private var reload
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    @State private var siteURL: URL?
    @State private var composesMail = false
    @State private var recruiterAddress = ""
    @State private var lastWriteFailures = 0

    public init(model: ApplyModel) {
        self.model = model
    }

    public var body: some View {
        NavigationStack {
            PhaseContainer(model.phase, loadingLabel: ApplyStrings.loading) {
                Group {
                    switch model.step {
                    case .checklist: checklist
                    case .kit: kit
                    case .email: emailReview
                    }
                }
                .bfhrToastHost()
            } skeleton: {
                ApplyChecklistSkeleton()
            } failure: { failure in
                PaneError(failure, title: ApplyStrings.errorTitle(failure), retry: reload, goBack: { dismiss() })
            }
            .navigationTitle(Text(verbatim: model.role))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text(verbatim: model.role).font(.bfhr(.headline)).lineLimit(1)
                        Text(verbatim: model.company).font(.bfhr(.caption1)).foregroundStyle(BFHRColor.Fg.secondary).lineLimit(1)
                    }
                    .accessibilityElement(children: .combine)
                }
                ToolbarItem(placement: .cancellationAction) {
                    if model.step == .checklist {
                        Button { dismiss() } label: { Text(ApplyStrings.cancel) }
                    } else {
                        Button { model.step = .checklist } label: { Text(ApplyStrings.back) }
                            .accessibilityIdentifier("apply.back")
                    }
                }
                if model.step != .checklist {
                    ToolbarItem(placement: .confirmationAction) {
                        Button { dismiss() } label: { Text(ApplyStrings.close) }
                    }
                }
            }
        }
        .interactiveDismissDisabled(model.isSending)
        .bfhrApplyPresentations(model: model, siteURL: $siteURL, composesMail: $composesMail, toasts: toasts, dismiss: dismiss)
        .onChange(of: model.writeFailures) { _, failures in
            guard failures > lastWriteFailures else { return }
            lastWriteFailures = failures
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: ApplyStrings.writeFailed))
        }
        .accessibilityIdentifier("apply.sheet")
    }

    // MARK: Checklist

    private var checklist: some View {
        Form {
            if model.asksIfSubmitted { submitPrompt }
            Section {
                if model.cvOptions.isEmpty {
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(ApplyStrings.noCV).font(.bfhr(.headline))
                        Text(ApplyStrings.noCVBody).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    Button { openURL(URL(string: "bruteforcehr://cvs")!) } label: { Text(ApplyStrings.openCVs) }
                } else {
                    ForEach(model.cvOptions) { option in
                        RadioRow(isSelected: model.selectedCvId == option.id) {
                            model.selectedCvId = option.id
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: option.title).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                                Text(ApplyStrings.cvDetail(language: option.language.uppercased(), isDefault: option.isDefault))
                                    .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                            }
                        } trailing: {
                            if let score = option.score { MatchBandPill(score: score) }
                        }
                        .accessibilityIdentifier("apply.cv.\(option.id)")
                    }
                }
            } header: {
                Text(ApplyStrings.cvSection).foregroundStyle(BFHRColor.Fg.secondary)
            }
            Section {
                Picker(selection: $model.coverLetter) {
                    Text(ApplyStrings.letterNone).tag(CoverLetterChoice.none)
                    ForEach(model.letterOptions) { letter in
                        Text(verbatim: letter.title).tag(CoverLetterChoice.existing(letter.id))
                    }
                    Text(ApplyStrings.letterWrite).tag(CoverLetterChoice.written)
                } label: { Text(ApplyStrings.letterSection) }
                .accessibilityIdentifier("apply.letter")
                if model.coverLetter == .written {
                    TextEditor(text: $model.letterText)
                        .frame(minHeight: 160)
                        .font(.bfhr(.body))
                        .accessibilityLabel(Text(ApplyStrings.letterEditorLabel))
                        .accessibilityIdentifier("apply.letterText")
                } else if let body = model.letterBody {
                    Text(verbatim: body)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .lineLimit(3)
                }
            } header: {
                Text(ApplyStrings.letterSection).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                Text(ApplyStrings.letterFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
            Section {
                ForEach(model.channelOptions) { option in
                    RadioRow(isSelected: model.channel == option) {
                        model.channel = option
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ApplyStrings.channelTitle(option)).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                            Text(bfhrPlain: ApplyStrings.channelDetail(option))
                                .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    } trailing: { EmptyView() }
                    .accessibilityIdentifier("apply.channel.\(option.isEmail ? "email" : "site")")
                }
                HStack {
                    TextField(text: $recruiterAddress) { Text(ApplyStrings.recruiterAddress) }
                        .bfhrEmailField()
                        .accessibilityIdentifier("apply.recruiter")
                    Button {
                        model.useEmail(recruiterAddress)
                        recruiterAddress = ""
                    } label: { Text(ApplyStrings.use) }
                    .buttonStyle(.borderless)
                    .disabled(!ApplyEmailDraft(to: recruiterAddress).hasValidRecipient)
                }
            } header: {
                Text(ApplyStrings.channelSection).foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomBar {
                if let blocker = model.blocker {
                    Text(ApplyStrings.blocker(blocker))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button(action: proceed) {
                    Text(model.channel?.isEmail == true ? ApplyStrings.reviewEmail : ApplyStrings.openSite)
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .disabled(!model.canContinue)
                .accessibilityIdentifier("apply.continue")
            }
        }
    }

    private var submitPrompt: some View {
        Section {
            SubmitPrompt(
                company: model.company,
                onApplied: { run(model.confirmApplied, thenDismiss: true) },
                onNotYet: model.notYet,
                onNotApplying: { run(model.notApplying, thenDismiss: true) }
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("apply.submitPrompt")
        }
    }

    // MARK: Kit (company site)

    private var kit: some View {
        List {
            if model.asksIfSubmitted {
                submitPrompt
            } else if model.deferredAnswer {
                Section {
                    Label { Text(ApplyStrings.inProgress) } icon: { Image(systemName: "clock") }
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            Section {
                Text(ApplyStrings.kitIntro).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
            }
            Section {
                ApplyFilesRows(state: model.files) { Task { await model.prepareFiles() } }
                if let body = model.letterBody {
                    Button {
                        copy(body)
                        toasts?.show(ToastItem(glyph: ToastGlyph.copied, message: ApplyStrings.letterCopied))
                    } label: {
                        Label { Text(ApplyStrings.copyLetter) } icon: { Image(systemName: "doc.on.doc") }
                    }
                }
            } header: {
                Text(ApplyStrings.filesSection).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                Text(ApplyStrings.filesFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .bfhrInsetGroupedList()
        .task { if model.files == .idle { await model.prepareFiles() } }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomBar {
                Button(action: openSite) {
                    VStack(spacing: 2) {
                        Text(model.deferredAnswer || model.asksIfSubmitted ? ApplyStrings.openSiteAgain : ApplyStrings.openSite)
                        if case .site(let url, _) = model.channel, let host = url.host() {
                            Text(verbatim: host).font(.bfhr(.caption1))
                        }
                    }
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .accessibilityIdentifier("apply.openSite")
            }
        }
    }

    // MARK: Email

    private var emailReview: some View {
        Form {
            if model.asksIfSubmitted { submitPrompt }
            Section {
                // From and To stack and wrap at accessibility sizes: an address is never cut to
                // "deni…e.com" on the screen that reviews what goes out.
                if model.canSendFromAccount {
                    Menu {
                        Picker(selection: $model.email.accountId) {
                            ForEach(model.sendingAccounts) { account in
                                Text(verbatim: account.address).tag(Optional(account.id))
                            }
                        } label: { Text(ApplyStrings.from) }
                        .pickerStyle(.inline)
                    } label: {
                        ApplyFieldRow(label: ApplyStrings.from) {
                            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
                                Text(verbatim: fromAddress)
                                    .foregroundStyle(BFHRColor.Accent.text)
                                    .multilineTextAlignment(dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
                                Image(systemName: "chevron.up.chevron.down")
                                    .imageScale(.small)
                                    .foregroundStyle(BFHRColor.Accent.text)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    .accessibilityLabel(Text(ApplyStrings.from))
                    .accessibilityValue(Text(verbatim: fromAddress))
                    .accessibilityIdentifier("apply.email.from")
                } else {
                    ApplyFieldRow(label: ApplyStrings.from) { Text(ApplyStrings.fromMailApp).foregroundStyle(BFHRColor.Fg.secondary) }
                }
                ApplyFieldRow(label: ApplyStrings.to) {
                    TextField(text: $model.email.to, axis: .vertical) { Text(ApplyStrings.to) }
                        .bfhrEmailField()
                        .multilineTextAlignment(dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
                        .accessibilityIdentifier("apply.email.to")
                        .onChange(of: model.email.to) { _, text in
                            // Wraps like a multi-line field, but an address is one line.
                            if text.contains(where: \.isNewline) { model.email.to = text.filter { !$0.isNewline } }
                        }
                }
                // A visible label that stays once the subject is filled in (From and To have theirs).
                VStack(alignment: .leading, spacing: 2) {
                    Text(ApplyStrings.subject)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .accessibilityHidden(true)
                    TextField(text: $model.email.subject, axis: .vertical) { Text(ApplyStrings.subject) }
                        .accessibilityIdentifier("apply.email.subject")
                        .onChange(of: model.email.subject) { _, text in
                            if text.contains(where: \.isNewline) { model.email.subject = text.filter { !$0.isNewline } }
                        }
                }
                TextEditor(text: $model.email.body)
                    .frame(minHeight: 180)
                    .font(.bfhr(.body))
                    .accessibilityLabel(Text(ApplyStrings.message))
            } footer: {
                Text(model.canSendFromAccount ? ApplyStrings.accountFooter : ApplyStrings.mailAppFooter)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            Section {
                ApplyFilesRows(state: model.files) { Task { await model.prepareFiles() } }
            } header: {
                Text(ApplyStrings.attachments).foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomBar {
                if let error = model.sendError {
                    Text(ApplyStrings.sendError(error))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if model.connection.isOffline, model.canSendFromAccount {
                    Text(ApplyStrings.offlineSend)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button(action: send) {
                    if model.isSending {
                        ProgressView()
                    } else {
                        Text(bfhrPlain: model.canSendFromAccount ? ApplyStrings.sendTo(model.email.to) : ApplyStrings.openInMail)
                    }
                }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .disabled(!canSend)
                .accessibilityIdentifier("apply.send")
            }
        }
    }

    private var fromAddress: String {
        model.sendingAccounts.first { $0.id == model.email.accountId }?.address ?? model.sendingAccounts.first?.address ?? ""
    }

    private var canSend: Bool {
        guard model.email.hasValidRecipient, !model.isSending else { return false }
        if case .ready = model.files {} else { return false }
        if model.canSendFromAccount { return !model.connection.isOffline }
        return true
    }

    // MARK: Pieces

    private func bottomBar(@ViewBuilder content: () -> some View) -> some View {
        VStack(spacing: BFHRSpace.s2) {
            content()
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s2)
        .frame(maxWidth: .infinity)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }

    // MARK: Actions

    private func proceed() {
        guard let channel = model.channel else { return }
        if channel.isEmail {
            Task { try? await model.beginEmailApplication() }
        } else {
            siteURL = try? model.beginSiteApplication()
        }
    }

    private func openSite() {
        guard case .site(let url, _) = model.channel else { return }
        siteURL = url
    }

    private func send() {
        if model.canSendFromAccount {
            Task {
                if let toast = try? await model.sendFromAccount() {
                    toasts?.show(toast)
                    dismiss()
                }
            }
        } else {
            composesMail = true
        }
    }

    private func run(_ action: () throws -> ToastItem?, thenDismiss: Bool) {
        if let toast = try? action() { toasts?.show(toast) }
        if thenDismiss { dismiss() }
    }

    private func copy(_ text: String) {
        #if os(iOS)
        UIPasteboard.general.string = text
        #endif
    }
}

/// A selectable row with a trailing checkmark (inset-grouped radio list). At accessibility sizes
/// the trailing accessory (the match pill) moves under the label, so neither is squeezed into
/// broken words.
struct RadioRow<Label: View, Trailing: View>: View {
    let isSelected: Bool
    let action: () -> Void
    @ViewBuilder let label: () -> Label
    @ViewBuilder let trailing: () -> Trailing
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: action) {
            HStack(spacing: BFHRSpace.s3) {
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s1))
                    : AnyLayout(HStackLayout(spacing: BFHRSpace.s3))
                layout {
                    label().frame(maxWidth: .infinity, alignment: .leading)
                    trailing()
                }
                Image(systemName: "checkmark")
                    .font(.bfhr(.body, emphasized: true))
                    .foregroundStyle(BFHRColor.Accent.text)
                    .opacity(isSelected ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// "From" / "To": label leading and value trailing; stacked, value wrapping, at accessibility
/// sizes.
struct ApplyFieldRow<Value: View>: View {
    let label: LocalizedStringResource
    @ViewBuilder let value: () -> Value
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: BFHRSpace.s3))
        layout {
            Text(label).foregroundStyle(BFHRColor.Fg.primary)
            value().frame(maxWidth: .infinity, alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
        }
    }
}

/// The checklist's shape while the job loads: CV rows, the cover letter row, Send via rows.
struct ApplyChecklistSkeleton: View {
    var body: some View {
        Form {
            Section {
                ForEach(0..<2, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "Base CV — English").font(.bfhr(.body))
                        Text(verbatim: "EN · Default").font(.bfhr(.footnote))
                    }
                }
            } header: { Text(ApplyStrings.cvSection) }
            Section {
                Text(verbatim: "Cover letter · None").font(.bfhr(.body))
            } header: { Text(ApplyStrings.letterSection) }
            Section {
                ForEach(0..<2, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "Company site").font(.bfhr(.body))
                        Text(verbatim: "apply.workable.com · opens here in Safari").font(.bfhr(.footnote))
                    }
                }
            } header: { Text(ApplyStrings.channelSection) }
        }
        .bfhrInsetGroupedList()
        .bfhrSkeleton()
    }
}

/// The CV PDF and cover letter PDF made for this application, with Share (Save to Files).
struct ApplyFilesRows: View {
    let state: ApplyFilesState
    let retry: () -> Void

    var body: some View {
        switch state {
        case .idle, .preparing:
            ProgressNote(ApplyStrings.preparingFiles)
        case .failed:
            InlineAlert(.warning, title: ApplyStrings.filesFailed, actionTitle: Strings.tryAgain, action: retry)
        case .ready(let files):
            ForEach(files) { file in
                ApplyFileRow(file: file)
            }
        }
    }
}

struct ApplyFileRow: View {
    let file: ApplyFile

    var body: some View {
        HStack(spacing: BFHRSpace.s3) {
            Image(systemName: "doc.richtext")
                .foregroundStyle(BFHRColor.Accent.text)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                // The file name is what the form's file picker shows; VoiceOver reads what it is.
                Text(verbatim: file.fileName).font(.bfhr(.body)).foregroundStyle(BFHRColor.Fg.primary)
                    .accessibilityLabel(Text(ApplyStrings.fileKind(file.kind)))
                Text(verbatim: ByteCountFormatter.string(fromByteCount: Int64(file.sizeBytes), countStyle: .file))
                    .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let url = file.temporaryURL {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text(ApplyStrings.shareFile(String(localized: ApplyStrings.fileKind(file.kind)))))
            }
        }
    }
}

extension ApplyFile {
    /// The bytes in a temporary file (Share, Save to Files, Mail attachments).
    var temporaryURL: URL? {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("apply-\(id)", isDirectory: true)
        let url = directory.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: url.path) { return url }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: url)
            return url
        } catch {
            return nil
        }
    }
}

extension View {
    /// An email keyboard without autocorrection on iOS.
    func bfhrEmailField() -> some View {
        #if os(iOS)
        keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        self
        #endif
    }
}
