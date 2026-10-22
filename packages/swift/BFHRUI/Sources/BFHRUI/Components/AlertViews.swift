import BFHRDesignTokens
import SwiftUI

/// A rounded tinted callout above the affected content (system.md "InlineAlert"): stale data, a
/// section that failed, an account to reconnect, a rejected queued write. Icon + title + body +
/// one action, optional dismiss (never for a broken account).
public struct InlineAlert: View {
    public enum Tone: Sendable {
        case info
        case warning
        case error

        var tone: BFHRTone {
            switch self {
            case .info: .info
            case .warning: .warning
            case .error: .danger
            }
        }

        var glyph: String {
            switch self {
            case .info: "info.circle"
            case .warning: "exclamationmark.triangle"
            case .error: "exclamationmark.circle"
            }
        }
    }

    private let tone: Tone
    private let title: LocalizedStringResource
    private let message: LocalizedStringResource?
    private let actionTitle: LocalizedStringResource?
    private let action: (() -> Void)?
    private let onDismiss: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(
        _ tone: Tone,
        title: LocalizedStringResource,
        message: LocalizedStringResource? = nil,
        actionTitle: LocalizedStringResource? = nil,
        action: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.tone = tone
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
        self.onDismiss = onDismiss
    }

    public var body: some View {
        let colors = tone.tone
        let isLarge = dynamicTypeSize.isAccessibilitySize
        // At accessibility sizes the glyph sits above the text (next to the ✕), so the text gets
        // the full width instead of a column beside the glyph.
        let layout = isLarge
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: BFHRSpace.s3))
        layout {
            Image(systemName: tone.glyph)
                .foregroundStyle(colors.text)
                .accessibilityHidden(true)
                .frame(minHeight: isLarge && onDismiss != nil ? BFHRHitTarget.minimum - BFHRSpace.s3 : nil, alignment: .top)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                // Only the title makes room for the ✕ in the top-trailing corner; the message and
                // action use the full width.
                Text(bfhrPlain: title)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(colors.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.trailing, onDismiss == nil || isLarge ? 0 : BFHRHitTarget.minimum - BFHRSpace.s3)
                if let message {
                    Text(bfhrPlain: message)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let actionTitle, let action {
                    Button(action: action) { Text(actionTitle) }
                        .buttonStyle(.bfhrPlain)
                        .padding(.leading, -BFHRSpace.s2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(BFHRSpace.s3)
        .overlay(alignment: .topTrailing) {
            if let onDismiss {
                IconButton(Strings.close, systemImage: "xmark", action: onDismiss)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .background(colors.subtle, in: BFHRRadius.shape(BFHRRadius.lg))
        .overlay(BFHRRadius.shape(BFHRRadius.lg).strokeBorder(colors.solid.opacity(0.4), lineWidth: BFHRBorderWidth.hairline))
        .accessibilityElement(children: .contain)
    }
}

/// A whole pane that couldn't load with nothing cached (system.md "PaneError"): the chrome stays,
/// the content area explains what happened and how to fix it. Try again takes VoiceOver focus;
/// not-found failures offer navigation instead of retry. Raw details sit behind "Copy details".
public struct PaneError: View {
    private let failure: LoadFailure
    private let title: LocalizedStringResource?
    private let message: LocalizedStringResource?
    private let retry: (() -> Void)?
    private let goBack: (() -> Void)?
    @AccessibilityFocusState private var focusesAction: Bool

    /// - Parameters:
    ///   - title / message: the screen's specific copy ("We couldn't load your applications");
    ///     defaults per failure kind otherwise.
    ///   - retry: Try again (ignored for not-found).
    ///   - goBack: secondary "Go back" on pushed screens.
    public init(
        _ failure: LoadFailure,
        title: LocalizedStringResource? = nil,
        message: LocalizedStringResource? = nil,
        retry: (() -> Void)? = nil,
        goBack: (() -> Void)? = nil
    ) {
        self.failure = failure
        self.title = title
        self.message = message
        self.retry = retry
        self.goBack = goBack
    }

    public var body: some View {
        // Centered in the pane when it fits; scrolls at large text sizes instead of truncating.
        // Always the same scroll view (not ViewThatFits), so texts keep their identity when the
        // text size changes.
        GeometryReader { proxy in
            ScrollView {
                content
                    .frame(maxWidth: .infinity, minHeight: proxy.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .onAppear { focusesAction = true }
    }

    private var content: some View {
        VStack(spacing: BFHRSpace.s4) {
            Image(systemName: failure.kind == .notFound ? "questionmark.folder" : "exclamationmark.icloud")
                .font(.system(size: BFHRIconSize.empty * 0.75))
                .foregroundStyle(BFHRColor.Fg.tertiary)
                .accessibilityHidden(true)
            VStack(spacing: BFHRSpace.s2) {
                Text(bfhrPlain: title ?? Strings.paneErrorTitle(failure.kind))
                    .font(.bfhr(.title3, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(bfhrPlain: message ?? Strings.paneErrorMessage(failure.kind))
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.center)
            VStack(spacing: BFHRSpace.s2) {
                if failure.isRetryable, let retry {
                    Button(action: retry) {
                        Label { Text(Strings.tryAgain) } icon: { Image(systemName: "arrow.clockwise") }
                            .labelStyle(.bfhrCompact)
                    }
                    .buttonStyle(.bfhrPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityFocused($focusesAction)
                }
                if let goBack {
                    Button(action: goBack) { Text(Strings.goBack) }
                        .buttonStyle(failure.isRetryable && retry != nil ? .bfhrSecondary : .bfhrPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let details = failure.details {
                    Button {
                        copyToPasteboard(details)
                    } label: {
                        Label { Text(Strings.copyDetails) } icon: { Image(systemName: "doc.on.doc") }
                            .labelStyle(.bfhrCompact)
                    }
                    .buttonStyle(.bfhrPlain)
                    .font(.bfhr(.footnote))
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(BFHRSpace.s6)
        .frame(maxWidth: 480)
    }

    private func copyToPasteboard(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #elseif canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
    }
}
