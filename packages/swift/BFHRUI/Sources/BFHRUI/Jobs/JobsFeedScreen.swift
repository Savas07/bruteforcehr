import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The Jobs tab root (docs/design/research/job-feed-search.md "Decision — iOS"): the search field
/// in the navigation bar (Return searches every job source), scope chips (All matches · Saved ·
/// saved searches · +), filter chips with sheets, the result header with the sort menu, the
/// "Get alerts for this search" banner, and job rows with swipe actions (Save leading, Not for me
/// trailing) that leave an inline "Hidden · Undo · Tell us why".
public struct JobsFeedScreen: View {
    @Bindable private var model: JobsFeedModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @Environment(\.bfhrReload) private var reload
    @Environment(\.bfhrApply) private var apply
    @Environment(\.bfhrAddFromLink) private var addFromLink
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var facet: FilterSheetRequest?
    @State private var reasonsFor: ReasonRequest?
    @State private var editor: SavedSearchEditorRequest?
    @State private var showsRankingInfo = false
    @State private var saveCount = 0
    @State private var lastWriteFailures = 0

    public init(model: JobsFeedModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: JobsStrings.loading) {
            content
        } skeleton: {
            JobsFeedSkeleton()
        } failure: { failure in
            PaneError(failure, title: JobsStrings.errorTitle, retry: reload)
        }
        .searchable(text: $model.query, placement: .automatic, prompt: Text(JobsStrings.searchPrompt))
        .onSubmit(of: .search) { Task { await model.searchSources() } }
        .toolbar { toolbarContent }
        .bfhrHaptic(.confirm, trigger: saveCount)
        .sheet(item: $facet) { request in
            JobsFilterSheet(model: model, focus: request.facet)
        }
        .sheet(item: $reasonsFor) { request in
            DismissReasonSheet(initial: model.hiddenReasons(request.jobId)) { reasons in
                if let toast = model.setHiddenReasons(request.jobId, reasons: reasons) { toasts?.show(toast) }
            }
        }
        .sheet(item: $editor) { request in
            SavedSearchEditor(model: model, searchId: request.searchId, seed: request.seed)
        }
        .sheet(isPresented: $showsRankingInfo) { RankingInfoSheet() }
        .onChange(of: model.writeFailures) { _, failures in
            guard failures > lastWriteFailures else { return }
            lastWriteFailures = failures
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: JobsStrings.writeFailed))
        }
        #if DEBUG
        .task { if JobsDesignPane.take(.filters) { facet = FilterSheetRequest(facet: nil) } }
        #endif
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        List {
            ConnectionBannerSection(model.connection)
            if !model.isFirstUse {
                Section {
                    scopeChips
                    filterChips
                }
                .listRowInsets(EdgeInsets(top: BFHRSpace.s1, leading: 0, bottom: BFHRSpace.s1, trailing: 0))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
            searchStatus
            if model.offersSavingSearch {
                Section {
                    SaveSearchBanner { saveSearch() }
                }
            }
            if model.isFirstUse {
                Section {
                    EmptyState(
                        .firstUse,
                        glyph: "briefcase",
                        title: JobsStrings.firstUseTitle,
                        message: model.canSearchSources ? JobsStrings.firstUseBody : JobsStrings.firstUseBodyNoSearch,
                        primary: addFromLink.map { action in .init(JobsStrings.addFromLink) { action() } }
                    )
                }
                .listRowBackground(Color.clear)
            } else if model.hasNoResults {
                Section {
                    noResults
                }
            } else if model.items.isEmpty {
                Section {
                    EmptyState(.subArea, title: emptyScopeTitle)
                }
            } else {
                Section {
                    ForEach(model.items) { item in
                        itemRow(item)
                    }
                } header: {
                    resultHeader
                }
            }
        }
        .bfhrInsetGroupedList()
        .animation(BFHRMotion.spring(reduceMotion: reduceMotion), value: model.items)
        .bfhrToastHost()
        .accessibilityIdentifier("jobs.feed")
    }

    @ViewBuilder private func itemRow(_ item: JobFeedItem) -> some View {
        switch item {
        case .job(let row):
            NavigationLink(value: JobsRoute.job(row.id)) {
                JobRowView(row: row) { toggleSave(row.id) }
            }
            .bfhrRowActions(actions(for: row))
            .accessibilityIdentifier("jobs.row.\(row.id)")
        case .hidden(let jobId, let title, let company, let reasons):
            HiddenJobRow(
                title: title,
                company: company,
                hasReasons: !reasons.isEmpty,
                onUndo: { model.unhide(jobId) },
                onTellUsWhy: { reasonsFor = ReasonRequest(jobId: jobId) }
            )
        }
    }

    private func actions(for row: JobFeedRow) -> [RowAction] {
        var actions: [RowAction] = []
        if row.canToggleSave {
            actions.append(RowAction(row.isSaved ? JobsStrings.unsave : JobsStrings.save, systemImage: row.isSaved ? "bookmark.slash" : "bookmark", edge: .leading, haptic: row.isSaved ? nil : .confirm) {
                toggleSave(row.id)
            })
        }
        actions.append(RowAction(Strings.notForMe, systemImage: "hand.thumbsdown", edge: .trailing) { hide(row.id) })
        if let apply, row.trackedStatus.map({ statusRank($0) ?? 0 < statusRank(.applied) ?? 0 }) ?? true {
            actions.append(RowAction(JobsStrings.applyAction, systemImage: "paperplane", edge: .menuOnly) { apply(row.id) })
        }
        if let url = row.postingURL {
            actions.append(RowAction(JobDetailViewStrings.openOriginal, systemImage: "safari", edge: .menuOnly) { openURL(url) })
        }
        return actions
    }

    // MARK: Chips

    private var scopeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: BFHRSpace.s2) {
                ScopeChip(title: Text(JobsStrings.scopeAll), isSelected: model.scope == .all) { model.scope = .all }
                    .accessibilityIdentifier("jobs.scope.all")
                ScopeChip(title: Text(JobsStrings.scopeSaved), count: model.savedCount, isSelected: model.scope == .saved) { model.scope = .saved }
                    .accessibilityIdentifier("jobs.scope.saved")
                ForEach(model.savedSearchChips) { chip in
                    ScopeChip(title: Text(verbatim: chip.name), count: chip.newCount, isSelected: model.scope == .search(chip.id)) {
                        model.scope = .search(chip.id)
                    }
                    .contextMenu {
                        Button { editor = SavedSearchEditorRequest(searchId: chip.id) } label: {
                            Label { Text(JobsStrings.edit) } icon: { Image(systemName: "pencil") }
                        }
                        if model.canSearchSources {
                            Button { Task { await model.runSavedSearch(chip.id) } } label: {
                                Label { Text(JobsStrings.runNow) } icon: { Image(systemName: "arrow.clockwise") }
                            }
                        }
                        Button(role: .destructive) {
                            if let toast = model.deleteSavedSearch(chip.id) { toasts?.show(toast) }
                        } label: {
                            Label { Text(JobsStrings.delete) } icon: { Image(systemName: "trash") }
                        }
                    }
                }
                Button { editor = SavedSearchEditorRequest(searchId: nil, seed: SavedSearchDraft()) } label: {
                    Image(systemName: "plus")
                        .font(.bfhr(.subheadline, emphasized: true))
                        .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(Text(JobsStrings.newSavedSearch))
            }
            .padding(.horizontal, BFHRSpace.s4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(JobsStrings.scopesLabel))
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: BFHRSpace.s2) {
                FilterChip(
                    title: Text(JobsStrings.filters),
                    systemImage: "line.3.horizontal.decrease",
                    badge: model.filters.activeCount,
                    isActive: !model.filters.isEmpty
                ) { facet = FilterSheetRequest(facet: nil) }
                .accessibilityIdentifier("jobs.filters")
                ForEach(JobFilterFacet.allCases) { item in
                    FilterChip(
                        title: Text(chipTitle(item)),
                        isActive: model.filters.isActive(item)
                    ) { facet = FilterSheetRequest(facet: item) }
                    .accessibilityIdentifier("jobs.filter.\(item.rawValue)")
                }
            }
            .padding(.horizontal, BFHRSpace.s4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(JobsStrings.filtersLabel))
    }

    /// "Remote", or with a value "Remote: Hybrid".
    private func chipTitle(_ facet: JobFilterFacet) -> String {
        let name = String(localized: JobsStrings.facet(facet))
        guard let value = JobsFilterSummary.value(of: facet, in: model.filters) else { return name }
        return String(localized: JobsStrings.facetValue(name, value))
    }

    // MARK: Header, search status, empty

    /// "Jobs: 37 · Best match ⌃⌄ ⓘ"; at accessibility sizes the count sits above the sort so no
    /// word breaks mid-line (r2).
    private var resultHeader: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
            : AnyLayout(HStackLayout(spacing: BFHRSpace.s2))
        return layout {
            Text(JobsStrings.jobCount(model.jobCount))
                .foregroundStyle(BFHRColor.Fg.secondary)
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: BFHRSpace.s2) }
            HStack(spacing: BFHRSpace.s2) {
                sortMenu
                rankingInfoButton
            }
        }
        .textCase(nil)
        .font(.bfhr(.footnote))
    }

    private var sortMenu: some View {
            Menu {
                Picker(selection: $model.sort) {
                    ForEach(JobFeedSort.allCases) { sort in
                        Text(JobsStrings.sort(sort)).tag(sort)
                    }
                } label: { Text(JobsStrings.sortBy) }
            } label: {
                HStack(spacing: BFHRSpace.s1) {
                    Text(JobsStrings.sort(model.sort))
                    Image(systemName: "chevron.up.chevron.down").imageScale(.small).accessibilityHidden(true)
                }
                .font(.bfhr(.footnote, emphasized: true))
                .foregroundStyle(BFHRColor.Accent.text)
                .frame(minHeight: BFHRHitTarget.minimum)
            }
            .accessibilityLabel(Text(JobsStrings.sortAccessibility(model.sort)))
            .accessibilityIdentifier("jobs.sort")
    }

    private var rankingInfoButton: some View {
        Button { showsRankingInfo = true } label: {
            Image(systemName: "info.circle")
                .foregroundStyle(BFHRColor.Accent.text)
                .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel(Text(JobsStrings.rankingInfoTitle))
    }

    @ViewBuilder private var searchStatus: some View {
        switch model.searchState {
        case .idle:
            EmptyView()
        case .searching(let query):
            Section {
                ProgressNote(JobsStrings.searching(query))
                    .accessibilityIdentifier("jobs.searching")
            }
        case .finished(_, let outcome):
            Section {
                SearchOutcomeView(outcome: outcome, onClose: model.dismissSearchState)
                    .accessibilityIdentifier("jobs.searchOutcome")
            }
        case .failed(_, let error):
            Section {
                InlineAlert(
                    error == .offline ? .info : .warning,
                    title: JobsStrings.searchFailedTitle(error),
                    message: JobsStrings.searchFailedBody(error),
                    actionTitle: error == .offline ? nil : Strings.tryAgain,
                    action: error == .offline ? nil : { Task { await model.searchSources() } },
                    onDismiss: model.dismissSearchState
                )
            }
        }
    }

    private var noResults: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            Text(JobsStrings.noResultsTitle)
                .font(.bfhr(.headline))
                .foregroundStyle(BFHRColor.Fg.primary)
            Text(JobsStrings.noResultsBody)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
            ChipFlow(spacing: BFHRSpace.s2) {
                ForEach(JobFilterFacet.allCases.filter(model.filters.isActive)) { item in
                    Button { model.filters.reset(item) } label: {
                        Label { Text(chipTitle(item)) } icon: { Image(systemName: "xmark") }
                            .labelStyle(.bfhrCompact)
                    }
                    .buttonStyle(.bfhrSecondary)
                    .accessibilityHint(Text(JobsStrings.removeFilterHint))
                }
            }
            HStack(spacing: BFHRSpace.s2) {
                if !model.filters.isEmpty {
                    Button { model.filters = .none } label: { Text(JobsStrings.removeAllFilters) }
                        .buttonStyle(.bfhrSecondary)
                }
                if !model.query.trimmingCharacters(in: .whitespaces).isEmpty, model.canSearchSources {
                    Button { Task { await model.searchSources() } } label: { Text(JobsStrings.searchAllSources) }
                        .buttonStyle(.bfhrPlain)
                }
            }
        }
        .padding(.vertical, BFHRSpace.s2)
        .accessibilityIdentifier("jobs.noResults")
    }

    private var emptyScopeTitle: LocalizedStringResource {
        switch model.scope {
        case .saved: JobsStrings.savedEmpty
        case .all, .search: JobsStrings.allHiddenEmpty
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .bfhrTrailing) {
            NavigationLink(value: JobsRoute.savedSearches) {
                Label { Text(JobsStrings.savedSearchesTitle) } icon: { Image(systemName: "bell") }
            }
            .accessibilityIdentifier("jobs.savedSearches")
            Menu {
                if let addFromLink {
                    Button(action: addFromLink) {
                        Label { Text(JobsStrings.addFromLink) } icon: { Image(systemName: "link") }
                    }
                }
                Button { editor = SavedSearchEditorRequest(searchId: nil, seed: SavedSearchDraft()) } label: {
                    Label { Text(JobsStrings.newSavedSearch) } icon: { Image(systemName: "bell.badge") }
                }
            } label: {
                Label { Text(JobsStrings.add) } icon: { Image(systemName: "plus") }
            }
            .accessibilityIdentifier("jobs.add")
        }
    }

    // MARK: Actions

    private func toggleSave(_ jobId: String) {
        let wasSaved = model.items.contains { if case .job(let row) = $0 { row.id == jobId && row.isSaved } else { false } }
        if !wasSaved { saveCount += 1 }
        if let toast = model.toggleSave(jobId) { toasts?.show(toast) }
    }

    private func hide(_ jobId: String) {
        // Hides stay silent (tokens: haptics only confirm, reveal, drag and error).
        model.hide(jobId)
    }

    private func saveSearch() {
        let toast = model.saveCurrentSearch { id in editor = SavedSearchEditorRequest(searchId: id) }
        toasts?.show(toast)
    }
}

