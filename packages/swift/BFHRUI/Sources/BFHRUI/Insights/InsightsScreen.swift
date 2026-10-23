import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Insights on iPhone (research/insights.md "Decision — iOS"): a single inset-grouped scroll with
/// the range picker, a 2 × 2 KPI grid, the funnel as horizontal bars, "Where do responses come
/// from?", time to first response and the 12-week activity chart. Every bar and row opens the
/// Tracker Pipeline filtered to those applications (`onDrillDown`). Charts never rely on colour:
/// each bar is a button whose VoiceOver label carries its numbers, and each card is titled with a
/// plain sentence.
public struct InsightsScreen: View {
    @Bindable private var model: InsightsModel
    private let onDrillDown: (InsightsDrillDown) -> Void
    @State private var showsAbout = false
    @State private var showsAllRows = false
    @Environment(\.bfhrReload) private var reload
    @Environment(\.locale) private var locale

    public init(model: InsightsModel, onDrillDown: @escaping (InsightsDrillDown) -> Void) {
        self.model = model
        self.onDrillDown = onDrillDown
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: InsightsStrings.loading) {
            content
        } skeleton: {
            InsightsSkeleton()
        } failure: { failure in
            PaneError(failure, title: InsightsStrings.errorTitle, retry: reload)
        }
        .navigationTitle(Text(InsightsStrings.title))
        .bfhrLargeTitle()
        .toolbar {
            ToolbarItem(placement: .bfhrTrailing) {
                Button {
                    showsAbout = true
                } label: {
                    Label { Text(InsightsStrings.about) } icon: { Image(systemName: "info.circle") }
                }
                .disabled(model.phase != .loaded)
            }
        }
        .sheet(isPresented: $showsAbout) { InsightsAboutSheet() }
        .environment(\.bfhrNow, model.now)
    }

    private var content: some View {
        ScrollViewReader { proxy in
            List {
                ConnectionBannerSection(model.connection)
                Section {
                    VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                        Picker(selection: $model.range) {
                            ForEach(InsightsRangePreset.ios, id: \.self) { range in
                                Text(range.shortLabel)
                                    .accessibilityLabel(Text(range.spokenLabel))
                                    .tag(range)
                            }
                        } label: {
                            Text(InsightsStrings.rangeLabel)
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        .accessibilityLabel(Text(InsightsStrings.rangeLabel))
                        if !model.isFirstUse {
                            Text(rangeLine)
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    }
                }
                if model.isFirstUse {
                    Section {
                        EmptyState(.firstUse, glyph: "chart.bar.xaxis", title: InsightsStrings.firstUseTitle, message: InsightsStrings.firstUseBody)
                    }
                } else if model.isEmptyRange {
                    Section {
                        EmptyState(
                            .noResults,
                            title: InsightsStrings.emptyRangeTitle,
                            message: InsightsStrings.emptyRangeBody,
                            primary: .init(InsightsStrings.showAllTime) { model.range = .all }
                        )
                    }
                } else {
                    kpiSection(proxy)
                    funnelSection.id(Card.funnel)
                    breakdownSection.id(Card.breakdown)
                    firstResponseSection.id(Card.firstResponse)
                    activitySection.id(Card.activity)
                }
                Section {
                    EmptyView()
                } footer: {
                    Text(InsightsStrings.provenance)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .bfhrInsetGroupedList()
            #if os(iOS)
            .listSectionSpacing(.compact)
            #endif
            .onAppear {
                if let card = model.scrollTarget { proxy.scrollTo(card, anchor: .top) }
            }
        }
    }

    private typealias Card = InsightsCard


    private var rangeLine: String {
        let range = model.resolvedRange
        guard let from = range.from else { return String(localized: InsightsStrings.rangeAllSpoken) }
        return "\(InsightsFormat.shortDay(from)) – \(InsightsFormat.longDay(range.to))"
    }

    // MARK: KPI grid

    private func kpiSection(_ proxy: ScrollViewProxy) -> some View {
        let report = model.report
        let median = report.medianDaysToFirstResponse
        return Section {
            KpiGrid {
                KpiTile(
                    label: InsightsStrings.kpiApplications,
                    value: report.applications.formatted(),
                    context: String(localized: InsightsStrings.sentInRange)
                ) { scroll(proxy, to: .funnel) }
                KpiTile(
                    label: InsightsStrings.kpiResponse,
                    value: InsightsFormat.rate(report.responseRate, locale: locale),
                    context: rateContext(report.responseRate)
                ) { scroll(proxy, to: .breakdown) }
                KpiTile(
                    label: InsightsStrings.kpiInterviews,
                    value: report.interviewRate.count.formatted(),
                    context: String(localized: InsightsStrings.countOf(report.interviewRate.count, report.interviewRate.of))
                ) { scroll(proxy, to: .funnel) }
                KpiTile(
                    label: InsightsStrings.kpiFirstResponse,
                    value: median.days.map { InsightsFormat.days($0, locale: locale) },
                    context: median.days == nil
                        ? "\(String(localized: InsightsStrings.repliesSoFar(median.n))) · \(String(localized: InsightsStrings.showsFromFive))"
                        : String(localized: InsightsStrings.medianOf(median.n))
                ) { scroll(proxy, to: .firstResponse) }
            }
            .listRowInsets(EdgeInsets(top: BFHRSpace.s2, leading: BFHRSpace.s2, bottom: BFHRSpace.s2, trailing: BFHRSpace.s2))
            .listRowBackground(Color.clear)
        }
    }

    private func rateContext(_ rate: InsightsRate) -> String {
        let count = String(localized: InsightsStrings.countOf(rate.count, rate.of))
        return rate.value == nil ? "\(count) · \(String(localized: InsightsStrings.showsFromFive))" : count
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func scroll(_ proxy: ScrollViewProxy, to card: Card) {
        withAnimation(BFHRMotion.animation(.base, easing: .standard, reduceMotion: reduceMotion)) {
            proxy.scrollTo(card, anchor: .top)
        }
    }

    // MARK: Funnel

    private var funnelSection: some View {
        let report = model.report
        return Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(InsightsStrings.funnelTitle(responded: report.responseRate.count, applied: report.applications))
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if model.isLowSample {
                    Text(InsightsStrings.lowSample)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(report.funnel, id: \.stage) { step in
                FunnelBar(step: step, applied: report.applications, locale: locale) {
                    onDrillDown(model.drillDown(stage: step.stage.drillStage))
                }
            }
            let buckets: [(Int, LocalizedStringResource, DrillDownStage)] = [
                (report.stillWaiting, InsightsStrings.stillWaiting(report.stillWaiting), .waiting),
                (report.noResponse, InsightsStrings.noResponse(report.noResponse), .noResponse),
                (report.withdrawn, InsightsStrings.withdrawn(report.withdrawn), .withdrawn),
            ]
            ForEach(buckets.filter { $0.0 > 0 }, id: \.2) { bucket in
                Button {
                    onDrillDown(model.drillDown(stage: bucket.2))
                } label: {
                    Text(bucket.1)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityHint(Text(InsightsStrings.opensTracker))
            }
        } header: {
            Text(InsightsStrings.funnelQuestion)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    // MARK: Breakdown

    private var breakdownSection: some View {
        let rows = model.breakdownRows
        let visible = showsAllRows ? rows : Array(rows.prefix(5))
        return Section {
            Picker(selection: $model.dimension) {
                ForEach([InsightsDimension.source, .channel, .cv], id: \.self) { dimension in
                    Text(dimension.label).tag(dimension)
                }
            } label: {
                Text(InsightsStrings.breakdownBy)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityLabel(Text(InsightsStrings.breakdownBy))
            ForEach(visible, id: \.key) { row in
                BreakdownRowView(
                    label: InsightsFormat.label(model.dimension, key: row.key, model: model),
                    row: row,
                    locale: locale
                ) {
                    onDrillDown(model.drillDown(model.dimension, key: row.key))
                }
            }
            if rows.count > 5 {
                Button {
                    showsAllRows.toggle()
                } label: {
                    Text(showsAllRows ? InsightsStrings.showFewer : InsightsStrings.showAll)
                }
            }
        } header: {
            Text(InsightsStrings.breakdownQuestion)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    // MARK: First response

    private var firstResponseSection: some View {
        let report = model.report
        let median = report.medianDaysToFirstResponse
        return Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                if let days = median.days {
                    Text(InsightsFormat.days(days, locale: locale))
                        .font(.bfhr(.title1, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(InsightsStrings.medianOf(median.n))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                } else {
                    Text(InsightsStrings.repliesSoFar(median.n))
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(InsightsStrings.lowSample)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                Text(InsightsStrings.firstResponseDefinition)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .accessibilityElement(children: .combine)
            if report.stillWaiting > 0 {
                Button {
                    onDrillDown(model.drillDown(stage: .waiting))
                } label: {
                    Text(InsightsStrings.stillWaiting(report.stillWaiting))
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityHint(Text(InsightsStrings.opensTracker))
            }
        } header: {
            Text(InsightsStrings.firstResponseQuestion)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    // MARK: Activity

    private var activitySection: some View {
        Section {
            Picker(selection: $model.series) {
                ForEach(InsightsSeries.allCases) { series in Text(series.label).tag(series) }
            } label: {
                Text(InsightsStrings.seriesLabel)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityLabel(Text(InsightsStrings.seriesLabel))
            Text(InsightsStrings.thisWeek(model.thisWeek, average: model.weeklyAverage.formatted(.number.precision(.fractionLength(0...1)).locale(locale))))
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
            WeeklyBars(points: model.activity, series: model.series) { week in
                onDrillDown(model.drillDown(week: week))
            }
            Toggle(isOn: $model.isCumulative) {
                Text(InsightsStrings.cumulative)
            }
        } header: {
            Text(InsightsStrings.activityQuestion)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }
}

// MARK: - Parts

/// Two columns of tiles; one column at accessibility text sizes.
private struct KpiGrid<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let columns = dynamicTypeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.flexible(), spacing: BFHRSpace.s2), GridItem(.flexible())]
        LazyVGrid(columns: columns, spacing: BFHRSpace.s2) { content }
    }
}

private struct KpiTile: View {
    let label: LocalizedStringResource
    /// nil: suppressed below 5 (shown as "—", read as "shows from 5").
    let value: String?
    let context: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(label)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Text(value ?? "—")
                    .font(.bfhr(.title2, emphasized: true))
                    .foregroundStyle(value == nil ? BFHRColor.Fg.tertiary : BFHRColor.Fg.primary)
                    .monospacedDigit()
                Text(context)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 88, alignment: .topLeading)
            .padding(BFHRSpace.s3)
            .background(BFHRColor.Surface.base, in: BFHRRadius.shape(BFHRRadius.lg))
            .contentShape(BFHRRadius.shape(BFHRRadius.lg))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityValue(Text(value.map { "\($0), \(context)" } ?? context))
        .accessibilityHint(Text(InsightsStrings.kpiHint))
        .accessibilityAddTraits(.isButton)
    }
}

/// One funnel stage: label, a bar sized to its share of Applied, "count · %". At accessibility
/// sizes the bar moves under the label (Flighty). The step conversion sits under the bar.
private struct FunnelBar: View {
    let step: FunnelStep
    let applied: Int
    let locale: Locale
    let action: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var share: Double { applied == 0 ? 0 : Double(step.reached) / Double(applied) }
    private var percent: String { InsightsFormat.rate(step.ofApplied, locale: locale) ?? "—" }

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                if dynamicTypeSize.isAccessibilitySize {
                    labelText
                    numbers
                    bar
                } else {
                    HStack(spacing: BFHRSpace.s3) {
                        labelText.frame(width: 96, alignment: .leading)
                        bar
                        numbers.frame(minWidth: 72, alignment: .trailing)
                    }
                }
                if let step = stepText {
                    Text(step)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(step.stage.label))
        .accessibilityValue(Text(accessibilityValue))
        .accessibilityHint(Text(InsightsStrings.opensTracker))
        .accessibilityAddTraits(.isButton)
    }

    private var labelText: some View {
        Text(step.stage.label)
            .font(.bfhr(.subheadline))
            .foregroundStyle(BFHRColor.Fg.primary)
    }

    private var numbers: some View {
        Text("\(step.reached.formatted()) · \(percent)")
            .font(.bfhr(.subheadline, emphasized: true))
            .foregroundStyle(BFHRColor.Fg.primary)
            .monospacedDigit()
    }

    private var bar: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(BFHRColor.Surface.sunken)
                Capsule()
                    .fill(BFHRColor.Chart.series)
                    .frame(width: step.reached == 0 ? 0 : max(6, geometry.size.width * share))
            }
        }
        .frame(height: 12)
        .accessibilityHidden(true)
    }

    private var stepText: String? {
        guard step.stage != .applied, let rate = step.fromPrevious, let value = rate.value else { return nil }
        return "↳ " + String(localized: InsightsStrings.stepFromPrevious(InsightsFormat.percent(value, locale: locale)))
    }

    private var accessibilityValue: String {
        var parts = [String(localized: InsightsStrings.stageValue(step.reached, percent))]
        if let step = stepText { parts.append(String(step.dropFirst(2))) }
        return parts.joined(separator: ", ")
    }
}

private struct BreakdownRowView: View {
    let label: String
    let row: BreakdownRow
    let locale: Locale
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                HStack(alignment: .firstTextBaseline) {
                    Text(label)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Spacer(minLength: BFHRSpace.s2)
                    Text(rateText)
                        .font(.bfhr(.subheadline, emphasized: row.rate.value != nil))
                        .foregroundStyle(row.rate.value == nil ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                }
                if let value = row.rate.value {
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Capsule().fill(BFHRColor.Surface.sunken)
                            Capsule().fill(BFHRColor.Chart.series).frame(width: max(value > 0 ? 6 : 0, geometry.size.width * value))
                        }
                    }
                    .frame(height: 6)
                    .accessibilityHidden(true)
                }
                Text(InsightsStrings.responsesOf(row.responses, row.applications))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(label))
        .accessibilityValue(Text("\(rateText), \(String(localized: InsightsStrings.responsesOf(row.responses, row.applications)))"))
        .accessibilityHint(Text(InsightsStrings.opensTracker))
        .accessibilityAddTraits(.isButton)
    }

    private var rateText: String {
        row.rate.value.map { InsightsFormat.percent($0, locale: locale) } ?? String(localized: InsightsStrings.tooFew)
    }
}

/// 12 weekly columns, each a button with its numbers in the VoiceOver label (no colour-only
/// meaning: values print above the bars, and the current week is named under the axis).
private struct WeeklyBars: View {
    let points: [ActivityPoint]
    let series: InsightsSeries
    let onSelect: (CivilDate) -> Void
    @ScaledMetric(relativeTo: .caption) private var chartHeight: CGFloat = 132

    var body: some View {
        let maxValue = max(1, points.map(\.value).max() ?? 1)
        VStack(spacing: BFHRSpace.s1) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(points) { point in
                    Button {
                        onSelect(point.weekStart)
                    } label: {
                        VStack(spacing: 2) {
                            Spacer(minLength: 0)
                            Text(point.value.formatted())
                                .font(.bfhr(.caption2))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                                .monospacedDigit()
                                .minimumScaleFactor(0.7)
                                .lineLimit(1)
                            RoundedRectangle(cornerRadius: 2)
                                .fill(point.value == 0 ? BFHRColor.Chart.grid : BFHRColor.Chart.series)
                                .frame(height: point.value == 0 ? 2 : max(4, (chartHeight - 24) * CGFloat(point.value) / CGFloat(maxValue)))
                        }
                        .frame(maxWidth: .infinity)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(InsightsStrings.weekOf(InsightsFormat.longDay(point.weekStart))))
                    .accessibilityValue(Text("\(String(localized: series.label)): \(point.weekly)"))
                    .accessibilityHint(Text(InsightsStrings.opensTracker))
                }
            }
            .frame(height: chartHeight)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(InsightsStrings.chartTitle))
            HStack(spacing: 3) {
                ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
                    Text(index % 4 == 0 || index == points.count - 1 ? InsightsFormat.shortDay(point.weekStart) : "")
                        .font(.bfhr(.caption2))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .lineLimit(1)
                        .fixedSize()
                        .frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.vertical, BFHRSpace.s1)
    }
}

/// Definitions and provenance (research/insights.md `MetricDefinitionPopover`, a form sheet on iOS).
private struct InsightsAboutSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section(header: Text(InsightsStrings.kpiApplications)) { Text(InsightsStrings.defApplications) }
                Section(header: Text(InsightsStrings.stageResponse)) { Text(InsightsStrings.defResponse) }
                Section(header: Text(InsightsStrings.kpiInterviews)) { Text(InsightsStrings.defInterviews) }
                Section(header: Text(InsightsStrings.kpiFirstResponse)) { Text(InsightsStrings.firstResponseDefinition) }
                Section {
                    Text(InsightsStrings.defRates)
                } footer: {
                    Text(InsightsStrings.provenance)
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(InsightsStrings.about))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(Strings.close) }
                }
            }
        }
        .presentationDetents([.medium, .large])
        // Opaque, so the iOS 26 glass sheet doesn't lower the text contrast over the screen below.
        .presentationBackground(BFHRColor.groupedBackground)
    }
}

private struct InsightsSkeleton: View {
    var body: some View {
        List {
            Section {
                Picker(selection: .constant(InsightsRangePreset.twelveWeeks)) {
                    ForEach(InsightsRangePreset.ios, id: \.self) { range in Text(range.shortLabel).tag(range) }
                } label: {
                    Text(InsightsStrings.rangeLabel)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .disabled(true)
                .unredacted()
            }
            Section {
                KpiGrid {
                    ForEach(0..<4, id: \.self) { _ in
                        KpiTile(label: InsightsStrings.kpiApplications, value: "00", context: "00 of 00") {}
                    }
                }
                .listRowBackground(Color.clear)
            }
            Section {
                ForEach(0..<4, id: \.self) { _ in
                    Text(verbatim: "Applied 00 · 00 %")
                }
            } header: {
                Text(InsightsStrings.funnelQuestion).unredacted()
            }
        }
        .bfhrInsetGroupedList()
    }
}
