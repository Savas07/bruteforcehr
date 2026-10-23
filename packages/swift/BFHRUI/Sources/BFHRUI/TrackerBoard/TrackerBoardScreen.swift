import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The Tracker tab (tracker.md "Decision — iOS"): the title menu switches **Pipeline** and
/// **Calendar**; + logs an application. The Pipeline is one grouped list instead of a column
/// pager: scope tabs (Active · Closed · All), a scrolling stage strip with counts, sticky
/// collapsible stage sections, and two equal ways to move an application: long-press → Move to…
/// (also the VoiceOver action) and swipe actions. Drag is not offered on iPhone (decisions.md
/// D28). Every move goes through BFHRCore's state machine as the user and offers Undo. Rows push
/// the Application detail.
public struct TrackerBoardScreen: View {
    @Bindable private var model: TrackerBoardModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @State private var sheet: TrackerSheet?
    @State private var adding: ApplicationDraft?
    @State private var sharing: InterviewCalendarFile?
    @State private var opened: OpenedApplication?
    @State private var agendaScope: AgendaScope = .upcoming
    /// Sections the user opened or closed; others follow `collapsedByDefault`.
    @State private var expansion: [ApplicationStatus: Bool] = [:]
    @State private var errorCount = 0
    /// Insights, pushed on this stack from the toolbar (decisions.md D03); nil hides the button.
    private let insights: AnyView?

    public init(model: TrackerBoardModel) {
        self.model = model
        self.insights = nil
    }