// MARK: - Requests

struct FilterSheetRequest: Identifiable {
    let facet: JobFilterFacet?
    var id: String { facet?.rawValue ?? "all" }
}

struct ReasonRequest: Identifiable {
    let jobId: String
    var id: String { jobId }
}

struct SavedSearchEditorRequest: Identifiable {
    let searchId: String?
    var seed: SavedSearchDraft?
    var id: String { searchId ?? "new" }
}

// MARK: - Pieces

/// A scope chip: selected = filled accent; a count shows new matches.
struct ScopeChip: View {
    let title: Text
    var count: Int = 0
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: BFHRSpace.s1) {
                title
                if count > 0 {
                    Text(count, format: .number)
                        .font(.bfhr(.caption1, emphasized: true))
                        .padding(.horizontal, 6)
                        .background(isSelected ? BFHRColor.Fg.onAccent.opacity(0.2) : BFHRColor.Surface.sunken, in: Capsule())
                }
            }
            .font(.bfhr(.subheadline, emphasized: isSelected))
            .foregroundStyle(isSelected ? BFHRColor.Fg.onAccent : BFHRColor.Fg.primary)
            .padding(.horizontal, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum)
            .background(isSelected ? BFHRColor.Accent.solid : BFHRColor.Surface.base, in: Capsule())
            .overlay { if !isSelected { Capsule().strokeBorder(BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin) } }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityValue(count > 0 ? Text(JobsStrings.newCount(count)) : Text(verbatim: ""))
    }
}

