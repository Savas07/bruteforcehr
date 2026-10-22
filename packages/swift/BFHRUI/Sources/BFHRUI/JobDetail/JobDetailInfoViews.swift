import BFHRCore
import BFHRDesignTokens
import SwiftUI

// The job's own information: header, details (Q&A facts), description and "Found on" sources
// (job-detail.md "Decision — iOS" 2, 4, 5, 6).

/// `JobDetailHeader`: company, title, where + when, fact chips, salary with provenance.
struct JobDetailHeaderSection: View {
    let header: JobDetailModel.Header
    let isDelisted: Bool
    let isPendingSync: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                if isDelisted {
                    InlineAlert(.info, title: JobDetailViewStrings.delisted, message: JobDetailViewStrings.delistedMessage)
                }
                HStack(spacing: BFHRSpace.s2) {
                    if dynamicTypeSize.isAccessibilitySize {
                        // The monogram is decorative; at AX sizes it would squeeze the name into
                        // hyphenated fragments.
                        Text(verbatim: header.company.name)
                            .font(.bfhr(.subheadline, emphasized: true))
                            .foregroundStyle(BFHRColor.Fg.primary)
                    } else {
                        CompanyChip(header.company)
                    }
                    if isPendingSync { SyncGlyph() }
                }
                Text(verbatim: header.title)
                    .font(.bfhr(.title2, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let meta = metaLine {
                    Text(verbatim: meta)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                if !chips.isEmpty {
                    ChipFlow(spacing: BFHRSpace.s2) {
                        ForEach(chips.indices, id: \.self) { index in
                            FactChip(text: chips[index])
                        }
                    }
                }
                salaryLine
            }
            .padding(.vertical, BFHRSpace.s2)
        }
    }

    /// "Europe, UK and Türkiye · Posted yesterday".
    private var metaLine: String? {
        var parts: [String] = []
        if let scope = header.remoteEligibility, !scope.isEmpty {
            parts.append(scope)
        } else if !header.locations.isEmpty {
            parts.append(header.locations.map(\.label).joined(separator: ", "))
        }
        if let posted = header.postedAt {
            let day = JobDetailFormat.relativeDay(posted, now: now, locale: locale, calendar: calendar)
            parts.append(String(localized: JobDetailViewStrings.posted(day)))
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var chips: [LocalizedStringResource] {
        [
            header.remoteType.map(JobDetailViewStrings.workMode),
            header.employmentType.map(JobDetailViewStrings.employment),
            header.seniority.map(JobDetailViewStrings.seniority),
        ].compactMap(\.self)
    }

    @ViewBuilder private var salaryLine: some View {
        let amount = header.salary.flatMap { JobDetailFormat.salary($0, locale: locale) }
        Label {
            if let amount {
                let provenance = header.salaryProvenance == .estimated ? JobDetailViewStrings.salaryEstimated : JobDetailViewStrings.salaryFromEmployer
                Text(verbatim: "\(amount) · \(String(localized: provenance))")
                    .foregroundStyle(BFHRColor.Fg.primary)
            } else {
                Text(JobDetailViewStrings.salaryNotStated)
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        } icon: {
            Image(systemName: "banknote").foregroundStyle(BFHRColor.Fg.secondary)
        }
        .font(.bfhr(.subheadline, emphasized: amount != nil))
    }
}

/// An outlined, non-interactive fact chip (work mode, employment type, seniority).
private struct FactChip: View {
    let text: LocalizedStringResource

    var body: some View {
        Text(text)
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.primary)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, BFHRSpace.s1)
            .overlay(Capsule().strokeBorder(BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin))
    }
}

// MARK: - Details

/// `FactsList`: Q&A rows with leading symbols; unknowns read "Not stated", never a gap.
struct JobFactsSection: View {
    let facts: [JobDetailModel.Fact]

