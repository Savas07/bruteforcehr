import BFHRCore
import BFHRDesignTokens
import SwiftUI

// The Pipeline's parts (tracker.md "Components needed"): ApplicationRow, StageIndexStrip,
// PipelineSection header, the drag drop panel and the skeleton.

/// One application (`ApplicationRow`): monogram (envelope badge when the last move came from an
/// email), role, company, days in stage, and a second line only when there is something next.
/// At accessibility sizes the decorative monogram steps aside so the role keeps whole words, and
/// the envelope moves next to the day count.
struct PipelineRowView: View {
    let row: PipelineRow
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var isLarge: Bool { dynamicTypeSize.isAccessibilitySize }

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            if !isLarge {
                CompanyMonogram(row.company, badge: row.lastMoveAutomatic ? "envelope.fill" : nil)
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                    Text(verbatim: row.role)
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .lineLimit(isLarge ? nil : 2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !isLarge { trailing }
                }
                Text(verbatim: row.company.name)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                NextStepLine(step: row.secondLine)
                    .font(.bfhr(.footnote))
                    .padding(.top, 2)
                if isLarge { trailing }
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
            if isLarge, row.lastMoveAutomatic {
                Image(systemName: "envelope.fill").accessibilityHidden(true)
            }
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
/// `.none`. One `Text`, so it wraps as a sentence at large sizes instead of truncating the day.
struct NextStepLine: View {
    let step: ApplicationNextStep
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        switch step {
        case .interview(let startsAt, _):
            line(glyph: "calendar", tone: BFHRColor.Accent.text, text: Text(TrackerBoardStrings.interview), day: dayAndTime(startsAt))
        case .nextAction(let text, let dueAt):
            line(glyph: "checklist", tone: BFHRColor.Fg.secondary, text: Text(verbatim: text), day: dueAt.map(day))
        case .stale(let days):
            line(glyph: "hourglass", tone: BFHRColor.Fg.secondary, text: Text(TrackerBoardStrings.noReply(days)), day: nil)
        case .none:
            EmptyView()
        }
    }

    private func line(glyph: String, tone: Color, text: Text, day: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
            Image(systemName: glyph).accessibilityHidden(true)
            if let day {
                Text("\(text) · \(day)")
            } else {
                text
            }
        }
        .foregroundStyle(tone)
    }

    private func day(_ date: Date) -> String {
        DateText.relativeDay(date, now: now, locale: locale, calendar: calendar)
    }

    private func dayAndTime(_ date: Date) -> String {
        DateText.dayAndTime(date, now: now, locale: locale, calendar: calendar)
    }
}

/// Drop handling shared by the strip and the drop panel: which stage is under the finger, and
/// what to do when it changes or a row lands.
struct StageDrop {
    var hovered: ApplicationStatus?
    var onTarget: (ApplicationStatus, Bool) -> Void
    var onDrop: ([String], ApplicationStatus) -> Bool
}

extension View {
    /// Makes a stage chip a drop target for a dragged application id.
    func stageDropTarget(_ status: ApplicationStatus, _ drop: StageDrop) -> some View {
        dropDestination(for: String.self) { items, _ in
            drop.onDrop(items, status)
        } isTargeted: { targeted in
            drop.onTarget(status, targeted)
        }
    }
}

/// The stage index strip (`StageIndexStrip`): one tab per section with its count. Empty stages
/// are dimmed but still tappable; a tap scrolls to (and opens) that section. While a row is
/// dragged, each chip is a drop target: the one under the finger fills with the accent and grows.
struct StageStrip: View {
    let stages: [StageCount]
    let drop: StageDrop
    let onSelect: (ApplicationStatus) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: BFHRSpace.s2) {
                ForEach(stages) { stage in
                    let isHovered = drop.hovered == stage.status
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
                            isHovered ? BFHRColor.Accent.subtle : stage.isEmpty ? Color.clear : BFHRColor.Surface.sunken,
                            in: Capsule()
                        )
                        .overlay(
                            Capsule().strokeBorder(
                                isHovered ? BFHRColor.Accent.solid : BFHRColor.Line.subtle,
                                lineWidth: isHovered ? BFHRBorderWidth.thick : BFHRBorderWidth.hairline
                            )
                        )
                        .scaleEffect(isHovered && !reduceMotion ? 1.06 : 1)
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .stageDropTarget(stage.status, drop)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(Text(TrackerBoardStrings.stageHint))
                }
            }
            .padding(.horizontal, BFHRSpace.s4)
            .padding(.vertical, BFHRSpace.s1)
            .animation(BFHRMotion.animation(.fast, easing: .standard, reduceMotion: reduceMotion), value: drop.hovered)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(TrackerBoardStrings.stagesLabel))
        .accessibilityIdentifier("tracker.stageStrip")
    }
}

