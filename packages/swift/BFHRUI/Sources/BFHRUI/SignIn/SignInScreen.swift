import BFHRDesignTokens
import SwiftUI

/// The signed-out takeover (IA.md: the only full-screen takeovers are signed-out auth and the
/// update gate): email → "Check your email" → signed in, plus the confirm-email and link-problem
/// states. One screen per `SignInModel.Step`; no navigation bar.
public struct SignInScreen: View {
    @Bindable private var model: SignInModel

    public init(model: SignInModel) {
        self.model = model
    }

    public var body: some View {
        // A ZStack, not a Group: a Group hands its modifiers to each child, so the identifier
        // below would replace the step's own.
        ZStack {
            switch model.step {
            case .enterEmail:
                EmailStep(model: model, confirming: false)
            case .confirmEmail:
                EmailStep(model: model, confirming: true)
            case .checkEmail(let address):
                CheckEmailStep(model: model, address: address)
            case .finishing:
                FinishingStep()
            case .linkFailed(let failure):
                LinkProblemStep(model: model, failure: failure)
            }
        }
        .background(BFHRColor.Surface.canvas)
        // Containers keep their own identifier; a plain identifier here would land on every
        // element inside and replace theirs.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("signIn")
    }
}

/// Shared layout of the sign-in steps: glyph, title (VoiceOver focus on appear), content, then the
/// actions pinned to the bottom at default text sizes (above the keyboard) and following the text
/// at accessibility sizes, where a pinned bar would hide the explanation.
struct SignInLayout<Content: View, Actions: View>: View {
    let glyph: String
    /// Problem states draw the glyph in the secondary text color: the accent reads as "all good".
    var glyphIsProblem = false
    let title: LocalizedStringResource
    let identifier: String
    @ViewBuilder let content: Content
    @ViewBuilder let actions: Actions
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AccessibilityFocusState private var focusesTitle: Bool

    var body: some View {
        let pinsActions = !dynamicTypeSize.isAccessibilitySize
        ScrollView {
            VStack(alignment: .leading, spacing: BFHRSpace.s4) {
                Image(systemName: glyph)
                    .font(.system(size: BFHRIconSize.empty))
                    .foregroundStyle(glyphIsProblem ? BFHRColor.Fg.secondary : BFHRColor.Accent.text)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.bfhr(.title1, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($focusesTitle)
                    // The step's identifier sits on its title: a container identifier on the
                    // scroll view doesn't reach XCUITest.
                    .accessibilityIdentifier(identifier)
                content
                if !pinsActions {
                    actions.padding(.top, BFHRSpace.s2)
                }
            }
            .padding(.horizontal, BFHRSpace.s6)
            .padding(.top, BFHRSpace.s12)
            .padding(.bottom, BFHRSpace.s6)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            if pinsActions {
                actions
                    .padding(.horizontal, BFHRSpace.s6)
                    .padding(.top, BFHRSpace.s3)
                    .padding(.bottom, BFHRSpace.s2)
                    .frame(maxWidth: 560)
                    .frame(maxWidth: .infinity)
                    .background(BFHRColor.Surface.canvas)
            }
        }
        // No navigation bar: a canvas strip keeps scrolled text from running under the status bar.
        .overlay(alignment: .top) {
            Color.clear
                .frame(height: 0)
                .background(BFHRColor.Surface.canvas.ignoresSafeArea(edges: .top))
        }
        .onAppear { focusesTitle = true }
    }
}

/// A sentence in the body style that wraps instead of truncating.
struct SignInParagraph: View {
    let text: Text
    var secondary = false

