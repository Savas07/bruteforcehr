import BFHRCore
import BFHRDesignTokens
import SwiftUI

// "How it fits" (job-detail.md "Findings" + "Decision — iOS" 3): band first, "72 of 100" second,
// the segmented band bar, basis + freshness, evidence counts, reasons and gaps with their
// evidence, the labelled AI summary, and the full breakdown sheet.

/// `MatchSummaryCard`: band label, "72 of 100", band bar, "Based on “…” · updated …". One
/// VoiceOver element: "Strong match, 84 of 100. Based on …".
struct MatchScoreCard: View {
    let match: JobDetailModel.ScoredMatch
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        let isHigh = match.band == .strong || match.band == .good
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: BFHRSpace.s2))
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            layout {
                Text(match.band.label)
                    .font(.bfhr(.title3, emphasized: true))
                    .foregroundStyle(isHigh ? BFHRColor.Accent.text : BFHRColor.Fg.primary)
                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: BFHRSpace.s2) }
                Text(MatchBand.scoreCaption(match.score))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .monospacedDigit()
            }
            // The segment labels are a legend under a decorative bar (the band is named above at
            // full size); past xLarge four labels can't share the width without breaking words.
            MatchBandBar(score: match.score)
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
            Text(verbatim: basis)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, BFHRSpace.s2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "\(String(localized: Strings.bandAccessibility(band: match.band, score: match.score))). \(basis)"))
    }

    private var basis: String {
        let updated = JobDetailFormat.relativeTime(match.computedAt, now: now, locale: locale, calendar: calendar)
        let resource = match.basis.cvTitle.map { JobDetailViewStrings.basis(cv: $0, updated: updated) }
            ?? JobDetailViewStrings.basisRemovedCV(updated: updated)
        return String(localized: resource)
    }
}

/// Evidence counts: "Requirements: 2 of 3 met · Skills: 5 of 6 match · Gaps to consider: 1".
struct MatchCounts: View {
    let match: JobDetailModel.ScoredMatch
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            if match.requirementsTotal > 0 {
                row(JobDetailViewStrings.requirementsCount(met: match.requirementsMet, total: match.requirementsTotal), systemImage: "checklist")
            }
            if match.requirementsNotStated > 0 {
                row(JobDetailViewStrings.notStatedCount(match.requirementsNotStated), systemImage: "questionmark.circle")
            }
            if match.skillsTotal > 0 {
                row(JobDetailViewStrings.skillsCount(matched: match.skillsMatched, total: match.skillsTotal), systemImage: "star")
            }
            if match.gapCount > 0 {
                row(JobDetailViewStrings.gapsCount(match.gapCount), systemImage: "circle.dashed")
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func row(_ text: LocalizedStringResource, systemImage: String) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            // The icons are decorative; at AX sizes they'd take a quarter of the line.
            Text(text).foregroundStyle(BFHRColor.Fg.primary).font(.bfhr(.subheadline))
        } else {
            Label {
                Text(text).foregroundStyle(BFHRColor.Fg.primary)
            } icon: {
                Image(systemName: systemImage).foregroundStyle(BFHRColor.Fg.secondary)
            }
            .font(.bfhr(.subheadline))
        }
    }
}

/// `FactorCard`: one reason or requirement with its status glyph, evidence and impact tag.
struct FactorRow: View {
    let factor: JobDetailModel.Factor
    /// The requirement checklist states the status in words ("Partly", "Not stated").
    var showsStatus = false

    var body: some View {
        GlyphLayout {
            FactorGlyph(status: factor.status)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: factor.label)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let evidence = factor.evidence {
                    Text(bfhrPlain: JobDetailViewStrings.evidence(evidence))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                FactorTags(factor: factor, showsStatus: showsStatus || factor.status != .met)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
    }
}

/// `GapRow`: a gap stated about the posting versus the CV, never the person, with "I have this"
/// (skill gaps) and "Add to CV…".
struct GapRow: View {
    let gap: JobDetailModel.Factor
    let onHaveSkill: (String) -> Void
    let onAddToCV: () -> Void

