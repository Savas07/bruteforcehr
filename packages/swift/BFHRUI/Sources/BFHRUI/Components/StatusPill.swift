import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Dot + status label in the status tone (system.md "StatusPill"). The label carries the meaning;
/// the dot is decorative. Rejected reads "Not selected" in the neutral Closed tone, never red.
/// The interactive variant opens Move to… (`StatusMenu`).
public struct StatusPill: View {
    public enum Size: Sendable {
        /// Dense lists: caption.
        case small
        /// Rows and headers: footnote.
        case regular
    }

    private let status: ApplicationStatus
    private let size: Size
    private let isPendingSync: Bool
    private let onTap: (() -> Void)?

    public init(_ status: ApplicationStatus, size: Size = .regular, isPendingSync: Bool = false, onTap: (() -> Void)? = nil) {
        self.status = status
        self.size = size
        self.isPendingSync = isPendingSync
        self.onTap = onTap
    }

    public var body: some View {
        if let onTap {
            Button(action: onTap) { pill }
                .buttonStyle(.plain)
                .frame(minHeight: BFHRHitTarget.minimum)
                .contentShape(Rectangle())
                .accessibilityLabel(accessibilityLabel)
                .accessibilityHint(Text(Strings.statusPillHint))
        } else {
            pill
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(accessibilityLabel)
        }
    }

    private var pill: some View {
        let tone = status.tone
        return HStack(spacing: BFHRSpace.s1) {
            ToneDot(tone: tone)
            Text(status.label)
                .font(.bfhr(size == .small ? .caption1 : .footnote, emphasized: true))
                .foregroundStyle(tone.text)
                .fixedSize(horizontal: false, vertical: true)
            if isPendingSync { SyncGlyph() }
            if onTap != nil {
                Image(systemName: "chevron.down")
                    .font(.bfhr(.caption2, emphasized: true))
                    .foregroundStyle(tone.text)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, BFHRSpace.s2)
        .padding(.vertical, size == .small ? 2 : BFHRSpace.s1)
        .background(tone.subtle, in: Capsule())
    }

    private var accessibilityLabel: Text {
        Text(Strings.statusPillLabel(status))
    }
}

/// The 8 pt tone dot used by pills, section headers and stage strips. Decorative.
public struct ToneDot: View {
    private let tone: BFHRTone
    @ScaledMetric(relativeTo: .footnote) private var diameter: CGFloat = 8

    public init(tone: BFHRTone) {
        self.tone = tone
    }

    public var body: some View {
        Circle()
            .fill(tone.solid)
            .frame(width: diameter, height: diameter)
            .accessibilityHidden(true)
    }
}

/// A phase or status section header: dot, label and a plain-text count (never a badge).
public struct StatusHeader: View {
    private let label: LocalizedStringResource
    private let tone: BFHRTone
    private let count: Int?

    public init(status: ApplicationStatus, count: Int?) {
        self.label = status.label
        self.tone = status.tone
        self.count = count
    }

    public init(phase: StatusPhase, count: Int?) {
        self.label = phase.label
        self.tone = phase.tone
        self.count = count
    }

    public var body: some View {
        HStack(spacing: BFHRSpace.s2) {
            ToneDot(tone: tone)
            Text(label)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            if let count {
                Text(count, format: .number)
                    .font(.bfhr(.subheadline))
                    .monospacedDigit()
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}
