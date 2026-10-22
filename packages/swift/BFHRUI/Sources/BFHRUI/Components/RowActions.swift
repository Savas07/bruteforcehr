import BFHRDesignTokens
import SwiftUI

// Swipe-action and context-menu conventions (components.md "Menu / ContextMenu", IA.md "iOS
// gestures and menus"): one list of actions per row feeds the leading swipe (primary positive
// action), the trailing swipe (snooze / close / not-for-me), the long-press context menu (every
// action) and the VoiceOver actions rotor, so the four never drift apart.

/// One row action.
public struct RowAction: Identifiable {
    public enum Edge: Sendable {
        /// Leading swipe: the primary positive action (Confirm, Done, Save, Advance).
        case leading
        /// Trailing swipe: Snooze, Close…, Not for me, Change…
        case trailing
        /// Context menu and accessibility rotor only.
        case menuOnly
    }

    public let id: String
    public var title: LocalizedStringResource
    public var systemImage: String
    public var edge: Edge
    /// `.destructive` only for deleting user content; hiding / dismissing / rejecting is never
    /// destructive-styled (calm principle).
    public var role: ButtonRole?
    /// Swipe button tint. Defaults to the accent for leading actions and neutral grey for trailing.
    public var tint: Color?
    /// Haptic played when it runs (`BFHRHaptic.confirm` for Confirm / Save / Mark applied).
    /// Dismissals stay silent.
    public var haptic: BFHRHaptic?
    public var isEnabled: Bool
    public var perform: @MainActor () -> Void

    public init(
        _ title: LocalizedStringResource,
        systemImage: String,
        edge: Edge,
        id: String? = nil,
        role: ButtonRole? = nil,
        tint: Color? = nil,
        haptic: BFHRHaptic? = nil,
        isEnabled: Bool = true,
        perform: @escaping @MainActor () -> Void
    ) {
        self.id = id ?? "\(title.key)"
        self.title = title
        self.systemImage = systemImage
        self.edge = edge
        self.role = role
        self.tint = tint
        self.haptic = haptic
        self.isEnabled = isEnabled
        self.perform = perform
    }
}

private struct RowActionsModifier: ViewModifier {
    let actions: [RowAction]
    @State private var hapticTrigger = 0
    @State private var lastHaptic: BFHRHaptic?

    func body(content: Content) -> some View {
        content
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                ForEach(actions.filter { $0.edge == .leading && $0.isEnabled }) { action in
                    button(for: action).tint(action.tint ?? BFHRColor.Accent.solid)
                }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                ForEach(actions.filter { $0.edge == .trailing && $0.isEnabled }) { action in
                    button(for: action).tint(action.tint ?? BFHRColor.Chart.neutral)
                }
            }
            .contextMenu {
                ForEach(actions) { action in
                    button(for: action).disabled(!action.isEnabled)
                }
            }
            .accessibilityActions {
                ForEach(actions.filter(\.isEnabled)) { action in
                    Button { run(action) } label: { Text(action.title) }
                }
            }
            .sensoryFeedback(trigger: hapticTrigger) { _, _ in lastHaptic?.feedback }
    }

    private func button(for action: RowAction) -> some View {
        Button(role: action.role) { run(action) } label: {
            Label { Text(action.title) } icon: { Image(systemName: action.systemImage) }
        }
    }

    private func run(_ action: RowAction) {
        lastHaptic = action.haptic
        if action.haptic != nil { hapticTrigger += 1 }
        action.perform()
    }
}

extension View {
    /// Attaches swipe actions, a context menu and VoiceOver actions from one action list.
    public func bfhrRowActions(_ actions: [RowAction]) -> some View {
        modifier(RowActionsModifier(actions: actions))
    }

    /// `.sensoryFeedback` with the haptic for a meaning (system.md "Haptics"). Only confirm, drag
    /// target change, reveal and error vibrate.
    public func bfhrHaptic(_ haptic: BFHRHaptic, trigger: some Equatable) -> some View {
        sensoryFeedback(haptic.feedback, trigger: trigger)
    }
}
