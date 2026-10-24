import BFHRDesignTokens
import SwiftUI

/// Delete account, pushed from Data & privacy (research settings-account.md: Starbucks' dedicated
/// screen, Lovable's itemized list, Hinge's "export first", Discord's verification step,
/// Bloomberg / Deliveroo / GroupMe type-to-confirm with the action disabled until it matches).
/// The safe button comes first; Return in the field never deletes.
struct DeleteAccountView: View {
    @Bindable var model: DataPrivacyModel
    @FocusState private var fieldFocused: Bool
    @AccessibilityFocusState private var focusesTitle: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isDeleting: Bool { model.deletion == .deleting || model.deletion == .deleted }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(DataPrivacyStrings.dialogTitle)
                        .font(.bfhr(.title2, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityFocused($focusesTitle)
                        .accessibilityIdentifier("delete.title")
                    Text(DataPrivacyStrings.dialogLead)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, BFHRSpace.s1)
                DeletedItemRow(text: DataPrivacyStrings.item1)
                DeletedItemRow(text: DataPrivacyStrings.item2)
                DeletedItemRow(text: DataPrivacyStrings.item3)
                DeletedItemRow(text: DataPrivacyStrings.item4)
                DeletedItemRow(text: DataPrivacyStrings.item5)
                DeletedItemRow(text: DataPrivacyStrings.item6)
                Text(DataPrivacyStrings.irreversible)
                    .font(.bfhr(.body, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Section {
                Button {
                    model.endDelete()
                } label: {
                    Label { Text(DataPrivacyStrings.exportFirst) } icon: { Image(systemName: "arrow.down.doc") }
                        .labelStyle(DataPrivacyListLabelStyle())
                        .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(isDeleting ? BFHRColor.Fg.disabled : BFHRColor.Accent.text)
                .accessibilityIdentifier("delete.exportFirst")
            }

            if model.showsReauth {
                ReauthSection(model: model)
            }

            Section {
                confirmField
            }

            Section {
                actions
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
        }
        .bfhrInsetGroupedList()
        .disabled(isDeleting)
        .navigationTitle(Text(DataPrivacyStrings.deleteTitle))
        .bfhrInlineTitle()
        .navigationBarBackButtonHidden(isDeleting)
        .animation(BFHRMotion.animation(.base, reduceMotion: reduceMotion), value: model.reauth)
        .animation(BFHRMotion.animation(.base, reduceMotion: reduceMotion), value: model.deletion)
        .onAppear { focusesTitle = true }
        .onChange(of: model.deletion) { _, phase in
            if phase == .failed { DataPrivacyAnnouncement.post(DataPrivacyStrings.errorDelete) }
        }
        .accessibilityIdentifier("delete")
    }

    private var confirmField: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            Text(DataPrivacyStrings.confirmLabel(model.confirmWord))
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityHidden(true)
            TextField(text: $model.confirmationText, prompt: nil) {
                Text(DataPrivacyStrings.confirmLabel(model.confirmWord))
            }
            .font(.bfhr(.body))
            .foregroundStyle(BFHRColor.Fg.primary)
            #if os(iOS)
            .textInputAutocapitalization(.characters)
            #endif
            .autocorrectionDisabled()
            .submitLabel(.done)
            // Return only closes the keyboard: deleting always takes the button.
            .onSubmit { fieldFocused = false }
            .focused($fieldFocused)
            .padding(.horizontal, BFHRSpace.s3)
            .padding(.vertical, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum + BFHRSpace.s1)
            .background(BFHRColor.Surface.sunken, in: BFHRRadius.shape(BFHRRadius.md))
            .overlay {
                BFHRRadius.shape(BFHRRadius.md)
                    .strokeBorder(
                        fieldFocused ? BFHRColor.Line.focus : BFHRColor.Line.control,
                        lineWidth: fieldFocused ? BFHRBorderWidth.thick : BFHRBorderWidth.thin
                    )
            }
            .accessibilityIdentifier("delete.confirmField")
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            if model.deletion == .failed {
                InlineAlert(.error, title: DataPrivacyStrings.errorDelete)
                    .accessibilityIdentifier("delete.error")
            }
            Button {
                model.endDelete()
            } label: {
                Text(DataPrivacyStrings.keep)
            }
            .buttonStyle(.bfhr(.primary, fullWidth: true))
            .accessibilityIdentifier("delete.keep")
            Button {
                fieldFocused = false
                Task { await model.delete() }
            } label: {
                HStack(spacing: BFHRSpace.s2) {
                    if isDeleting {
                        ProgressView()
                            .tint(BFHRColor.Fg.disabled)
                            .accessibilityHidden(true)
                    }
                    Text(isDeleting ? DataPrivacyStrings.progress : DataPrivacyStrings.submit)
                }
            }
            .buttonStyle(.bfhr(.destructive, fullWidth: true))
            .disabled(!model.canDelete)
            .accessibilityIdentifier("delete.submit")
            if !model.isOnline {
                OfflineNote()
            }
        }
    }
}

/// One line of the deletion list.
struct DeletedItemRow: View {
    let text: LocalizedStringResource