    var body: some View {
        text
            .font(.bfhr(secondary ? .subheadline : .body))
            .foregroundStyle(secondary ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A primary button that shows a spinner and a progress label while `isBusy`.
struct SignInPrimaryButton: View {
    let title: LocalizedStringResource
    let busyTitle: LocalizedStringResource
    let isBusy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: BFHRSpace.s2) {
                if isBusy {
                    ProgressView()
                        .tint(BFHRColor.Fg.disabled)
                        .accessibilityHidden(true)
                }
                Text(isBusy ? busyTitle : title)
            }
        }
        .buttonStyle(.bfhr(.primary, fullWidth: true))
        .disabled(isBusy)
        .accessibilityIdentifier("signIn.primary")
    }
}

// MARK: Email (and confirm email)

struct EmailStep: View {
    @Bindable var model: SignInModel
    /// The confirm-email variant: a link opened on a device that didn't ask for it.
    let confirming: Bool
    @FocusState private var fieldFocused: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        SignInLayout(
            glyph: confirming ? "envelope.open" : "envelope",
            title: confirming ? SignInStrings.confirmTitle : SignInStrings.title,
            identifier: confirming ? "signIn.confirm" : "signIn.email"
        ) {
            SignInParagraph(text: Text(confirming ? SignInStrings.confirmBody : SignInStrings.body))
            field
                .padding(.top, BFHRSpace.s2)
            if let error = model.sendError {
                SendErrorAlert(error: error)
            }
        } actions: {
            VStack(spacing: BFHRSpace.s3) {
                SignInPrimaryButton(
                    title: confirming ? SignInStrings.confirmAction : SignInStrings.sendLink,
                    busyTitle: confirming ? SignInStrings.signingIn : SignInStrings.sending,
                    isBusy: model.isSending,
                    action: submit
                )
                if !confirming {
                    Text(AttributedString(localized: SignInStrings.legal))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .tint(BFHRColor.Fg.link)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var field: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            Text(SignInStrings.emailLabel)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
                .accessibilityHidden(true)
            // `bfhrPlain`: the example address would otherwise render as a mailto link. Vertical,
            // so a long address wraps instead of clipping (AX sizes); Return arrives as a line
            // break, which submits instead.
            TextField(
                text: Binding(
                    get: { model.emailDraft },
                    set: { value in
                        guard value.contains("\n") else {
                            model.emailDraft = value
                            return
                        }
                        model.emailDraft = value.replacingOccurrences(of: "\n", with: "")
                        submit()
                    }
                ),
                // A placeholder doesn't wrap: at accessibility sizes it would end in "…", and the
                // "Email" label above already names the field.
                prompt: dynamicTypeSize.isAccessibilitySize
                    ? nil
                    : Text(bfhrPlain: SignInStrings.emailPlaceholder).foregroundStyle(BFHRColor.Fg.tertiary),
                axis: .vertical
            ) {
                Text(SignInStrings.emailLabel)
            }
            .font(.bfhr(.body))
            .foregroundStyle(BFHRColor.Fg.primary)
            .textContentType(.emailAddress)
            #if os(iOS)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            #endif
            .autocorrectionDisabled()
            .submitLabel(confirming ? .go : .send)
            .onSubmit(submit)
            .focused($fieldFocused)
            .disabled(model.isSending)
            .padding(.horizontal, BFHRSpace.s3)
            .padding(.vertical, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum + BFHRSpace.s1)
            .background(BFHRColor.Surface.base, in: BFHRRadius.shape(BFHRRadius.md))
            .overlay {
                BFHRRadius.shape(BFHRRadius.md)
                    .strokeBorder(
                        model.fieldError != nil ? BFHRTone.danger.solid : (fieldFocused ? BFHRColor.Line.focus : BFHRColor.Line.control),
                        lineWidth: fieldFocused || model.fieldError != nil ? BFHRBorderWidth.thick : BFHRBorderWidth.thin
                    )
            }
            .accessibilityIdentifier("signIn.emailField")
            if let error = model.fieldError {
                Label {
                    Text(bfhrPlain: fieldErrorText(error))
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "exclamationmark.circle")
                }
                .labelStyle(.bfhrCompact)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRTone.danger.text)
                .accessibilityIdentifier("signIn.fieldError")
            }
        }
    }

    private func fieldErrorText(_ error: SignInModel.FieldError) -> LocalizedStringResource {
        switch error {
        case .invalidFormat: SignInStrings.invalidFormat
        case .rejected: SignInStrings.rejected
        case .mismatch: SignInStrings.mismatch
        }
    }

    private func submit() {
        fieldFocused = false
        Task {
            if confirming {
                await model.confirmEmail()
            } else {
                await model.sendLink()
            }
            if model.fieldError != nil { announce(model.fieldError.map(fieldErrorText)) }
        }
    }

    private func announce(_ resource: LocalizedStringResource?) {
        #if os(iOS)
        guard let resource else { return }
        AccessibilityNotification.Announcement(String(localized: resource)).post()
        #endif
    }
}

/// Sending failed: an error alert under the field (offline, limit, server).
struct SendErrorAlert: View {
    let error: SignInModel.SendError

    var body: some View {
        switch error {
        case .offline:
            InlineAlert(.error, title: SignInStrings.sendOfflineTitle, message: SignInStrings.sendOfflineMessage)
        case .tooManyRequests:
            InlineAlert(.warning, title: SignInStrings.sendTooManyTitle, message: SignInStrings.sendTooManyMessage)
        case .other:
            InlineAlert(.error, title: SignInStrings.sendOtherTitle, message: SignInStrings.sendOtherMessage)
        }
    }
}

// MARK: Check your email

struct CheckEmailStep: View {
    let model: SignInModel
    let address: String
    @Environment(\.openURL) private var openURL

    /// Apple Mail's URL scheme: opens the inbox.
    static let mailApp = URL(string: "message://")!