    var body: some View {
        if !facts.isEmpty {
            Section {
                ForEach(facts) { fact in
                    FactRow(fact: fact)
                }
            } header: {
                Text(JobDetailViewStrings.details)
            }
        }
    }
}

private struct FactRow: View {
    let fact: JobDetailModel.Fact
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: BFHRSpace.s3))
        layout {
            Label {
                Text(JobDetailViewStrings.fact(fact.kind))
                    .fixedSize(horizontal: !dynamicTypeSize.isAccessibilitySize, vertical: false)
                    .foregroundStyle(BFHRColor.Fg.primary)
            } icon: {
                Image(systemName: symbol).foregroundStyle(BFHRColor.Fg.secondary)
            }
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: BFHRSpace.s2) }
            value
                .foregroundStyle(BFHRColor.Fg.secondary)
                .multilineTextAlignment(dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
        }
        .font(.bfhr(.body))
        .accessibilityElement(children: .combine)
    }

    private var symbol: String {
        switch fact.kind {
        case .workMode: "laptopcomputer"
        case .whereTheyHire: "globe.europe.africa"
        case .visaSponsorship: "person.text.rectangle"
        case .relocation: "shippingbox"
        case .employmentType: "briefcase"
        case .salary: "banknote"
        case .lastSeen: "clock"
        }
    }

    @ViewBuilder private var value: some View {
        switch fact.value {
        case .workMode(let type): Text(JobDetailViewStrings.workMode(type))
        case .eligibility(let scope): Text(verbatim: scope)
        case .locations(let locations): Text(verbatim: locations.map(\.label).joined(separator: ", "))
        case .yes: Text(JobDetailViewStrings.yes)
        case .no: Text(JobDetailViewStrings.no)
        case .employmentType(let type): Text(JobDetailViewStrings.employment(type))
        case .salary(let range):
            if let text = JobDetailFormat.salary(range, locale: locale) {
                Text(verbatim: text)
            } else {
                Text(JobDetailViewStrings.notStated)
            }
        case .date(let date):
            Text(verbatim: DateText.relativeDay(date, now: now, locale: locale, calendar: calendar))
        case .notStated: Text(JobDetailViewStrings.notStated)
        }
    }
}

// MARK: - Description

/// `DescriptionText`: the posting's plain text, about 12 lines with Show more.
struct JobDescriptionSection: View {
    let description: String
    let hasDescription: Bool
    let openOriginal: (() -> Void)?
    @State private var isExpanded = false
    @State private var fullHeight: CGFloat = 0
    @State private var shownHeight: CGFloat = 0

    var body: some View {
        Section {
            if hasDescription {
                Text(verbatim: description)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .lineLimit(isExpanded ? nil : 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { shownHeight = $0 }
                    .background(alignment: .top) {
                        Text(verbatim: description)
                            .font(.bfhr(.body))
                            .fixedSize(horizontal: false, vertical: true)
                            .hidden()
                            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { fullHeight = $0 }
                    }
                    .padding(.vertical, BFHRSpace.s1)
                if isExpanded || fullHeight > shownHeight + 1 {
                    Button { isExpanded.toggle() } label: {
                        Text(isExpanded ? Strings.showLess : JobDetailViewStrings.showMore)
                    }
                }
            } else {
                InlineAlert(
                    .info,
                    title: JobDetailViewStrings.noDescription,
                    actionTitle: openOriginal == nil ? nil : JobDetailViewStrings.openOriginal,
                    action: openOriginal
                )
            }
        } header: {
            Text(JobDetailViewStrings.about)
        }
    }
}

// MARK: - Sources

/// `SourcesList`: "Found on {n} sites", direct from employer first, each row an external link.
struct JobSourcesSection: View {
    let sources: JobDetailModel.Sources
    @State private var showsAll = false

    private static let collapsedCount = 3