    var body: some View {
        Label {
            Text(text)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "trash")
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
        .labelStyle(DataPrivacyListLabelStyle())
    }
}

// MARK: Re-authentication

/// "Confirm it's you": a fresh email-link sign-in, needed when the sign-in is older than five
/// minutes (Mammoth / Navan / Upside: say where the link went, open it on this device, come back).
struct ReauthSection: View {
    @Bindable var model: DataPrivacyModel

    var body: some View {
        Section {
            content
            if let problem = model.reauthProblem {
                ReauthProblemAlert(problem: problem) {
                    Task { await model.retryReauth() }
                }
            }
        } header: {
            Text(DataPrivacyStrings.reauthTitle)
        }
        .onChange(of: model.reauth) { _, step in
            switch step {
            case .sent: DataPrivacyAnnouncement.post(DataPrivacyStrings.reauthSent(model.email))
            case .done: DataPrivacyAnnouncement.post(DataPrivacyStrings.reauthDone)
            default: break
            }
        }
        .onChange(of: model.reauthProblem) { _, problem in
            if let problem { DataPrivacyAnnouncement.post(ReauthProblemAlert.title(problem)) }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.reauth {
        case .needed, .sending:
            ReauthParagraph(text: DataPrivacyStrings.reauthBody(model.email))
                .accessibilityIdentifier("delete.reauth.needed")
            sendButton(sending: model.reauth == .sending)
        case .sent, .verifying:
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
                Image(systemName: "envelope")
                    .foregroundStyle(BFHRColor.Accent.text)
                    .accessibilityHidden(true)
                ReauthParagraph(text: DataPrivacyStrings.reauthSent(model.email))
                if model.reauth == .verifying {
                    ProgressView().accessibilityHidden(true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("delete.reauth.sent")
            sendButton(sending: false)
        case .done:
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(BFHRTone.success.text)
                    .accessibilityHidden(true)
                ReauthParagraph(text: DataPrivacyStrings.reauthDone)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("delete.reauth.done")
        case .checking, .notNeeded:
            EmptyView()
        }
    }

    private func sendButton(sending: Bool) -> some View {
        let enabled = model.isOnline && !sending && model.reauth != .verifying
        return Button {
            Task { await model.sendReauthLink() }
        } label: {
            HStack(spacing: BFHRSpace.s2) {
                if sending { ProgressView().accessibilityHidden(true) }
                Text(DataPrivacyStrings.reauthSend)
            }
            .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
            .contentShape(Rectangle())
        }
        .foregroundStyle(enabled ? BFHRColor.Accent.text : BFHRColor.Fg.disabled)
        .disabled(!enabled)
        .accessibilityIdentifier("delete.reauth.send")
    }
}

/// A wrapping sentence that interpolates the address (no mailto link).
struct ReauthParagraph: View {
    let text: LocalizedStringResource

    var body: some View {
        Text(bfhrPlain: text)
            .font(.bfhr(.body))
            .foregroundStyle(BFHRColor.Fg.primary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Sending or opening the link failed: the sign-in screens' copy for the same problems.
struct ReauthProblemAlert: View {
    let problem: ReauthProblem
    let retry: () -> Void

    static func title(_ problem: ReauthProblem) -> LocalizedStringResource {
        switch problem {
        case .sendOffline: SignInStrings.sendOfflineTitle
        case .sendTooManyRequests: SignInStrings.sendTooManyTitle
        case .sendOther: SignInStrings.sendOtherTitle
        case .linkExpired: SignInStrings.expiredTitle
        case .linkUnusable: SignInStrings.unusableTitle
        case .linkOffline, .linkOther: SignInStrings.retryTitle
        }
    }

    private var message: LocalizedStringResource {
        switch problem {
        case .sendOffline: SignInStrings.sendOfflineMessage
        case .sendTooManyRequests: SignInStrings.sendTooManyMessage
        case .sendOther: SignInStrings.sendOtherMessage
        case .linkExpired: SignInStrings.expiredMessage
        case .linkUnusable: SignInStrings.unusableMessage
        case .linkOffline: SignInStrings.retryOfflineMessage
        case .linkOther: SignInStrings.retryOtherMessage
        }
    }

    var body: some View {
        let tone: InlineAlert.Tone = problem == .sendTooManyRequests ? .warning : .error
        InlineAlert(
            tone,
            title: Self.title(problem),
            message: message,
            actionTitle: problem.isRetryable ? DataPrivacyStrings.retry : nil,
            action: problem.isRetryable ? retry : nil
        )
        .accessibilityIdentifier("delete.reauth.problem")
    }
}