    /// With an Insights destination: the toolbar's chart button pushes it.
    public init<Insights: View>(model: TrackerBoardModel, @ViewBuilder insights: () -> Insights) {
        self.model = model
        self.insights = AnyView(insights())
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: TrackerBoardStrings.loading) {
            switch model.view {
            case .pipeline:
                if model.isEmpty {
                    emptyPipeline
                } else {
                    pipeline
                }
            case .calendar:
                TrackerCalendarView(model: model, scope: $agendaScope) { applicationId in
                    opened = OpenedApplication(id: applicationId)
                } onShare: { interview in
                    sharing = model.calendarFile(for: interview)
                }
            }
        } skeleton: {
            TrackerSkeleton()
        } failure: { failure in
            PaneError(failure, title: TrackerBoardStrings.errorTitle, retry: reload)
        }
        .navigationTitle(Text(model.view.label))
        .toolbarTitleMenu {
            ForEach(TrackerView.allCases) { view in
                Button {
                    model.view = view
                } label: {
                    Label { Text(view.label) } icon: { Image(systemName: view.systemImage) }
                }
            }
        }
        .toolbar {
            if insights != nil {
                ToolbarItem(placement: .bfhrTrailing) {
                    Button {
                        model.showsInsights = true
                    } label: {
                        Label { Text(TrackerBoardStrings.insights) } icon: { Image(systemName: "chart.bar.xaxis") }
                    }
                    .accessibilityIdentifier("tracker.insights")
                }
            }
            ToolbarItem(placement: .bfhrTrailing) {
                Button {
                    adding = model.newApplicationDraft()
                } label: {
                    Label { Text(TrackerBoardStrings.add) } icon: { Image(systemName: "plus") }
                }
                .disabled(!model.isLoaded)
                .accessibilityIdentifier("tracker.add")
            }
        }
        .navigationDestination(isPresented: $model.showsInsights) {
            if let insights { insights }
        }
        .navigationDestination(item: $opened) { opened in
            TrackerApplicationDetailScreen(model: model, applicationId: opened.id, focusInterviewId: opened.interviewId)
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        .bfhrHaptic(.error, trigger: errorCount)
        .sheet(item: $sheet) { sheet in
            TrackerMoveSheet(sheet: sheet, model: model) { status in
                self.sheet = nil
                run { try model.move(sheet.applicationId, to: status) }
            } onCancel: {
                self.sheet = nil
            }
        }
        .sheet(item: $adding) { draft in
            ApplicationAddSheet(draft: draft, now: model.now) { draft in
                adding = nil
                let id = model.logApplication(draft)
                if let toast = model.loggedToast(id) { toasts?.show(toast) }
                opened = OpenedApplication(id: id)
            } onCancel: {
                adding = nil
            }
        }
        .sheet(item: $sharing) { file in
            InterviewShareSheet(file: file)
        }
        .onChange(of: model.writeFailures) {
            errorCount += 1
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: TrackerBoardStrings.saveFailed))
        }
        .onChange(of: model.route, initial: true) { consumeRoute() }
        // A link that arrived before the data opens once it's loaded.
        .onChange(of: model.phase) { consumeRoute() }
        #if DEBUG
        .onAppear { if TrackerDesignPane.requested == .calendarPast { agendaScope = .past } }
        #endif
    }

    private func consumeRoute() {
        guard let route = model.route, model.isLoaded else { return }
        model.route = nil
        switch route {
        case .application(let id, let interviewId):
            model.view = .pipeline
            // An interview link that arrived before the data names no application yet.
            let resolved = id.isEmpty ? model.data.interviews.first { $0.id == interviewId }?.applicationId ?? id : id
            opened = OpenedApplication(id: resolved, interviewId: interviewId)
        case .add:
            adding = model.newApplicationDraft()
        case .calendar:
            opened = nil
            model.view = .calendar
        case .insights(let range):
            opened = nil
            model.insightsRange = range
            model.showsInsights = insights != nil
        }
    }

    // MARK: Empty

    private var emptyPipeline: some View {
        ScrollView {
            VStack(spacing: 0) {
                ConnectionBanner(model.connection)
                EmptyState(
                    .firstUse,
                    glyph: "rectangle.split.3x1",
                    title: TrackerBoardStrings.emptyTitle,
                    message: TrackerBoardStrings.emptyBodyLog,
                    primary: .init(TrackerBoardStrings.add) { adding = model.newApplicationDraft() }
                )
                Text(TrackerBoardStrings.csvOnDesktop)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, BFHRSpace.s6)
                    .padding(.bottom, BFHRSpace.s6)
            }
        }
    }

    // MARK: Pipeline

    private var pipeline: some View {
        ScrollViewReader { proxy in
            List {
                ConnectionBannerSection(model.connection)
                if let filter = model.filter {
                    Section {
                        FilterChipRow(label: filter.label) { model.clearFilter() }
                            .listRowSeparator(.hidden)
                    }
                }
                Section {
                    Picker(selection: $model.scope) {
                        ForEach(PipelineScope.allCases) { scope in Text(scope.label).tag(scope) }
                    } label: {
                        Text(TrackerBoardStrings.scopeLabel)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .accessibilityLabel(Text(TrackerBoardStrings.scopeLabel))
                    .listRowSeparator(.hidden)
                    StageStrip(stages: model.stageStrip) { status in
                        expansion[status] = true
                        withAnimation(BFHRMotion.animation(.base, easing: .standard, reduceMotion: reduceMotion)) {
                            proxy.scrollTo(status, anchor: .top)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                }
                ForEach(model.sections) { section in
                    Section {
                        if isExpanded(section) {
                            ForEach(section.rows) { row in
                                NavigationLink {
                                    TrackerApplicationDetailScreen(model: model, applicationId: row.id)
                                } label: {
                                    PipelineRowView(row: row)
                                }
                                .bfhrRowActions(actions(for: row))
                            }
                        }
                    } header: {
                        StageSectionHeader(section: section, isExpanded: isExpanded(section), phaseCaption: phaseCaption(for: section)) {
                            withAnimation(BFHRMotion.animation(.base, easing: .standard, reduceMotion: reduceMotion)) {
                                expansion[section.status] = !isExpanded(section)
                            }
                        }
                    }
                    .id(section.status)
                }
                if model.scope == .closed, model.sections.allSatisfy(\.isEmpty) {
                    Text(TrackerBoardStrings.closedEmpty)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
        }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.bfhrReload) private var reload

    /// The phase (Shortlist, In progress, Closed) above the first stage of each phase, so the
    /// list reads as the three phases. Not in Closed, where it would only repeat the tab.
    private func phaseCaption(for section: PipelineSection) -> StatusPhase? {
        guard model.scope != .closed else { return nil }
        return model.sections.first { $0.phase == section.phase }?.status == section.status ? section.phase : nil
    }

    private func isExpanded(_ section: PipelineSection) -> Bool {
        guard !section.isEmpty else { return false }
        return expansion[section.status] ?? !section.collapsedByDefault
    }

    // MARK: Actions

    private func actions(for row: PipelineRow) -> [RowAction] {
        var actions: [RowAction] = []
        if let next = model.advanceTarget(for: row.id) {
            actions.append(RowAction(TrackerBoardStrings.moveTo(next), systemImage: "arrow.right", edge: .leading, id: "advance", haptic: .confirm) {
                run { try model.move(row.id, to: next) }
            })
        }
        actions.append(RowAction(Strings.moveTo, systemImage: "arrow.left.arrow.right", edge: .trailing, id: "move") {
            sheet = .move(row.id)
        })
        if row.status.isActive {
            actions.append(RowAction(TrackerBoardStrings.closeApplication, systemImage: "archivebox", edge: .trailing, id: "close") {
                sheet = .close(row.id)
            })
        }
        return actions
    }

    private func run(_ action: () throws -> ToastItem?) {
        do {
            if let item = try action() { toasts?.show(item) }
        } catch {
            errorCount += 1
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: TrackerBoardStrings.moveError(error)))
        }
    }
}

/// An application pushed programmatically (deep link, Calendar row, after Log an application),
/// optionally scrolled to one interview round.
struct OpenedApplication: Identifiable, Hashable {
    var id: String
    var interviewId: String?
}

/// Where a `bruteforcehr://` link (or a notification) asks the Tracker to go.
public enum TrackerRoute: Hashable, Sendable {
    /// `applications/{id}` or `interviews/{id}` (then `interviewId` is set).
    case application(String, interviewId: String?)
    /// `tracker/new`: Log an application.
    case add
    /// `tracker?view=calendar`.
    case calendar
    /// `insights?range=4w|12w|…`: Insights pushed on the Tracker.
    case insights(range: String?)
}

/// "From Insights: Applied in the last 4 weeks ✕": the Pipeline shows a drill-down; ✕ clears it.
private struct FilterChipRow: View {
    let label: String
    let onClear: () -> Void

    var body: some View {
        HStack(spacing: BFHRSpace.s2) {
            Text(TrackerBoardStrings.fromInsights(label))
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onClear) {
                Image(systemName: "xmark.circle.fill")
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(TrackerBoardStrings.clearFilter))
            .accessibilityIdentifier("tracker.clearFilter")
        }
        .padding(.horizontal, BFHRSpace.s3)
        .background(BFHRColor.Accent.subtle, in: Capsule())
    }
}

/// Move to… (every status) or Close… (outcomes only).
enum TrackerSheet: Identifiable, Hashable {
    case move(String)
    case close(String)

    var id: Self { self }

    var applicationId: String {
        switch self {
        case .move(let id), .close(let id): id
        }
    }
}

extension ApplicationDraft: Identifiable {
    public var id: Date { date }
}

extension TrackerBoardStrings {
    /// The toast for a move the state machine refused: D16's reason when there is one.
    static func moveError(_ error: any Error) -> LocalizedStringResource {
        if let error = error as? TransitionError,
           let denial = TransitionDenial(rawValue: error.code.rawValue),
           let reason = denial.reason {
            return reason
        }
        return moveFailed
    }
}

// MARK: - Sheets

/// The Move to… / Close… sheet: `StatusMenu` with the medium detent, titled with the action and
/// the application it moves, on a solid background so the Pipeline doesn't show through.
struct TrackerMoveSheet: View {
    let sheet: TrackerSheet
    let model: TrackerBoardModel
    let onSelect: (ApplicationStatus) -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                switch sheet {
                case .move(let id): StatusMenu(model.moveTargets(for: id), onSelect: onSelect)
                case .close(let id): StatusMenu(model.outcomeTargets(for: id), onSelect: onSelect)
                }
            }
            .navigationTitle(Text(title))
            .modifier(SheetSubtitle(subtitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // The system ✕ (iOS 26): a "Close" text button would read like the
                    // Close… outcome action in this very sheet.
                    if #available(iOS 26, macOS 26, *) {
                        Button(role: .close, action: onCancel)
                    } else {
                        Button(role: .cancel, action: onCancel) { Text(Strings.close) }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private var title: LocalizedStringResource {
        switch sheet {
        case .move: Strings.moveTo
        case .close: TrackerBoardStrings.closeTitle
        }
    }

    /// "Aire Digital Health · Frontend Engineer": which application the sheet moves.
    private var subtitle: String? {
        model.data.application(id: sheet.applicationId).map { "\($0.company) · \($0.role)" }
    }
}

/// The system navigation subtitle (iOS 26) under the sheet's title.
struct SheetSubtitle: ViewModifier {
    let subtitle: String?

    init(_ subtitle: String?) {
        self.subtitle = subtitle
    }

    func body(content: Content) -> some View {
        if let subtitle, #available(iOS 26, macOS 11, *) {
            content.navigationSubtitle(Text(verbatim: subtitle))
        } else {
            content
        }
    }
}