/// A sticky stage section header (`PipelineSection`): dot, label, count and a chevron that
/// collapses the section. Empty stages are a single quiet line without a chevron. The first stage
/// of a phase carries the phase name above it (Shortlist, In progress, Closed).
struct StageSectionHeader: View {
    let section: PipelineSection
    let isExpanded: Bool
    var phaseCaption: StatusPhase?
    let toggle: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let phaseCaption {
                Text(phaseCaption.label)
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .textCase(.uppercase)
                    .padding(.top, BFHRSpace.s3)
                    .accessibilityAddTraits(.isHeader)
            }
            if section.isEmpty {
                label
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
        .padding(.horizontal, BFHRSpace.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Opaque while pinned, so rows scrolling underneath never collide with the label.
        .background(BFHRColor.background)
        .listRowInsets(EdgeInsets())
    }

    private var label: some View {
        HStack(spacing: BFHRSpace.s2) {
            ToneDot(tone: section.status.tone)
            Text(section.status.label)
                .font(.bfhr(.subheadline, emphasized: !section.isEmpty))
                .foregroundStyle(section.isEmpty ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
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

/// While an application is dragged and the strip has scrolled away: every stage as a drop chip
/// pinned over the top of the list, so a long move (Saved → Offer, or to an outcome) needs no
/// scrolling. The title names the destination under the finger ("Move to Screening"); targets the
/// state machine refuses are dimmed and explain themselves in a toast if dropped on.
struct DropPanel: View {
    let targets: [MoveTarget]
    let drop: StageDrop
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            Text(drop.hovered.map(TrackerBoardStrings.moveTo) ?? TrackerBoardStrings.dropHint)
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
        .animation(BFHRMotion.animation(.fast, easing: .standard, reduceMotion: reduceMotion), value: drop.hovered)
    }

    private func chip(_ target: MoveTarget) -> some View {
        let isHovered = drop.hovered == target.status
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
        .scaleEffect(isHovered && !reduceMotion ? 1.06 : 1)
        .stageDropTarget(target.status, drop)
    }
}

/// Loading: the real scope tabs and stage headers (statuses are static) with "–" counts, and two
/// row-shaped placeholders per stage. Only the data is skeleton.
struct TrackerSkeleton: View {
    var body: some View {
        List {
            Section {
                Picker(selection: .constant(PipelineScope.active)) {
                    ForEach(PipelineScope.allCases) { scope in Text(scope.label).tag(scope) }
                } label: {
                    Text(TrackerBoardStrings.scopeLabel)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .disabled(true)
                .unredacted()
                .listRowSeparator(.hidden)
            }
            ForEach([ApplicationStatus.applied, .screening, .interviewing], id: \.self) { status in
                Section {
                    ForEach(0..<2, id: \.self) { index in
                        PipelineRowView(row: .placeholder(status, index: index))
                    }
                } header: {
                    HStack(spacing: BFHRSpace.s2) {
                        ToneDot(tone: status.tone)
                        Text(status.label)
                            .font(.bfhr(.subheadline, emphasized: true))
                            .foregroundStyle(BFHRColor.Fg.primary)
                        Text(verbatim: "–").foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    .textCase(nil)
                    .frame(minHeight: BFHRHitTarget.minimum)
                    .unredacted()
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
