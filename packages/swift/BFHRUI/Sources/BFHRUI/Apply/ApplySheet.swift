import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The Apply sheet (docs/design/research/apply.md "Decision — iOS"): one review-first checklist
/// (CV with "Tailor for this job" · Cover letter · Send via) with the bottom button naming the next
/// step ("Open company site" / "Review email"), then the application kit (CV PDF, cover letter,
/// answers to copy) with "Did you apply?", or the email review with its attachments. Tailoring and
/// the cover letter editor are pages of the sheet. Company and role stay in the navigation header
/// on every page.
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
                    case .tailor:
                        if let tailoring = model.tailoring {
                            TailorReviewPage(model: tailoring) { _ in
                                toasts?.show(ToastItem(glyph: ToastGlyph.confirmed, message: ApplyStrings.tailorSaved(model.company)))
                                model.endTailoring()
                            }
                        }
                    case .letter:
                        CoverLetterEditorPage(model: model.letter) { model.step = .checklist }
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
                        Button(action: back) { Text(ApplyStrings.back) }
                            .accessibilityIdentifier("apply.back")
                    }
                }
                if model.step == .kit || model.step == .email {
                    ToolbarItem(placement: .confirmationAction) {
                        Button { dismiss() } label: { Text(ApplyStrings.close) }
                    }
                }
            }
        }
        .interactiveDismissDisabled(model.isSending || model.step == .tailor || model.step == .letter)
        .sheet(isPresented: $model.picksAttachments) { AttachmentPickerSheet(model: model) }
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
                                if let saved = option.savedForJob {
                                    Text(ApplyStrings.savedVersionDetail(saved, language: option.language.uppercased()))
                                        .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                                } else {
                                    Text(ApplyStrings.cvDetail(language: option.language.uppercased(), isDefault: option.isDefault))
                                        .font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                                }
                            }
                        } trailing: {
                            if let score = option.score { MatchBandPill(score: score) }
                            if option.savedForJob == .tailored { AiBadge() }
                        }
                        .accessibilityIdentifier("apply.cv.\(option.id)")
                    }
                    Button(action: model.beginTailoring) {
                        HStack(spacing: BFHRSpace.s3) {
                            Image(systemName: "sparkles")
                                .foregroundStyle(BFHRColor.Accent.text)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ApplyStrings.tailorRow).font(.bfhr(.body)).foregroundStyle(BFHRColor.Accent.text)
                                Text(ApplyStrings.tailorRowBody).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.forward")
                                .font(.bfhr(.footnote, emphasized: true))
                                .foregroundStyle(BFHRColor.Fg.tertiary)
                                .accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(model.selectedCV == nil)
                    .accessibilityIdentifier("apply.tailorRow")
                }
            } header: {
                Text(ApplyStrings.cvSection).foregroundStyle(BFHRColor.Fg.secondary)
            }
            Section {
                Picker(selection: Binding(get: { model.coverLetter }, set: { choice in
                    if choice == .written { model.editLetter() } else { model.coverLetter = choice }
                })) {
                    Text(ApplyStrings.letterNone).tag(CoverLetterChoice.none)
                    ForEach(model.letterOptions) { letter in
                        Text(verbatim: letter.title).tag(CoverLetterChoice.existing(letter.id))
                    }
                    Text(ApplyStrings.letterWrite).tag(CoverLetterChoice.written)
                } label: { Text(ApplyStrings.letterSection) }
                .accessibilityIdentifier("apply.letter")
                if model.coverLetter == .written {
                    Button(action: model.editLetter) {
                        HStack(spacing: BFHRSpace.s3) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ApplyStrings.letterEdit).font(.bfhr(.body)).foregroundStyle(BFHRColor.Accent.text)
                                if let body = model.letterBody {
                                    Text(verbatim: body)
                                        .font(.bfhr(.footnote))
                                        .foregroundStyle(BFHRColor.Fg.secondary)
                                        .lineLimit(2)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.forward")
                                .font(.bfhr(.footnote, emphasized: true))
                                .foregroundStyle(BFHRColor.Fg.tertiary)
                                .accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("apply.letter.edit")
                } else if let body = model.letterBody {
                    Text(verbatim: body)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .lineLimit(3)
                }
            } header: {
                Text(ApplyStrings.letterSection).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                Text(ApplyStrings.letterWriteFooter).foregroundStyle(BFHRColor.Fg.secondary)
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
            ApplyBottomBar {
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

    /// The kit: the CV PDF (Save to Files / Share), the cover letter (Copy / Share), the answers
    /// for this job with Copy, then "Did you apply?" in the bottom bar once back from Safari.
    private var kit: some View {
        List {
            Section {
                Text(ApplyStrings.kitIntro).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                if model.deferredAnswer, !model.asksIfSubmitted {
                    Label { Text(ApplyStrings.inProgress) } icon: { Image(systemName: "clock") }
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            Section {
                switch model.files {
                case .idle, .preparing:
                    ProgressNote(ApplyStrings.preparingFiles)
                case .failed:
                    InlineAlert(.warning, title: ApplyStrings.filesFailed, actionTitle: Strings.tryAgain) { Task { await model.prepareFiles() } }
                case .ready(let files):
                    ForEach(files.filter { if case .cv = $0.kind { true } else { false } }) { file in
                        KitFileRow(file: file) { toasts?.show(ToastItem(glyph: ToastGlyph.confirmed, message: ApplyStrings.savedToFiles)) }
                    }
                }
            } header: {
                Text(ApplyStrings.cvSectionKit).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                Text(ApplyStrings.kitCVFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
            if let body = model.letterBody {
                Section {
                    Text(verbatim: body)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .lineLimit(4)
                    Button {
                        copy(body)
                        toasts?.show(ToastItem(glyph: ToastGlyph.copied, message: ApplyStrings.letterCopied))
                    } label: {
                        Label { Text(ApplyStrings.copyLetter) } icon: { Image(systemName: "doc.on.doc") }
                    }
                    .accessibilityIdentifier("apply.kit.copyLetter")
                    if let file = model.files.files.first(where: { if case .coverLetter = $0.kind { true } else { false } }),
                       let url = file.temporaryURL {
                        ShareLink(item: url) {
                            Label { Text(ApplyStrings.shareLetterPDF) } icon: { Image(systemName: "square.and.arrow.up") }
                        }
                        .accessibilityIdentifier("apply.kit.shareLetter")
                    }
                } header: {
                    Text(ApplyStrings.letterSection).foregroundStyle(BFHRColor.Fg.secondary)
                } footer: {
                    Text(ApplyStrings.kitLetterFooter).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            KitAnswersSections(answers: model.kitAnswers) { answer in
                copy(answer.text)
                toasts?.show(ToastItem(glyph: ToastGlyph.copied, message: ApplyStrings.copied(answer.label)))
            }
        }
        .bfhrInsetGroupedList()
        .accessibilityIdentifier("apply.kit")
        .task { if model.files == .idle { await model.prepareFiles() } }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ApplyBottomBar {
                if model.asksIfSubmitted {
                    SubmitPrompt(
                        company: model.company,
                        onApplied: { run(model.confirmApplied, thenDismiss: true) },
                        onNotYet: model.notYet,
                        onNotApplying: { run(model.notApplying, thenDismiss: true) }
                    )
                    .accessibilityIdentifier("apply.submitPrompt")
                } else {
                    Button(action: openSite) {
                        VStack(spacing: 2) {
                            Text(model.deferredAnswer ? ApplyStrings.openSiteAgain : ApplyStrings.openSite)
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
                ExtraAttachmentRows(model: model) { model.picksAttachments = true }
            } header: {
                Text(ApplyStrings.attachments).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                Text(ApplyStrings.attachTotal(
                    count: model.attachments.count,
                    size: AttachmentPickerSheet.size(model.attachmentBytes),
                    limit: AttachmentPickerSheet.size(model.attachmentLimitBytes)
                ))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityIdentifier("apply.attach.total")
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ApplyBottomBar {
                if let problem = model.attachmentProblem {
                    Text(ApplyStrings.attachProblem(problem, limit: AttachmentPickerSheet.size(model.attachmentLimitBytes)))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if let error = model.sendError {
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
        guard model.email.hasValidRecipient, !model.isSending, model.attachmentProblem == nil else { return false }
        if case .ready = model.files {} else { return false }
        if model.canSendFromAccount { return !model.connection.isOffline }
        return true
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

    /// Back to the checklist; leaving the review cancels a pending request.
    private func back() {
        switch model.step {
        case .tailor:
            model.tailoring?.cancel()
            model.endTailoring()
        default:
            model.step = .checklist
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
            Task {
                await model.loadAttachmentBytes()
                composesMail = true
            }
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