    var body: some View {
        GlyphLayout {
            FactorGlyph(status: gap.status)
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    title
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let evidence = gap.evidence {
                        Text(bfhrPlain: JobDetailViewStrings.evidence(evidence))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    FactorTags(factor: gap, showsStatus: false)
                }
                .accessibilityElement(children: .combine)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: BFHRSpace.s2) { buttons }.fixedSize(horizontal: true, vertical: false)
                    VStack(alignment: .leading, spacing: BFHRSpace.s2) { buttons }
                }
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    private var title: Text {
        if gap.kind == .skill {
            Text(bfhrPlain: JobDetailViewStrings.skillGap(gap.label))
        } else if gap.status == .outsidePrefs {
            Text(bfhrPlain: JobDetailViewStrings.outsidePreferences(gap.label))
        } else {
            Text(verbatim: gap.label)
        }
    }

    @ViewBuilder private var buttons: some View {
        if let skill = gap.skill {
            Button { onHaveSkill(skill) } label: { Text(JobDetailViewStrings.haveThis) }
            .buttonStyle(.bfhrSecondary)
        }
        Button(action: onAddToCV) { Text(JobDetailViewStrings.addToCV) }
        .buttonStyle(.bfhrSecondary)
    }
}

/// Status glyph: never red, never color alone (the row states the status in words).
private struct FactorGlyph: View {
    let status: MatchFactorStatus

    var body: some View {
        let (symbol, color): (String, Color) = switch status {
        case .met: ("checkmark.circle.fill", BFHRColor.Accent.text)
        case .partial: ("circle.lefthalf.filled", BFHRColor.Accent.text)
        case .missing: ("circle.dashed", BFHRColor.Fg.secondary)
        case .outsidePrefs: ("minus.circle", BFHRColor.Fg.secondary)
        case .notStated: ("questionmark.circle", BFHRColor.Fg.secondary)
        }
        Image(systemName: symbol)
            .font(.bfhr(.body))
            .foregroundStyle(color)
            .accessibilityHidden(true)
    }
}

/// `ImpactTag` ("Matters most" / "Matters some"), the status in words, and AI provenance.
private struct FactorTags: View {
    let factor: JobDetailModel.Factor
    let showsStatus: Bool

    var body: some View {
        ChipFlow(spacing: BFHRSpace.s2) {
            tag(JobDetailViewStrings.impact(factor.impact), emphasized: factor.impact == .most)
            if showsStatus {
                tag(JobDetailViewStrings.status(factor.status), emphasized: false)
            }
            if factor.source == .ai {
                AiBadge()
            }
        }
    }

    private func tag(_ text: LocalizedStringResource, emphasized: Bool) -> some View {
        Text(text)
            .font(.bfhr(.caption1, emphasized: emphasized))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, 2)
            // A rounded rectangle, not a capsule: at AX sizes the tag wraps to two lines.
            .background(BFHRColor.Surface.sunken, in: BFHRRadius.shape(BFHRRadius.sm))
    }
}

/// A leading status glyph beside the content; at AX sizes the glyph sits above it so the text
/// keeps the full row width.
struct GlyphLayout<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: BFHRSpace.s3))
        layout { content }
    }
}

