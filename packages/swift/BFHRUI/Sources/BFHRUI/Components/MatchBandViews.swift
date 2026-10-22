import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The band label (job-detail.md "Findings"): lists show the band, detail adds "72 of 100".
/// Strong and Good use the accent family; Partial and Stretch stay neutral, so a low band never
/// reads as a warning.
public struct MatchBandPill: View {
    private let score: Int

    public init(score: Int) {
        self.score = score
    }

    public var body: some View {
        let band = matchBand(score)
        let isHigh = band == .strong || band == .good
        Text(band.label)
            .font(.bfhr(.caption1, emphasized: true))
            .foregroundStyle(isHigh ? BFHRColor.Accent.text : BFHRColor.Fg.secondary)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, 2)
            .background(isHigh ? BFHRColor.Accent.subtle : BFHRColor.Surface.sunken, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(Text(Strings.bandAccessibility(band: band, score: score)))
    }
}

/// Four labelled segments (Stretch · Partial · Good · Strong) with a marker at the score. The
/// segment the score falls in is filled. Decorative to VoiceOver: the card's label states the
/// band and score.
public struct MatchBandBar: View {
    private struct Segment: Identifiable {
        let band: MatchBand
        let lower: Int
        let upper: Int
        var id: MatchBand { band }
        var fraction: CGFloat { CGFloat(upper - lower) / 100 }
    }

    private let score: Int
    @ScaledMetric(relativeTo: .caption) private var barHeight: CGFloat = 6

    public init(score: Int) {
        self.score = min(max(score, 0), 100)
    }

    private var segments: [Segment] {
        let t = MatchBand.thresholds
        return [
            Segment(band: .stretch, lower: 0, upper: t.partial),
            Segment(band: .partial, lower: t.partial, upper: t.good),
            Segment(band: .good, lower: t.good, upper: t.strong),
            Segment(band: .strong, lower: t.strong, upper: 100),
        ]
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
            GeometryReader { proxy in
                track(width: proxy.size.width)
            }
            .frame(height: barHeight * 2)
            HStack(spacing: 0) {
                ForEach(segments) { segment in
                    segmentLabel(segment)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func track(width: CGFloat) -> some View {
        let current = matchBand(score)
        let marker = barHeight * 2
        let markerX = min(max(0, width * CGFloat(score) / 100 - barHeight), max(0, width - marker))
        return ZStack(alignment: .leading) {
            HStack(spacing: 2) {
                ForEach(segments) { segment in
                    let color: Color = segment.band == current ? BFHRColor.Chart.series : BFHRColor.Chart.grid
                    Capsule()
                        .fill(color)
                        .frame(width: max(0, width * segment.fraction - 2), height: barHeight)
                }
            }
            Circle()
                .fill(BFHRColor.Surface.base)
                .overlay(Circle().strokeBorder(BFHRColor.Chart.series, lineWidth: BFHRBorderWidth.thick))
                .frame(width: marker, height: marker)
                .offset(x: markerX)
        }
        .frame(height: marker)
    }

    private func segmentLabel(_ segment: Segment) -> some View {
        let isCurrent = segment.band == matchBand(score)
        return Text(segment.band.shortLabel)
            .font(.bfhr(.caption2, emphasized: isCurrent))
            .foregroundStyle(isCurrent ? BFHRColor.Fg.primary : BFHRColor.Fg.tertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