    var body: some View {
        SignInLayout(glyph: "envelope.badge", title: SignInStrings.checkTitle, identifier: "signIn.check") {
            VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                SignInParagraph(text: Text(bfhrPlain: SignInStrings.checkBody(address)))
                SignInParagraph(text: Text(SignInStrings.checkDevice))
                SignInParagraph(text: Text(SignInStrings.checkHelper), secondary: true)
            }
            if model.didResend {
                Label {
                    Text(SignInStrings.resent).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "checkmark.circle")
                }
                .labelStyle(.bfhrCompact)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRTone.success.text)
            }
            if let error = model.sendError {
                SendErrorAlert(error: error)
            }
        } actions: {
            VStack(spacing: BFHRSpace.s2) {
                Button { openURL(Self.mailApp) } label: { Text(SignInStrings.openMail) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                ResendButton(model: model)
                Button { model.useDifferentEmail() } label: { Text(SignInStrings.differentEmail) }
                    .buttonStyle(.bfhrPlain)
                    .accessibilityIdentifier("signIn.differentEmail")
            }
        }
    }
}

/// "Resend link", disabled with a countdown during the cooldown.
struct ResendButton: View {
    let model: SignInModel

    var body: some View {
        // The timeline only redraws each second; the model's clock decides (fixed in design mode).
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let now = model.currentDate
            let available = model.resendAvailableAt(now)
            let remaining = available.map { max(1, Int($0.timeIntervalSince(now).rounded(.up))) }
            Button {
                Task { await model.resendLink() }
            } label: {
                HStack(spacing: BFHRSpace.s2) {
                    if model.isSending {
                        ProgressView().accessibilityHidden(true)
                    }
                    if let remaining {
                        Text(SignInStrings.resendIn(Self.clock(remaining)))
                            .monospacedDigit()
                    } else {
                        Text(model.isSending ? SignInStrings.sending : SignInStrings.resend)
                    }
                }
            }
            .buttonStyle(.bfhr(.secondary, fullWidth: true))
            .disabled(remaining != nil || model.isSending)
            .accessibilityLabel(Text(SignInStrings.resend))
            .accessibilityValue(remaining.map { Text(SignInStrings.resendAvailableIn($0)) } ?? Text(verbatim: ""))
            .accessibilityIdentifier("signIn.resend")
        }
    }

    /// "0:42".
    static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

// MARK: Finishing

struct FinishingStep: View {
    var body: some View {
        VStack(spacing: BFHRSpace.s4) {
            ProgressView()
                .controlSize(.large)
                .accessibilityHidden(true)
            Text(SignInStrings.finishing)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(BFHRSpace.s6)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
        .accessibilityIdentifier("signIn.finishing")
    }
}

// MARK: Link problems

struct LinkProblemStep: View {
    let model: SignInModel
    let failure: SignInModel.LinkFailure
    @Environment(\.openURL) private var openURL
    @State private var isRetrying = false

    /// The website's Support page (GitHub issues).
    static let support = URL(string: "https://bruteforcehr.web.app/support/")!

    var body: some View {
        SignInLayout(glyph: glyph, glyphIsProblem: true, title: title, identifier: "signIn.linkProblem") {
            SignInParagraph(text: Text(message))
        } actions: {
            VStack(spacing: BFHRSpace.s2) {
                switch failure {
                case .expired, .unusable:
                    Button { model.startOver() } label: { Text(SignInStrings.sendNewLink) }
                        .buttonStyle(.bfhr(.primary, fullWidth: true))
                case .retryable:
                    SignInPrimaryButton(title: Strings.tryAgain, busyTitle: SignInStrings.signingIn, isBusy: isRetrying) {
                        isRetrying = true
                        Task {
                            await model.retry()
                            isRetrying = false
                        }
                    }
                    Button { model.startOver() } label: { Text(SignInStrings.sendNewLink) }
                        .buttonStyle(.bfhr(.secondary, fullWidth: true))
                case .accountDisabled:
                    Button { openURL(Self.support) } label: { Text(SignInStrings.getHelp) }
                        .buttonStyle(.bfhr(.primary, fullWidth: true))
                }
                Button { model.useDifferentEmail() } label: { Text(SignInStrings.differentEmail) }
                    .buttonStyle(.bfhrPlain)
            }
        }
    }

    private var glyph: String {
        switch failure {
        case .expired: "clock"
        case .unusable: "link"
        case .accountDisabled: "person.crop.circle.badge.xmark"
        case .retryable(let offline, _, _): offline ? "wifi.slash" : "arrow.clockwise"
        }
    }

    private var title: LocalizedStringResource {
        switch failure {
        case .expired: SignInStrings.expiredTitle
        case .unusable: SignInStrings.unusableTitle
        case .accountDisabled: SignInStrings.disabledTitle
        case .retryable: SignInStrings.retryTitle
        }
    }

    private var message: LocalizedStringResource {
        switch failure {
        case .expired: SignInStrings.expiredMessage
        case .unusable: SignInStrings.unusableMessage
        case .accountDisabled: SignInStrings.disabledMessage
        case .retryable(let offline, _, _): offline ? SignInStrings.retryOfflineMessage : SignInStrings.retryOtherMessage
        }
    }
}