/// `AISummaryBlock`: "AI summary · can be wrong", the rationale, 👍 / 👎.
struct AISummaryBlock: View {
    let rationale: String
    let feedback: JobDetailModel.SummaryFeedback?
    let onRate: (JobDetailModel.SummaryFeedback) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            AiBadge(Strings.aiSummaryLabel)
            Text(verbatim: rationale)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .center, spacing: BFHRSpace.s1) {
                Text(feedback == nil ? JobDetailViewStrings.summaryQuestion : JobDetailViewStrings.summaryThanks)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                thumb(.helpful, systemImage: "hand.thumbsup", label: JobDetailViewStrings.summaryUseful)
                thumb(.notHelpful, systemImage: "hand.thumbsdown", label: JobDetailViewStrings.summaryNotUseful)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    private func thumb(_ kind: JobDetailModel.SummaryFeedback, systemImage: String, label: LocalizedStringResource) -> some View {
        let isSelected = feedback == kind
        return Button { onRate(kind) } label: {
            Image(systemName: isSelected ? "\(systemImage).fill" : systemImage)
                .font(.bfhr(.body))
                .foregroundStyle(isSelected ? BFHRColor.Accent.text : BFHRColor.Fg.secondary)
                .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// `MatchBreakdown` (large-detent sheet): requirements checklist, skills, every reason and gap,
/// and "What goes into this score?". Reads the model, so "I have this" updates it in place.
struct MatchBreakdownSheet: View {
    let model: JobDetailModel
    let onHaveSkill: (String) -> Void
    let onAddToCV: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let match = model.match.scored {
                    list(match)
                }
            }
            .navigationTitle(Text(JobDetailViewStrings.match))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(JobDetailViewStrings.done) }
                }
            }
        }
        .environment(\.bfhrNow, model.now)
        .bfhrToastHost()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private func list(_ match: JobDetailModel.ScoredMatch) -> some View {
        List {
            Section {
                MatchScoreCard(match: match)
                MatchCounts(match: match)
            }
            if !match.requirements.isEmpty {
                Section {
                    ForEach(match.requirements) { FactorRow(factor: $0, showsStatus: true) }
                } header: {
                    Text(JobDetailViewStrings.breakdownRequirements)
                }
            }
            if match.skillsTotal > 0 {
                Section {
                    ChipFlow(spacing: BFHRSpace.s2) {
                        ForEach(match.matchedSkills, id: \.self) { SkillTag(name: match.label(forSkill: $0), isMatched: true) }
                        ForEach(match.unmatchedSkills, id: \.self) { SkillTag(name: match.label(forSkill: $0), isMatched: false) }
                    }
                    .padding(.vertical, BFHRSpace.s2)
                } header: {
                    Text(JobDetailViewStrings.breakdownSkills)
                } footer: {
                    Text(JobDetailViewStrings.breakdownSkillsFooter)
                }
            }
            let reasons = match.reasons.filter { $0.kind != .requirement }
            if !reasons.isEmpty {
                Section {
                    ForEach(reasons) { FactorRow(factor: $0) }
                } header: {
                    Text(JobDetailViewStrings.reasons)
                }
            }
            let gaps = match.gaps.filter { $0.kind != .requirement }
            if !gaps.isEmpty {
                Section {
                    ForEach(gaps) { gap in
                        GapRow(gap: gap, onHaveSkill: onHaveSkill, onAddToCV: {
                            dismiss()
                            onAddToCV()
                        })
                    }
                } header: {
                    Text(JobDetailViewStrings.gaps)
                }
            }
            if let rationale = match.rationale {
                Section {
                    AISummaryBlock(rationale: rationale, feedback: model.summaryFeedback, onRate: model.rateSummary)
                } header: {
                    Text(JobDetailViewStrings.summary)
                }
            }
            Section {
                Text(JobDetailViewStrings.explainerBody)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(JobDetailViewStrings.explainer)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            } header: {
                Text(JobDetailViewStrings.explainerTitle)
            }
        }
        .bfhrInsetGroupedList()
    }
}

/// `SkillChips`: skills in your CV get a check and the accent tint (Braintrust); the others stay
/// neutral. Not interactive.
private struct SkillTag: View {
    let name: String
    let isMatched: Bool

    var body: some View {
        Label {
            Text(verbatim: name)
        } icon: {
            Image(systemName: isMatched ? "checkmark" : "circle.dashed")
        }
        .labelStyle(.bfhrCompact)
        .font(.bfhr(.subheadline, emphasized: isMatched))
        .foregroundStyle(isMatched ? BFHRColor.Accent.text : BFHRColor.Fg.secondary)
        .padding(.horizontal, BFHRSpace.s3)
        .padding(.vertical, BFHRSpace.s1)
        .background(isMatched ? BFHRColor.Accent.subtle : BFHRColor.Surface.sunken, in: Capsule())
    }
}
