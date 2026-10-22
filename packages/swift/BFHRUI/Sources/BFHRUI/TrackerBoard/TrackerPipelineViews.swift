import BFHRCore
import BFHRDesignTokens
import SwiftUI

// The Pipeline's parts (tracker.md "Components needed"): ApplicationRow, StageIndexStrip,
// PipelineSection header, the drag drop panel and the skeleton.

/// One application (`ApplicationRow`): monogram (envelope badge when the last move came from an
/// email), role, company, days in stage, and a second line only when there is something next.
struct PipelineRowView: View {
    let row: PipelineRow
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(row.company, badge: row.lastMoveAutomatic ? "envelope.fill" : nil)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                    Text(verbatim: row.role)
                        .font(.bfhr(.headline))
                        .foregroundStyle(row.status.isActive ? BFHRColor.Fg.primary : BFHRColor.Fg.secondary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !dynamicTypeSize.isAccessibilitySize { trailing }
                }
                Text(verbatim: row.company.name)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                NextStepLine(step: row.secondLine)
                    .font(.bfhr(.footnote))
                    .padding(.top, 2)
                if dynamicTypeSize.isAccessibilitySize { trailing }
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
        .accessibilityValue(row.lastMoveAutomatic ? Text(TrackerBoardStrings.autoMoved) : Text(verbatim: ""))
    }

    /// Days in the stage for active rows ("12 d"); the outcome's day for closed ones.
    @ViewBuilder
    private var trailing: some View {
        HStack(spacing: BFHRSpace.s1) {
            if row.pendingSync { SyncGlyph() }
            if row.status.isActive {
                Text(TrackerBoardStrings.daysShort(row.daysInStage))
                    .monospacedDigit()
                    .accessibilityLabel(Text(TrackerBoardStrings.daysInStage(row.daysInStage)))
            } else {
                RelativeTimeText(row.statusChangedAt, style: .day)
            }
        }
        .font(.bfhr(.footnote))
        .foregroundStyle(BFHRColor.Fg.secondary)
    }
}

/// What comes next for an application, one glyph + line: the interview ("Interview · Today,
/// 14:00", accent), the user's next action with its day, or the calm staleness hint. Nothing for
/// `.none`. At large sizes the day moves under the text instead of truncating.
struct NextStepLine: View {
    let step: ApplicationNextStep

    var body: some View {
        switch step {
        case .interview(let startsAt, _):
            line(glyph: "calendar", tone: BFHRColor.Accent.text, text: Text(TrackerBoardStrings.interview), date: startsAt, style: .dayAndTime)
        case .nextAction(let text, let dueAt):
            line(glyph: "checklist", tone: BFHRColor.Fg.secondary, text: Text(verbatim: text), date: dueAt, style: .day)
        case .stale(let days):
            line(glyph: "hourglass", tone: BFHRColor.Fg.secondary, text: Text(TrackerBoardStrings.noReply(days)), date: nil, style: .day)
        case .none:
            EmptyView()
        }
    }

    private func line(glyph: String, tone: Color, text: Text, date: Date?, style: RelativeTimeText.Style) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
            Image(systemName: glyph).accessibilityHidden(true)
            if let date {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
                        text
                        Text(verbatim: "·").accessibilityHidden(true)
                        RelativeTimeText(date, style: style)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        text
                        RelativeTimeText(date, style: style)
                    }
                }
            } else {
                text
            }
        }
        .foregroundStyle(tone)
    }
}

/// The stage index strip (`StageIndexStrip`): one tab per section with its count. Empty stages
/// are dimmed but still tappable; a tap scrolls to (and opens) that section.
struct StageStrip: View {
    let stages: [StageCount]
    let onSelect: (ApplicationStatus) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: BFHRSpace.s2) {
                ForEach(stages) { stage in
                    Button { onSelect(stage.status) } label: {
                        HStack(spacing: BFHRSpace.s1) {
                            ToneDot(tone: stage.status.tone)
                                .opacity(stage.isEmpty ? 0.4 : 1)
                            Text(stage.status.label)
                                .font(.bfhr(.subheadline, emphasized: !stage.isEmpty))
                            Text(stage.count, format: .number)
                                .font(.bfhr(.subheadline))
                                .monospacedDigit()
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                        .foregroundStyle(stage.isEmpty ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
                        .padding(.horizontal, BFHRSpace.s3)
                        .frame(minHeight: BFHRHitTarget.minimum)
                        .background(
                            stage.isEmpty ? Color.clear : BFHRColor.Surface.sunken,
                            in: Capsule()
                        )
                        .overlay(Capsule().strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.hairline))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(Text(TrackerBoardStrings.stageHint))
                }
            }
            .padding(.horizontal, BFHRSpace.s4)
            .padding(.vertical, BFHRSpace.s1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(TrackerBoardStrings.stagesLabel))
    }
}

