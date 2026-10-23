import BFHRDesignTokens
import SwiftUI

/// Where the update surfaces send people. iOS can't install updates itself (App Review 2.5.2);
/// TestFlight does. Internal testing has no public join link, so the app opens TestFlight itself.
enum UpdateLinks {
    /// TestFlight's URL scheme: opens the TestFlight app, which lists this app's new build.
    static let testFlightApp = URL(string: "itms-beta://")!
    /// TestFlight on the App Store, for when the TestFlight app isn't installed.
    static let testFlightAppStore = URL(string: "https://apps.apple.com/app/testflight/id899247664")!
    /// The website's Support page (GitHub issues behind an "issues are public" note).
    static let support = URL(string: "https://bruteforcehr.web.app/support/")!
}

extension OpenURLAction {
    /// Opens the TestFlight app, or its App Store page when TestFlight isn't installed.
    func openTestFlight() {
        self(UpdateLinks.testFlightApp) { accepted in
            if !accepted { self(UpdateLinks.testFlightAppStore) }
        }
    }
}

/// "Update available": the `InlineAlert` anatomy (glyph, title, sentence, text action, ✕) in the
/// info tone, with the title in the primary text color (the info-colored title measured only just
/// above 4.5:1 in the audit) on an opaque raised card, so it reads over scrolled content. At
/// accessibility text sizes it collapses to one line, "Update available" as the button that opens
/// TestFlight, + ✕, so it doesn't cover the tab; the version sentence stays in the VoiceOver value.
public struct UpdateBanner: View {
    private let version: AppVersion
    private let onDismiss: () -> Void
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(version: AppVersion, onDismiss: @escaping () -> Void) {
        self.version = version
        self.onDismiss = onDismiss
    }

    public var body: some View {
        let tone = BFHRTone.info
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                compact
            } else {
                regular
            }
        }
        .overlay(BFHRRadius.shape(BFHRRadius.lg).strokeBorder(tone.solid.opacity(0.4), lineWidth: BFHRBorderWidth.hairline))
        // The shadow belongs to the card's shape only: on the whole view, SwiftUI gives every
        // text and button its own shadow, which blurred the text edges (the audit failed
        // "Open TestFlight" on contrast, and a button showed a lifted rectangle).
        .background {
            BFHRRadius.shape(BFHRRadius.lg)
                .fill(tone.subtle)
                .background(BFHRColor.Surface.elevated, in: BFHRRadius.shape(BFHRRadius.lg))
                .bfhrElevation(.raised)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("update.banner")
    }

    private var regular: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            Image(systemName: "arrow.down.app")
                .foregroundStyle(BFHRTone.info.text)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                // Only the title makes room for the ✕ in the top-trailing corner.
                Text(UpdateGateStrings.bannerTitle)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.trailing, BFHRHitTarget.minimum - BFHRSpace.s3)
                    .accessibilityAddTraits(.isHeader)
                Text(UpdateGateStrings.bannerMessage(version.description))
                    .font(.bfhr(.subheadline))
                    .fixedSize(horizontal: false, vertical: true)
                Button { openURL.openTestFlight() } label: { Text(UpdateGateStrings.openTestFlight) }
                    .buttonStyle(.bfhrPlain)
                    .padding(.leading, -BFHRSpace.s2)
            }
            .foregroundStyle(BFHRColor.Fg.primary)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(BFHRSpace.s3)
        .overlay(alignment: .topTrailing) { closeButton }
    }

    private var compact: some View {
        HStack(alignment: .center, spacing: BFHRSpace.s1) {
            Button { openURL.openTestFlight() } label: {
                Text(UpdateGateStrings.bannerTitle)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Accent.text)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(Text(UpdateGateStrings.bannerMessage(version.description)))
            .accessibilityHint(Text(UpdateGateStrings.openTestFlightHint))
            closeButton
        }
        .padding(.leading, BFHRSpace.s3)
        .padding(.vertical, BFHRSpace.s1)
    }

    private var closeButton: some View {
        IconButton(Strings.close, systemImage: "xmark", action: onDismiss)
    }
}

