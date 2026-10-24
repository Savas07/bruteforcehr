import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Jobs › Saved searches (job-feed-search.md item 9, Glassdoor job alerts): each search with its
/// criteria line, alert cadence and new-match count; tap edits, swipe deletes with Undo (eBay).
/// "Hidden jobs" sits at the bottom (decisions.md D10).
public struct SavedSearchesScreen: View {
    @Bindable private var model: JobsFeedModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bfhrReload) private var reload
    @State private var editor: SavedSearchEditorRequest?

    public init(model: JobsFeedModel) {
        self.model = model
    }

    public var body: some View {
        // Loading and failure come from the feed's data (states.md): never "No saved searches
        // yet" before the list has loaded.
        PhaseContainer(model.phase, loadingLabel: JobsStrings.savedSearchesLoading) {
            list
        } skeleton: {
            JobsListSkeleton()
        } failure: { failure in
            PaneError(failure, title: JobsStrings.savedSearchesError, retry: reload)
        }
        .navigationTitle(Text(JobsStrings.savedSearchesTitle))
        .bfhrInlineTitle()
        .sheet(item: $editor) { request in
            SavedSearchEditor(model: model, searchId: request.searchId, seed: request.seed)
        }
        .accessibilityIdentifier("screen.savedSearches")
        #if DEBUG
        .task {
            if let first = model.savedSearches.first, JobsDesignPane.take(.editor) {
                editor = SavedSearchEditorRequest(searchId: first.id)
            }
        }
        #endif
    }

    private var list: some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                if model.savedSearches.isEmpty {
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(JobsStrings.noSavedSearchesTitle)
                            .font(.bfhr(.headline))
                            .foregroundStyle(BFHRColor.Fg.primary)
                        Text(JobsStrings.noSavedSearchesBody)
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    .padding(.vertical, BFHRSpace.s1)
                }
                ForEach(model.savedSearches) { search in
                    Button { editor = SavedSearchEditorRequest(searchId: search.id) } label: {
                        SavedSearchRow(search: search, newCount: model.savedSearchChips.first { $0.id == search.id }?.newCount ?? 0)
                    }
                    .buttonStyle(.plain)
                    .bfhrRowActions(actions(for: search))
                    .accessibilityIdentifier("savedSearches.row.\(search.id)")
                }
                GhostRow(JobsStrings.newSavedSearch) { editor = SavedSearchEditorRequest(searchId: nil, seed: SavedSearchDraft()) }
            } footer: {
                Text(JobsStrings.savedSearchesFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
            Section {
                NavigationLink(value: JobsRoute.hiddenJobs) {
                    LabeledContent {
                        Text(model.hiddenJobs.count, format: .number).foregroundStyle(BFHRColor.Fg.secondary)
                    } label: {
                        Label { Text(JobsStrings.hiddenJobsTitle) } icon: { Image(systemName: "eye.slash") }
                            .labelStyle(.bfhrCompact)
                    }
                }
                .accessibilityIdentifier("savedSearches.hidden")
            }
        }
        .bfhrInsetGroupedList()
        .bfhrToastHost()
    }

    private func actions(for search: SavedSearch) -> [RowAction] {
        var actions = [
            RowAction(JobsStrings.showJobsAction, systemImage: "list.bullet", edge: .leading) {
                model.scope = .search(search.id)
                dismiss()
            },
            RowAction(JobsStrings.delete, systemImage: "trash", edge: .trailing, role: .destructive) {
                if let toast = model.deleteSavedSearch(search.id) { toasts?.show(toast) }
            },
        ]
        if model.canSearchSources {
            actions.append(RowAction(JobsStrings.runNow, systemImage: "arrow.clockwise", edge: .menuOnly) {
                model.scope = .search(search.id)
                Task { await model.runSavedSearch(search.id) }
                dismiss()
            })
        }
        return actions
    }
}