/// A sticky stage section header (`PipelineSection`): dot, label, count and a chevron that
/// collapses the section. Empty stages are a single quiet line without a chevron.
struct StageSectionHeader: View {
    let section: PipelineSection
    let isExpanded: Bool
    let toggle: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if section.isEmpty {
            label
                .opacity(0.7)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
        } else {
            Button(action: toggle) {
                label
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .accessibilityValue(Text(isExpanded ? TrackerBoardStrings.expanded : TrackerBoardStrings.collapsed))
        }
    }

    private var label: some View {
        HStack(spacing: BFHRSpace.s2) {
            ToneDot(tone: section.status.tone)
            Text(section.status.label)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            Text(section.count, format: .number)
                .font(.bfhr(.subheadline))
                .monospacedDigit()
                .foregroundStyle(BFHRColor.Fg.secondary)
            Spacer(minLength: BFHRSpace.s2)
            if !section.isEmpty {
                Image(systemName: "chevron.down")
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .rotationEffect(.degrees(isExpanded ? 0 : -90))
                    .animation(BFHRMotion.animation(.base, easing: .standard, reduceMotion: reduceMotion), value: isExpanded)
                    .accessibilityHidden(true)
            }
        }
        .textCase(nil)
        .frame(minHeight: BFHRHitTarget.minimum)
    }
}

/// While an application is dragged: every stage as a drop chip pinned over the top of the list,
/// so a long move (Saved → Offer, or to an outcome) needs no scrolling. The title names the
/// destination under the finger ("Move to Screening"); targets the state machine refuses are
/// dimmed and explain themselves in a toast if dropped on.
struct DropPanel: View {
    let targets: [MoveTarget]
    let hovered: ApplicationStatus?
    let onTarget: (ApplicationStatus, Bool) -> Void
    let onDrop: ([String], ApplicationStatus) -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            Text(hovered.map(TrackerBoardStrings.moveTo) ?? TrackerBoardStrings.dropHint)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            ChipFlow(spacing: BFHRSpace.s2) {
                ForEach(targets) { target in
                    chip(target)
                }
            }
        }
        .padding(BFHRSpace.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BFHRColor.Surface.elevated, in: BFHRRadius.shape(BFHRRadius.lg))
        .overlay(BFHRRadius.shape(BFHRRadius.lg).strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.hairline))
        .bfhrElevation(.overlay)
        .padding(.horizontal, BFHRSpace.s3)
        .padding(.top, BFHRSpace.s2)
    }

    private func chip(_ target: MoveTarget) -> some View {
        let isHovered = hovered == target.status
        return HStack(spacing: BFHRSpace.s1) {
            ToneDot(tone: target.status.tone)
            Text(target.status.label)
                .font(.bfhr(.subheadline, emphasized: isHovered))
            if target.isCurrent {
                Image(systemName: "checkmark").font(.bfhr(.caption1, emphasized: true))
            }
        }
        .foregroundStyle(target.isEnabled ? BFHRColor.Fg.primary : BFHRColor.Fg.disabled)
        .padding(.horizontal, BFHRSpace.s3)
        .frame(minHeight: BFHRHitTarget.minimum)
        .background(isHovered ? BFHRColor.Accent.subtle : BFHRColor.Surface.sunken, in: Capsule())
        .overlay(Capsule().strokeBorder(isHovered ? BFHRColor.Accent.solid : BFHRColor.Line.subtle, lineWidth: isHovered ? BFHRBorderWidth.thick : BFHRBorderWidth.hairline))
        .scaleEffect(isHovered ? 1.05 : 1)
        .dropDestination(for: String.self) { items, _ in
            onDrop(items, target.status)
        } isTargeted: { targeted in
            onTarget(target.status, targeted)
        }
    }
}

/// Loading: the real stage headers with "–" counts and two row-shaped placeholders each.
struct TrackerSkeleton: View {
    var body: some View {
        List {
            ForEach([ApplicationStatus.applied, .screening, .interviewing], id: \.self) { status in
                Section {
                    ForEach(0..<2, id: \.self) { index in
                        PipelineRowView(row: .placeholder(status, index: index))
                    }
                } header: {
                    HStack(spacing: BFHRSpace.s2) {
                        ToneDot(tone: status.tone)
                        Text(status.label).font(.bfhr(.subheadline, emphasized: true))
                        Text(verbatim: "–").foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    .textCase(nil)
                    .frame(minHeight: BFHRHitTarget.minimum)
                }
            }
        }
        .listStyle(.plain)
        .scrollDisabled(true)
    }
}

private extension PipelineRow {
    static func placeholder(_ status: ApplicationStatus, index: Int) -> PipelineRow {
        PipelineRow(
            id: "\(status.rawValue)-\(index)", company: CompanyIdentity(name: "Company name"),
            role: index == 0 ? "Frontend Engineer" : "Product Engineer, Platform",
            status: status, statusChangedAt: .distantPast, daysInStage: 3, nextDate: nil,
            secondLine: .none, lastMoveAutomatic: false, pendingSync: false
        )
    }
}
