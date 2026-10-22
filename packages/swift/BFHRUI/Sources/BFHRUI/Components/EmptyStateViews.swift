import BFHRDesignTokens
import SwiftUI

/// The four empty-state kinds (system.md "Empty states"). `firstUse` and `caughtUp` follow the
/// `ContentUnavailableView` layout (centered glyph, title, message, actions) with a monochrome
/// ≤ 48 pt glyph; `noResults` is text only with
/// "Clear filters"; `subArea` is one muted line (or use `GhostRow`). Copy says what arrives here
/// and how to start, never praise.
public struct EmptyState: View {
    public enum Kind: Sendable {
        case firstUse
        case noResults
        case caughtUp
        case subArea
    }

    public struct Action {
        public var title: LocalizedStringResource
        public var perform: () -> Void

        public init(_ title: LocalizedStringResource, perform: @escaping () -> Void) {
            self.title = title
            self.perform = perform
        }
    }

    private let kind: Kind
    private let glyph: String?
    private let title: LocalizedStringResource
    private let message: LocalizedStringResource?
    private let primary: Action?
    private let secondary: Action?

    public init(
        _ kind: Kind,
        glyph: String? = nil,
        title: LocalizedStringResource,
        message: LocalizedStringResource? = nil,
        primary: Action? = nil,
        secondary: Action? = nil
    ) {
        self.kind = kind
        self.glyph = glyph
        self.title = title
        self.message = message
        self.primary = primary
        self.secondary = secondary
    }

    public var body: some View {
        switch kind {
        case .firstUse, .caughtUp:
            // ContentUnavailableView's layout with our own colors: inside its label slot the system
            // styles glyph and title as one element, which failed the contrast audit in dark mode.
            VStack(spacing: BFHRSpace.s4) {
                if let glyph {
                    Image(systemName: glyph)
                        .font(.system(size: BFHRIconSize.empty * 0.8))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                        .accessibilityHidden(true)
                }
                VStack(spacing: BFHRSpace.s2) {
                    Text(bfhrPlain: title)
                        .font(.bfhr(.title3, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let message {
                        Text(bfhrPlain: message)
                            .font(.bfhr(.body))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .multilineTextAlignment(.center)
                actions
            }
            .padding(BFHRSpace.s6)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .noResults:
            VStack(spacing: BFHRSpace.s2) {
                Text(bfhrPlain: title)
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let message {
                    Text(bfhrPlain: message)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let primary {
                    Button(action: primary.perform) { Text(primary.title) }
                        .buttonStyle(.bfhrPlain)
                }
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, BFHRSpace.s8)
        case .subArea:
            Text(bfhrPlain: title)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.tertiary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private var actions: some View {
        if let primary, let secondary {
            ButtonPair {
                Button(action: primary.perform) { Text(primary.title) }
            } secondary: {
                Button(action: secondary.perform) { Text(secondary.title) }
            }
        } else if let primary {
            Button(action: primary.perform) { Text(primary.title) }
                .buttonStyle(.bfhrPrimary)
        }
    }
}

/// "+ Add your first role" inside an empty section or stage (components.md `GhostRow`).
public struct GhostRow: View {
    private let title: LocalizedStringResource
    private let action: () -> Void

    public init(_ title: LocalizedStringResource, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Label { Text(title) } icon: { Image(systemName: "plus") }
                .labelStyle(.bfhrCompact)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Accent.text)
                .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
