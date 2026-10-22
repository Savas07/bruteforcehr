import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Icon and title side by side with a fixed `BFHRSpace.s1` gap, first-baseline aligned. Use it
/// for any `Label` inside a capsule or a `List` row: the default style in an iOS 26 list row puts
/// the title into the row's text column, leaving a wide gap after the icon.
public struct CompactLabelStyle: LabelStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
            configuration.icon
            configuration.title
        }
    }
}

extension LabelStyle where Self == CompactLabelStyle {
    public static var bfhrCompact: CompactLabelStyle { CompactLabelStyle() }
}

/// Provenance (components.md `SourceTag`): where a value or change came from. Caption text with a
/// glyph, neutral colors; automatic sources read "Automatic · Mail".
public struct SourceTag: View {
    public enum Source: Hashable, Sendable {
        case cv
        case email
        case automatic(EventActor)
        case user

        var glyph: String {
            switch self {
            case .cv: "doc.text"
            case .email: "envelope"
            case .automatic: "envelope.badge"
            case .user: "person"
            }
        }

        var label: LocalizedStringResource {
            switch self {
            case .cv: Strings.sourceCV
            case .email: Strings.sourceEmail
            case .automatic(let actor): actor.label
            case .user: EventActor.user.label
            }
        }
    }

    private let source: Source

    public init(_ source: Source) {
        self.source = source
    }

    /// Hugs its label on one line when it fits. Next to other items, lay it out in `ChipFlow`
    /// (not an `HStack`), so neighbors move to the next line instead of squeezing the tag; it only
    /// wraps when it alone is wider than the row (AX sizes).
    public var body: some View {
        Label { Text(source.label) } icon: { Image(systemName: source.glyph) }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.caption1))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, 2)
            .background(BFHRColor.Surface.sunken, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// "AI-assisted" chip with the sparkle (decisions.md D13).
public struct AiBadge: View {
    private let label: LocalizedStringResource

    /// - Parameter label: `Strings.aiAssisted` (default) or `Strings.aiSummaryLabel` on match summaries.
    public init(_ label: LocalizedStringResource = Strings.aiAssisted) {
        self.label = label
    }

    public var body: some View {
        Label { Text(label) } icon: { Image(systemName: "sparkles") }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.caption1, emphasized: true))
            .foregroundStyle(BFHRTone.info.text)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, 2)
            .background(BFHRTone.info.subtle, in: Capsule())
    }
}

/// The always-visible AI disclaimer line under AI-written text.
public struct AiDisclosureLine: View {
    public init() {}

    public var body: some View {
        Label { Text(Strings.aiDisclaimer) } icon: { Image(systemName: "sparkles") }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
    }
}

/// "Needs a look": amber dot + text with an optional reason (components.md `ConfidenceTag`).
/// Never red.
public struct ConfidenceTag: View {
    private let reason: LocalizedStringResource?

    public init(reason: LocalizedStringResource? = nil) {
        self.reason = reason
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label { Text(Strings.needsALook) } icon: {
                Image(systemName: "info.circle")
            }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.caption1, emphasized: true))
            .foregroundStyle(BFHRTone.warning.text)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, 2)
            .background(BFHRTone.warning.subtle, in: Capsule())
            if let reason {
                Text(reason)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// A labelled wait that names the work (components.md `ProgressNote`): activity indicator + text,
/// and "This can take up to a minute…" after `BFHRTiming.longWait`. Never blocks navigation.
public struct ProgressNote: View {
    private let label: LocalizedStringResource
    @State private var isLong = false

    public init(_ label: LocalizedStringResource) {
        self.label = label
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
            ProgressView()
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if isLong {
                    Text(Strings.longWait)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .task {
            try? await Task.sleep(for: .seconds(BFHRTiming.longWait))
            if !Task.isCancelled { isLong = true }
        }
    }
}

/// A filter / choice chip (components.md `Chip`): capsule toggle with a ✓ when selected, never
/// color alone. Lay several out with `ChipFlow`.
public struct ChipToggleStyle: ToggleStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: BFHRSpace.s1) {
                if configuration.isOn {
                    Image(systemName: "checkmark").font(.bfhr(.caption1, emphasized: true))
                }
                configuration.label
            }
            .font(.bfhr(.subheadline, emphasized: configuration.isOn))
            .foregroundStyle(configuration.isOn ? BFHRColor.Accent.text : BFHRColor.Fg.primary)
            .padding(.horizontal, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum)
            .background(configuration.isOn ? BFHRColor.Accent.subtle : BFHRColor.Surface.base, in: Capsule())
            .overlay(Capsule().strokeBorder(configuration.isOn ? BFHRColor.Accent.text : BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(configuration.isOn ? [.isSelected] : [])
    }
}

extension ToggleStyle where Self == ChipToggleStyle {
    public static var bfhrChip: ChipToggleStyle { ChipToggleStyle() }
}

/// Wraps chips onto as many lines as needed; at accessibility sizes each chip gets its own line.
public struct ChipFlow: Layout {
    public var spacing: CGFloat

    public init(spacing: CGFloat = BFHRSpace.s2) {
        self.spacing = spacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
                x += min(size.width, bounds.width) + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
            let itemWidth = min(size.width, width)
            if !row.indices.isEmpty && row.width + spacing + itemWidth > width {
                rows.append(row)
                row = Row()
            }
            row.width += (row.indices.isEmpty ? 0 : spacing) + itemWidth
            row.height = max(row.height, size.height)
            row.indices.append(index)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/// The avatar button on every tab root (IA.md): initials monogram, amber dot when a mail account
/// needs attention. Opens Settings.
public struct AvatarButton: View {
    private let name: String
    private let needsAttention: Bool
    private let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var diameter: CGFloat = 32

    public init(name: String, needsAttention: Bool = false, action: @escaping () -> Void) {
        self.name = name
        self.needsAttention = needsAttention
        self.action = action
    }

    static func initials(of name: String) -> String {
        name.split(separator: " ").prefix(2).compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    public var body: some View {
        Button(action: action) {
            Text(Self.initials(of: name))
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Accent.text)
                .frame(width: diameter, height: diameter)
                .background(BFHRColor.Accent.subtle, in: Circle())
                .overlay(alignment: .topTrailing) {
                    if needsAttention {
                        Circle()
                            .fill(BFHRTone.warning.solid)
                            .overlay(Circle().strokeBorder(BFHRColor.Surface.base, lineWidth: BFHRBorderWidth.thick))
                            .frame(width: 12, height: 12)
                            .offset(x: 2, y: -2)
                    }
                }
                .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(Strings.settings))
        .accessibilityValue(needsAttention ? Text(Strings.accountNeedsAttention) : Text(verbatim: ""))
    }
}