/// Name, criteria line (Realtor.com), cadence + threshold, new-match badge.
struct SavedSearchRow: View {
    let search: SavedSearch
    let newCount: Int
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        // At accessibility sizes the badge goes under the text, so the name keeps the full width
        // instead of breaking words (r2).
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: BFHRSpace.s3))
        layout {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: search.name)
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if let line = criteriaLine {
                    Text(verbatim: line)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                Text(JobsStrings.cadenceLine(search))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if newCount > 0 {
                Text(JobsStrings.newCount(newCount))
                    .font(.bfhr(.caption1, emphasized: true))
                    .foregroundStyle(BFHRColor.Accent.text)
                    .padding(.horizontal, BFHRSpace.s2)
                    .padding(.vertical, 2)
                    .background(BFHRColor.Accent.subtle, in: Capsule())
            }
        }
        .padding(.vertical, BFHRSpace.s1)
        .contentShape(Rectangle())
    }

    private var criteriaLine: String? {
        let query = search.query.trimmingCharacters(in: .whitespaces)
        let filters = JobsFilterSummary.line(search.filters)
        let parts = [query.isEmpty ? nil : "“\(query)”", filters].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// The saved-search editor (LinkedIn/Glassdoor): name, keywords, the criteria (edited with the
/// feed's filter sheet), alerts (cadence, threshold, daily digest) and Delete at the bottom.
struct SavedSearchEditor: View {
    let model: JobsFeedModel
    let searchId: String?
    @State private var draft: SavedSearchDraft
    @State private var editsFilters = false
    @Environment(\.dismiss) private var dismiss
    @Environment(ToastCenter.self) private var toasts: ToastCenter?

    init(model: JobsFeedModel, searchId: String?, seed: SavedSearchDraft?) {
        self.model = model
        self.searchId = searchId
        let initial = searchId.flatMap(model.savedSearch(id:)).map(SavedSearchDraft.init) ?? seed ?? SavedSearchDraft()
        _draft = State(initialValue: initial)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    EditorField(label: JobsStrings.searchName) {
                        TextField(text: $draft.name) { Text(JobsStrings.searchName) }
                            .accessibilityIdentifier("editor.name")
                    }
                    EditorField(label: JobsStrings.searchKeywordsLabel) {
                        TextField(text: $draft.query) { Text(JobsStrings.searchKeywords) }
                            .accessibilityLabel(Text(JobsStrings.searchKeywordsLabel))
                            .accessibilityIdentifier("editor.query")
                    }
                } header: {
                    Text(JobsStrings.searchSection).foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    // The summary under its label, left-aligned: a long criteria line wraps as a
                    // sentence instead of a ragged right-aligned column.
                    Button { editsFilters = true } label: {
                        HStack(spacing: BFHRSpace.s3) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(JobsStrings.filters).foregroundStyle(BFHRColor.Fg.primary)
                                Text(verbatim: JobsFilterSummary.line(draft.filters) ?? String(localized: JobsStrings.noFilters))
                                    .font(.bfhr(.subheadline))
                                    .foregroundStyle(BFHRColor.Fg.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right")
                                .font(.bfhr(.footnote, emphasized: true))
                                .foregroundStyle(BFHRColor.Fg.tertiary)
                                .accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("editor.filters")
                }
                Section {
                    Toggle(isOn: $draft.alertsOn) { Text(JobsStrings.alerts) }
                        .tint(BFHRColor.Accent.solid)
                        .accessibilityIdentifier("editor.alerts")
                    if draft.alertsOn {
                        Picker(selection: $draft.schedule) {
                            ForEach(SavedSearchSchedule.allCases, id: \.self) { schedule in
                                Text(JobsStrings.schedule(schedule)).tag(schedule)
                            }
                        } label: { Text(JobsStrings.checkFor) }
                        Picker(selection: $draft.threshold) {
                            Text(JobsStrings.threshold(.strong)).tag(MatchBand.strong)
                            Text(JobsStrings.threshold(.good)).tag(MatchBand.good)
                            Text(JobsStrings.threshold(.stretch)).tag(MatchBand.stretch)
                        } label: { Text(JobsStrings.notifyFor) }
                        Toggle(isOn: $draft.dailyDigest) { Text(JobsStrings.dailyDigest) }
                            .tint(BFHRColor.Accent.solid)
                    }
                } header: {
                    Text(JobsStrings.alertsSection).foregroundStyle(BFHRColor.Fg.secondary)
                } footer: {
                    Text(draft.alertsOn ? JobsStrings.alertsFooter : JobsStrings.alertsOffFooter)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                if let searchId {
                    Section {
                        Button(role: .destructive) {
                            if let toast = model.deleteSavedSearch(searchId) { toasts?.show(toast) }
                            dismiss()
                        } label: { Text(JobsStrings.deleteSearch) }
                        .accessibilityIdentifier("editor.delete")
                    }
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(searchId == nil ? JobsStrings.newSavedSearch : JobsStrings.editSavedSearch))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(JobsStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: save) { Text(JobsStrings.saveSearch) }
                        .disabled(!draft.isValid)
                        .accessibilityIdentifier("editor.save")
                }
            }
            .sheet(isPresented: $editsFilters) {
                SavedSearchCriteriaForm(filters: $draft.filters, knownCountries: model.knownCountries, knownSources: model.knownSources)
            }
        }
        .presentationDragIndicator(.visible)
    }

    private func save() {
        if let searchId {
            model.updateSavedSearch(searchId, with: draft)
        } else {
            let id = model.createSavedSearch(draft)
            model.scope = .search(id)
        }
        dismiss()
    }
}

