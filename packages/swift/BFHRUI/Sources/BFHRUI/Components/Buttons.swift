import BFHRDesignTokens
import SwiftUI

/// Button variants (system.md "Button"): one `primary` per view; `secondary` next to it; `plain`
/// for low emphasis; `destructive` only for deleting things (filled red only inside a
/// confirmation dialog, which iOS draws itself). Every size is at least 44 pt tall, labels wrap
/// instead of truncating, and paired buttons stack via `ButtonPair` when they don't fit.
public struct BFHRButtonStyle: ButtonStyle {
    public enum Variant: Sendable {
        case primary
        case secondary
        case plain
        case destructive
    }

    public var variant: Variant
    /// Full width (sticky bars, sheets) or hugging the label.
    public var fullWidth: Bool

    @Environment(\.isEnabled) private var isEnabled

    public init(_ variant: Variant, fullWidth: Bool = false) {
        self.variant = variant
        self.fullWidth = fullWidth
    }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fixedSize(horizontal: false, vertical: true)
            .font(.bfhr(.body, emphasized: variant == .primary))
            .multilineTextAlignment(.center)
            .foregroundStyle(foreground)
            .padding(.horizontal, variant == .plain ? BFHRSpace.s2 : BFHRSpace.s4)
            .padding(.vertical, BFHRSpace.s2)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: BFHRHitTarget.minimum)
            .background(background(pressed: configuration.isPressed), in: BFHRRadius.shape(BFHRRadius.md))
            .overlay {
                if variant == .secondary {
                    BFHRRadius.shape(BFHRRadius.md)
                        .strokeBorder(isEnabled ? BFHRColor.Line.control : BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.thin)
                }
            }
            .contentShape(BFHRRadius.shape(BFHRRadius.md))
    }

    private var foreground: Color {
        guard isEnabled else { return BFHRColor.Fg.disabled }
        return switch variant {
        case .primary: BFHRColor.Fg.onAccent
        case .secondary: BFHRColor.Fg.primary
        case .plain: BFHRColor.Accent.text
        case .destructive: BFHRTone.danger.text
        }
    }

    private func background(pressed: Bool) -> Color {
        switch variant {
        case .primary:
            guard isEnabled else { return BFHRColor.Surface.sunken }
            return pressed ? BFHRColor.Accent.pressed : BFHRColor.Accent.solid
        case .secondary: return pressed ? BFHRColor.Surface.hover : BFHRColor.Surface.base
        case .plain: return pressed ? BFHRColor.Surface.hover : .clear
        case .destructive: return BFHRTone.danger.subtle
        }
    }
}

extension ButtonStyle where Self == BFHRButtonStyle {
    public static var bfhrPrimary: BFHRButtonStyle { BFHRButtonStyle(.primary) }
    public static var bfhrSecondary: BFHRButtonStyle { BFHRButtonStyle(.secondary) }
    public static var bfhrPlain: BFHRButtonStyle { BFHRButtonStyle(.plain) }
    public static var bfhrDestructive: BFHRButtonStyle { BFHRButtonStyle(.destructive) }

    public static func bfhr(_ variant: BFHRButtonStyle.Variant, fullWidth: Bool = false) -> BFHRButtonStyle {
        BFHRButtonStyle(variant, fullWidth: fullWidth)
    }
}

/// A primary + secondary pair: side by side in equal halves when both labels fit on one line in
/// half the width, stacked (primary on top) otherwise, as German labels and large text sizes often
/// need. Labels are never truncated or shrunk; stacked labels wrap.
public struct ButtonPair<Primary: View, Secondary: View>: View {
    private let primary: Primary
    private let secondary: Secondary

    public init(@ViewBuilder primary: () -> Primary, @ViewBuilder secondary: () -> Secondary) {
        self.primary = primary()
        self.secondary = secondary()
    }

    public var body: some View {
        ButtonPairLayout(spacing: BFHRSpace.s2) {
            primary.buttonStyle(.bfhr(.primary, fullWidth: true))
            secondary.buttonStyle(.bfhr(.secondary, fullWidth: true))
        }
    }
}

/// Lays out [primary, secondary]: secondary | primary in equal halves when each one's one-line
/// ideal width fits in half, else primary over secondary at full width.
struct ButtonPairLayout: Layout {
    var spacing: CGFloat

    static func isSideBySide(idealWidths: [CGFloat], available: CGFloat, spacing: CGFloat) -> Bool {
        guard available.isFinite else { return true }
        let half = (available - spacing) / 2
        // `ceil` + 1 pt: a label measured at exactly its fractional ideal width can still truncate
        // once pixel-rounded, so side by side needs a little slack.
        return idealWidths.allSatisfy { $0.rounded(.up) + 1 <= half }
    }

    private func sideBySide(_ subviews: Subviews, width: CGFloat) -> Bool {
        Self.isSideBySide(
            idealWidths: subviews.map { $0.sizeThatFits(.unspecified).width },
            available: width,
            spacing: spacing
        )
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let width = proposal.width ?? subviews.map { $0.sizeThatFits(.unspecified).width }.reduce(spacing, +)
        if sideBySide(subviews, width: width) {
            let half = ProposedViewSize(width: (width - spacing) / 2, height: nil)
            return CGSize(width: width, height: subviews.map { $0.sizeThatFits(half).height }.max() ?? 0)
        }
        let full = ProposedViewSize(width: width, height: nil)
        let heights = subviews.map { $0.sizeThatFits(full).height }
        return CGSize(width: width, height: heights.reduce(spacing, +))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let primary = subviews[0], secondary = subviews[1]
        if sideBySide(subviews, width: bounds.width) {
            let half = (bounds.width - spacing) / 2
            // Height unconstrained: a label that wraps grows the button instead of truncating.
            let size = ProposedViewSize(width: half, height: nil)
            secondary.place(at: CGPoint(x: bounds.minX, y: bounds.minY), proposal: size)
            primary.place(at: CGPoint(x: bounds.minX + half + spacing, y: bounds.minY), proposal: size)
        } else {
            let full = ProposedViewSize(width: bounds.width, height: nil)
            let primaryHeight = primary.sizeThatFits(full).height
            primary.place(at: CGPoint(x: bounds.minX, y: bounds.minY), proposal: full)
            secondary.place(at: CGPoint(x: bounds.minX, y: bounds.minY + primaryHeight + spacing), proposal: full)
        }
    }
}

/// An icon-only button with an accessible name and a 44 pt target (components.md `IconButton`).
public struct IconButton: View {
    private let title: LocalizedStringResource
    private let systemImage: String
    private let action: () -> Void

    public init(_ title: LocalizedStringResource, systemImage: String, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.bfhr(.body))
                .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .foregroundStyle(BFHRColor.Accent.text)
        .accessibilityLabel(Text(title))
    }
}
