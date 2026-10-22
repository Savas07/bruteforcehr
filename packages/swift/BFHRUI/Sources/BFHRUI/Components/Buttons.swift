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

/// A primary + secondary pair: side by side when both labels fit, stacked (primary on top) when
/// either needs more than half the width, as German labels often do.
public struct ButtonPair<Primary: View, Secondary: View>: View {
    private let primary: Primary
    private let secondary: Secondary

    public init(@ViewBuilder primary: () -> Primary, @ViewBuilder secondary: () -> Secondary) {
        self.primary = primary()
        self.secondary = secondary()
    }

    public var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: BFHRSpace.s2) {
                secondary.buttonStyle(.bfhr(.secondary, fullWidth: true)).fixedSize(horizontal: false, vertical: true)
                primary.buttonStyle(.bfhr(.primary, fullWidth: true)).fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: BFHRSpace.s2) {
                primary.buttonStyle(.bfhr(.primary, fullWidth: true))
                secondary.buttonStyle(.bfhr(.secondary, fullWidth: true))
            }
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