/// "Update required": the only way forward is TestFlight. Shown as a full-screen cover that can't
/// be dismissed (`.bfhrUpdateGate`). The buttons are pinned to the bottom at default text sizes and
/// follow the text at accessibility sizes, where a pinned bar would cut the explanation off.
public struct UpdateRequiredScreen: View {
    private let installed: AppVersion
    private let minimum: AppVersion
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AccessibilityFocusState private var focusesTitle: Bool

    public init(installed: AppVersion, minimum: AppVersion) {
        self.installed = installed
        self.minimum = minimum
    }

    public var body: some View {
        let pinsActions = !dynamicTypeSize.isAccessibilitySize
        ScrollView {
            VStack(alignment: .leading, spacing: BFHRSpace.s4) {
                Image(systemName: "arrow.down.app")
                    .font(.system(size: BFHRIconSize.empty))
                    .foregroundStyle(BFHRColor.Accent.text)
                    .accessibilityHidden(true)
                Text(UpdateGateStrings.requiredTitle)
                    .font(.bfhr(.title1, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($focusesTitle)
                // Each text grows on its own: one `fixedSize` on the stack truncated the last line
                // of the German message at AX5 ("weiterzuma…").
                VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                    Text(UpdateGateStrings.requiredMessage)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(UpdateGateStrings.requiredReassurance)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                Text(UpdateGateStrings.requiredVersions(installed: installed.description, minimum: minimum.description))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if !pinsActions {
                    actions
                        .padding(.top, BFHRSpace.s4)
                }
            }
            .padding(.horizontal, BFHRSpace.s6)
            .padding(.top, BFHRSpace.s12)
            .padding(.bottom, BFHRSpace.s6)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
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
        .background(BFHRColor.Surface.canvas)
        // No navigation bar, so nothing stops scrolled text from running under the status bar:
        // a canvas strip covers the top safe area.
        .overlay(alignment: .top) {
            Color.clear
                .frame(height: 0)
                .background(BFHRColor.Surface.canvas.ignoresSafeArea(edges: .top))
        }
        .onAppear { focusesTitle = true }
        .accessibilityIdentifier("update.required")
    }

    private var actions: some View {
        VStack(spacing: BFHRSpace.s2) {
            Button { openURL.openTestFlight() } label: { Text(UpdateGateStrings.openTestFlight) }
                .buttonStyle(.bfhr(.primary, fullWidth: true))
                .fixedSize(horizontal: false, vertical: true)
            Button { openURL(UpdateLinks.support) } label: { Text(UpdateGateStrings.getHelp) }
                .buttonStyle(.bfhrPlain)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

extension View {
    /// Docks the "Update available" banner above the tab bar (this view's bottom safe-area inset),
    /// so content scrolls to end above it. Put it on each tab's root, outside the screen, so the
    /// screen's toasts stack above it.
    public func bfhrUpdateBanner(_ model: UpdateGateModel) -> some View {
        modifier(UpdateBannerModifier(model: model))
    }

    /// Covers the app with `UpdateRequiredScreen` while `model` is blocked. It can't be dismissed;
    /// it goes away when a later check no longer blocks (e.g. after the update).
    public func bfhrUpdateGate(_ model: UpdateGateModel) -> some View {
        modifier(UpdateGateModifier(model: model))
    }
}

private struct UpdateBannerModifier: ViewModifier {
    let model: UpdateGateModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            if let version = model.bannerVersion {
                UpdateBanner(version: version, onDismiss: model.dismissBanner)
                    .padding(.horizontal, BFHRSpace.s4)
                    .padding(.bottom, BFHRSpace.s2)
                    .transition(.opacity)
            }
        }
        .animation(BFHRMotion.animation(.base, easing: .enter, reduceMotion: reduceMotion), value: model.bannerVersion)
    }
}

private struct UpdateGateModifier: ViewModifier {
    let model: UpdateGateModel

    func body(content: Content) -> some View {
        let isPresented = Binding(get: { model.isBlocked }, set: { _ in })
        #if os(iOS)
        content.fullScreenCover(isPresented: isPresented) { cover }
        #else
        content.sheet(isPresented: isPresented) { cover }
        #endif
    }

    @ViewBuilder private var cover: some View {
        if let requirement = model.requirement {
            UpdateRequiredScreen(installed: requirement.installed, minimum: requirement.minimum)
                .interactiveDismissDisabled()
        }
    }
}