/// A text field with its label above it, so a filled-in field still says what it is (the label
/// is visual only; the field carries the accessibility label).
private struct EditorField<Field: View>: View {
    let label: LocalizedStringResource
    @ViewBuilder let field: () -> Field

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            field()
        }
    }
}

/// Every criterion a saved search stores (Remote, Posted, Salary, Location, Seniority, Source),
/// edited with the feed's facets; no live count, since a saved search runs on the server against
/// every source.
struct SavedSearchCriteriaForm: View {
    @Binding var filters: SavedSearchFilters
    let knownCountries: [String]
    let knownSources: [String]
    @State private var salaryText: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale

    init(filters: Binding<SavedSearchFilters>, knownCountries: [String], knownSources: [String]) {
        _filters = filters
        self.knownCountries = knownCountries
        self.knownSources = knownSources
        _salaryText = State(initialValue: filters.wrappedValue.salaryMin.map { String(Int($0.amount)) } ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    chips(RemoteType.allCases, selected: filters.remoteTypes) { String(localized: JobDetailViewStrings.workMode($0)) } set: { filters.remoteTypes = $0 }
                } header: { Text(JobsStrings.facet(.remote)).foregroundStyle(BFHRColor.Fg.secondary) }
                Section {
                    Picker(selection: $filters.postedWithinDays) {
                        ForEach(JobsFilterSheet.postedOptions, id: \.self) { days in
                            Text(days.map(JobsStrings.postedWithin) ?? JobsStrings.postedAny).tag(days)
                        }
                    } label: { Text(JobsStrings.facet(.posted)) }
                }
                Section {
                    Picker(selection: currency) {
                        ForEach(JobsFilterSheet.currencies, id: \.self) { Text(verbatim: $0).tag($0) }
                    } label: { Text(JobsStrings.currency) }
                    TextField(text: $salaryText) { Text(JobsStrings.salaryMinimum) }
                        .bfhrNumberField()
                        .onChange(of: salaryText) { _, text in
                            let amount = Double(text.filter(\.isNumber)) ?? 0
                            filters.salaryMin = amount > 0
                                ? SalaryMinimum(amount: amount, currency: filters.salaryMin?.currency ?? JobsFilterSheet.defaultCurrency(locale), period: .year)
                                : nil
                        }
                } header: { Text(JobsStrings.facet(.salary)).foregroundStyle(BFHRColor.Fg.secondary) }
                Section {
                    TextField(text: countries) { Text(JobsStrings.countryCodes) }
                        .autocorrectionDisabled()
                    if !knownCountries.isEmpty {
                        chips(knownCountries, selected: filters.countryCodes.map { $0.uppercased() }) { locale.localizedString(forRegionCode: $0) ?? $0 } set: { filters.countryCodes = $0 }
                    }
                    Toggle(isOn: Binding(get: { filters.visaSponsorship == true }, set: { filters.visaSponsorship = $0 ? true : nil })) {
                        Text(JobsStrings.visaOnly)
                    }
                    .tint(BFHRColor.Accent.solid)
                } header: { Text(JobsStrings.facet(.location)).foregroundStyle(BFHRColor.Fg.secondary) } footer: {
                    Text(JobsStrings.countryCodesFooter).foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    chips(Seniority.allCases, selected: filters.seniority) { String(localized: JobDetailViewStrings.seniority($0)) } set: { filters.seniority = $0 }
                } header: { Text(JobsStrings.facet(.seniority)).foregroundStyle(BFHRColor.Fg.secondary) }
                if !knownSources.isEmpty {
                    Section {
                        chips(knownSources, selected: filters.sources) { JobDetailFormat.sourceName($0) } set: { filters.sources = $0 }
                    } header: { Text(JobsStrings.facet(.source)).foregroundStyle(BFHRColor.Fg.secondary) }
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(JobsStrings.filters))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(JobDetailViewStrings.done) }
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    /// "DE, NL" typed as ISO codes, for countries no job has shown yet.
    private var countries: Binding<String> {
        Binding {
            filters.countryCodes.joined(separator: ", ")
        } set: { text in
            filters.countryCodes = text
                .split(whereSeparator: { $0 == "," || $0.isWhitespace })
                .map { $0.uppercased() }
                .filter { $0.count == 2 }
        }
    }

