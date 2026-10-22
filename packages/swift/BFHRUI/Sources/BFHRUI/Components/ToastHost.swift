import BFHRDesignTokens
import Observation
import SwiftUI

/// One toast at a time for the whole app (decisions.md D12). Inject one instance at the app root
/// with `.environment(toastCenter)`; screens read it with `@Environment(ToastCenter.self)` and
/// call `show(_:)` with the `ToastItem` their model returns.
@Observable
public final class ToastCenter {
    public private(set) var current: ToastItem?
    /// Set by the host from the environment: VoiceOver extends the visible time.
    public var isVoiceOverRunning = false
    private var hideTask: Task<Void, Never>?

    public init() {}

    /// Shows `item`, replacing the current toast (whose change stays undoable elsewhere).
    public func show(_ item: ToastItem) {
        current = item
        AccessibilityNotification.Announcement(item.resolvedMessage).post()
        scheduleHide(after: duration(for: item))
    }

    public func dismiss() {
        hideTask?.cancel()
        current = nil
    }

    /// Runs the current toast's action. After an Undo the follow-up reads "Restored" (+ Open),
    /// never another Undo.
    public func performAction() {
        guard let item = current, let action = item.action else { return }
        action.perform()
        if action.role == .undo {
            let open = action.openAfterRestore.map { ToastAction(label: Strings.open, perform: $0) }
            show(ToastItem(glyph: ToastGlyph.restored, message: Strings.restored, action: open))
        } else {
            dismiss()
        }
    }

    /// `BFHRTiming.toast` (6 s), or `toastExtended` (10 s) with VoiceOver, over 60 characters or
    /// for bulk changes.
    public func duration(for item: ToastItem) -> TimeInterval {
        isVoiceOverRunning || item.isBulk || item.resolvedMessage.count > 60 ? BFHRTiming.toastExtended : BFHRTiming.toast
    }

    private func scheduleHide(after seconds: TimeInterval) {
        hideTask?.cancel()
        let id = current?.id
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled, let self, self.current?.id == id else { return }
            self.current = nil
        }
    }
}

/// The dark snackbar docked 8 pt above the tab bar (or above a screen's sticky bottom bar when the
/// host sits inside that bar's `safeAreaInset`). Swipe down dismisses. At accessibility text sizes
/// or with VoiceOver the action becomes a full-width button.
private struct ToastHostModifier: ViewModifier {
    @Environment(ToastCenter.self) private var center: ToastCenter?
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let center, let item = center.current {
                    ToastView(item: item, perform: center.performAction, dismiss: center.dismiss)
                        .padding(.horizontal, BFHRSpace.s4)
                        .padding(.bottom, BFHRSpace.s2)
                        .transition(
                            .opacity.combined(with: .offset(y: BFHRMotion.distance(reduceMotion: reduceMotion)))
                        )
                        .id(item.id)
                }
            }
            .animation(BFHRMotion.animation(.base, easing: .enter, reduceMotion: reduceMotion), value: center?.current?.id)
            .onChange(of: voiceOver, initial: true) { _, running in center?.isVoiceOverRunning = running }
    }
}

extension View {
    /// Shows `ToastCenter`'s toast at the bottom of this view's safe area. Put it on each tab's
    /// root content; a screen with a sticky bottom bar puts it inside the bar's `safeAreaInset`
    /// content so the toast stacks above the bar.
    public func bfhrToastHost() -> some View {
        modifier(ToastHostModifier())
    }
}

struct ToastView: View {
    let item: ToastItem
    let perform: () -> Void
    let dismiss: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    private var largeTarget: Bool { dynamicTypeSize.isAccessibilitySize || voiceOver }

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
                Image(systemName: item.glyph)
                    .foregroundStyle(BFHRColor.Toast.text)
                    .accessibilityHidden(true)
                Text(bfhrPlain: item.message)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Toast.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !largeTarget, let action = item.action {
                    actionButton(action)
                }
            }
            if largeTarget, let action = item.action {
                actionButton(action)
                    .frame(maxWidth: .infinity)
                    .background(BFHRColor.Toast.border, in: BFHRRadius.shape(BFHRRadius.md))
            }
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, item.action == nil ? BFHRSpace.s3 : BFHRSpace.s1)
        .frame(minHeight: BFHRHitTarget.minimum)
        .background(BFHRColor.Toast.bg, in: BFHRRadius.shape(BFHRRadius.lg))
        .overlay(BFHRRadius.shape(BFHRRadius.lg).strokeBorder(BFHRColor.Toast.border, lineWidth: BFHRBorderWidth.thin))
        .bfhrElevation(.overlay)
        .gesture(DragGesture(minimumDistance: 12).onEnded { value in
            if value.translation.height > 24 { dismiss() }
        })
        .accessibilityElement(children: .contain)
        .accessibilityAction(.escape, dismiss)
    }

    private func actionButton(_ action: ToastAction) -> some View {
        Button(action: perform) {
            Text(action.label)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Toast.action)
                .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
