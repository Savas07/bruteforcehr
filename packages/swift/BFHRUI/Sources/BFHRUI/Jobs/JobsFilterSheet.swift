import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// A filter chip's sheet (job-feed-search.md "Filter chip row"): one facet at the medium detent,
/// or every facet from the Filters button at the large one, with a live "Show N jobs" and Reset
/// (Glassdoor, Handshake). Changes apply only through "Show N jobs".
struct JobsFilterSheet: View {
    let model: JobsFeedModel
    let focus: JobFilterFacet?
    @State private var draft: JobFeedFilters
    @State private var salaryText: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.locale) private var locale

    static let currencies = ["EUR", "GBP", "USD", "TRY"]
    static let postedOptions: [Int?] = [nil, 1, 3, 7, 30]

    init(model: JobsFeedModel, focus: JobFilterFacet?) {
        self.model = model
        self.focus = focus
        _draft = State(initialValue: model.filters)
        _salaryText = State(initialValue: model.filters.criteria.salaryMin.map { String(Int($0.amount)) } ?? "")
    }

    private var facets: [JobFilterFacet] { focus.map { [$0] } ?? JobFilterFacet.allCases }

    var body: some View {
        NavigationStack {
            Form {
                ForEach(facets) { facet in
                    section(facet)
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(focus.map(JobsStrings.facet) ?? JobsStrings.filters))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(JobsStrings.cancel) }
                }
                ToolbarItem(placement: .bfhrTrailing) {
                    Button {
                        for facet in facets { draft.reset(facet) }
                        if facets.contains(.salary) { salaryText = "" }
                    } label: { Text(JobsStrings.reset) }
                    .disabled(facets.allSatisfy { !draft.isActive($0) })
                    .accessibilityIdentifier("filters.reset")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    Button {
                        model.filters = draft
                        dismiss()
                    } label: {
                        Text(JobsStrings.showJobs(model.resultCount(with: draft)))
                    }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .padding(.horizontal, BFHRSpace.s4)
                    .padding(.vertical, BFHRSpace.s2)
                    .accessibilityIdentifier("filters.show")
                }
                .background(.bar)
                .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            }
        }
        .presentationDetents(focus == nil || dynamicTypeSize.isAccessibilitySize ? [.large] : [.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private func section(_ facet: JobFilterFacet) -> some View {
        switch facet {
        case .remote:
            Section {
                chips(RemoteType.allCases, selected: Set(draft.criteria.remoteTypes)) { String(localized: JobDetailViewStrings.workMode($0)) } set: { draft.criteria.remoteTypes = $0 }
            } header: { header(facet) }
        case .match:
            Section {
                Picker(selection: $draft.minimumBand) {
                    Text(JobsStrings.matchAny).tag(MatchBand?.none)
                    Text(JobsStrings.matchAtLeast(.partial)).tag(MatchBand?.some(.partial))
                    Text(JobsStrings.matchAtLeast(.good)).tag(MatchBand?.some(.good))
                    Text(JobsStrings.matchAtLeast(.strong)).tag(MatchBand?.some(.strong))
                } label: { Text(JobsStrings.facet(.match)) }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: { header(facet) } footer: {
                Text(JobsStrings.matchFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
        case .posted:
            Section {
                Picker(selection: $draft.criteria.postedWithinDays) {
                    ForEach(Self.postedOptions, id: \.self) { days in
                        Text(days.map(JobsStrings.postedWithin) ?? JobsStrings.postedAny).tag(days)
                    }
                } label: { Text(JobsStrings.facet(.posted)) }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: { header(facet) }
        case .salary:
            Section {
                Picker(selection: currency) {
                    ForEach(Self.currencies, id: \.self) { code in
                        Text(verbatim: code).tag(code)
                    }
                } label: { Text(JobsStrings.currency) }
                TextField(text: $salaryText) { Text(JobsStrings.salaryMinimum) }
                    .bfhrNumberField()
                    .onChange(of: salaryText) { _, text in updateSalary(text: text) }
                    .accessibilityIdentifier("filters.salary")
                Toggle(isOn: $draft.hidesUnstatedSalary) { Text(JobsStrings.hideUnstatedSalary) }
                    .tint(BFHRColor.Accent.solid)
            } header: { header(facet) } footer: {
                Text(JobsStrings.salaryFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
        case .location:
            Section {
                if model.knownCountries.isEmpty {
                    Text(JobsStrings.noCountries).foregroundStyle(BFHRColor.Fg.secondary)
                } else {
                    chips(model.knownCountries, selected: Set(draft.criteria.countryCodes.map { $0.uppercased() })) { code in
                        locale.localizedString(forRegionCode: code) ?? code
                    } set: { draft.criteria.countryCodes = $0 }
                }
                Toggle(isOn: Binding(get: { draft.criteria.visaSponsorship == true }, set: { draft.criteria.visaSponsorship = $0 ? true : nil })) {
                    Text(JobsStrings.visaOnly)
                }
                .tint(BFHRColor.Accent.solid)
            } header: { header(facet) }
        case .seniority:
            Section {
                chips(Seniority.allCases, selected: Set(draft.criteria.seniority)) { String(localized: JobDetailViewStrings.seniority($0)) } set: { draft.criteria.seniority = $0 }
            } header: { header(facet) }
        case .source:
            Section {
                if model.knownSources.isEmpty {
                    Text(JobsStrings.noSources).foregroundStyle(BFHRColor.Fg.secondary)
                } else {
                    chips(model.knownSources, selected: Set(draft.criteria.sources)) { source in
                        JobDetailFormat.sourceName(source)
                    } set: { draft.criteria.sources = $0 }
                }
            } header: { header(facet) }
        }
    }

    private func header(_ facet: JobFilterFacet) -> some View {
        Text(JobsStrings.facet(facet)).foregroundStyle(BFHRColor.Fg.secondary)
    }

    /// Multi-select chips; the result keeps `options` order.
    private func chips<Option: Hashable>(
        _ options: [Option],
        selected: Set<Option>,
        label: @escaping (Option) -> String,
        set: @escaping ([Option]) -> Void
    ) -> some View {
        ChipFlow(spacing: BFHRSpace.s2) {
            ForEach(options, id: \.self) { option in
                Toggle(isOn: Binding(
                    get: { selected.contains(option) },
                    set: { isOn in
                        var next = selected
                        if isOn { next.insert(option) } else { next.remove(option) }
                        set(options.filter(next.contains))
                    }
                )) { Text(verbatim: label(option)) }
                .toggleStyle(.bfhrChip)
            }
        }
        .padding(.vertical, BFHRSpace.s2)
    }

    private var currency: Binding<String> {
        Binding {
            draft.criteria.salaryMin?.currency ?? Self.defaultCurrency(locale)
        } set: { code in
            if let minimum = draft.criteria.salaryMin {
                draft.criteria.salaryMin = SalaryMinimum(amount: minimum.amount, currency: code, period: minimum.period)
            } else {
                pendingCurrency = code
            }
        }
    }

    @State private var pendingCurrency: String?

    private func updateSalary(text: String) {
        let digits = text.filter(\.isNumber)
        guard let amount = Double(digits), amount > 0 else {
            draft.criteria.salaryMin = nil
            return
        }
        let code = draft.criteria.salaryMin?.currency ?? pendingCurrency ?? Self.defaultCurrency(locale)
        draft.criteria.salaryMin = SalaryMinimum(amount: amount, currency: code, period: .year)
    }

    static func defaultCurrency(_ locale: Locale) -> String {
        let code = locale.currency?.identifier ?? "EUR"
        return currencies.contains(code) ? code : "EUR"
    }
}

/// The value an active chip shows ("Remote: Hybrid", "Match: Good+", "Location (3)").
enum JobsFilterSummary {
    static func value(of facet: JobFilterFacet, in filters: JobFeedFilters, locale: Locale = .current) -> String? {
        guard filters.isActive(facet) else { return nil }
        let criteria = filters.criteria
        func list(_ values: [String]) -> String {
            values.count <= 2 ? values.formatted(.list(type: .and, width: .narrow)) : String(localized: JobsStrings.selectedCount(values.count))
        }
        switch facet {
        case .remote:
            return list(criteria.remoteTypes.map { String(localized: JobDetailViewStrings.workMode($0)) })
        case .match:
            return filters.minimumBand.map { String(localized: JobsStrings.matchShort($0)) }
        case .posted:
            return criteria.postedWithinDays.map { String(localized: JobsStrings.postedWithin($0)) }
        case .salary:
            if let minimum = criteria.salaryMin {
                return minimum.amount.formatted(.currency(code: minimum.currency).locale(locale).notation(.compactName).precision(.significantDigits(1...3))) + "+"
            }
            return String(localized: JobsStrings.statedOnly)
        case .location:
            var values = criteria.countryCodes.map { locale.localizedString(forRegionCode: $0) ?? $0 }
            if criteria.visaSponsorship == true { values.append(String(localized: JobsStrings.visaShort)) }
            return list(values)
        case .seniority:
            return list(criteria.seniority.map { String(localized: JobDetailViewStrings.seniority($0)) })
        case .source:
            return list(criteria.sources.map(JobDetailFormat.sourceName))
        }
    }

    /// The criteria in one line for a saved search row ("Remote · Germany · Senior").
    static func line(_ criteria: SavedSearchFilters, locale: Locale = .current) -> String? {
        let filters = JobFeedFilters(criteria: criteria)
        let parts = JobFilterFacet.allCases.compactMap { value(of: $0, in: filters, locale: locale) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

extension View {
    /// A number pad on iOS.
    func bfhrNumberField() -> some View {
        #if os(iOS)
        keyboardType(.numberPad)
        #else
        self
        #endif
    }
}