    private var currency: Binding<String> {
        Binding {
            filters.salaryMin?.currency ?? JobsFilterSheet.defaultCurrency(locale)
        } set: { code in
            if let minimum = filters.salaryMin {
                filters.salaryMin = SalaryMinimum(amount: minimum.amount, currency: code, period: minimum.period)
            }
        }
    }

    private func chips<Option: Hashable>(
        _ options: [Option],
        selected: [Option],
        label: @escaping (Option) -> String,
        set: @escaping ([Option]) -> Void
    ) -> some View {
        ChipFlow(spacing: BFHRSpace.s2) {
            ForEach(options, id: \.self) { option in
                Toggle(isOn: Binding(
                    get: { selected.contains(option) },
                    set: { isOn in
                        var next = Set(selected)
                        if isOn { next.insert(option) } else { next.remove(option) }
                        set(options.filter(next.contains))
                    }
                )) { Text(verbatim: label(option)) }
                .toggleStyle(.bfhrChip)
            }
        }
        .padding(.vertical, BFHRSpace.s2)
    }
}

/// Saved searches › Hidden jobs (D10): every job hidden with Not for me, newest first, with
/// "Show in feed" (swipe or button).
public struct HiddenJobsScreen: View {
    @Bindable private var model: JobsFeedModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.bfhrReload) private var reload

    public init(model: JobsFeedModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: JobsStrings.loading) {
            list
        } skeleton: {
            JobsListSkeleton()
        } failure: { failure in
            PaneError(failure, title: JobsStrings.errorTitle, retry: reload)
        }
        .navigationTitle(Text(JobsStrings.hiddenJobsTitle))
        .bfhrInlineTitle()
        .accessibilityIdentifier("screen.hiddenJobs")
    }

    private var list: some View {
        List {
            ConnectionBannerSection(model.connection)
            if model.hiddenJobs.isEmpty {
                Section {
                    EmptyState(.subArea, title: JobsStrings.hiddenEmpty)
                }
            } else {
                Section {
                    ForEach(model.hiddenJobs) { row in
                        NavigationLink(value: JobsRoute.job(row.id)) {
                            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                                Text(verbatim: row.title)
                                    .font(.bfhr(.headline))
                                    .foregroundStyle(BFHRColor.Fg.primary)
                                Text(verbatim: row.company.name)
                                    .font(.bfhr(.subheadline))
                                    .foregroundStyle(BFHRColor.Fg.secondary)
                                let reasons = model.hiddenReasons(row.id)
                                if !reasons.isEmpty {
                                    Text(JobDetailViewStrings.hiddenReasons(reasons.map { String(localized: JobDetailViewStrings.reason($0)) }.formatted(.list(type: .and))))
                                        .font(.bfhr(.footnote))
                                        .foregroundStyle(BFHRColor.Fg.secondary)
                                }
                            }
                            .padding(.vertical, BFHRSpace.s1)
                        }
                        .bfhrRowActions([
                            RowAction(JobsStrings.showInFeed, systemImage: "eye", edge: .leading) {
                                model.unhide(row.id)
                                toasts?.show(ToastItem(glyph: ToastGlyph.restored, message: JobsStrings.unhiddenToast(row.company.name)))
                            },
                        ])
                    }
                } footer: {
                    Text(JobsStrings.hiddenFooter).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        }
        .bfhrInsetGroupedList()
        .bfhrToastHost()
    }
}
