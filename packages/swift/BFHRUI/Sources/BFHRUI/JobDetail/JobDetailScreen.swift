import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Job detail + match explanation (docs/design/research/job-detail.md "Decision — iOS"), pushed on
/// the Jobs stack: header, how it fits (band first, "72 of 100", evidence counts, reasons, gaps you
/// can correct, the labelled AI summary), details, description, "Found on" sources and a sticky
/// Apply bar labelled by route. Share and the original posting sit in the toolbar.
public struct JobDetailScreen: View {
    @Bindable private var model: JobDetailModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bfhrReload) private var reload
    @State private var saveCount = 0
    @State private var confirmCount = 0
    @State private var showsTitle = false
    @State private var showsBreakdown = false
    @State private var showsReasons = false

    public init(model: JobDetailModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: JobDetailViewStrings.loading) {
            content
        } skeleton: {
            JobDetailSkeleton()
        } failure: { failure in
            PaneError(
                failure,
                title: failure.kind == .notFound ? JobDetailViewStrings.notFoundTitle : JobDetailViewStrings.errorTitle,
                retry: reload,
                goBack: { dismiss() }
            )
        }
        .environment(\.bfhrNow, model.now)
        .bfhrHaptic(.confirm, trigger: saveCount)
        .bfhrHaptic(.confirm, trigger: confirmCount)
        .navigationTitle(showsTitle ? model.header?.title ?? "" : "")
        .bfhrInlineTitle()
        .toolbar { toolbarContent }
        .sheet(isPresented: $showsBreakdown) {
            MatchBreakdownSheet(model: model, onHaveSkill: haveSkill, onAddToCV: addToCV)
        }
        .sheet(isPresented: $showsReasons) {
            DismissReasonSheet(initial: model.hiddenReasons) { reasons in
                if let toast = model.setHiddenReasons(reasons) { toasts?.show(toast) }
            }
        }
    }

    // MARK: Content

    private var content: some View {
        List {
            ConnectionBannerSection(model.connection)
            if model.isHidden {
                Section {
                    HiddenBanner(reasons: model.hiddenReasons, onUndo: model.unhide, onTellUsWhy: { showsReasons = true })
                }
            }
            if let header = model.header {
                JobDetailHeaderSection(header: header, isDelisted: model.isDelisted, isPendingSync: model.isPendingSync)
            }
            matchSections
            JobFactsSection(facts: model.facts)
            JobDescriptionSection(
                description: model.description,
                hasDescription: model.hasDescription,
                openOriginal: model.originalPostingURL.map { url in { openURL(url) } }
            )
            JobSourcesSection(sources: model.sources)
            if model.canHide {
                Section {
                    Button(action: hideJob) {
                        Label { Text(Strings.notForMe) } icon: { Image(systemName: "hand.thumbsdown") }
                    }
                } footer: {
                    Text(JobDetailViewStrings.notForMeFooter)
                }
            }
        }
        .bfhrInsetGroupedList()
        .onScrollGeometryChange(for: Bool.self) { geometry in
            geometry.contentOffset.y + geometry.contentInsets.top > 96
        } action: { _, pastHeader in
            showsTitle = pastHeader
        }
        // Inside the bar's inset, so the toast stacks above the Apply bar.
        .bfhrToastHost()
        .safeAreaInset(edge: .bottom, spacing: 0) { applyBar }
    }

    @ViewBuilder private var matchSections: some View {
        switch model.match {
        case .pending:
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    ProgressNote(JobDetailViewStrings.pending)
                    Text(JobDetailViewStrings.pendingMessage)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                .padding(.vertical, BFHRSpace.s1)
            } header: {
                Text(JobDetailViewStrings.match)
            }
        case .noCV:
            Section {
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    Text(JobDetailViewStrings.noCV)
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(JobDetailViewStrings.noCVMessage)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                .padding(.vertical, BFHRSpace.s1)
                Button { open("bruteforcehr://cvs") } label: { Text(JobDetailViewStrings.openCVs) }
            } header: {
                Text(JobDetailViewStrings.match)
            }
        case .scored(let match):
            Section {
                MatchScoreCard(match: match)
                MatchCounts(match: match)
                Button { showsBreakdown = true } label: {
                    HStack {
                        Text(JobDetailViewStrings.breakdownOpen)
                        Spacer(minLength: BFHRSpace.s2)
                        Image(systemName: "chevron.up")
                            .font(.bfhr(.footnote, emphasized: true))
                            .foregroundStyle(BFHRColor.Fg.tertiary)
                            .accessibilityHidden(true)
                    }
                }
            } header: {
                Text(JobDetailViewStrings.match)
            } footer: {
                Text(JobDetailViewStrings.explainer)
            }
            if !match.topReasons.isEmpty {
                Section {
                    ForEach(match.topReasons) { factor in
                        FactorRow(factor: factor)
                    }
                } header: {
                    Text(JobDetailViewStrings.reasons)
                } footer: {
                    if match.rationale == nil { Text(JobDetailViewStrings.noRationale) }
                }
            }
            if !match.topGaps.isEmpty {
                Section {
                    ForEach(match.topGaps) { gap in
                        GapRow(gap: gap, onHaveSkill: haveSkill, onAddToCV: addToCV)
                            .bfhrRowActions(gapActions(gap))
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
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbarContent: some ToolbarContent {
        if model.phase == .loaded, let header = model.header {
            ToolbarItemGroup(placement: .bfhrTrailing) {
                if let url = model.originalPostingURL {
                    ShareLink(
                        item: url,
                        subject: Text(verbatim: header.title),
                        message: Text(verbatim: "\(header.title) · \(header.company.name)")
                    )
                    Button { openURL(url) } label: {
                        Label { Text(JobDetailViewStrings.openOriginal) } icon: { Image(systemName: "safari") }
                    }
                    .accessibilityHint(Text(JobDetailViewStrings.opensInBrowser))
                }
                if model.canHide || model.isHidden {
                    Menu {
                        if model.canHide {
                            Button(action: hideJob) {
                                Label { Text(Strings.notForMe) } icon: { Image(systemName: "hand.thumbsdown") }
                            }
                        }
                        if model.isHidden {
                            Button(action: model.unhide) {
                                Label { Text(JobDetailViewStrings.showInFeed) } icon: { Image(systemName: "eye") }
                            }
                            Button { showsReasons = true } label: {
                                Label { Text(JobDetailViewStrings.tellUsWhy) } icon: { Image(systemName: "text.bubble") }
                            }
                        }
                    } label: {
                        Label { Text(JobDetailViewStrings.more) } icon: { Image(systemName: "ellipsis") }
                    }
                }
            }
        }
    }

    // MARK: Apply bar

    @ViewBuilder private var applyBar: some View {
        if model.header != nil {
            VStack(spacing: 0) {
                Divider()
                HStack(spacing: BFHRSpace.s3) {
                    if case .applied(let date, let applicationId) = model.applyRoute {
                        AppliedLabel(date: date)
                        Spacer(minLength: 0)
                        Button { open("bruteforcehr://applications/\(applicationId)") } label: {
                            Text(JobDetailViewStrings.viewInTracker)
                        }
                        .buttonStyle(.bfhrSecondary)
                    } else {
                        if model.canToggleSave { saveButton }
                        if let route = model.applyRoute {
                            applyButton(route)
                        }
                    }
                }
                .padding(.horizontal, BFHRSpace.s4)
                .padding(.vertical, BFHRSpace.s2)
            }
            .background(.bar)
            // A sticky bar can't grow with AX5 text without hiding the content it serves (it took
            // half of an iPhone 17e screen): like the system bars it stops at AX1 and offers the
            // Large Content Viewer.
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        }
    }

    private var saveButton: some View {
        Button(action: toggleSave) {
            Image(systemName: model.isSaved ? "bookmark.fill" : "bookmark")
                .font(.bfhr(.body, emphasized: true))
                .foregroundStyle(BFHRColor.Accent.text)
        }
        .buttonStyle(.bfhrSecondary)
        .accessibilityLabel(Text(model.isSaved ? JobDetailViewStrings.saved : JobDetailViewStrings.save))
        .accessibilityShowsLargeContentViewer {
            Image(systemName: model.isSaved ? "bookmark.fill" : "bookmark")
            Text(model.isSaved ? JobDetailViewStrings.saved : JobDetailViewStrings.save)
        }
        .accessibilityAddTraits(model.isSaved ? .isSelected : [])
    }

    private func applyButton(_ route: JobDetailModel.ApplyRoute) -> some View {
        let isExternal = if case .email = route { false } else { true }
        return Button { apply(route) } label: {
            HStack(spacing: BFHRSpace.s1) {
                Text(JobDetailViewStrings.apply(route))
                Image(systemName: isExternal ? "arrow.up.right" : "envelope")
                    .font(.bfhr(.footnote, emphasized: true))
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.bfhr(.primary, fullWidth: true))
        .accessibilityShowsLargeContentViewer {
            Text(JobDetailViewStrings.apply(route))
        }
        .accessibilityHint(isExternal ? Text(JobDetailViewStrings.opensInBrowser) : Text(verbatim: ""))
    }

    // MARK: Actions

    private func toggleSave() {
        if !model.isSaved { saveCount += 1 }
        if let toast = model.toggleSave() { toasts?.show(toast) }
    }

    private func hideJob() {
        if let toast = model.hide() { toasts?.show(toast) }
    }

    private func haveSkill(_ skill: String) {
        confirmCount += 1
        if let toast = model.markHaveSkill(skill) { toasts?.show(toast) }
    }

    /// "Add to CV…" opens the CV the score is based on (IA.md `bruteforcehr://cvs/{cvId}`).
    private func addToCV() {
        if let cvId = model.match.scored?.basis.cvId {
            open("bruteforcehr://cvs/\(cvId)")
        } else {
            open("bruteforcehr://cvs")
        }
    }

    private func apply(_ route: JobDetailModel.ApplyRoute) {
        switch route {
        case .email(let address): open("mailto:\(address)")
        case .companySite(let url), .board(_, let url): openURL(url)
        case .applied(_, let applicationId): open("bruteforcehr://applications/\(applicationId)")
        }
    }

    private func open(_ link: String) {
        if let url = URL(string: link) { openURL(url) }
    }

    private func gapActions(_ gap: JobDetailModel.Factor) -> [RowAction] {
        var actions: [RowAction] = []
        if let skill = gap.skill {
            actions.append(RowAction(JobDetailViewStrings.haveThis, systemImage: "checkmark", edge: .leading, id: "haveThis", haptic: .confirm) {
                if let toast = model.markHaveSkill(skill) { toasts?.show(toast) }
            })
        }
        actions.append(RowAction(JobDetailViewStrings.addToCV, systemImage: "doc.badge.plus", edge: .menuOnly, id: "addToCV", perform: addToCV))
        return actions
    }
}

/// "Applied 12 Oct" in the bar once the job is in the Tracker at Applied or beyond.
private struct AppliedLabel: View {
    let date: Date
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        Label {
            Text(JobDetailViewStrings.appliedOn(JobDetailFormat.shortDate(date, locale: locale, calendar: calendar)))
        } icon: {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(BFHRColor.Accent.text)
        }
        .font(.bfhr(.subheadline, emphasized: true))
        .foregroundStyle(BFHRColor.Fg.primary)
    }
}