    var body: some View {
        if sources.total > 0 {
            let rows = showsAll ? sources.all : Array(sources.all.prefix(Self.collapsedCount))
            Section {
                ForEach(rows) { source in
                    SourceRow(source: source)
                }
                if !showsAll && sources.total > Self.collapsedCount {
                    Button { showsAll = true } label: {
                        Text(JobDetailViewStrings.showAllSources(sources.total))
                    }
                }
            } header: {
                Text(JobDetailViewStrings.foundOn(sources.total))
            } footer: {
                Text(JobDetailViewStrings.sourcesFootnote)
            }
        }
    }
}

private struct SourceRow: View {
    let source: JobDetailModel.Source
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        if let url = source.url {
            Link(destination: url) { content(isLink: true) }
                .accessibilityHint(Text(JobDetailViewStrings.opensInBrowser))
        } else {
            content(isLink: false)
        }
    }

    private func content(isLink: Bool) -> some View {
        HStack(alignment: .center, spacing: BFHRSpace.s3) {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: JobDetailFormat.sourceName(source.source))
                    .font(.bfhr(.body, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if source.isDirectFromEmployer || source.usedForApply {
                    ChipFlow(spacing: BFHRSpace.s2) {
                        if source.isDirectFromEmployer {
                            SourceBadge(text: JobDetailViewStrings.directFromEmployer, systemImage: "checkmark.seal.fill", isAccent: true)
                        }
                        if source.usedForApply {
                            SourceBadge(text: JobDetailViewStrings.usedForApply, systemImage: "arrow.up.forward.app", isAccent: false)
                        }
                    }
                }
                ForEach(details, id: \.self) { line in
                    Text(verbatim: line)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            Spacer(minLength: BFHRSpace.s2)
            if isLink {
                Image(systemName: "arrow.up.right")
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "Posted yesterday", "Lists €75K–€85K a year", "Listed as “…”".
    private var details: [String] {
        var lines: [String] = []
        if let posted = source.postedAt {
            let day = JobDetailFormat.relativeDay(posted, now: now, locale: locale, calendar: calendar)
            lines.append(String(localized: JobDetailViewStrings.posted(day)))
        }
        if let salary = source.differingSalary.flatMap({ JobDetailFormat.salary($0, locale: locale) }) {
            lines.append(String(localized: JobDetailViewStrings.sourceSalary(salary)))
        }
        if let title = source.differingTitle {
            lines.append(String(localized: JobDetailViewStrings.sourceTitle(title)))
        }
        return lines
    }
}

private struct SourceBadge: View {
    let text: LocalizedStringResource
    let systemImage: String
    let isAccent: Bool

    var body: some View {
        Label { Text(text) } icon: { Image(systemName: systemImage) }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.caption1, emphasized: true))
            .foregroundStyle(isAccent ? BFHRColor.Accent.text : BFHRColor.Fg.secondary)
            .padding(.horizontal, BFHRSpace.s2)
            .padding(.vertical, 2)
            .background(isAccent ? BFHRColor.Accent.subtle : BFHRColor.Surface.sunken, in: Capsule())
    }
}

// MARK: - Hidden

/// "Hidden from your feed · Undo · Tell us why" (decisions.md D19) at the top of a hidden job.
struct HiddenBanner: View {
    let reasons: [DismissReason]
    let onUndo: () -> Void
    let onTellUsWhy: () -> Void

    var body: some View {
        GlyphLayout {
            Image(systemName: "eye.slash")
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(JobDetailViewStrings.hidden)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if !reasons.isEmpty {
                    Text(JobDetailViewStrings.hiddenReasons(reasons.map { String(localized: JobDetailViewStrings.reason($0)) }.formatted(.list(type: .and))))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: BFHRSpace.s2) { buttons }
                    VStack(alignment: .leading, spacing: 0) { buttons }
                }
                .padding(.leading, -BFHRSpace.s2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var buttons: some View {
        Button(action: onUndo) { Text(Strings.undo) }
            .buttonStyle(.bfhrPlain)
        Button(action: onTellUsWhy) { Text(reasons.isEmpty ? JobDetailViewStrings.tellUsWhy : Strings.change) }
            .buttonStyle(.bfhrPlain)
    }
}

/// The optional reason sheet after Not for me: multi-select reasons, Skip and Save reason.
struct DismissReasonSheet: View {
    let onSave: ([DismissReason]) -> Void
    @State private var selected: Set<DismissReason>
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.dismiss) private var dismiss

    /// job-feed-search.md "Reasons": the hard filters first, "Something else" last.
    static let reasonOrder: [DismissReason] = [
        .location, .salary, .seniority, .notRelevant, .company, .language, .visa, .alreadyApplied, .other,
    ]

    init(initial: [DismissReason], onSave: @escaping ([DismissReason]) -> Void) {
        self.onSave = onSave
        _selected = State(initialValue: Set(initial))
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ChipFlow(spacing: BFHRSpace.s2) {
                        ForEach(Self.reasonOrder, id: \.self) { reason in
                            Toggle(isOn: binding(reason)) { Text(JobDetailViewStrings.reason(reason)) }
                                .toggleStyle(.bfhrChip)
                        }
                    }
                    .padding(.vertical, BFHRSpace.s2)
                } header: {
                    Text(JobDetailViewStrings.reasonsSubtitle)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .textCase(nil)
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(JobDetailViewStrings.reasonsTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(JobDetailViewStrings.reasonsSkip) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        onSave(Self.reasonOrder.filter(selected.contains))
                        dismiss()
                    } label: {
                        Text(JobDetailViewStrings.reasonsSave)
                    }
                    .disabled(selected.isEmpty)
                }
            }
        }
        // At AX sizes the medium detent shows little more than the title and subtitle.
        .presentationDetents(dynamicTypeSize.isAccessibilitySize ? [.large] : [.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func binding(_ reason: DismissReason) -> Binding<Bool> {
        Binding {
            selected.contains(reason)
        } set: { isOn in
            if isOn { selected.insert(reason) } else { selected.remove(reason) }
        }
    }
}

// MARK: - Skeleton

/// The real section layout with placeholder text, plus the Apply bar's space (states.md).
struct JobDetailSkeleton: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                    CompanyChip(CompanyIdentity(name: "Company name"))
                    Text(verbatim: "Senior Frontend Engineer").font(.bfhr(.title2, emphasized: true))
                    Text(verbatim: "Europe, UK and Türkiye · Posted yesterday").font(.bfhr(.subheadline))
                    Text(verbatim: "€70K–€85K a year · from employer").font(.bfhr(.subheadline))
                }
                .padding(.vertical, BFHRSpace.s2)
            }
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                    Text(verbatim: "Strong match · 84 of 100").font(.bfhr(.title3, emphasized: true))
                    Capsule().frame(height: 8)
                    Text(verbatim: "Based on your CV · updated 7 hours ago").font(.bfhr(.footnote))
                }
                .padding(.vertical, BFHRSpace.s1)
                Text(verbatim: "Requirements: 2 of 3 met").font(.bfhr(.subheadline))
            } header: {
                Text(JobDetailViewStrings.match)
            }
            Section {
                ForEach(0..<3, id: \.self) { _ in
                    Text(verbatim: "A reason this job fits your CV").font(.bfhr(.body))
                }
            }
            Section {
                Text(verbatim: String(repeating: "Placeholder description text ", count: 8)).font(.bfhr(.body))
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack(spacing: BFHRSpace.s3) {
                BFHRRadius.shape(BFHRRadius.md).frame(width: 56, height: BFHRHitTarget.minimum)
                BFHRRadius.shape(BFHRRadius.md).frame(maxWidth: .infinity).frame(height: BFHRHitTarget.minimum)
            }
            .padding(.horizontal, BFHRSpace.s4)
            .padding(.vertical, BFHRSpace.s2)
            .background(.bar)
        }
    }
}