/// A filter chip: outlined, filled with the subtle accent when active (it then shows the value).
struct FilterChip: View {
    let title: Text
    var systemImage: String?
    var badge: Int = 0
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: BFHRSpace.s1) {
                if let systemImage { Image(systemName: systemImage).accessibilityHidden(true) }
                title
                if badge > 0 {
                    Text(badge, format: .number)
                        .font(.bfhr(.caption1, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.onAccent)
                        .padding(.horizontal, 6)
                        .background(BFHRColor.Accent.solid, in: Capsule())
                }
                if systemImage == nil {
                    Image(systemName: "chevron.down").imageScale(.small).accessibilityHidden(true)
                }
            }
            .font(.bfhr(.subheadline))
            .foregroundStyle(isActive ? BFHRColor.Accent.text : BFHRColor.Fg.primary)
            .padding(.horizontal, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum)
            .background(isActive ? BFHRColor.Accent.subtle : BFHRColor.Surface.base, in: Capsule())
            .overlay { Capsule().strokeBorder(isActive ? BFHRColor.Accent.text.opacity(0.4) : BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin) }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

/// "Get alerts for this search" (Handshake): turning it on saves the search at once.
struct SaveSearchBanner: View {
    let onSave: () -> Void

    var body: some View {
        Toggle(isOn: Binding(get: { false }, set: { if $0 { onSave() } })) {
            Label { Text(JobsStrings.saveSearchBanner) } icon: { Image(systemName: "bell") }
                .labelStyle(.bfhrCompact)
                .font(.bfhr(.body))
        }
        .tint(BFHRColor.Accent.solid)
        .accessibilityIdentifier("jobs.saveSearch")
    }
}

/// The on-demand search's result: what was found, and the sources it couldn't use.
struct SearchOutcomeView: View {
    let outcome: JobsSearchResponse
    let onClose: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Image(systemName: "checkmark.circle")
                .foregroundStyle(BFHRColor.Accent.text)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(JobsStrings.searchFound(found: outcome.counts.found, new: outcome.counts.created))
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                let used = outcome.sources.filter { $0.status == .ok }.map { JobDetailFormat.sourceName($0.source) }
                if !used.isEmpty {
                    Text(JobsStrings.searchedSources(used.formatted(.list(type: .and))))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                let skipped = outcome.sources.filter { $0.status != .ok }
                if !skipped.isEmpty {
                    Text(JobsStrings.skippedSources(skipped.map { "\(JobDetailFormat.sourceName($0.source)) (\(String(localized: JobsStrings.skipReason($0))))" }.formatted(.list(type: .and))))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(Text(Strings.close))
        }
    }
}

/// "Best match" explained in one sheet (job-feed-search.md "Result header").
struct RankingInfoSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(JobsStrings.rankingInfoBody)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .padding(.vertical, BFHRSpace.s1)
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(JobsStrings.rankingInfoTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: { Text(JobDetailViewStrings.done) }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
